package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"github.com/miedvance/api/internal/httputil"
	"github.com/miedvance/api/internal/model"
	"github.com/miedvance/api/internal/repository"
)

const lbTTL = 5 * time.Minute

// PapersService implements all papers business logic.
type PapersService struct {
	repo *repository.PapersRepo
	rdb  *redis.Client
	log  *zap.Logger
}

// NewPapersService creates a PapersService.
func NewPapersService(repo *repository.PapersRepo, rdb *redis.Client, log *zap.Logger) *PapersService {
	return &PapersService{repo: repo, rdb: rdb, log: log}
}

// ── Paper listing ─────────────────────────────────────────────────────────────

func (s *PapersService) ListPapers(ctx context.Context, userID uuid.UUID, f repository.PaperListFilter) ([]repository.PaperCard, error) {
	return s.repo.ListPapers(ctx, userID, f)
}

func (s *PapersService) GetUserStats(ctx context.Context, userID uuid.UUID) (*repository.UserStats, error) {
	return s.repo.GetUserStats(ctx, userID)
}

// ── Exam attempt state machine ────────────────────────────────────────────────
//
// An attempt moves through: not_started → in_progress → submitted.
// A fourth derived state, "expired", is an in_progress attempt whose server-side
// deadline (start + duration, capped by the paper window) has passed; it is
// auto-finalised on the next start/submit interaction.
//
// The state is derived from the attempt row rather than stored in a column:
//   • no row                    → not_started
//   • row, is_completed = false → in_progress (or expired, once the clock runs out)
//   • row, is_completed = true  → submitted

type ExamStatus string

const (
	StatusNotStarted ExamStatus = "not_started"
	StatusInProgress ExamStatus = "in_progress"
	StatusSubmitted  ExamStatus = "submitted"
	StatusExpired    ExamStatus = "expired"
)

type paperSummary struct {
	ID             uuid.UUID  `json:"id"`
	Type           string     `json:"type"`
	Title          string     `json:"title"`
	SubjectID      string     `json:"subject_id"`
	SubjectName    string     `json:"subject_name"`
	Grade          string     `json:"grade"`
	TimeSeconds    int32      `json:"time_seconds"`
	QuestionCount  int16      `json:"question_count"`
	AvailableFrom  time.Time  `json:"available_from"`
	AvailableUntil *time.Time `json:"available_until,omitempty"`
}

// ExamOverviewResponse is the pre-start payload. It deliberately carries NO
// questions and NO answers — only what the lobby needs to render.
type ExamOverviewResponse struct {
	Paper            paperSummary `json:"paper"`
	Status           ExamStatus   `json:"status"`
	RemainingSeconds int          `json:"remaining_seconds"`
}

// ExamStartResponse is returned only after a server-validated start. Questions
// never include correct_option (stripped via the model's json:"-" tag).
type ExamStartResponse struct {
	Paper            paperSummary     `json:"paper"`
	Questions        []model.Question `json:"questions"`
	Status           ExamStatus       `json:"status"`
	RemainingSeconds int              `json:"remaining_seconds"`
	StartedAt        time.Time        `json:"started_at"`
}

func summaryFromPaper(p *repository.PaperRow) paperSummary {
	return paperSummary{
		ID:             p.ID,
		Type:           string(p.Type),
		Title:          p.Title,
		SubjectID:      p.SubjectID,
		SubjectName:    p.SubjectName,
		Grade:          string(p.Grade),
		TimeSeconds:    p.TimeSeconds,
		QuestionCount:  p.QuestionCount,
		AvailableFrom:  p.AvailableFrom,
		AvailableUntil: p.AvailableUntil,
	}
}

// examDeadline is the moment an in-progress attempt must be finalised: the
// start time plus the paper's duration, but never later than the paper window.
func examDeadline(startedAt time.Time, p *repository.PaperRow) time.Time {
	deadline := startedAt.Add(time.Duration(p.TimeSeconds) * time.Second)
	if p.AvailableUntil != nil && p.AvailableUntil.Before(deadline) {
		deadline = *p.AvailableUntil
	}
	return deadline
}

// remainingSeconds returns whole seconds left until the deadline, clamped at 0.
func remainingSeconds(deadline, now time.Time) int {
	secs := int(deadline.Sub(now).Seconds())
	if secs < 0 {
		return 0
	}
	return secs
}

