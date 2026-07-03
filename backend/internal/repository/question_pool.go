package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/miedvance/api/internal/model"
)

// QuestionPoolRepo handles all question-pool and paper-question join queries.
type QuestionPoolRepo struct {
	pool *pgxpool.Pool
}

// NewQuestionPoolRepo creates a QuestionPoolRepo.
func NewQuestionPoolRepo(pool *pgxpool.Pool) *QuestionPoolRepo {
	return &QuestionPoolRepo{pool: pool}
}

// PoolFilter carries optional filters for listing pool questions.
type PoolFilter struct {
	SubjectID    string
	SlugContains string
	Page         int
	Limit        int
}

// ListPoolQuestions returns paginated pool questions with total count.
func (r *QuestionPoolRepo) ListPoolQuestions(ctx context.Context, f PoolFilter) ([]model.PoolQuestion, int, error) {
	if f.Limit <= 0 {
		f.Limit = 30
	}
	if f.Page < 1 {
		f.Page = 1
	}
	offset := (f.Page - 1) * f.Limit

	params := []any{}
	wheres := []string{"1=1"}

	if f.SubjectID != "" {
		params = append(params, f.SubjectID)
		wheres = append(wheres, fmt.Sprintf("subject_id = $%d", len(params)))
	}
	if f.SlugContains != "" {
		params = append(params, "%"+f.SlugContains+"%")
		wheres = append(wheres, fmt.Sprintf("slug ILIKE $%d", len(params)))
	}

	whereClause := "WHERE " + joinAnd(wheres)

	// Total count
	var total int
	countQ := fmt.Sprintf(`SELECT COUNT(*) FROM questions %s`, whereClause)
	if err := r.pool.QueryRow(ctx, countQ, params...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count pool questions: %w", err)
	}

	params = append(params, f.Limit, offset)
	dataQ := fmt.Sprintf(`
		SELECT id, slug, subject_id, question_text, option_a, option_b, option_c, option_d,
		       correct_option, explanation, image_url, created_by, created_at
		FROM questions %s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d`,
		whereClause, len(params)-1, len(params),
	)

	rows, err := r.pool.Query(ctx, dataQ, params...)
	if err != nil {
		return nil, 0, fmt.Errorf("list pool questions: %w", err)
	}
	defer rows.Close()

	var out []model.PoolQuestion
	for rows.Next() {
		var q model.PoolQuestion
		var createdByStr *string
		if err := rows.Scan(
			&q.ID, &q.Slug, &q.SubjectID, &q.QuestionText,
			&q.OptionA, &q.OptionB, &q.OptionC, &q.OptionD,
			&q.CorrectOption, &q.Explanation, &q.ImageURL,
			&createdByStr, &q.CreatedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("scan pool question: %w", err)
		}
		if createdByStr != nil {
			id, _ := uuid.Parse(*createdByStr)
			q.CreatedBy = &id
		}
		out = append(out, q)
	}
	return out, total, rows.Err()
}

