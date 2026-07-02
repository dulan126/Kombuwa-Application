package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/miedvance/api/internal/model"
)

// PapersRepo handles all paper-related DB queries.
type PapersRepo struct {
	pool *pgxpool.Pool
}

// NewPapersRepo creates a PapersRepo.
func NewPapersRepo(pool *pgxpool.Pool) *PapersRepo { return &PapersRepo{pool: pool} }

// ── Paper listing ─────────────────────────────────────────────────────────────

// PaperListFilter carries optional filters for GET /papers.
type PaperListFilter struct {
	Type      string
	SubjectID string
	Grade     string
}

// PaperCard is the row returned for the paper list (joined with attempt status).
type PaperCard struct {
	model.Paper
	SubjectName string     `json:"subject_name"`
	Done        *bool      `json:"done,omitempty"`
	Score       *int16     `json:"score,omitempty"`
	SubmittedAt *time.Time `json:"submitted_at,omitempty"`
}

// ListPapers returns published papers accessible to the student (available_from <= now),
// joined with the student's attempt status for the given userID.
func (r *PapersRepo) ListPapers(ctx context.Context, userID uuid.UUID, f PaperListFilter) ([]PaperCard, error) {
	now := time.Now()

	params := []any{now, userID}
	wheres := []string{"p.is_published = TRUE", "p.available_from <= $1"}

	if f.Type != "" {
		params = append(params, f.Type)
		wheres = append(wheres, fmt.Sprintf("p.type = $%d::paper_type", len(params)))
	}
	if f.SubjectID != "" {
		params = append(params, f.SubjectID)
		wheres = append(wheres, fmt.Sprintf("p.subject_id = $%d", len(params)))
	}
	if f.Grade != "" {
		params = append(params, f.Grade)
		wheres = append(wheres, fmt.Sprintf("p.grade = $%d::grade_enum", len(params)))
	}

	q := fmt.Sprintf(`
		SELECT p.id, p.type, p.subject_id, p.grade, p.title,
		       p.question_count, p.time_seconds,
		       p.available_from, p.available_until,
		       p.ms_available, p.ms_available_at,
		       s.name_si AS subject_name,
		       a.is_completed AS done, a.score, a.submitted_at
		FROM papers p
		JOIN subjects s ON s.id = p.subject_id
		LEFT JOIN attempts a ON a.paper_id = p.id AND a.user_id = $2
		WHERE %s
		ORDER BY p.type DESC, p.available_from DESC`,
		strings.Join(wheres, " AND "),
	)

	rows, err := r.pool.Query(ctx, q, params...)
	if err != nil {
		return nil, fmt.Errorf("list papers: %w", err)
	}
	defer rows.Close()

	var cards []PaperCard
	for rows.Next() {
		var c PaperCard
		var idStr, paperType, grade, subjectID string
		var msAvailableAt *time.Time
		err := rows.Scan(
			&idStr, &paperType, &subjectID, &grade, &c.Title,
			&c.QuestionCount, &c.TimeSeconds,
			&c.AvailableFrom, &c.AvailableUntil,
			&c.MSAvailable, &msAvailableAt,
			&c.SubjectName,
			&c.Done, &c.Score, &c.SubmittedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan paper card: %w", err)
		}
		c.ID, _ = uuid.Parse(idStr)
		c.Type = model.PaperType(paperType)
		c.Grade = model.Grade(grade)
		c.SubjectID = subjectID
		cards = append(cards, c)
	}
	return cards, rows.Err()
}

// ── Paper + question fetching ─────────────────────────────────────────────────

// PaperRow is the paper record used for the questions endpoint.
type PaperRow struct {
	ID             uuid.UUID
	Type           model.PaperType
	SubjectID      string
	SubjectName    string
	Grade          model.Grade
	Title          string
	TimeSeconds    int32
	QuestionCount  int16
	AvailableFrom  time.Time
	AvailableUntil *time.Time
	MSAvailable    bool
	IsPublished    bool
}

// GetPaper returns a published paper by ID (joins subject name).
func (r *PapersRepo) GetPaper(ctx context.Context, paperID uuid.UUID) (*PaperRow, error) {
	const q = `SELECT p.id, p.type, p.subject_id, s.name_si,
	                  p.grade, p.title, p.time_seconds, p.question_count,
	                  p.available_from, p.available_until, p.ms_available, p.is_published
	           FROM papers p
	           JOIN subjects s ON s.id = p.subject_id
	           WHERE p.id = $1 AND p.is_published = TRUE`
	row := r.pool.QueryRow(ctx, q, paperID)

	var p PaperRow
	var idStr, paperType, grade string
	err := row.Scan(
		&idStr, &paperType, &p.SubjectID, &p.SubjectName,
		&grade, &p.Title, &p.TimeSeconds, &p.QuestionCount,
		&p.AvailableFrom, &p.AvailableUntil, &p.MSAvailable, &p.IsPublished,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get paper: %w", err)
	}
	p.ID, _ = uuid.Parse(idStr)
	p.Type = model.PaperType(paperType)
	p.Grade = model.Grade(grade)
	return &p, nil
}

