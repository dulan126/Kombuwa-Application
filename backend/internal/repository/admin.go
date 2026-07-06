package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/miedvance/api/internal/model"
)

// AdminRepo handles all admin-specific DB queries.
type AdminRepo struct {
	pool *pgxpool.Pool
}

// NewAdminRepo creates an AdminRepo.
func NewAdminRepo(pool *pgxpool.Pool) *AdminRepo { return &AdminRepo{pool: pool} }

// ── Stats ─────────────────────────────────────────────────────────────────────

// Stats holds the admin dashboard aggregate counts.
type Stats struct {
	TotalStudents    int64          `json:"totalStudents"`
	TotalPapers      int64          `json:"totalPapers"`
	TotalAttempts    int64          `json:"totalAttempts"`
	TotalThreads     int64          `json:"totalThreads"`
	DAU              int64          `json:"dau"`
	WAU              int64          `json:"wau"`
	TopForumSubjects []SubjectCount `json:"topForumSubjects"`
}

// SubjectCount is one row from the top-forum-subjects aggregation.
type SubjectCount struct {
	SubjectID string `json:"subject_id"`
	Count     int64  `json:"cnt"`
}

// GetStats runs all aggregation queries and returns the stats struct.
func (r *AdminRepo) GetStats(ctx context.Context) (*Stats, error) {
	var s Stats

	queries := []struct {
		q   string
		dst *int64
	}{
		{`SELECT COUNT(*) FROM users WHERE role = 'student'`, &s.TotalStudents},
		{`SELECT COUNT(*) FROM papers WHERE is_published = TRUE`, &s.TotalPapers},
		{`SELECT COUNT(*) FROM attempts WHERE is_completed = TRUE`, &s.TotalAttempts},
		{`SELECT COUNT(*) FROM forum_threads`, &s.TotalThreads},
		{`SELECT COUNT(DISTINCT user_id) FROM attempts WHERE submitted_at > NOW() - INTERVAL '1 day'`, &s.DAU},
		{`SELECT COUNT(DISTINCT user_id) FROM attempts WHERE submitted_at > NOW() - INTERVAL '7 days'`, &s.WAU},
	}
	for _, qry := range queries {
		if err := r.pool.QueryRow(ctx, qry.q).Scan(qry.dst); err != nil {
			return nil, fmt.Errorf("stats query: %w", err)
		}
	}

	rows, err := r.pool.Query(ctx,
		`SELECT subject_id, COUNT(*) AS cnt FROM forum_threads
		 GROUP BY subject_id ORDER BY cnt DESC LIMIT 5`,
	)
	if err != nil {
		return nil, fmt.Errorf("top subjects: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var sc SubjectCount
		if err := rows.Scan(&sc.SubjectID, &sc.Count); err != nil {
			return nil, fmt.Errorf("scan subject count: %w", err)
		}
		s.TopForumSubjects = append(s.TopForumSubjects, sc)
	}
	return &s, rows.Err()
}

// ── Admin paper list ──────────────────────────────────────────────────────────

// AdminPaperRow is the richer paper row shown to admins (includes attempt count).
type AdminPaperRow struct {
	model.Paper
	SubjectName  string            `json:"subject_name"`
	AttemptCount int64             `json:"attempt_count"`
	Pdfs         map[string]string `json:"pdfs,omitempty"` // past-paper reference PDFs (slot → URL)
}

// AdminPaperFilter carries optional scoping filters for the admin paper list.
// Empty fields are ignored; set fields compose with pagination.
type AdminPaperFilter struct {
	SubjectID string
	Type      string
}

// ListPapers returns paginated papers (published or not) with attempt counts and total count.
// The filter's WHERE clause is shared by the count and list queries so totals stay in sync.
func (r *AdminRepo) ListPapers(ctx context.Context, f AdminPaperFilter, page, limit int) ([]AdminPaperRow, int, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 50
	}
	offset := (page - 1) * limit

	var clauses []string
	var params []any
	if f.SubjectID != "" {
		params = append(params, f.SubjectID)
		clauses = append(clauses, fmt.Sprintf("p.subject_id = $%d", len(params)))
	}
	if f.Type != "" {
		params = append(params, f.Type)
		clauses = append(clauses, fmt.Sprintf("p.type = $%d::paper_type", len(params)))
	}
	where := ""
	if len(clauses) > 0 {
		where = "WHERE " + strings.Join(clauses, " AND ")
	}

	var total int
	if err := r.pool.QueryRow(ctx,
		fmt.Sprintf(`SELECT COUNT(*) FROM papers p %s`, where), params...,
	).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count admin papers: %w", err)
	}

	listParams := append(params, limit, offset)
	rows, err := r.pool.Query(ctx,
		fmt.Sprintf(`SELECT p.id, p.type, p.subject_id, COALESCE(p.grade::text,''), p.title,
		        p.question_count, p.is_published, p.ms_available,
		        p.available_from, p.available_until, p.created_at,
		        s.name_si AS subject_name,
		        COUNT(a.id) AS attempt_count
		 FROM papers p
		 JOIN subjects s ON s.id = p.subject_id
		 LEFT JOIN attempts a ON a.paper_id = p.id AND a.is_completed = TRUE
		 %s
		 GROUP BY p.id, s.name_si
		 ORDER BY p.created_at DESC
		 LIMIT $%d OFFSET $%d`, where, len(params)+1, len(params)+2),
		listParams...,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("list admin papers: %w", err)
	}
	defer rows.Close()

	var out []AdminPaperRow
	for rows.Next() {
		var row AdminPaperRow
		var idStr, paperType, grade, subjectID string
		err := rows.Scan(
			&idStr, &paperType, &subjectID, &grade, &row.Title,
			&row.QuestionCount, &row.IsPublished, &row.MSAvailable,
			&row.AvailableFrom, &row.AvailableUntil, &row.CreatedAt,
			&row.SubjectName, &row.AttemptCount,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("scan admin paper: %w", err)
		}
		row.ID, _ = uuid.Parse(idStr)
		row.Type = model.PaperType(paperType)
		row.Grade = model.Grade(grade)
		row.SubjectID = subjectID
		out = append(out, row)
	}
	return out, total, rows.Err()
}