// GetPoolQuestion returns a single pool question by ID.
func (r *QuestionPoolRepo) GetPoolQuestion(ctx context.Context, id int) (*model.PoolQuestion, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, slug, subject_id, question_text, option_a, option_b, option_c, option_d,
		        correct_option, explanation, image_url, created_by, created_at
		 FROM questions WHERE id = $1`,
		id,
	)
	var q model.PoolQuestion
	var createdByStr *string
	err := row.Scan(
		&q.ID, &q.Slug, &q.SubjectID, &q.QuestionText,
		&q.OptionA, &q.OptionB, &q.OptionC, &q.OptionD,
		&q.CorrectOption, &q.Explanation, &q.ImageURL,
		&createdByStr, &q.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get pool question: %w", err)
	}
	if createdByStr != nil {
		id, _ := uuid.Parse(*createdByStr)
		q.CreatedBy = &id
	}
	return &q, nil
}

// CreatePoolQuestionParams holds input for creating a pool question.
type CreatePoolQuestionParams struct {
	Slug          string
	SubjectID     *string
	QuestionText  string
	OptionA       string
	OptionB       string
	OptionC       string
	OptionD       string
	CorrectOption string
	Explanation   *string
	ImageURL      *string
	CreatedBy     uuid.UUID
}

// CreatePoolQuestion inserts a new question into the pool. Returns 409 on slug conflict.
func (r *QuestionPoolRepo) CreatePoolQuestion(ctx context.Context, p CreatePoolQuestionParams) (*model.PoolQuestion, error) {
	var q model.PoolQuestion
	var createdByStr *string
	err := r.pool.QueryRow(ctx,
		`INSERT INTO questions
		   (slug, subject_id, question_text, option_a, option_b, option_c, option_d,
		    correct_option, explanation, image_url, created_by, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
		 RETURNING id, slug, subject_id, question_text, option_a, option_b, option_c, option_d,
		           correct_option, explanation, image_url, created_by, created_at`,
		p.Slug, p.SubjectID, p.QuestionText, p.OptionA, p.OptionB, p.OptionC, p.OptionD,
		p.CorrectOption, p.Explanation, p.ImageURL, p.CreatedBy,
	).Scan(
		&q.ID, &q.Slug, &q.SubjectID, &q.QuestionText,
		&q.OptionA, &q.OptionB, &q.OptionC, &q.OptionD,
		&q.CorrectOption, &q.Explanation, &q.ImageURL,
		&createdByStr, &q.CreatedAt,
	)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, ErrSlugConflict
		}
		return nil, fmt.Errorf("create pool question: %w", err)
	}
	if createdByStr != nil {
		id, _ := uuid.Parse(*createdByStr)
		q.CreatedBy = &id
	}
	return &q, nil
}

// UpdatePoolQuestionParams holds updatable fields. Slug is intentionally excluded (immutable).
type UpdatePoolQuestionParams struct {
	SubjectID     *string
	QuestionText  string
	OptionA       string
	OptionB       string
	OptionC       string
	OptionD       string
	CorrectOption string
	Explanation   *string
	ImageURL      *string
}

// UpdatePoolQuestion edits a pool question. The slug field is immutable and ignored.
func (r *QuestionPoolRepo) UpdatePoolQuestion(ctx context.Context, id int, p UpdatePoolQuestionParams) (*model.PoolQuestion, error) {
	var q model.PoolQuestion
	var createdByStr *string
	err := r.pool.QueryRow(ctx,
		`UPDATE questions SET
		   subject_id = $2, question_text = $3, option_a = $4, option_b = $5,
		   option_c = $6, option_d = $7, correct_option = $8, explanation = $9, image_url = $10
		 WHERE id = $1
		 RETURNING id, slug, subject_id, question_text, option_a, option_b, option_c, option_d,
		           correct_option, explanation, image_url, created_by, created_at`,
		id, p.SubjectID, p.QuestionText, p.OptionA, p.OptionB, p.OptionC, p.OptionD,
		p.CorrectOption, p.Explanation, p.ImageURL,
	).Scan(
		&q.ID, &q.Slug, &q.SubjectID, &q.QuestionText,
		&q.OptionA, &q.OptionB, &q.OptionC, &q.OptionD,
		&q.CorrectOption, &q.Explanation, &q.ImageURL,
		&createdByStr, &q.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("update pool question: %w", err)
	}
	if createdByStr != nil {
		uid, _ := uuid.Parse(*createdByStr)
		q.CreatedBy = &uid
	}
	return &q, nil
}

// DeletePoolQuestion removes a question from the pool.
// It returns ErrQuestionInUse if the question is still attached to any paper.
func (r *QuestionPoolRepo) DeletePoolQuestion(ctx context.Context, id int) error {
	var count int
	if err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM paper_questions WHERE question_id = $1`, id,
	).Scan(&count); err != nil {
		return fmt.Errorf("check paper attachments: %w", err)
	}
	if count > 0 {
		return ErrQuestionInUse
	}
	_, err := r.pool.Exec(ctx, `DELETE FROM questions WHERE id = $1`, id)
	return err
}

// SlugExists returns true if a slug is already taken.
func (r *QuestionPoolRepo) SlugExists(ctx context.Context, slug string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM questions WHERE slug = $1)`, slug,
	).Scan(&exists)
	return exists, err
}

// ── Paper-question join ───────────────────────────────────────────────────────

// AttachToPaper adds a question to a paper's question list.
// Returns ErrDuplicateAttachment if already attached.
func (r *QuestionPoolRepo) AttachToPaper(ctx context.Context, paperID uuid.UUID, questionID int, sortOrder int16) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO paper_questions (paper_id, question_id, sort_order) VALUES ($1, $2, $3)`,
		paperID, questionID, sortOrder,
	)
	if err != nil {
		if isUniqueViolation(err) {
			return ErrDuplicateAttachment
		}
		return fmt.Errorf("attach question: %w", err)
	}
	if _, err = r.pool.Exec(ctx,
		`UPDATE papers SET question_count = (SELECT COUNT(*) FROM paper_questions WHERE paper_id = $1) WHERE id = $1`,
		paperID,
	); err != nil {
		return fmt.Errorf("sync question_count: %w", err)
	}
	return nil
}