// ensureWindowOpen rejects a fresh start when the paper's availability window is
// not currently open. Applies identically to daily and SRP papers.
func ensureWindowOpen(p *repository.PaperRow, now time.Time) error {
	label := "Daily MCQ"
	if p.Type == model.PaperSRP {
		label = "SRP paper"
	}
	if now.Before(p.AvailableFrom) {
		return httputil.E(http.StatusForbidden, label+" not yet available")
	}
	if p.AvailableUntil != nil && now.After(*p.AvailableUntil) {
		return httputil.E(http.StatusForbidden, label+" window has closed")
	}
	return nil
}

// GetExamOverview returns the pre-start lobby payload for a paper. It is
// read-only: it never creates an attempt and never returns questions or answers.
func (s *PapersService) GetExamOverview(ctx context.Context, paperID, userID uuid.UUID) (*ExamOverviewResponse, error) {
	paper, err := s.repo.GetPaper(ctx, paperID)
	if err != nil {
		return nil, fmt.Errorf("get paper: %w", err)
	}
	if paper == nil {
		return nil, httputil.E(http.StatusNotFound, "Paper not found")
	}

	attempt, err := s.repo.FindAttempt(ctx, paperID, userID)
	if err != nil {
		return nil, fmt.Errorf("find attempt: %w", err)
	}

	now := time.Now()
	resp := &ExamOverviewResponse{Paper: summaryFromPaper(paper)}

	switch {
	case attempt == nil:
		resp.Status = StatusNotStarted
	case attempt.IsCompleted:
		resp.Status = StatusSubmitted
	default:
		remaining := remainingSeconds(examDeadline(attempt.StartedAt, paper), now)
		if remaining <= 0 {
			resp.Status = StatusExpired
		} else {
			resp.Status = StatusInProgress
			resp.RemainingSeconds = remaining
		}
	}

	return resp, nil
}

// StartExam transitions the attempt to in_progress and returns the questions
// (without answers). It is idempotent: a second start on an in-progress attempt
// resumes the same attempt with the same started_at, so a refresh or a double
// click never hands out a fresh attempt or resets the clock.
func (s *PapersService) StartExam(ctx context.Context, paperID, userID uuid.UUID) (*ExamStartResponse, error) {
	paper, err := s.repo.GetPaper(ctx, paperID)
	if err != nil {
		return nil, fmt.Errorf("get paper: %w", err)
	}
	if paper == nil {
		return nil, httputil.E(http.StatusNotFound, "Paper not found")
	}

	attempt, err := s.repo.FindAttempt(ctx, paperID, userID)
	if err != nil {
		return nil, fmt.Errorf("find attempt: %w", err)
	}
	if attempt != nil && attempt.IsCompleted {
		return nil, httputil.Ewith(http.StatusForbidden, "Already attempted",
			map[string]any{"attemptId": attempt.ID})
	}

	now := time.Now()

	// First start consumes the single attempt — only allowed while the window is open.
	if attempt == nil {
		if err := ensureWindowOpen(paper, now); err != nil {
			return nil, err
		}
		if err := s.repo.CreateAttemptIfNotExists(ctx, userID, paperID, paper.QuestionCount); err != nil {
			return nil, fmt.Errorf("create attempt: %w", err)
		}
		attempt, err = s.repo.FindAttempt(ctx, paperID, userID)
		if err != nil {
			return nil, fmt.Errorf("reload attempt: %w", err)
		}
		if attempt == nil {
			return nil, fmt.Errorf("attempt vanished after create")
		}
	}

	// Resume path: if the clock has already run out, finalise now rather than
	// handing back a playable exam. Answers were never synced mid-exam (resume,
	// same-clock policy), so an expired attempt finalises with score 0.
	deadline := examDeadline(attempt.StartedAt, paper)
	remaining := remainingSeconds(deadline, now)
	if remaining <= 0 {
		if err := s.finalizeExpired(ctx, attempt.ID, paper, attempt.StartedAt); err != nil {
			return nil, err
		}
		go s.computeRankings(paperID)
		return nil, httputil.Ewith(http.StatusForbidden, "Exam time has expired",
			map[string]any{"attemptId": attempt.ID})
	}

	questions, err := s.repo.GetQuestionsNoAnswers(ctx, paperID)
	if err != nil {
		return nil, fmt.Errorf("get questions: %w", err)
	}

	return &ExamStartResponse{
		Paper:            summaryFromPaper(paper),
		Questions:        questions,
		Status:           StatusInProgress,
		RemainingSeconds: remaining,
		StartedAt:        attempt.StartedAt,
	}, nil
}