// GetPaper returns a single paper row by ID (any publish state) with subject name and attempt count.
func (r *AdminRepo) GetPaper(ctx context.Context, paperID uuid.UUID) (*AdminPaperRow, error) {
	var row AdminPaperRow
	var idStr, paperType, grade, subjectID string
	err := r.pool.QueryRow(ctx,
		`SELECT p.id, p.type, p.subject_id, COALESCE(p.grade::text,''), p.title,
		        p.question_count, p.is_published, p.ms_available,
		        p.available_from, p.available_until, p.created_at,
		        s.name_si AS subject_name,
		        COUNT(a.id) AS attempt_count
		 FROM papers p
		 JOIN subjects s ON s.id = p.subject_id
		 LEFT JOIN attempts a ON a.paper_id = p.id AND a.is_completed = TRUE
		 WHERE p.id = $1
		 GROUP BY p.id, s.name_si`,
		paperID,
	).Scan(
		&idStr, &paperType, &subjectID, &grade, &row.Title,
		&row.QuestionCount, &row.IsPublished, &row.MSAvailable,
		&row.AvailableFrom, &row.AvailableUntil, &row.CreatedAt,
		&row.SubjectName, &row.AttemptCount,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get admin paper: %w", err)
	}
	row.ID, _ = uuid.Parse(idStr)
	row.Type = model.PaperType(paperType)
	row.Grade = model.Grade(grade)
	row.SubjectID = subjectID
	return &row, nil
}

// SetPaperPublished toggles is_published on a paper. Returns the updated state.
func (r *AdminRepo) SetPaperPublished(ctx context.Context, paperID uuid.UUID, publish bool) (bool, error) {
	var result bool
	err := r.pool.QueryRow(ctx,
		`UPDATE papers SET is_published = $1 WHERE id = $2 RETURNING is_published`,
		publish, paperID,
	).Scan(&result)
	if err != nil {
		return false, fmt.Errorf("set published: %w", err)
	}
	return result, nil
}

