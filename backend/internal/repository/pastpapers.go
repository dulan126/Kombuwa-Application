package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kombuwaedu/api/internal/model"
)

// PastPapersRepo handles all past-paper DB queries.
type PastPapersRepo struct {
	pool *pgxpool.Pool
}

// NewPastPapersRepo creates a PastPapersRepo.
func NewPastPapersRepo(pool *pgxpool.Pool) *PastPapersRepo { return &PastPapersRepo{pool: pool} }

// ── Tree listing ──────────────────────────────────────────────────────────────

// PPListFilter carries optional query filters.
type PPListFilter struct {
	SubjectID string
	Grade     string
	Year      int
}

// PPFlatRow is one DB row before the Go-side tree grouping.
type PPFlatRow struct {
	ID                    uuid.UUID
	SubjectID             string
	SubjectName           string
	TopicID               int32
	TopicName             string
	TopicOrder            int16
	Year                  int16
	Grade                 string
	MCQCount              int16
	EssayCount            int16
	MCQMarks              int16
	EssayMarks            int16
	HasEssayPDF           bool
	MarkingSchemeAvailable bool
	MSMCQUploaded         bool
	HasMsEssay            bool
}

// ListFlat returns all past-paper rows matching the filter (ungrouped).
func (r *PastPapersRepo) ListFlat(ctx context.Context, f PPListFilter) ([]PPFlatRow, error) {
	params := []any{}
	wheres := []string{}
	if f.SubjectID != "" {
		params = append(params, f.SubjectID)
		wheres = append(wheres, fmt.Sprintf("pp.subject_id = $%d", len(params)))
	}
	if f.Grade != "" {
		params = append(params, f.Grade)
		wheres = append(wheres, fmt.Sprintf("pp.grade = $%d::grade_enum", len(params)))
	}
	if f.Year > 0 {
		params = append(params, f.Year)
		wheres = append(wheres, fmt.Sprintf("pp.year = $%d", len(params)))
	}
	whereClause := ""
	if len(wheres) > 0 {
		whereClause = "WHERE " + strings.Join(wheres, " AND ")
	}

	rows, err := r.pool.Query(ctx, fmt.Sprintf(`
		SELECT pp.id, pp.subject_id, pp.topic_id, pp.year, pp.grade,
		       pp.mcq_count, pp.essay_count, pp.mcq_marks, pp.essay_marks,
		       pp.marking_scheme_available, pp.ms_mcq_uploaded,
		       pp.essay_pdf_url IS NOT NULL AS has_essay_pdf,
		       pp.ms_essay_pdf_url IS NOT NULL AS has_ms_essay,
		       s.name_si AS subject_name,
		       t.name_si AS topic_name, t.sort_order AS topic_order
		FROM past_papers pp
		JOIN subjects s ON s.id = pp.subject_id
		JOIN topics t   ON t.id = pp.topic_id
		%s
		ORDER BY s.name_si, t.sort_order, pp.year DESC`, whereClause),
		params...,
	)
	if err != nil {
		return nil, fmt.Errorf("list past papers: %w", err)
	}
	defer rows.Close()

	var out []PPFlatRow
	for rows.Next() {
		var row PPFlatRow
		var idStr string
		err := rows.Scan(
			&idStr, &row.SubjectID, &row.TopicID, &row.Year, &row.Grade,
			&row.MCQCount, &row.EssayCount, &row.MCQMarks, &row.EssayMarks,
			&row.MarkingSchemeAvailable, &row.MSMCQUploaded,
			&row.HasEssayPDF, &row.HasMsEssay,
			&row.SubjectName, &row.TopicName, &row.TopicOrder,
		)
		if err != nil {
			return nil, fmt.Errorf("scan past paper: %w", err)
		}
		row.ID, _ = uuid.Parse(idStr)
		out = append(out, row)
	}
	return out, rows.Err()
}

// ── Single past paper ─────────────────────────────────────────────────────────

// PPMetaRow holds the minimal metadata needed to gate PDF/question access.
type PPMetaRow struct {
	ID                    uuid.UUID
	SubjectID             string
	TopicID               int32
	Year                  int16
	Grade                 string
	MSMCQUploaded         bool
	EssayPDFURL           *string
	MSEssayPDFURL         *string
	MarkingSchemeAvailable bool
}

