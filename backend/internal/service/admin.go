package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"github.com/miedvance/api/internal/httputil"
	"github.com/miedvance/api/internal/model"
	"github.com/miedvance/api/internal/repository"
)

const permCacheTTL = 5 * time.Minute

// Subject card summary cache: read-often, changes only on content writes.
// Write-triggered invalidation via invalidateSubjectSummary; TTL is a safety net.
const (
	subjectSummaryCacheKey = "admin:subject_summary"
	subjectSummaryTTL      = 5 * time.Minute
)

// AdminService implements all admin business logic.
type AdminService struct {
	repo       *repository.AdminRepo
	papersRepo *repository.PapersRepo
	papersSvc  *PapersService
	rbacRepo   *repository.RBACRepo
	poolRepo   *repository.QuestionPoolRepo
	media      *MediaService
	rdb        *redis.Client
	log        *zap.Logger
}

// NewAdminService creates an AdminService.
func NewAdminService(
	repo *repository.AdminRepo,
	papersRepo *repository.PapersRepo,
	papersSvc *PapersService,
	rbacRepo *repository.RBACRepo,
	poolRepo *repository.QuestionPoolRepo,
	media *MediaService,
	rdb *redis.Client,
	log *zap.Logger,
) *AdminService {
	return &AdminService{
		repo:       repo,
		papersRepo: papersRepo,
		papersSvc:  papersSvc,
		rbacRepo:   rbacRepo,
		poolRepo:   poolRepo,
		media:      media,
		rdb:        rdb,
		log:        log,
	}
}

// Media exposes the media service for handler wiring (upload/remove/serve).
func (s *AdminService) Media() *MediaService { return s.media }

// ── Stats ─────────────────────────────────────────────────────────────────────

func (s *AdminService) GetStats(ctx context.Context) (*repository.Stats, error) {
	return s.repo.GetStats(ctx)
}

// ── Papers ────────────────────────────────────────────────────────────────────

// PapersPage is the paginated response for admin paper listing.
type PapersPage struct {
	Papers []repository.AdminPaperRow `json:"papers"`
	Total  int                        `json:"total"`
}

func (s *AdminService) ListPapers(ctx context.Context, f repository.AdminPaperFilter, page, limit int) (*PapersPage, error) {
	papers, total, err := s.repo.ListPapers(ctx, f, page, limit)
	if err != nil {
		return nil, err
	}
	if papers == nil {
		papers = []repository.AdminPaperRow{}
	}
	return &PapersPage{Papers: papers, Total: total}, nil
}

func (s *AdminService) GetPaper(ctx context.Context, paperID uuid.UUID) (*repository.AdminPaperRow, error) {
	paper, err := s.repo.GetPaper(ctx, paperID)
	if err != nil {
		return nil, fmt.Errorf("get paper: %w", err)
	}
	if paper == nil {
		return nil, httputil.E(http.StatusNotFound, "Paper not found")
	}
	// Attach reference-PDF URLs for past papers so the builder can show them.
	if paper.Type == model.PaperPastPaper && s.media != nil {
		if pdfs, err := s.media.PaperPDFs(ctx, paperID); err == nil {
			paper.Pdfs = pdfs
		}
	}
	return paper, nil
}

func (s *AdminService) SetPaperPublished(ctx context.Context, paperID uuid.UUID, publish bool) (map[string]any, error) {
	result, err := s.repo.SetPaperPublished(ctx, paperID, publish)
	if err != nil {
		return nil, fmt.Errorf("set published: %w", err)
	}
	s.invalidateSubjectSummary(ctx)
	return map[string]any{"id": paperID, "is_published": result}, nil
}

// CreateDraftPaperInput holds fields for creating a blank draft paper.
type CreateDraftPaperInput struct {
	Type           string     `json:"type"`
	SubjectID      string     `json:"subject_id"`
	Grade          string     `json:"grade"`
	Title          string     `json:"title"`
	TimeSeconds    int        `json:"time_seconds"`
	AvailableFrom  time.Time  `json:"available_from"`
	AvailableUntil *time.Time `json:"available_until"`
}