// ── User list ─────────────────────────────────────────────────────────────────

// AdminUserFilter carries optional filters for GET /admin/users.
type AdminUserFilter struct {
	Stream string
	Grade  string
	Page   int
	Limit  int
}

// AdminUserRow is the user row shape for admin listing.
type AdminUserRow struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Mobile    string    `json:"mobile"`
	Stream    *string   `json:"stream,omitempty"`
	Grade     *string   `json:"grade,omitempty"`
	District  *string   `json:"district,omitempty"`
	School    *string   `json:"school,omitempty"`
	ExamYear  *int16    `json:"exam_year,omitempty"`
	CreatedAt string    `json:"created_at"`
	LastLogin *string   `json:"last_login,omitempty"`
}

// ListUsers returns paginated student users with optional stream/grade filter, plus total count.
func (r *AdminRepo) ListUsers(ctx context.Context, f AdminUserFilter) ([]AdminUserRow, int, error) {
	pageSize := f.Limit
	if pageSize < 1 {
		pageSize = 50
	}
	page := f.Page
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * pageSize

	params := []any{}
	wheres := []string{"role = 'student'"}

	if f.Stream != "" {
		params = append(params, f.Stream)
		wheres = append(wheres, fmt.Sprintf("stream = $%d::stream_enum", len(params)))
	}
	if f.Grade != "" {
		params = append(params, f.Grade)
		wheres = append(wheres, fmt.Sprintf("grade = $%d::grade_enum", len(params)))
	}

	whereClause := strings.Join(wheres, " AND ")

	var total int
	countQ := fmt.Sprintf(`SELECT COUNT(*) FROM users WHERE %s`, whereClause)
	if err := r.pool.QueryRow(ctx, countQ, params...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count users: %w", err)
	}

	params = append(params, pageSize, offset)
	limitIdx := len(params) - 1
	offsetIdx := len(params)

	q := fmt.Sprintf(
		`SELECT id, name, mobile, stream, grade, district, school, exam_year, created_at, last_login
		 FROM users WHERE %s
		 ORDER BY created_at DESC LIMIT $%d OFFSET $%d`,
		whereClause, limitIdx, offsetIdx,
	)

	rows, err := r.pool.Query(ctx, q, params...)
	if err != nil {
		return nil, 0, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	var out []AdminUserRow
	for rows.Next() {
		var u AdminUserRow
		var idStr string
		var createdAt, lastLogin interface{}
		err := rows.Scan(&idStr, &u.Name, &u.Mobile, &u.Stream, &u.Grade,
			&u.District, &u.School, &u.ExamYear, &createdAt, &lastLogin)
		if err != nil {
			return nil, 0, fmt.Errorf("scan user: %w", err)
		}
		u.ID, _ = uuid.Parse(idStr)
		if createdAt != nil {
			s := fmt.Sprintf("%v", createdAt)
			u.CreatedAt = s
		}
		if lastLogin != nil {
			s := fmt.Sprintf("%v", lastLogin)
			u.LastLogin = &s
		}
		out = append(out, u)
	}
	return out, total, rows.Err()
}

// ── Streams ───────────────────────────────────────────────────────────────────

// StreamRow represents a row in the streams table.
type StreamRow struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Icon      string `json:"icon"`
	Color     string `json:"color"`
	SortOrder int16  `json:"sort_order"`
}