// GetPastPaper returns the metadata for a single past paper.
func (r *PastPapersRepo) GetPastPaper(ctx context.Context, ppID uuid.UUID) (*PPMetaRow, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, subject_id, topic_id, year, grade,
		        ms_mcq_uploaded, essay_pdf_url, ms_essay_pdf_url, marking_scheme_available
		 FROM past_papers WHERE id = $1`,
		ppID,
	)
	var p PPMetaRow
	var idStr string
	err := row.Scan(&idStr, &p.SubjectID, &p.TopicID, &p.Year, &p.Grade,
		&p.MSMCQUploaded, &p.EssayPDFURL, &p.MSEssayPDFURL, &p.MarkingSchemeAvailable)
	if err != nil {
		return nil, fmt.Errorf("get past paper: %w", err)
	}
	p.ID, _ = uuid.Parse(idStr)
	return &p, nil
}

// ── MCQ questions ─────────────────────────────────────────────────────────────

// GetPPQuestions returns MCQ questions; correct_option is only included when showAnswers=true.
func (r *PastPapersRepo) GetPPQuestions(ctx context.Context, ppID uuid.UUID, showAnswers bool) ([]model.PPQuestion, error) {
	var selectCols string
	if showAnswers {
		selectCols = "id, sort_order, question_text, option_a, option_b, option_c, option_d, correct_option, image_url"
	} else {
		selectCols = "id, sort_order, question_text, option_a, option_b, option_c, option_d, NULL AS correct_option, image_url"
	}
	rows, err := r.pool.Query(ctx,
		fmt.Sprintf(`SELECT %s FROM pp_questions WHERE past_paper_id = $1 ORDER BY sort_order`, selectCols),
		ppID,
	)
	if err != nil {
		return nil, fmt.Errorf("get pp questions: %w", err)
	}
	defer rows.Close()

	var out []model.PPQuestion
	for rows.Next() {
		var q model.PPQuestion
		if err := rows.Scan(&q.ID, &q.SortOrder, &q.QuestionText,
			&q.OptionA, &q.OptionB, &q.OptionC, &q.OptionD,
			&q.CorrectOption, &q.ImageURL); err != nil {
			return nil, fmt.Errorf("scan pp question: %w", err)
		}
		out = append(out, q)
	}
	return out, rows.Err()
}

// ── Admin writes ──────────────────────────────────────────────────────────────

// CreatePastPaperParams holds all fields for inserting a past-paper record.
type CreatePastPaperParams struct {
	SubjectID   string
	TopicID     int32
	Year        int16
	Grade       model.Grade
	MCQMarks    int16
	EssayMarks  int16
	UploadedBy  uuid.UUID
}

// CreatePastPaper inserts a new past-paper record and returns its UUID.
func (r *PastPapersRepo) CreatePastPaper(ctx context.Context, p CreatePastPaperParams) (uuid.UUID, error) {
	var idStr string
	err := r.pool.QueryRow(ctx,
		`INSERT INTO past_papers (subject_id, topic_id, year, grade, mcq_marks, essay_marks, uploaded_by)
		 VALUES ($1,$2,$3,$4::grade_enum,$5,$6,$7) RETURNING id`,
		p.SubjectID, p.TopicID, p.Year, string(p.Grade), p.MCQMarks, p.EssayMarks, p.UploadedBy,
	).Scan(&idStr)
	if err != nil {
		return uuid.UUID{}, fmt.Errorf("create past paper: %w", err)
	}
	id, _ := uuid.Parse(idStr)
	return id, nil
}

// SetEssayPDF stores the essay PDF path + size.
func (r *PastPapersRepo) SetEssayPDF(ctx context.Context, ppID uuid.UUID, path string, size int64) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE past_papers SET essay_pdf_url = $1, essay_pdf_size = $2 WHERE id = $3`,
		path, size, ppID,
	)
	return err
}

// SetMarkingSchemePDF stores the marking scheme PDF and flips marking_scheme_available.
func (r *PastPapersRepo) SetMarkingSchemePDF(ctx context.Context, ppID uuid.UUID, path string, size int64) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE past_papers SET ms_essay_pdf_url = $1, ms_essay_pdf_size = $2,
		                         marking_scheme_available = TRUE WHERE id = $3`,
		path, size, ppID,
	)
	return err
}

// PPQuestionInput is one question in a bulk upload.
type PPQuestionInput struct {
	QuestionText  string
	OptionA       string
	OptionB       string
	OptionC       string
	OptionD       string
	CorrectOption *string
}

// BulkReplacePPQuestions deletes existing questions and inserts new ones in a transaction.
func (r *PastPapersRepo) BulkReplacePPQuestions(ctx context.Context, ppID uuid.UUID, qs []PPQuestionInput) error {
	return withPool(ctx, r.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM pp_questions WHERE past_paper_id = $1`, ppID); err != nil {
			return fmt.Errorf("delete pp questions: %w", err)
		}
		for i, q := range qs {
			if _, err := tx.Exec(ctx,
				`INSERT INTO pp_questions (past_paper_id, sort_order, question_text, option_a, option_b, option_c, option_d, correct_option)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
				ppID, i+1, q.QuestionText, q.OptionA, q.OptionB, q.OptionC, q.OptionD, q.CorrectOption,
			); err != nil {
				return fmt.Errorf("insert pp question %d: %w", i+1, err)
			}
		}
		if _, err := tx.Exec(ctx, `UPDATE past_papers SET mcq_count = $1 WHERE id = $2`, len(qs), ppID); err != nil {
			return fmt.Errorf("update mcq_count: %w", err)
		}
		return nil
	})
}

// AnswerKeyEntry is one answer in the answer-key upload.
type AnswerKeyEntry struct {
	SortOrder     int
	CorrectOption string
}

// ApplyAnswerKey sets correct_option per sort_order and flips ms_mcq_uploaded.
func (r *PastPapersRepo) ApplyAnswerKey(ctx context.Context, ppID uuid.UUID, answers []AnswerKeyEntry) error {
	return withPool(ctx, r.pool, func(tx pgx.Tx) error {
		for _, a := range answers {
			if _, err := tx.Exec(ctx,
				`UPDATE pp_questions SET correct_option = $1 WHERE past_paper_id = $2 AND sort_order = $3`,
				a.CorrectOption, ppID, a.SortOrder,
			); err != nil {
				return fmt.Errorf("update answer key: %w", err)
			}
		}
		if _, err := tx.Exec(ctx,
			`UPDATE past_papers SET ms_mcq_uploaded = TRUE, marking_scheme_available = TRUE WHERE id = $1`,
			ppID,
		); err != nil {
			return fmt.Errorf("flip ms_mcq_uploaded: %w", err)
		}
		return nil
	})
}