// dayConflictMsg is the 409 message for the one-paper-per-type-per-day rule.
func dayConflictMsg(t model.PaperType) string {
	label := "Daily MCQ"
	if t == model.PaperSRP {
		label = "SRP"
	}
	return fmt.Sprintf("A %s paper already exists for this subject on that day", label)
}

// CreateDraftPaper creates a blank draft paper with no questions.
func (s *AdminService) CreateDraftPaper(ctx context.Context, createdBy uuid.UUID, in CreateDraftPaperInput) (uuid.UUID, error) {
	if in.Title == "" || in.SubjectID == "" || in.Type == "" {
		return uuid.UUID{}, httputil.E(http.StatusBadRequest, "type, subject_id, and title are required")
	}
	paperType := model.PaperType(in.Type)
	// Grade (12/13) is a level; past papers carry none.
	if paperType != model.PaperPastPaper && in.Grade == "" {
		return uuid.UUID{}, httputil.E(http.StatusBadRequest, "grade is required")
	}
	slst := time.FixedZone("SLST", 5*3600+30*60)
	switch paperType {
	case model.PaperSRP:
		fromSLST := in.AvailableFrom.In(slst)
		if fromSLST.Weekday() != time.Saturday {
			return uuid.UUID{}, httputil.E(http.StatusBadRequest, "SRP papers must start on a Saturday (SLST)")
		}
		sundayEnd := time.Date(
			fromSLST.Year(), fromSLST.Month(), fromSLST.Day()+1,
			23, 59, 59, 0, slst,
		).UTC()
		in.AvailableUntil = &sundayEnd
	case model.PaperPastPaper:
		// Past papers have no schedule: always available, no countdown, and no
		// one-per-day rule. Normalise timing fields.
		in.AvailableFrom = time.Now()
		in.AvailableUntil = nil
		in.TimeSeconds = 0
	}

	// One paper per type, per subject, per day — daily/SRP only (past papers may
	// share a day; many can exist per subject).
	if paperType != model.PaperPastPaper {
		exists, err := s.papersRepo.PaperExistsOnDay(ctx, in.SubjectID, paperType, in.AvailableFrom, uuid.Nil)
		if err != nil {
			return uuid.UUID{}, fmt.Errorf("check existing paper: %w", err)
		}
		if exists {
			return uuid.UUID{}, httputil.E(http.StatusConflict, dayConflictMsg(paperType))
		}
	}

	id, err := s.papersRepo.CreatePaper(ctx, repository.CreatePaperParams{
		Type:           paperType,
		SubjectID:      in.SubjectID,
		Grade:          model.Grade(in.Grade),
		Title:          in.Title,
		QuestionCount:  0,
		TimeSeconds:    in.TimeSeconds,
		AvailableFrom:  in.AvailableFrom,
		AvailableUntil: in.AvailableUntil,
		CreatedBy:      createdBy,
	}, nil)
	if err != nil {
		return uuid.UUID{}, err
	}
	s.invalidateSubjectSummary(ctx)
	return id, nil
}

// UpdatePaperInput holds editable paper fields.
type UpdatePaperInput struct {
	Title          string     `json:"title"`
	SubjectID      string     `json:"subject_id"`
	Grade          string     `json:"grade"`
	TimeSeconds    int32      `json:"time_seconds"`
	AvailableFrom  time.Time  `json:"available_from"`
	AvailableUntil *time.Time `json:"available_until"`
}