// ListStreams returns all streams ordered by sort_order.
func (r *AdminRepo) ListStreams(ctx context.Context) ([]StreamRow, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, name, icon, color, sort_order FROM streams ORDER BY sort_order, id`,
	)
	if err != nil {
		return nil, fmt.Errorf("list streams: %w", err)
	}
	defer rows.Close()

	var out []StreamRow
	for rows.Next() {
		var s StreamRow
		if err := rows.Scan(&s.ID, &s.Name, &s.Icon, &s.Color, &s.SortOrder); err != nil {
			return nil, fmt.Errorf("scan stream: %w", err)
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// CreateStream inserts a new stream.
func (r *AdminRepo) CreateStream(ctx context.Context, s StreamRow) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO streams (id, name, icon, color, sort_order) VALUES ($1,$2,$3,$4,$5)`,
		s.ID, s.Name, s.Icon, s.Color, s.SortOrder,
	)
	if err != nil {
		return fmt.Errorf("create stream: %w", err)
	}
	return nil
}

// DeleteStream removes a stream (cascades to stream_subjects).
func (r *AdminRepo) DeleteStream(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM streams WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete stream: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// ── Subjects ──────────────────────────────────────────────────────────────────

// SubjectRow is a lightweight subject with its associated stream IDs.
type SubjectRow struct {
	ID        string   `json:"id"`
	NameSi    string   `json:"name_si"`
	StreamIDs []string `json:"stream_ids"`
}

// ListSubjects returns all subjects with their stream associations.
func (r *AdminRepo) ListSubjects(ctx context.Context) ([]SubjectRow, error) {
	rows, err := r.pool.Query(ctx, `SELECT id, name_si FROM subjects ORDER BY name_si`)
	if err != nil {
		return nil, fmt.Errorf("list subjects: %w", err)
	}
	defer rows.Close()

	index := map[string]*SubjectRow{}
	var order []string
	for rows.Next() {
		var s SubjectRow
		if err := rows.Scan(&s.ID, &s.NameSi); err != nil {
			return nil, fmt.Errorf("scan subject: %w", err)
		}
		s.StreamIDs = []string{}
		index[s.ID] = &s
		order = append(order, s.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	ssRows, err := r.pool.Query(ctx,
		`SELECT subject_id, stream_id FROM stream_subjects ORDER BY subject_id, sort_order`,
	)
	if err != nil {
		return nil, fmt.Errorf("list stream_subjects: %w", err)
	}
	defer ssRows.Close()
	for ssRows.Next() {
		var subjectID, streamID string
		if err := ssRows.Scan(&subjectID, &streamID); err != nil {
			return nil, fmt.Errorf("scan stream_subject: %w", err)
		}
		if s, ok := index[subjectID]; ok {
			s.StreamIDs = append(s.StreamIDs, streamID)
		}
	}
	if err := ssRows.Err(); err != nil {
		return nil, err
	}

	out := make([]SubjectRow, len(order))
	for i, id := range order {
		out[i] = *index[id]
	}
	return out, nil
}

// SubjectSummaryRow carries per-subject content counts for the admin landing cards.
type SubjectSummaryRow struct {
	ID                 string `json:"id"`
	NameSi             string `json:"name_si"`
	DailyCount         int64  `json:"daily_count"`
	DailyPublished     int64  `json:"daily_published"`
	SRPCount           int64  `json:"srp_count"`
	SRPPublished       int64  `json:"srp_published"`
	PastPaperCount     int64  `json:"pastpaper_count"`
	PastPaperPublished int64  `json:"pastpaper_published"`
	QuestionCount      int64  `json:"question_count"`
}

// SubjectSummaries returns per-subject paper (split by type) and question counts
// in a single grouped aggregate query — one round-trip, no per-subject queries.
func (r *AdminRepo) SubjectSummaries(ctx context.Context) ([]SubjectSummaryRow, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT s.id, s.name_si,
		       COALESCE(p.daily, 0), COALESCE(p.daily_pub, 0),
		       COALESCE(p.srp, 0),   COALESCE(p.srp_pub, 0),
		       COALESCE(p.past, 0),  COALESCE(p.past_pub, 0),
		       COALESCE(q.cnt, 0)
		FROM subjects s
		LEFT JOIN (
		  SELECT subject_id,
		         COUNT(*) FILTER (WHERE type = 'daily')                      AS daily,
		         COUNT(*) FILTER (WHERE type = 'daily'     AND is_published) AS daily_pub,
		         COUNT(*) FILTER (WHERE type = 'srp')                        AS srp,
		         COUNT(*) FILTER (WHERE type = 'srp'       AND is_published) AS srp_pub,
		         COUNT(*) FILTER (WHERE type = 'pastpaper')                  AS past,
		         COUNT(*) FILTER (WHERE type = 'pastpaper' AND is_published) AS past_pub
		  FROM papers GROUP BY subject_id
		) p ON p.subject_id = s.id
		LEFT JOIN (
		  SELECT subject_id, COUNT(*) AS cnt
		  FROM questions GROUP BY subject_id
		) q ON q.subject_id = s.id
		ORDER BY s.name_si`,
	)
	if err != nil {
		return nil, fmt.Errorf("subject summaries: %w", err)
	}
	defer rows.Close()

	var out []SubjectSummaryRow
	for rows.Next() {
		var row SubjectSummaryRow
		if err := rows.Scan(&row.ID, &row.NameSi,
			&row.DailyCount, &row.DailyPublished,
			&row.SRPCount, &row.SRPPublished,
			&row.PastPaperCount, &row.PastPaperPublished,
			&row.QuestionCount); err != nil {
			return nil, fmt.Errorf("scan subject summary: %w", err)
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

// CreateSubject inserts a new subject.
func (r *AdminRepo) CreateSubject(ctx context.Context, id, nameSi string) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO subjects (id, name_si) VALUES ($1, $2)`,
		id, nameSi,
	)
	if err != nil {
		return fmt.Errorf("create subject: %w", err)
	}
	return nil
}

// ErrSubjectInUse is returned when a subject still has papers or questions
// referencing it (FK RESTRICT).
var ErrSubjectInUse = fmt.Errorf("subject still has papers or questions")

// DeleteSubject removes a subject and all its stream associations.
// Returns ErrSubjectInUse if papers or questions still reference it.
func (r *AdminRepo) DeleteSubject(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM subjects WHERE id = $1`, id)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23503" { // foreign_key_violation
			return ErrSubjectInUse
		}
		return fmt.Errorf("delete subject: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// ListStreamSubjects returns subjects belonging to a specific stream, ordered by sort_order.
func (r *AdminRepo) ListStreamSubjects(ctx context.Context, streamID string) ([]SubjectRow, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT s.id, s.name_si FROM stream_subjects ss
		 JOIN subjects s ON s.id = ss.subject_id
		 WHERE ss.stream_id = $1
		 ORDER BY ss.sort_order, s.name_si`,
		streamID,
	)
	if err != nil {
		return nil, fmt.Errorf("list stream subjects: %w", err)
	}
	defer rows.Close()

	var out []SubjectRow
	for rows.Next() {
		var s SubjectRow
		if err := rows.Scan(&s.ID, &s.NameSi); err != nil {
			return nil, fmt.Errorf("scan subject: %w", err)
		}
		s.StreamIDs = []string{streamID}
		out = append(out, s)
	}
	return out, rows.Err()
}

// AddSubjectToStream links a subject to a stream.
func (r *AdminRepo) AddSubjectToStream(ctx context.Context, streamID, subjectID string) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO stream_subjects (stream_id, subject_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
		streamID, subjectID,
	)
	if err != nil {
		return fmt.Errorf("add subject to stream: %w", err)
	}
	return nil
}