// GetQuestionsNoAnswers returns questions for a paper without correct_option.
func (r *PapersRepo) GetQuestionsNoAnswers(ctx context.Context, paperID uuid.UUID) ([]model.Question, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, sort_order, question_text, option_a, option_b, option_c, option_d, image_url
		 FROM questions WHERE paper_id = $1 ORDER BY sort_order`,
		paperID,
	)
	if err != nil {
		return nil, fmt.Errorf("get questions: %w", err)
	}
	defer rows.Close()

	var qs []model.Question
	for rows.Next() {
		var q model.Question
		if err := rows.Scan(&q.ID, &q.SortOrder, &q.QuestionText,
			&q.OptionA, &q.OptionB, &q.OptionC, &q.OptionD, &q.ImageURL); err != nil {
			return nil, fmt.Errorf("scan question: %w", err)
		}
		qs = append(qs, q)
	}
	return qs, rows.Err()
}

// GetQuestionsWithAnswers returns questions including correct_option (for scoring and marking scheme).
func (r *PapersRepo) GetQuestionsWithAnswers(ctx context.Context, paperID uuid.UUID) ([]model.QuestionWithAnswer, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, sort_order, question_text, option_a, option_b, option_c, option_d,
		        correct_option, explanation, image_url
		 FROM questions WHERE paper_id = $1 ORDER BY sort_order`,
		paperID,
	)
	if err != nil {
		return nil, fmt.Errorf("get questions with answers: %w", err)
	}
	defer rows.Close()

	var qs []model.QuestionWithAnswer
	for rows.Next() {
		var q model.QuestionWithAnswer
		if err := rows.Scan(&q.ID, &q.SortOrder, &q.QuestionText,
			&q.OptionA, &q.OptionB, &q.OptionC, &q.OptionD,
			&q.CorrectOption, &q.Explanation, &q.ImageURL); err != nil {
			return nil, fmt.Errorf("scan question: %w", err)
		}
		qs = append(qs, q)
	}
	return qs, rows.Err()
}

// ── Attempts ──────────────────────────────────────────────────────────────────

// AttemptRow holds minimal attempt state.
type AttemptRow struct {
	ID          uuid.UUID
	IsCompleted bool
	StartedAt   time.Time
}

// FindAttempt returns the existing attempt for user+paper, or nil if none.
func (r *PapersRepo) FindAttempt(ctx context.Context, paperID, userID uuid.UUID) (*AttemptRow, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, is_completed, started_at FROM attempts WHERE paper_id = $1 AND user_id = $2`,
		paperID, userID,
	)
	var a AttemptRow
	var idStr string
	err := row.Scan(&idStr, &a.IsCompleted, &a.StartedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find attempt: %w", err)
	}
	a.ID, _ = uuid.Parse(idStr)
	return &a, nil
}

// CreateAttemptIfNotExists inserts a new attempt record. ON CONFLICT DO NOTHING.
func (r *PapersRepo) CreateAttemptIfNotExists(ctx context.Context, userID, paperID uuid.UUID, totalQ int16) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO attempts (user_id, paper_id, total_questions, started_at)
		 VALUES ($1,$2,$3,NOW())
		 ON CONFLICT (user_id, paper_id) DO NOTHING`,
		userID, paperID, totalQ,
	)
	return err
}

// CompleteAttemptParams carries scoring results for the update.
type CompleteAttemptParams struct {
	AttemptID     uuid.UUID
	Score         int
	Answers       map[string]string // {"0":"A","1":"C",...}
	TimeTakenSecs int
}

// CompleteAttempt marks an attempt as submitted with score + answers.
func (r *PapersRepo) CompleteAttempt(ctx context.Context, p CompleteAttemptParams) error {
	answersJSON, err := json.Marshal(p.Answers)
	if err != nil {
		return fmt.Errorf("marshal answers: %w", err)
	}
	_, err = r.pool.Exec(ctx,
		`UPDATE attempts SET
		   score = $1, answers = $2, submitted_at = NOW(),
		   time_taken_secs = $3, is_completed = TRUE
		 WHERE id = $4`,
		p.Score, string(answersJSON), p.TimeTakenSecs, p.AttemptID,
	)
	return err
}

// AttemptResult holds score + answer data for the marking scheme.
type AttemptResult struct {
	Score          int16
	TotalQuestions int16
	Answers        map[string]string
}