func (s *AdminService) UpdatePaper(ctx context.Context, paperID uuid.UUID, in UpdatePaperInput) (*model.Paper, error) {
	if in.Title == "" || in.SubjectID == "" || in.Grade == "" || in.TimeSeconds <= 0 {
		return nil, httputil.E(http.StatusBadRequest, "title, subject_id, grade, and time_seconds are required")
	}

	// Type is immutable on update; fetch it to enforce one-paper-per-day when the
	// subject or date changes (excluding this paper's own row).
	existing, err := s.repo.GetPaper(ctx, paperID)
	if err != nil {
		return nil, fmt.Errorf("get paper: %w", err)
	}
	if existing == nil {
		return nil, httputil.E(http.StatusNotFound, "Paper not found")
	}
	exists, err := s.papersRepo.PaperExistsOnDay(ctx, in.SubjectID, existing.Type, in.AvailableFrom, paperID)
	if err != nil {
		return nil, fmt.Errorf("check existing paper: %w", err)
	}
	if exists {
		return nil, httputil.E(http.StatusConflict, dayConflictMsg(existing.Type))
	}

	paper, err := s.repo.UpdatePaper(ctx, paperID, repository.UpdatePaperParams{
		Title:          in.Title,
		SubjectID:      in.SubjectID,
		Grade:          in.Grade,
		TimeSeconds:    in.TimeSeconds,
		AvailableFrom:  in.AvailableFrom,
		AvailableUntil: in.AvailableUntil,
	})
	if err != nil {
		return nil, fmt.Errorf("update paper: %w", err)
	}
	if paper == nil {
		return nil, httputil.E(http.StatusNotFound, "Paper not found")
	}
	s.invalidateSubjectSummary(ctx)
	return paper, nil
}

func (s *AdminService) DeletePaper(ctx context.Context, paperID uuid.UUID) error {
	// Capture PDF keys before the row (and its cascaded paper_media rows) go away.
	var pdfKeys []string
	if s.media != nil {
		pdfKeys, _ = s.media.KeysForPaper(ctx, paperID)
	}

	if err := s.repo.DeletePaper(ctx, paperID); err != nil {
		if err.Error() == "no rows in result set" {
			return httputil.E(http.StatusNotFound, "Paper not found")
		}
		return fmt.Errorf("delete paper: %w", err)
	}
	if s.media != nil {
		s.media.DeleteFiles(pdfKeys)
	}
	s.invalidateSubjectSummary(ctx)
	return nil
}

// TriggerRankings synchronously computes rankings for a paper (admin-initiated).
func (s *AdminService) TriggerRankings(ctx context.Context, paperID uuid.UUID) error {
	paper, err := s.papersRepo.GetPaper(ctx, paperID)
	if err != nil {
		return fmt.Errorf("get paper: %w", err)
	}
	if paper == nil {
		return httputil.E(http.StatusNotFound, "Paper not found")
	}

	attempts, err := s.papersRepo.GetCompletedAttempts(ctx, paperID)
	if err != nil {
		return fmt.Errorf("get attempts: %w", err)
	}
	if err := s.papersRepo.DeleteRankings(ctx, paperID); err != nil {
		return fmt.Errorf("delete rankings: %w", err)
	}

	districtCounters := map[string]int32{}
	for i, a := range attempts {
		nat := int32(i + 1)
		dist := "unknown"
		if a.District != nil {
			dist = *a.District
		}
		districtCounters[dist]++
		if err := s.papersRepo.UpsertRanking(ctx, repository.UpsertRankingParams{
			PaperID:       paperID,
			UserID:        a.UserID,
			Score:         a.Score,
			TimeTakenSecs: a.TimeTakenSecs,
			NationalRank:  nat,
			DistrictRank:  districtCounters[dist],
			District:      a.District,
		}); err != nil {
			return fmt.Errorf("upsert ranking: %w", err)
		}
	}

	s.papersSvc.InvalidateLeaderboardCache(ctx, paperID)
	s.log.Info("rankings triggered by admin", zap.String("paper_id", paperID.String()))
	return nil
}

// ── Question pool ─────────────────────────────────────────────────────────────