// DetachFromPaper removes a question from a paper's question list (question stays in pool).
func (r *QuestionPoolRepo) DetachFromPaper(ctx context.Context, paperID uuid.UUID, questionID int) error {
	if _, err := r.pool.Exec(ctx,
		`DELETE FROM paper_questions WHERE paper_id = $1 AND question_id = $2`,
		paperID, questionID,
	); err != nil {
		return err
	}
	_, err := r.pool.Exec(ctx,
		`UPDATE papers SET question_count = (SELECT COUNT(*) FROM paper_questions WHERE paper_id = $1) WHERE id = $1`,
		paperID,
	)
	return err
}

// ListPaperQuestions returns all questions attached to a paper ordered by sort_order.
func (r *QuestionPoolRepo) ListPaperQuestions(ctx context.Context, paperID uuid.UUID) ([]model.PaperQuestion, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT q.id, q.slug, q.subject_id, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
		        q.correct_option, q.explanation, q.image_url, q.created_by, q.created_at, pq.sort_order
		 FROM paper_questions pq
		 JOIN questions q ON q.id = pq.question_id
		 WHERE pq.paper_id = $1
		 ORDER BY pq.sort_order`,
		paperID,
	)
	if err != nil {
		return nil, fmt.Errorf("list paper questions: %w", err)
	}
	defer rows.Close()

	var out []model.PaperQuestion
	for rows.Next() {
		var q model.PaperQuestion
		var createdByStr *string
		if err := rows.Scan(
			&q.ID, &q.Slug, &q.SubjectID, &q.QuestionText,
			&q.OptionA, &q.OptionB, &q.OptionC, &q.OptionD,
			&q.CorrectOption, &q.Explanation, &q.ImageURL,
			&createdByStr, &q.CreatedAt, &q.SortOrder,
		); err != nil {
			return nil, fmt.Errorf("scan paper question: %w", err)
		}
		if createdByStr != nil {
			id, _ := uuid.Parse(*createdByStr)
			q.CreatedBy = &id
		}
		out = append(out, q)
	}
	return out, rows.Err()
}

// NextSortOrder returns max(sort_order)+1 for a paper's questions (for auto-ordering new attachments).
func (r *QuestionPoolRepo) NextSortOrder(ctx context.Context, paperID uuid.UUID) (int16, error) {
	var max *int16
	err := r.pool.QueryRow(ctx,
		`SELECT MAX(sort_order) FROM paper_questions WHERE paper_id = $1`, paperID,
	).Scan(&max)
	if err != nil {
		return 0, fmt.Errorf("next sort order: %w", err)
	}
	if max == nil {
		return 1, nil
	}
	return *max + 1, nil
}

// UpdateSortOrder changes a question's sort_order within a paper.
func (r *QuestionPoolRepo) UpdateSortOrder(ctx context.Context, paperID uuid.UUID, questionID int, order int16) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE paper_questions SET sort_order = $3 WHERE paper_id = $1 AND question_id = $2`,
		paperID, questionID, order,
	)
	return err
}

// PaperQuestionCount returns the number of questions attached to a paper.
func (r *QuestionPoolRepo) PaperQuestionCount(ctx context.Context, paperID uuid.UUID) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM paper_questions WHERE paper_id = $1`, paperID,
	).Scan(&n)
	return n, err
}

// ── Sentinel errors ───────────────────────────────────────────────────────────

var (
	ErrSlugConflict       = fmt.Errorf("slug already exists")
	ErrQuestionInUse      = fmt.Errorf("question is still attached to one or more papers")
	ErrDuplicateAttachment = fmt.Errorf("question already attached to this paper")
)

// ── helpers ───────────────────────────────────────────────────────────────────

func joinAnd(parts []string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += " AND "
		}
		out += p
	}
	return out
}

// isUniqueViolation returns true for PostgreSQL UNIQUE constraint violation (code 23505).
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