// GetCompletedAttempt returns the completed attempt for user+paper (nil if not found or incomplete).
func (r *PapersRepo) GetCompletedAttempt(ctx context.Context, paperID, userID uuid.UUID) (*AttemptResult, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT score, total_questions, answers FROM attempts
		 WHERE paper_id = $1 AND user_id = $2 AND is_completed = TRUE`,
		paperID, userID,
	)
	var a AttemptResult
	var answersJSON string
	err := row.Scan(&a.Score, &a.TotalQuestions, &answersJSON)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get completed attempt: %w", err)
	}
	if err := json.Unmarshal([]byte(answersJSON), &a.Answers); err != nil {
		a.Answers = map[string]string{}
	}
	return &a, nil
}

// ── Rankings ──────────────────────────────────────────────────────────────────

// RankingAttemptRow is the data needed to compute rankings.
type RankingAttemptRow struct {
	UserID        uuid.UUID
	Score         int16
	TimeTakenSecs int32
	District      *string
}

// GetCompletedAttempts returns all completed attempts for a paper ordered by score desc, time asc.
func (r *PapersRepo) GetCompletedAttempts(ctx context.Context, paperID uuid.UUID) ([]RankingAttemptRow, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT a.user_id, a.score, a.time_taken_secs, u.district
		 FROM attempts a
		 JOIN users u ON u.id = a.user_id
		 WHERE a.paper_id = $1 AND a.is_completed = TRUE
		 ORDER BY a.score DESC, a.time_taken_secs ASC`,
		paperID,
	)
	if err != nil {
		return nil, fmt.Errorf("get completed attempts: %w", err)
	}
	defer rows.Close()

	var out []RankingAttemptRow
	for rows.Next() {
		var row RankingAttemptRow
		var userIDStr string
		if err := rows.Scan(&userIDStr, &row.Score, &row.TimeTakenSecs, &row.District); err != nil {
			return nil, fmt.Errorf("scan attempt row: %w", err)
		}
		row.UserID, _ = uuid.Parse(userIDStr)
		out = append(out, row)
	}
	return out, rows.Err()
}

// DeleteRankings removes all existing rankings for a paper (before recompute).
func (r *PapersRepo) DeleteRankings(ctx context.Context, paperID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM rankings WHERE paper_id = $1`, paperID)
	return err
}

// UpsertRankingParams carries one ranking row to insert or update.
type UpsertRankingParams struct {
	PaperID       uuid.UUID
	UserID        uuid.UUID
	Score         int16
	TimeTakenSecs int32
	NationalRank  int32
	DistrictRank  int32
	District      *string
}

// UpsertRanking inserts or updates a single ranking row.
func (r *PapersRepo) UpsertRanking(ctx context.Context, p UpsertRankingParams) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO rankings (paper_id, user_id, score, time_taken_secs, national_rank, district_rank, district)
		 VALUES ($1,$2,$3,$4,$5,$6,$7)
		 ON CONFLICT (paper_id, user_id) DO UPDATE
		 SET score=$3, time_taken_secs=$4, national_rank=$5, district_rank=$6, computed_at=NOW()`,
		p.PaperID, p.UserID, p.Score, p.TimeTakenSecs, p.NationalRank, p.DistrictRank, p.District,
	)
	return err
}

// LeaderboardRow is one entry in the leaderboard response.
type LeaderboardRow struct {
	NationalRank  int32   `json:"national_rank"`
	DistrictRank  int32   `json:"district_rank"`
	Score         int16   `json:"score"`
	TimeTakenSecs int32   `json:"time_taken_secs"`
	District      *string `json:"district,omitempty"`
	Name          string  `json:"name"`
	School        *string `json:"school,omitempty"`
}

// StudentRankRow is a single student's rank entry.
type StudentRankRow struct {
	NationalRank  int32   `json:"national_rank"`
	DistrictRank  int32   `json:"district_rank"`
	Score         int16   `json:"score"`
	TimeTakenSecs int32   `json:"time_taken_secs"`
	District      *string `json:"district,omitempty"`
}