// PoolQuestionInput is the payload for creating or updating a pool question.
type PoolQuestionInput struct {
	Slug          string  `json:"slug"`
	SubjectID     *string `json:"subject_id"`
	TopicID       *int32  `json:"topic_id"`
	QuestionText  string  `json:"question_text"`
	OptionA       string  `json:"option_a"`
	OptionB       string  `json:"option_b"`
	OptionC       string  `json:"option_c"`
	OptionD       string  `json:"option_d"`
	OptionE       string  `json:"option_e"`
	CorrectOption string  `json:"correct_option"`
	Explanation   *string `json:"explanation"`
	ImageURL      *string `json:"image_url"`
	// IsPp defaults false (pool-authored); set true when authored via the
	// past-paper builder. Ignored on update (origin is immutable).
	IsPp bool `json:"is_pp"`
}

func (s *AdminService) ListPoolQuestions(ctx context.Context, f repository.PoolFilter) ([]model.PoolQuestion, int, error) {
	qs, total, err := s.poolRepo.ListPoolQuestions(ctx, f)
	if err != nil {
		return nil, 0, err
	}
	if s.media != nil && len(qs) > 0 {
		ids := make([]int, len(qs))
		for i := range qs {
			ids[i] = int(qs[i].ID)
		}
		imgs, err := s.media.AdminImagesFor(ctx, ids)
		if err != nil {
			return nil, 0, err
		}
		for i := range qs {
			if m := imgs[int(qs[i].ID)]; len(m) > 0 {
				qs[i].Images = m
			}
		}
	}
	return qs, total, nil
}

func (s *AdminService) CreatePoolQuestion(ctx context.Context, createdBy uuid.UUID, in PoolQuestionInput) (*model.PoolQuestion, error) {
	if err := validatePoolQuestion(in); err != nil {
		return nil, err
	}

	slug := in.Slug
	if slug == "" {
		var err error
		slug, err = s.uniqueSlug(ctx, in.QuestionText)
		if err != nil {
			return nil, err
		}
	} else {
		exists, err := s.poolRepo.SlugExists(ctx, slug)
		if err != nil {
			return nil, fmt.Errorf("check slug: %w", err)
		}
		if exists {
			return nil, httputil.Ewith(http.StatusConflict, "Slug already in use", map[string]any{"slug": slug})
		}
	}

	q, err := s.poolRepo.CreatePoolQuestion(ctx, repository.CreatePoolQuestionParams{
		Slug:          slug,
		SubjectID:     in.SubjectID,
		TopicID:       in.TopicID,
		QuestionText:  in.QuestionText,
		OptionA:       in.OptionA,
		OptionB:       in.OptionB,
		OptionC:       in.OptionC,
		OptionD:       in.OptionD,
		OptionE:       in.OptionE,
		CorrectOption: strings.ToUpper(in.CorrectOption),
		Explanation:   in.Explanation,
		ImageURL:      in.ImageURL,
		IsPp:          in.IsPp,
		CreatedBy:     createdBy,
	})
	if err == repository.ErrSlugConflict {
		return nil, httputil.Ewith(http.StatusConflict, "Slug already in use", map[string]any{"slug": slug})
	}
	if err != nil {
		return nil, fmt.Errorf("create pool question: %w", err)
	}
	s.invalidateSubjectSummary(ctx)
	return q, nil
}

func (s *AdminService) UpdatePoolQuestion(ctx context.Context, id int, in PoolQuestionInput) (*model.PoolQuestion, error) {
	if err := validatePoolQuestion(in); err != nil {
		return nil, err
	}
	q, err := s.poolRepo.UpdatePoolQuestion(ctx, id, repository.UpdatePoolQuestionParams{
		SubjectID:     in.SubjectID,
		TopicID:       in.TopicID,
		QuestionText:  in.QuestionText,
		OptionA:       in.OptionA,
		OptionB:       in.OptionB,
		OptionC:       in.OptionC,
		OptionD:       in.OptionD,
		OptionE:       in.OptionE,
		CorrectOption: strings.ToUpper(in.CorrectOption),
		Explanation:   in.Explanation,
		ImageURL:      in.ImageURL,
		IsPp:          in.IsPp,
	})
	if err != nil {
		return nil, fmt.Errorf("update pool question: %w", err)
	}
	if q == nil {
		return nil, httputil.E(http.StatusNotFound, "Question not found")
	}
	s.invalidateSubjectSummary(ctx)
	return q, nil
}