// RemoveSubjectFromStream removes a subject-stream link.
func (r *AdminRepo) RemoveSubjectFromStream(ctx context.Context, streamID, subjectID string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM stream_subjects WHERE stream_id = $1 AND subject_id = $2`,
		streamID, subjectID,
	)
	if err != nil {
		return fmt.Errorf("remove subject from stream: %w", err)
	}
	return nil
}

// CreateTopic inserts a new topic and returns its ID.
func (r *AdminRepo) CreateTopic(ctx context.Context, subjectID, nameSi string) (int32, error) {
	var id int32
	err := r.pool.QueryRow(ctx,
		`INSERT INTO topics (subject_id, name_si) VALUES ($1,$2) RETURNING id`,
		subjectID, nameSi,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("create topic: %w", err)
	}
	return id, nil
}

// ListTopics returns all topics for a given subject ordered by sort_order then id.
func (r *AdminRepo) ListTopics(ctx context.Context, subjectID string) ([]model.Topic, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, subject_id, name_si, sort_order FROM topics WHERE subject_id = $1 ORDER BY sort_order, id`,
		subjectID,
	)
	if err != nil {
		return nil, fmt.Errorf("list topics: %w", err)
	}
	defer rows.Close()
	var out []model.Topic
	for rows.Next() {
		var t model.Topic
		if err := rows.Scan(&t.ID, &t.SubjectID, &t.NameSi, &t.SortOrder); err != nil {
			return nil, fmt.Errorf("scan topic: %w", err)
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// DeleteTopic removes a topic by id. Questions referencing it get topic_id = NULL via FK.
func (r *AdminRepo) DeleteTopic(ctx context.Context, id int32) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM topics WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete topic: %w", err)
	}
	return nil
}