// GetLeaderboardFromDB returns a paginated leaderboard from the DB.
func (r *PapersRepo) GetLeaderboardFromDB(ctx context.Context, paperID uuid.UUID, district string, page, limit int) ([]LeaderboardRow, int, error) {
	offset := (page - 1) * limit
	params := []any{paperID, limit, offset}
	distWhere := ""
	if district != "" {
		params = append(params, district)
		distWhere = fmt.Sprintf("AND r.district = $%d", len(params))
	}

	rows, err := r.pool.Query(ctx, fmt.Sprintf(`
		SELECT r.national_rank, r.district_rank, r.score, r.time_taken_secs, r.district,
		       u.name, u.school
		FROM rankings r
		JOIN users u ON u.id = r.user_id
		WHERE r.paper_id = $1 %s
		ORDER BY r.national_rank ASC
		LIMIT $2 OFFSET $3`, distWhere),
		params...,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("get leaderboard: %w", err)
	}
	defer rows.Close()

	var out []LeaderboardRow
	for rows.Next() {
		var row LeaderboardRow
		if err := rows.Scan(&row.NationalRank, &row.DistrictRank, &row.Score, &row.TimeTakenSecs,
			&row.District, &row.Name, &row.School); err != nil {
			return nil, 0, fmt.Errorf("scan leaderboard: %w", err)
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	// Count total
	countParams := []any{paperID}
	countWhere := ""
	if district != "" {
		countParams = append(countParams, district)
		countWhere = "AND district = $2"
	}
	var total int
	err = r.pool.QueryRow(ctx,
		fmt.Sprintf(`SELECT COUNT(*) FROM rankings WHERE paper_id = $1 %s`, countWhere),
		countParams...,
	).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("count leaderboard: %w", err)
	}
	return out, total, nil
}

// GetStudentRank returns a single student's ranking row, or nil if not yet ranked.
func (r *PapersRepo) GetStudentRank(ctx context.Context, paperID, userID uuid.UUID) (*StudentRankRow, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT national_rank, district_rank, score, time_taken_secs, district
		 FROM rankings WHERE paper_id = $1 AND user_id = $2`,
		paperID, userID,
	)
	var s StudentRankRow
	err := row.Scan(&s.NationalRank, &s.DistrictRank, &s.Score, &s.TimeTakenSecs, &s.District)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get student rank: %w", err)
	}
	return &s, nil
}

// ── Admin paper management ────────────────────────────────────────────────────

// CreatePaperParams holds all fields for inserting a new paper.
type CreatePaperParams struct {
	Type           model.PaperType
	SubjectID      string
	Grade          model.Grade
	Title          string
	QuestionCount  int
	TimeSeconds    int
	AvailableFrom  time.Time
	AvailableUntil *time.Time
	CreatedBy      uuid.UUID
}

// CreatePaper inserts a paper and its questions in a single transaction.
// Returns the new paper UUID.
func (r *PapersRepo) CreatePaper(ctx context.Context, p CreatePaperParams, qs []QuestionInput) (uuid.UUID, error) {
	var paperID uuid.UUID

	err := withPool(ctx, r.pool, func(tx pgx.Tx) error {
		var idStr string
		err := tx.QueryRow(ctx,
			`INSERT INTO papers (type, subject_id, grade, title, question_count, time_seconds,
			                     available_from, available_until, is_published, created_by)
			 VALUES ($1::paper_type,$2,$3::grade_enum,$4,$5,$6,$7,$8,TRUE,$9) RETURNING id`,
			string(p.Type), p.SubjectID, string(p.Grade), p.Title,
			p.QuestionCount, p.TimeSeconds, p.AvailableFrom, p.AvailableUntil, p.CreatedBy,
		).Scan(&idStr)
		if err != nil {
			return fmt.Errorf("insert paper: %w", err)
		}
		paperID, _ = uuid.Parse(idStr)

		for i, q := range qs {
			if _, err := tx.Exec(ctx,
				`INSERT INTO questions (paper_id, sort_order, question_text, option_a, option_b, option_c, option_d, correct_option, explanation)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
				paperID, i+1, q.QuestionText, q.OptionA, q.OptionB, q.OptionC, q.OptionD, q.CorrectOption, q.Explanation,
			); err != nil {
				return fmt.Errorf("insert question %d: %w", i+1, err)
			}
		}
		return nil
	})
	return paperID, err
}

// QuestionInput is the input shape for creating questions.
type QuestionInput struct {
	QuestionText  string
	OptionA       string
	OptionB       string
	OptionC       string
	OptionD       string
	CorrectOption string
	Explanation   *string
}

// EnableMarkingScheme sets ms_available=TRUE for the given paper.
func (r *PapersRepo) EnableMarkingScheme(ctx context.Context, paperID uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE papers SET ms_available = TRUE, ms_available_at = NOW() WHERE id = $1`,
		paperID,
	)
	return err
}

// ── internal tx helper ────────────────────────────────────────────────────────

// withPool is a local transaction helper (mirrors db.WithTx but takes a pool directly).
func withPool(ctx context.Context, pool *pgxpool.Pool, fn func(pgx.Tx) error) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback(ctx)
			panic(p)
		}
	}()
	if err := fn(tx); err != nil {
		_ = tx.Rollback(ctx)
		return err
	}
	return tx.Commit(ctx)
}