func (s *AdminService) DeletePoolQuestion(ctx context.Context, id int) error {
	// List image keys BEFORE deleting: the question's media rows cascade away
	// with it, so we capture the files to remove first and delete them only
	// after the row delete succeeds.
	var mediaKeys []string
	if s.media != nil {
		mediaKeys, _ = s.media.KeysForQuestion(ctx, id)
	}

	err := s.poolRepo.DeletePoolQuestion(ctx, id)
	if err == repository.ErrQuestionInUse {
		return httputil.E(http.StatusConflict, "Question is attached to one or more papers — detach it first")
	}
	if err != nil {
		return fmt.Errorf("delete pool question: %w", err)
	}
	if s.media != nil {
		s.media.DeleteFiles(mediaKeys)
	}
	s.invalidateSubjectSummary(ctx)
	return nil
}

// ── Paper-question builder ────────────────────────────────────────────────────

// AttachQuestionInput is the body for POST /admin/papers/{id}/questions.
// Set QuestionID to attach an existing pool question.
// Set QuestionID to 0 and fill the question fields to author inline.
type AttachQuestionInput struct {
	QuestionID        int `json:"question_id"`
	PoolQuestionInput     // embedded for inline authoring
}

func (s *AdminService) ListPaperQuestions(ctx context.Context, paperID uuid.UUID) ([]model.PaperQuestion, error) {
	qs, err := s.poolRepo.ListPaperQuestions(ctx, paperID)
	if err != nil {
		return nil, err
	}
	if s.media != nil && len(qs) > 0 {
		ids := make([]int, len(qs))
		for i := range qs {
			ids[i] = int(qs[i].ID)
		}
		imgs, err := s.media.AdminImagesFor(ctx, ids)
		if err != nil {
			return nil, err
		}
		for i := range qs {
			if m := imgs[int(qs[i].ID)]; len(m) > 0 {
				qs[i].Images = m
			}
		}
	}
	return qs, nil
}

func (s *AdminService) AttachQuestion(ctx context.Context, paperID uuid.UUID, createdBy uuid.UUID, in AttachQuestionInput) (*model.PaperQuestion, error) {
	var questionID int

	if in.QuestionID != 0 {
		// Attach existing pool question
		questionID = in.QuestionID
		q, err := s.poolRepo.GetPoolQuestion(ctx, questionID)
		if err != nil {
			return nil, fmt.Errorf("get question: %w", err)
		}
		if q == nil {
			return nil, httputil.E(http.StatusNotFound, "Question not found in pool")
		}
	} else {
		// Create inline — auto-slug from text, then attach. is_pp comes straight
		// from the form: the past-paper builder pre-ticks it, but the admin can
		// change it, so the submitted value wins (no server-side override).
		newQ, err := s.CreatePoolQuestion(ctx, createdBy, in.PoolQuestionInput)
		if err != nil {
			return nil, err
		}
		questionID = int(newQ.ID)
	}

	// Determine next sort order
	order, err := s.poolRepo.NextSortOrder(ctx, paperID)
	if err != nil {
		return nil, fmt.Errorf("next sort order: %w", err)
	}

	if err := s.poolRepo.AttachToPaper(ctx, paperID, questionID, order); err != nil {
		if err == repository.ErrDuplicateAttachment {
			return nil, httputil.E(http.StatusConflict, "Question already attached to this paper")
		}
		return nil, fmt.Errorf("attach question: %w", err)
	}

	// Return updated question list as confirmation
	pqs, err := s.poolRepo.ListPaperQuestions(ctx, paperID)
	if err != nil {
		return nil, err
	}
	for i := range pqs {
		if int(pqs[i].ID) == questionID {
			q := pqs[i]
			return &q, nil
		}
	}
	return nil, nil
}

