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

// ── Exam start (questions without answers) ────────────────────────────────────

type QuestionsResponse struct {
	Paper     paperSummary   `json:"paper"`
	Questions []model.Question `json:"questions"`
}

type paperSummary struct {
	ID             uuid.UUID  `json:"id"`
	Type           string     `json:"type"`
	Title          string     `json:"title"`
	SubjectID      string     `json:"subject_id"`
	SubjectName    string     `json:"subject_name"`
	Grade          string     `json:"grade"`
	TimeSeconds    int32      `json:"time_seconds"`
	QuestionCount  int16      `json:"question_count"`
	AvailableUntil *time.Time `json:"available_until,omitempty"`
}

func (s *PapersService) GetQuestions(ctx context.Context, paperID, userID uuid.UUID) (*QuestionsResponse, error) {
	paper, err := s.repo.GetPaper(ctx, paperID)
	if err != nil {
		return nil, fmt.Errorf("get paper: %w", err)
	}
	if paper == nil {
		return nil, httputil.E(http.StatusNotFound, "Paper not found")
	}

	// SRP: reject if window has closed
	if paper.Type == model.PaperSRP && paper.AvailableUntil != nil && time.Now().After(*paper.AvailableUntil) {
		return nil, httputil.E(http.StatusForbidden, "SRP window has closed")
	}

	// Check for existing attempt
	attempt, err := s.repo.FindAttempt(ctx, paperID, userID)
	if err != nil {
		return nil, fmt.Errorf("find attempt: %w", err)
	}
	if attempt != nil && attempt.IsCompleted {
		return nil, httputil.Ewith(http.StatusForbidden, "Already attempted",
			map[string]any{"attemptId": attempt.ID})
	}

	// Create attempt record if this is the first access
	if attempt == nil {
		if err := s.repo.CreateAttemptIfNotExists(ctx, userID, paperID, paper.QuestionCount); err != nil {
			return nil, fmt.Errorf("create attempt: %w", err)
		}
	}

	questions, err := s.repo.GetQuestionsNoAnswers(ctx, paperID)
	if err != nil {
		return nil, fmt.Errorf("get questions: %w", err)
	}

	return &QuestionsResponse{
		Paper: paperSummary{
			ID:             paper.ID,
			Type:           string(paper.Type),
			Title:          paper.Title,
			SubjectID:      paper.SubjectID,
			SubjectName:    paper.SubjectName,
			Grade:          string(paper.Grade),
			TimeSeconds:    paper.TimeSeconds,
			QuestionCount:  paper.QuestionCount,
			AvailableUntil: paper.AvailableUntil,
		},
		Questions: questions,
	}, nil
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

	timeTaken := int(time.Since(attempt.StartedAt).Seconds())
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
	case model.PaperSRP:
		if len(in.Questions) != 30 {
			return uuid.UUID{}, httputil.E(http.StatusUnprocessableEntity, "SRP must have exactly 30 questions")
		}
	default:
		return uuid.UUID{}, httputil.E(http.StatusBadRequest, "type must be 'daily' or 'srp'")
	}

	qs := make([]repository.QuestionInput, len(in.Questions))
	for i, q := range in.Questions {
		qs[i] = repository.QuestionInput{
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