// finalizeExpired submits an in-progress attempt whose deadline has passed,
// scoring whatever answers were persisted (empty ⇒ score 0) and recording the
// full elapsed time capped at the paper duration.
func (s *PapersService) finalizeExpired(ctx context.Context, attemptID uuid.UUID, paper *repository.PaperRow, startedAt time.Time) error {
	timeTaken := int(examDeadline(startedAt, paper).Sub(startedAt).Seconds())
	if timeTaken < 0 {
		timeTaken = 0
	}
	if err := s.repo.CompleteAttempt(ctx, repository.CompleteAttemptParams{
		AttemptID:     attemptID,
		Score:         0,
		Answers:       map[string]string{},
		TimeTakenSecs: timeTaken,
	}); err != nil {
		return fmt.Errorf("finalize expired attempt: %w", err)
	}
	return nil
}

// ── Submit ────────────────────────────────────────────────────────────────────

type SubmitInput struct {
	Answers map[string]string `json:"answers"` // {"0":"A","1":"C",...}
}

type SubmitResult struct {
	Score         int                       `json:"score"`
	Total         int                       `json:"total"`
	Percentage    int                       `json:"percentage"`
	TimeTakenSecs int                       `json:"timeTakenSecs"`
	Rank          *repository.StudentRankRow `json:"rank"`
}

func (s *PapersService) Submit(ctx context.Context, paperID, userID uuid.UUID, in SubmitInput) (*SubmitResult, error) {
	// Reject submissions with no active attempt (not_started).
	attempt, err := s.repo.FindAttempt(ctx, paperID, userID)
	if err != nil {
		return nil, fmt.Errorf("find attempt: %w", err)
	}
	if attempt == nil {
		return nil, httputil.E(http.StatusBadRequest, "No active attempt found")
	}
	if attempt.IsCompleted {
		return nil, httputil.E(http.StatusConflict, "Already submitted")
	}

	paper, err := s.repo.GetPaper(ctx, paperID)
	if err != nil {
		return nil, fmt.Errorf("get paper: %w", err)
	}
	if paper == nil {
		return nil, httputil.E(http.StatusNotFound, "Paper not found")
	}

	// Server-side scoring
	questions, err := s.repo.GetQuestionsWithAnswers(ctx, paperID)
	if err != nil {
		return nil, fmt.Errorf("get questions: %w", err)
	}

	score := 0
	for _, q := range questions {
		// Node uses answers[String(q.sort_order - 1)] — sort_order is 1-indexed, key is 0-indexed
		key := fmt.Sprintf("%d", q.SortOrder-1)
		student := strings.ToUpper(in.Answers[key])
		if student == q.CorrectOption {
			score++
		}
	}

	// Server-authoritative elapsed time, clamped to the exam deadline so a late
	// (e.g. throttled auto-submit) submission can't inflate the ranking tiebreaker.
	now := time.Now()
	if deadline := examDeadline(attempt.StartedAt, paper); now.After(deadline) {
		now = deadline
	}
	timeTaken := int(now.Sub(attempt.StartedAt).Seconds())
	if timeTaken < 0 {
		timeTaken = 0
	}

	if err := s.repo.CompleteAttempt(ctx, repository.CompleteAttemptParams{
		AttemptID:     attempt.ID,
		Score:         score,
		Answers:       in.Answers,
		TimeTakenSecs: timeTaken,
	}); err != nil {
		return nil, fmt.Errorf("complete attempt: %w", err)
	}

	// Compute rankings asynchronously — don't block the response
	go s.computeRankings(paperID)

	// Fetch current rank estimate from DB (may be stale until goroutine completes)
	rank, _ := s.repo.GetStudentRank(ctx, paperID, userID)

	total := len(questions)
	pct := 0
	if total > 0 {
		pct = score * 100 / total
	}
	return &SubmitResult{
		Score:         score,
		Total:         total,
		Percentage:    pct,
		TimeTakenSecs: timeTaken,
		Rank:          rank,
	}, nil
}

// computeRankings recomputes national + district ranks for all attempts on a paper.
// Runs in a background goroutine; mirrors ranking.service.js:computeRankings().
func (s *PapersService) computeRankings(paperID uuid.UUID) {
	ctx := context.Background()
	log := s.log.With(zap.String("paper_id", paperID.String()))
	log.Info("computing rankings")

	attempts, err := s.repo.GetCompletedAttempts(ctx, paperID)
	if err != nil {
		log.Error("get completed attempts", zap.Error(err))
		return
	}

	if err := s.repo.DeleteRankings(ctx, paperID); err != nil {
		log.Error("delete old rankings", zap.Error(err))
		return
	}

	districtCounters := map[string]int32{}
	for i, a := range attempts {
		nat := int32(i + 1)
		dist := "unknown"
		if a.District != nil {
			dist = *a.District
		}
		districtCounters[dist]++
		distRank := districtCounters[dist]

		if err := s.repo.UpsertRanking(ctx, repository.UpsertRankingParams{
			PaperID:       paperID,
			UserID:        a.UserID,
			Score:         a.Score,
			TimeTakenSecs: a.TimeTakenSecs,
			NationalRank:  nat,
			DistrictRank:  distRank,
			District:      a.District,
		}); err != nil {
			log.Error("upsert ranking", zap.Error(err))
			return
		}
	}

	// Invalidate leaderboard cache for this paper
	s.InvalidateLeaderboardCache(ctx, paperID)
	log.Info("rankings computed", zap.Int("count", len(attempts)))
}