func (s *AdminService) DetachQuestion(ctx context.Context, paperID uuid.UUID, questionID int) error {
	return s.poolRepo.DetachFromPaper(ctx, paperID, questionID)
}

func (s *AdminService) ReorderQuestion(ctx context.Context, paperID uuid.UUID, questionID int, order int16) error {
	return s.poolRepo.UpdateSortOrder(ctx, paperID, questionID, order)
}

// ── Users ─────────────────────────────────────────────────────────────────────

// UsersPage is the paginated response for admin user listing.
type UsersPage struct {
	Users []repository.AdminUserRow `json:"users"`
	Total int                       `json:"total"`
}

func (s *AdminService) ListUsers(ctx context.Context, f repository.AdminUserFilter) (*UsersPage, error) {
	users, total, err := s.repo.ListUsers(ctx, f)
	if err != nil {
		return nil, err
	}
	if users == nil {
		users = []repository.AdminUserRow{}
	}
	return &UsersPage{Users: users, Total: total}, nil
}

func (s *AdminService) UpdateUserRole(ctx context.Context, userID uuid.UUID, role string) error {
	r := model.UserRole(role)
	switch r {
	case model.RoleStudent, model.RoleTeacher, model.RoleAdmin, model.RoleEditor:
	default:
		return httputil.E(http.StatusBadRequest, "invalid role: must be student, teacher, admin, or editor")
	}
	found, err := s.repo.UpdateUserRole(ctx, userID, r)
	if err != nil {
		return fmt.Errorf("update user role: %w", err)
	}
	if !found {
		return httputil.E(http.StatusNotFound, "User not found")
	}
	return nil
}

func (s *AdminService) UpdateUserStatus(ctx context.Context, userID uuid.UUID, isActive bool) error {
	found, err := s.repo.UpdateUserStatus(ctx, userID, isActive)
	if err != nil {
		return fmt.Errorf("update user status: %w", err)
	}
	if !found {
		return httputil.E(http.StatusNotFound, "User not found")
	}
	return nil
}

// ── Streams ───────────────────────────────────────────────────────────────────

func (s *AdminService) ListStreams(ctx context.Context) ([]repository.StreamRow, error) {
	streams, err := s.repo.ListStreams(ctx)
	if streams == nil {
		streams = []repository.StreamRow{}
	}
	return streams, err
}

func (s *AdminService) CreateStream(ctx context.Context, row repository.StreamRow) error {
	if row.ID == "" || row.Name == "" {
		return httputil.E(http.StatusBadRequest, "id and name are required")
	}
	return s.repo.CreateStream(ctx, row)
}

func (s *AdminService) DeleteStream(ctx context.Context, id string) error {
	if err := s.repo.DeleteStream(ctx, id); err != nil {
		return httputil.E(http.StatusNotFound, "Stream not found")
	}
	return nil
}

// ── Subjects ──────────────────────────────────────────────────────────────────

func (s *AdminService) ListSubjects(ctx context.Context) ([]repository.SubjectRow, error) {
	subjects, err := s.repo.ListSubjects(ctx)
	if subjects == nil {
		subjects = []repository.SubjectRow{}
	}
	return subjects, err
}

// SubjectSummaries returns per-subject content counts for the admin landing
// cards, cached in Redis (write-invalidated + TTL safety net).
func (s *AdminService) SubjectSummaries(ctx context.Context) ([]repository.SubjectSummaryRow, error) {
	if raw, err := s.rdb.Get(ctx, subjectSummaryCacheKey).Bytes(); err == nil {
		var cached []repository.SubjectSummaryRow
		if json.Unmarshal(raw, &cached) == nil {
			return cached, nil
		}
	}

	rows, err := s.repo.SubjectSummaries(ctx)
	if err != nil {
		return nil, fmt.Errorf("subject summaries: %w", err)
	}
	if rows == nil {
		rows = []repository.SubjectSummaryRow{}
	}
	if data, err := json.Marshal(rows); err == nil {
		_ = s.rdb.Set(ctx, subjectSummaryCacheKey, data, subjectSummaryTTL).Err()
	}
	return rows, nil
}

