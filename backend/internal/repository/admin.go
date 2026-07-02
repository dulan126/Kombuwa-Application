package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
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
	TotalStudents    int64            `json:"totalStudents"`
	TotalPapers      int64            `json:"totalPapers"`
	TotalAttempts    int64            `json:"totalAttempts"`
	TotalThreads     int64            `json:"totalThreads"`
	DAU              int64            `json:"dau"`
	WAU              int64            `json:"wau"`
	TopForumSubjects []SubjectCount   `json:"topForumSubjects"`
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
	SubjectName  string `json:"subject_name"`
	AttemptCount int64  `json:"attempt_count"`
}

// ListAllPapers returns all papers (published or not) with attempt counts.
func (r *AdminRepo) ListAllPapers(ctx context.Context) ([]AdminPaperRow, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT p.id, p.type, p.subject_id, p.grade, p.title,
		        p.question_count, p.is_published, p.ms_available,
		        p.available_from, p.available_until, p.created_at,
		        s.name_si AS subject_name,
		        COUNT(a.id) AS attempt_count
		 FROM papers p
		 JOIN subjects s ON s.id = p.subject_id
		 LEFT JOIN attempts a ON a.paper_id = p.id AND a.is_completed = TRUE
		 GROUP BY p.id, s.name_si
		 ORDER BY p.created_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list admin papers: %w", err)
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
			return nil, fmt.Errorf("scan admin paper: %w", err)
		}
		row.ID, _ = uuid.Parse(idStr)
		row.Type = model.PaperType(paperType)
		row.Grade = model.Grade(grade)
		row.SubjectID = subjectID
		out = append(out, row)
	}
	return out, rows.Err()
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
}

// AdminUserRow is the user row shape for admin listing.
type AdminUserRow struct {
	ID        uuid.UUID  `json:"id"`
	Name      string     `json:"name"`
	Mobile    string     `json:"mobile"`
	Stream    *string    `json:"stream,omitempty"`
	Grade     *string    `json:"grade,omitempty"`
	District  *string    `json:"district,omitempty"`
	School    *string    `json:"school,omitempty"`
	ExamYear  *int16     `json:"exam_year,omitempty"`
	CreatedAt string     `json:"created_at"`
	LastLogin *string    `json:"last_login,omitempty"`
}

// ListUsers returns paginated student users with optional stream/grade filter.
func (r *AdminRepo) ListUsers(ctx context.Context, f AdminUserFilter) ([]AdminUserRow, error) {
	const pageSize = 50
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

	params = append(params, pageSize, offset)
	limitIdx := len(params) - 1
	offsetIdx := len(params)

	q := fmt.Sprintf(
		`SELECT id, name, mobile, stream, grade, district, school, exam_year, created_at, last_login
		 FROM users WHERE %s
		 ORDER BY created_at DESC LIMIT $%d OFFSET $%d`,
		strings.Join(wheres, " AND "), limitIdx, offsetIdx,
	)

	rows, err := r.pool.Query(ctx, q, params...)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
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
			return nil, fmt.Errorf("scan user: %w", err)
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
	return out, rows.Err()
}

// ── Subjects + topics ─────────────────────────────────────────────────────────

// SubjectWithTopics is a subject row with its nested topics.
type SubjectWithTopics struct {
	ID        string       `json:"id"`
	NameSi    string       `json:"name_si"`
	Stream    string       `json:"stream"`
	SortOrder int16        `json:"sort_order"`
	Topics    []model.Topic `json:"topics"`
}

// ListSubjectsWithTopics returns all subjects with nested topics.
func (r *AdminRepo) ListSubjectsWithTopics(ctx context.Context) ([]SubjectWithTopics, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT s.id, s.name_si, s.stream, s.sort_order,
		        t.id AS topic_id, t.name_si AS topic_name, t.sort_order AS topic_order
		 FROM subjects s
		 LEFT JOIN topics t ON t.subject_id = s.id
		 ORDER BY s.stream, s.sort_order, t.sort_order`,
	)
	if err != nil {
		return nil, fmt.Errorf("list subjects: %w", err)
	}
	defer rows.Close()

	index := map[string]*SubjectWithTopics{}
	var order []string

	for rows.Next() {
		var sID, sName, stream string
		var sortOrder int16
		var topicID *int32
		var topicName *string
		var topicOrder *int16

		if err := rows.Scan(&sID, &sName, &stream, &sortOrder,
			&topicID, &topicName, &topicOrder); err != nil {
			return nil, fmt.Errorf("scan subject+topic: %w", err)
		}

		if _, exists := index[sID]; !exists {
			index[sID] = &SubjectWithTopics{
				ID: sID, NameSi: sName, Stream: stream,
				SortOrder: sortOrder, Topics: []model.Topic{},
			}
			order = append(order, sID)
		}
		if topicID != nil {
			name := ""
			if topicName != nil {
				name = *topicName
			}
			ord := int16(0)
			if topicOrder != nil {
				ord = *topicOrder
			}
			index[sID].Topics = append(index[sID].Topics, model.Topic{
				ID: *topicID, SubjectID: sID, NameSi: name, SortOrder: ord,
			})
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	out := make([]SubjectWithTopics, len(order))
	for i, id := range order {
		out[i] = *index[id]
	}
	return out, nil
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