// InvalidateLeaderboardCache removes all lb:{paperID}:* keys from Redis.
// Exported so the cron scheduler can call it after ranking recomputes.
func (s *PapersService) InvalidateLeaderboardCache(ctx context.Context, paperID uuid.UUID) {
	pattern := fmt.Sprintf("lb:%s:*", paperID)
	var cursor uint64
	for {
		keys, next, err := s.rdb.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			s.log.Error("scan leaderboard cache keys", zap.Error(err))
			return
		}
		if len(keys) > 0 {
			s.rdb.Del(ctx, keys...)
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

type LeaderboardResult struct {
	Rows   []repository.LeaderboardRow `json:"rows"`
	Total  int                         `json:"total"`
	MyRank *repository.StudentRankRow  `json:"myRank"`
}

func (s *PapersService) GetLeaderboard(ctx context.Context, paperID, userID uuid.UUID, district string, page, limit int) (*LeaderboardResult, error) {
	cacheKey := fmt.Sprintf("lb:%s:%s:%d:%d", paperID, distKey(district), page, limit)

	type cachedLB struct {
		Rows  []repository.LeaderboardRow `json:"rows"`
		Total int                         `json:"total"`
	}

	if raw, err := s.rdb.Get(ctx, cacheKey).Bytes(); err == nil {
		var cached cachedLB
		if json.Unmarshal(raw, &cached) == nil {
			myRank, _ := s.repo.GetStudentRank(ctx, paperID, userID)
			return &LeaderboardResult{Rows: cached.Rows, Total: cached.Total, MyRank: myRank}, nil
		}
	}

	rows, total, err := s.repo.GetLeaderboardFromDB(ctx, paperID, district, page, limit)
	if err != nil {
		return nil, fmt.Errorf("get leaderboard: %w", err)
	}

	if data, err := json.Marshal(cachedLB{Rows: rows, Total: total}); err == nil {
		_ = s.rdb.Set(ctx, cacheKey, data, lbTTL).Err()
	}

	myRank, _ := s.repo.GetStudentRank(ctx, paperID, userID)
	return &LeaderboardResult{Rows: rows, Total: total, MyRank: myRank}, nil
}

// ── Marking scheme ────────────────────────────────────────────────────────────

type MarkingSchemeEntry struct {
	repository.LeaderboardRow // reuse struct — actually different; define inline
}

type MSQuestion struct {
	model.QuestionWithAnswer
	StudentAnswer *string `json:"studentAnswer"`
}

type MarkingSchemeResult struct {
	Questions    []MSQuestion `json:"questions"`
	StudentScore *int16       `json:"studentScore"`
	Total        int          `json:"totalQuestions"`
}

func (s *PapersService) GetMarkingScheme(ctx context.Context, paperID, userID uuid.UUID) (*MarkingSchemeResult, error) {
	paper, err := s.repo.GetPaper(ctx, paperID)
	if err != nil {
		return nil, fmt.Errorf("get paper: %w", err)
	}
	if paper == nil {
		return nil, httputil.E(http.StatusNotFound, "Paper not found")
	}
	if !paper.MSAvailable {
		return nil, httputil.Ewith(http.StatusForbidden, "Marking scheme not yet available",
			map[string]any{"msAvailable": false})
	}

	questions, err := s.repo.GetQuestionsWithAnswers(ctx, paperID)
	if err != nil {
		return nil, fmt.Errorf("get questions: %w", err)
	}

	attempt, err := s.repo.GetCompletedAttempt(ctx, paperID, userID)
	if err != nil {
		return nil, fmt.Errorf("get attempt: %w", err)
	}

	var studentScore *int16
	studentAnswers := map[string]string{}
	if attempt != nil {
		studentScore = &attempt.Score
		studentAnswers = attempt.Answers
	}

	msQs := make([]MSQuestion, len(questions))
	for i, q := range questions {
		sa := studentAnswers[fmt.Sprintf("%d", i)]
		var saPtr *string
		if sa != "" {
			saPtr = &sa
		}
		msQs[i] = MSQuestion{QuestionWithAnswer: q, StudentAnswer: saPtr}
	}

	return &MarkingSchemeResult{
		Questions:    msQs,
		StudentScore: studentScore,
		Total:        len(questions),
	}, nil
}

// ── Admin ─────────────────────────────────────────────────────────────────────

type CreatePaperInput struct {
	Type           string              `json:"type"`
	SubjectID      string              `json:"subject_id"`
	Grade          string              `json:"grade"`
	Title          string              `json:"title"`
	TimeSeconds    int                 `json:"time_seconds"`
	AvailableFrom  time.Time           `json:"available_from"`
	AvailableUntil *time.Time          `json:"available_until"`
	Questions      []QuestionInputJSON `json:"questions"`
}

type QuestionInputJSON struct {
	Slug          string  `json:"slug"`
	SubjectID     *string `json:"subject_id"`
	QuestionText  string  `json:"question_text"`
	OptionA       string  `json:"option_a"`
	OptionB       string  `json:"option_b"`
	OptionC       string  `json:"option_c"`
	OptionD       string  `json:"option_d"`
	CorrectOption string  `json:"correct_option"`
	Explanation   *string `json:"explanation,omitempty"`
}

func (s *PapersService) CreatePaper(ctx context.Context, createdBy uuid.UUID, in CreatePaperInput) (uuid.UUID, error) {
	paperType := model.PaperType(in.Type)
	switch paperType {
	case model.PaperDaily:
		if len(in.Questions) != 10 {
			return uuid.UUID{}, httputil.E(http.StatusUnprocessableEntity, "Daily MCQ must have exactly 10 questions")
		}
		// Auto-set available_until to full calendar day (00:00–23:59 SLST) if not provided
		if in.AvailableUntil == nil {
			until := in.AvailableFrom.Add(24 * time.Hour)
			in.AvailableUntil = &until
		}
	case model.PaperSRP:
		if len(in.Questions) != 50 {
			return uuid.UUID{}, httputil.E(http.StatusUnprocessableEntity, "SRP must have exactly 50 questions")
		}
		srpSlst := time.FixedZone("SLST", 5*3600+30*60)
		srpFrom := in.AvailableFrom.In(srpSlst)
		if srpFrom.Weekday() != time.Saturday {
			return uuid.UUID{}, httputil.E(http.StatusBadRequest, "SRP papers must start on a Saturday (SLST)")
		}
		if in.AvailableUntil == nil {
			sundayEnd := time.Date(
				srpFrom.Year(), srpFrom.Month(), srpFrom.Day()+1,
				23, 59, 59, 0, srpSlst,
			).UTC()
			in.AvailableUntil = &sundayEnd
		}
	default:
		return uuid.UUID{}, httputil.E(http.StatusBadRequest, "type must be 'daily' or 'srp'")
	}

	qs := make([]repository.QuestionInput, len(in.Questions))
	for i, q := range in.Questions {
		slug := q.Slug
		if slug == "" {
			slug = fmt.Sprintf("q-%x-%d", time.Now().UnixNano()>>16, i+1)
		}
		qs[i] = repository.QuestionInput{
			Slug:          slug,
			SubjectID:     q.SubjectID,
			QuestionText:  q.QuestionText,
			OptionA:       q.OptionA,
			OptionB:       q.OptionB,
			OptionC:       q.OptionC,
			OptionD:       q.OptionD,
			CorrectOption: q.CorrectOption,
			Explanation:   q.Explanation,
		}
	}

	return s.repo.CreatePaper(ctx, repository.CreatePaperParams{
		Type:           paperType,
		SubjectID:      in.SubjectID,
		Grade:          model.Grade(in.Grade),
		Title:          in.Title,
		QuestionCount:  len(in.Questions),
		TimeSeconds:    in.TimeSeconds,
		AvailableFrom:  in.AvailableFrom,
		AvailableUntil: in.AvailableUntil,
		CreatedBy:      createdBy,
	}, qs)
}

func (s *PapersService) EnableMarkingScheme(ctx context.Context, paperID uuid.UUID) error {
	if err := s.repo.EnableMarkingScheme(ctx, paperID); err != nil {
		return fmt.Errorf("enable marking scheme: %w", err)
	}
	s.InvalidateLeaderboardCache(ctx, paperID)
	return nil
}

// ── helpers ───────────────────────────────────────────────────────────────────

func distKey(district string) string {
	if district == "" {
		return "all"
	}
	return district
}