// invalidateSubjectSummary drops the cached card counts. Called after any write
// that changes per-subject paper or question counts so cards never go stale.
func (s *AdminService) invalidateSubjectSummary(ctx context.Context) {
	_ = s.rdb.Del(ctx, subjectSummaryCacheKey).Err()
}

func (s *AdminService) CreateSubject(ctx context.Context, id, nameSi string) error {
	if id == "" || nameSi == "" {
		return httputil.E(http.StatusBadRequest, "id and name_si are required")
	}
	if err := s.repo.CreateSubject(ctx, id, nameSi); err != nil {
		return err
	}
	s.invalidateSubjectSummary(ctx)
	return nil
}

func (s *AdminService) DeleteSubject(ctx context.Context, id string) error {
	if err := s.repo.DeleteSubject(ctx, id); err != nil {
		if err == repository.ErrSubjectInUse {
			return httputil.E(http.StatusConflict, "Subject still has papers or questions — move or delete them first")
		}
		return httputil.E(http.StatusNotFound, "Subject not found")
	}
	s.invalidateSubjectSummary(ctx)
	return nil
}

func (s *AdminService) ListStreamSubjects(ctx context.Context, streamID string) ([]repository.SubjectRow, error) {
	subjects, err := s.repo.ListStreamSubjects(ctx, streamID)
	if subjects == nil {
		subjects = []repository.SubjectRow{}
	}
	return subjects, err
}

func (s *AdminService) AddSubjectToStream(ctx context.Context, streamID, subjectID string) error {
	if streamID == "" || subjectID == "" {
		return httputil.E(http.StatusBadRequest, "stream_id and subject_id are required")
	}
	return s.repo.AddSubjectToStream(ctx, streamID, subjectID)
}

func (s *AdminService) RemoveSubjectFromStream(ctx context.Context, streamID, subjectID string) error {
	return s.repo.RemoveSubjectFromStream(ctx, streamID, subjectID)
}

// ── Topics ────────────────────────────────────────────────────────────────────

func (s *AdminService) CreateTopic(ctx context.Context, subjectID, nameSi string) (int32, error) {
	if subjectID == "" || len(nameSi) < 2 {
		return 0, httputil.E(http.StatusBadRequest, "subject_id and name_si (min 2 chars) are required")
	}
	return s.repo.CreateTopic(ctx, subjectID, nameSi)
}

func (s *AdminService) ListTopics(ctx context.Context, subjectID string) ([]model.Topic, error) {
	return s.repo.ListTopics(ctx, subjectID)
}

func (s *AdminService) DeleteTopic(ctx context.Context, id int32) error {
	return s.repo.DeleteTopic(ctx, id)
}

// ── RBAC ──────────────────────────────────────────────────────────────────────

// HasPermission checks whether a role has a given permission code.
// Results are cached in Redis for permCacheTTL.
// Implements middleware.PermissionChecker.
func (s *AdminService) HasPermission(ctx context.Context, role model.UserRole, code string) (bool, error) {
	cacheKey := "perm:" + string(role)

	// Try Redis cache first
	if raw, err := s.rdb.Get(ctx, cacheKey).Bytes(); err == nil {
		var codes []string
		if json.Unmarshal(raw, &codes) == nil {
			for _, c := range codes {
				if c == code {
					return true, nil
				}
			}
			return false, nil
		}
	}

	// Cache miss: load from DB
	codes, err := s.rbacRepo.GetPermissionsForRole(ctx, role)
	if err != nil {
		return false, fmt.Errorf("load permissions: %w", err)
	}

	// Cache the result
	if data, err := json.Marshal(codes); err == nil {
		_ = s.rdb.Set(ctx, cacheKey, data, permCacheTTL).Err()
	}

	for _, c := range codes {
		if c == code {
			return true, nil
		}
	}
	return false, nil
}