// ── Paper CRUD ────────────────────────────────────────────────────────────────

// UpdatePaperParams holds updatable paper fields.
type UpdatePaperParams struct {
	Title          string
	SubjectID      string
	Grade          string
	TimeSeconds    int32
	AvailableFrom  time.Time
	AvailableUntil *time.Time
}

// UpdatePaper edits paper metadata. Returns the updated paper, or nil if not found.
func (r *AdminRepo) UpdatePaper(ctx context.Context, paperID uuid.UUID, p UpdatePaperParams) (*model.Paper, error) {
	var paper model.Paper
	var idStr, paperType, grade string
	err := r.pool.QueryRow(ctx,
		`UPDATE papers SET title=$2, subject_id=$3, grade=NULLIF($4,'')::grade_enum, time_seconds=$5,
		                   available_from=$6, available_until=$7, updated_at=NOW()
		 WHERE id=$1
		 RETURNING id, type, subject_id, COALESCE(grade::text,''), title, question_count, time_seconds,
		           available_from, available_until, ms_available, is_published, created_at`,
		paperID, p.Title, p.SubjectID, p.Grade, p.TimeSeconds, p.AvailableFrom, p.AvailableUntil,
	).Scan(
		&idStr, &paperType, &paper.SubjectID, &grade, &paper.Title,
		&paper.QuestionCount, &paper.TimeSeconds, &paper.AvailableFrom, &paper.AvailableUntil,
		&paper.MSAvailable, &paper.IsPublished, &paper.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("update paper: %w", err)
	}
	paper.ID, _ = uuid.Parse(idStr)
	paper.Type = model.PaperType(paperType)
	paper.Grade = model.Grade(grade)
	return &paper, nil
}

// DeletePaper removes a paper and its join-table entries (questions remain in pool).
func (r *AdminRepo) DeletePaper(ctx context.Context, paperID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM papers WHERE id = $1`, paperID)
	if err != nil {
		return fmt.Errorf("delete paper: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// ── User management ───────────────────────────────────────────────────────────

// UpdateUserRole changes the role of a user. Returns false if user not found.
func (r *AdminRepo) UpdateUserRole(ctx context.Context, userID uuid.UUID, role model.UserRole) (bool, error) {
	tag, err := r.pool.Exec(ctx,
		`UPDATE users SET role = $2::user_role, updated_at = NOW() WHERE id = $1`,
		userID, string(role),
	)
	if err != nil {
		return false, fmt.Errorf("update user role: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// UpdateUserStatus activates or deactivates a user. Returns false if user not found.
func (r *AdminRepo) UpdateUserStatus(ctx context.Context, userID uuid.UUID, isActive bool) (bool, error) {
	tag, err := r.pool.Exec(ctx,
		`UPDATE users SET is_active = $2, updated_at = NOW() WHERE id = $1`,
		userID, isActive,
	)
	if err != nil {
		return false, fmt.Errorf("update user status: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}