func (s *AdminService) ListPermissions(ctx context.Context) ([]model.Permission, error) {
	return s.rbacRepo.ListPermissions(ctx)
}

func (s *AdminService) GetRolePermissions(ctx context.Context, role model.UserRole) ([]string, error) {
	return s.rbacRepo.GetPermissionsForRole(ctx, role)
}

func (s *AdminService) SetRolePermissions(ctx context.Context, role model.UserRole, codes []string) error {
	// Validate all codes exist
	all, err := s.rbacRepo.ListPermissions(ctx)
	if err != nil {
		return fmt.Errorf("list permissions: %w", err)
	}
	valid := map[string]bool{}
	for _, p := range all {
		valid[p.Code] = true
	}
	for _, c := range codes {
		if !valid[c] {
			return httputil.Ewith(http.StatusBadRequest, "Unknown permission code", map[string]any{"code": c})
		}
	}

	if err := s.rbacRepo.SetPermissionsForRole(ctx, role, codes); err != nil {
		return fmt.Errorf("set permissions: %w", err)
	}

	// Invalidate cache for this role
	_ = s.rdb.Del(ctx, "perm:"+string(role)).Err()
	return nil
}

// ── slug helpers ──────────────────────────────────────────────────────────────

var nonAlphanumRE = regexp.MustCompile(`[^a-z0-9\s-]`)
var multiSpaceRE = regexp.MustCompile(`\s+`)

func autoSlug(text string) string {
	lower := strings.Map(func(r rune) rune {
		if unicode.IsUpper(r) {
			return unicode.ToLower(r)
		}
		return r
	}, text)
	clean := nonAlphanumRE.ReplaceAllString(lower, "")
	clean = multiSpaceRE.ReplaceAllString(strings.TrimSpace(clean), "-")

	// Take first 8 words
	words := strings.SplitN(clean, "-", 9)
	if len(words) > 8 {
		words = words[:8]
	}
	slug := strings.Join(words, "-")
	if len(slug) > 80 {
		slug = slug[:80]
	}
	// Trim trailing dash
	return strings.TrimRight(slug, "-")
}

func (s *AdminService) uniqueSlug(ctx context.Context, text string) (string, error) {
	base := autoSlug(text)
	if base == "" {
		base = "q"
	}

	for i := 0; i < 6; i++ {
		candidate := base
		if i > 0 {
			// Append a short random-ish suffix based on current time
			candidate = fmt.Sprintf("%s-%x", base, (time.Now().UnixNano()>>16)&0xffff)
		}
		exists, err := s.poolRepo.SlugExists(ctx, candidate)
		if err != nil {
			return "", fmt.Errorf("check slug: %w", err)
		}
		if !exists {
			return candidate, nil
		}
	}
	return "", httputil.E(http.StatusConflict, "Could not generate a unique slug — provide one manually")
}

// ── validation ────────────────────────────────────────────────────────────────

func validatePoolQuestion(in PoolQuestionInput) error {
	// Every question must belong to a subject (DB enforces NOT NULL too).
	if in.SubjectID == nil || *in.SubjectID == "" {
		return httputil.E(http.StatusBadRequest, "subject_id is required")
	}
	// Every MCQ must have exactly 5 non-empty options.
	if in.QuestionText == "" || in.OptionA == "" || in.OptionB == "" || in.OptionC == "" || in.OptionD == "" || in.OptionE == "" {
		return httputil.E(http.StatusBadRequest, "question_text and all 5 options (a–e) are required")
	}
	co := strings.ToUpper(in.CorrectOption)
	if co != "A" && co != "B" && co != "C" && co != "D" && co != "E" {
		return httputil.E(http.StatusBadRequest, "correct_option must be A, B, C, D, or E")
	}
	return nil
}
