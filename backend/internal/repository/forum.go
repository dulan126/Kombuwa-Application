package repository

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/miedvance/api/internal/model"
)

// ForumRepo handles all forum DB queries.
type ForumRepo struct {
	pool *pgxpool.Pool
}

// NewForumRepo creates a ForumRepo.
func NewForumRepo(pool *pgxpool.Pool) *ForumRepo { return &ForumRepo{pool: pool} }

// ── Thread listing ────────────────────────────────────────────────────────────

// ThreadListFilter carries optional query filters for GET /forum/threads.
type ThreadListFilter struct {
	Subject string
	Status  string
	Page    int
	Limit   int
}

// ThreadListRow is one row in the thread list response.
type ThreadListRow struct {
	ID          uuid.UUID    `json:"id"`
	SubjectID   string       `json:"subject_id"`
	SubjectName string       `json:"subject_name"`
	Title       string       `json:"title"`
	Status      string       `json:"status"`
	ViewCount   int32        `json:"view_count"`
	ReplyCount  int32        `json:"reply_count"`
	ImageURLs   []string     `json:"image_urls"`
	CreatedAt   time.Time    `json:"created_at"`
	AuthorName  string       `json:"author_name"`
	AuthorRole  string       `json:"author_role"`
}

// ListThreads returns a paginated, filtered list of non-deleted threads.
func (r *ForumRepo) ListThreads(ctx context.Context, f ThreadListFilter) ([]ThreadListRow, int, error) {
	limit := f.Limit
	if limit < 1 || limit > 50 {
		limit = 20
	}
	page := f.Page
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * limit

	params := []any{}
	wheres := []string{"t.is_deleted = FALSE"}
	if f.Subject != "" {
		params = append(params, f.Subject)
		wheres = append(wheres, fmt.Sprintf("t.subject_id = $%d", len(params)))
	}
	if f.Status != "" {
		params = append(params, f.Status)
		wheres = append(wheres, fmt.Sprintf("t.status = $%d::thread_status", len(params)))
	}
	whereSQL := strings.Join(wheres, " AND ")

	// Count without pagination params
	filterParams := make([]any, len(params))
	copy(filterParams, params)

	params = append(params, limit, offset)
	limitIdx := len(params) - 1
	offsetIdx := len(params)

	rows, err := r.pool.Query(ctx, fmt.Sprintf(`
		SELECT t.id, t.subject_id, t.title, t.status, t.view_count, t.reply_count,
		       t.image_urls, t.created_at,
		       u.name AS author_name, u.role AS author_role,
		       s.name_si AS subject_name
		FROM forum_threads t
		JOIN users u    ON u.id = t.user_id
		JOIN subjects s ON s.id = t.subject_id
		WHERE %s
		ORDER BY t.created_at DESC
		LIMIT $%d OFFSET $%d`, whereSQL, limitIdx, offsetIdx),
		params...,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("list threads: %w", err)
	}
	defer rows.Close()

	var out []ThreadListRow
	for rows.Next() {
		var row ThreadListRow
		var idStr string
		err := rows.Scan(
			&idStr, &row.SubjectID, &row.Title, &row.Status, &row.ViewCount, &row.ReplyCount,
			&row.ImageURLs, &row.CreatedAt, &row.AuthorName, &row.AuthorRole, &row.SubjectName,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("scan thread: %w", err)
		}
		row.ID, _ = uuid.Parse(idStr)
		if row.ImageURLs == nil {
			row.ImageURLs = []string{}
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	var total int
	err = r.pool.QueryRow(ctx,
		fmt.Sprintf(`SELECT COUNT(*) FROM forum_threads t WHERE %s`, whereSQL),
		filterParams...,
	).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("count threads: %w", err)
	}
	return out, total, nil
}

// ── Single thread ─────────────────────────────────────────────────────────────

// ThreadDetailRow is the full thread row with joins.
type ThreadDetailRow struct {
	model.ForumThread
	AuthorRole  string `json:"author_role"`
	SubjectName string `json:"subject_name"`
}

// GetThread returns a single non-deleted thread by ID.
func (r *ForumRepo) GetThread(ctx context.Context, threadID uuid.UUID) (*ThreadDetailRow, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT t.id, t.user_id, t.subject_id, t.title, t.body, t.image_urls,
		        t.status, t.view_count, t.reply_count, t.created_at, t.updated_at,
		        u.name AS author_name, u.role AS author_role, s.name_si AS subject_name
		 FROM forum_threads t
		 JOIN users u ON u.id = t.user_id
		 JOIN subjects s ON s.id = t.subject_id
		 WHERE t.id = $1 AND t.is_deleted = FALSE`,
		threadID,
	)

	var t ThreadDetailRow
	var idStr, userIDStr string
	err := row.Scan(
		&idStr, &userIDStr, &t.SubjectID, &t.Title, &t.Body, &t.ImageURLs,
		&t.Status, &t.ViewCount, &t.ReplyCount, &t.CreatedAt, &t.UpdatedAt,
		&t.AuthorName, &t.AuthorRole, &t.SubjectName,
	)
	if err != nil {
		return nil, err
	}
	t.ID, _ = uuid.Parse(idStr)
	t.UserID, _ = uuid.Parse(userIDStr)
	if t.ImageURLs == nil {
		t.ImageURLs = []string{}
	}
	return &t, nil
}

// IncrementViewCount bumps view_count for a thread.
func (r *ForumRepo) IncrementViewCount(ctx context.Context, threadID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `UPDATE forum_threads SET view_count = view_count + 1 WHERE id = $1`, threadID)
	return err
}

// ReplyRow is one reply in the thread detail response.
type ReplyRow struct {
	ID             uuid.UUID  `json:"id"`
	UserID         uuid.UUID  `json:"user_id"`
	Body           string     `json:"body"`
	IsVerified     bool       `json:"is_verified"`
	CreatedAt      time.Time  `json:"created_at"`
	Name           string     `json:"name"`
	Role           string     `json:"role"`
	VerifiedByName *string    `json:"verified_by_name,omitempty"`
}

// GetReplies returns non-deleted replies for a thread (verified first, then chronological).
func (r *ForumRepo) GetReplies(ctx context.Context, threadID uuid.UUID) ([]ReplyRow, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT r.id, r.user_id, r.body, r.is_verified, r.created_at,
		        u.name, u.role,
		        vu.name AS verified_by_name
		 FROM forum_replies r
		 JOIN users u ON u.id = r.user_id
		 LEFT JOIN users vu ON vu.id = r.verified_by
		 WHERE r.thread_id = $1 AND r.is_deleted = FALSE
		 ORDER BY r.is_verified DESC, r.created_at ASC`,
		threadID,
	)
	if err != nil {
		return nil, fmt.Errorf("get replies: %w", err)
	}
	defer rows.Close()

	var out []ReplyRow
	for rows.Next() {
		var rr ReplyRow
		var idStr, userIDStr string
		if err := rows.Scan(&idStr, &userIDStr, &rr.Body, &rr.IsVerified, &rr.CreatedAt,
			&rr.Name, &rr.Role, &rr.VerifiedByName); err != nil {
			return nil, fmt.Errorf("scan reply: %w", err)
		}
		rr.ID, _ = uuid.Parse(idStr)
		rr.UserID, _ = uuid.Parse(userIDStr)
		out = append(out, rr)
	}
	return out, rows.Err()
}

// ── Create thread ─────────────────────────────────────────────────────────────

// CreateThreadResult holds the new thread's ID and creation time.
type CreateThreadResult struct {
	ID        uuid.UUID
	CreatedAt time.Time
}

// CreateThread inserts a new forum thread.
func (r *ForumRepo) CreateThread(ctx context.Context, userID uuid.UUID, subjectID, title, body string, imageURLs []string) (*CreateThreadResult, error) {
	if imageURLs == nil {
		imageURLs = []string{}
	}
	var idStr string
	var createdAt time.Time
	err := r.pool.QueryRow(ctx,
		`INSERT INTO forum_threads (user_id, subject_id, title, body, image_urls)
		 VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`,
		userID, subjectID, title, body, imageURLs,
	).Scan(&idStr, &createdAt)
	if err != nil {
		return nil, fmt.Errorf("create thread: %w", err)
	}
	id, _ := uuid.Parse(idStr)
	return &CreateThreadResult{ID: id, CreatedAt: createdAt}, nil
}

// ── Create reply ──────────────────────────────────────────────────────────────

// AddReply inserts a reply and bumps reply_count in a transaction.
func (r *ForumRepo) AddReply(ctx context.Context, threadID, userID uuid.UUID, body string) (uuid.UUID, time.Time, error) {
	var replyID uuid.UUID
	var createdAt time.Time

	err := withPool(ctx, r.pool, func(tx pgx.Tx) error {
		var idStr string
		if err := tx.QueryRow(ctx,
			`INSERT INTO forum_replies (thread_id, user_id, body) VALUES ($1,$2,$3) RETURNING id, created_at`,
			threadID, userID, body,
		).Scan(&idStr, &createdAt); err != nil {
			return fmt.Errorf("insert reply: %w", err)
		}
		replyID, _ = uuid.Parse(idStr)

		if _, err := tx.Exec(ctx,
			`UPDATE forum_threads SET reply_count = reply_count + 1, updated_at = NOW() WHERE id = $1`,
			threadID,
		); err != nil {
			return fmt.Errorf("bump reply_count: %w", err)
		}
		return nil
	})
	return replyID, createdAt, err
}

// ── Verify reply ──────────────────────────────────────────────────────────────

// VerifyReply runs the single-verified-reply transaction:
// 1. unverifies all replies in the thread
// 2. verifies the target reply
// 3. marks thread as resolved
func (r *ForumRepo) VerifyReply(ctx context.Context, replyID, verifierID uuid.UUID) error {
	// First get thread_id
	var threadIDStr string
	err := r.pool.QueryRow(ctx,
		`SELECT thread_id FROM forum_replies WHERE id = $1`, replyID,
	).Scan(&threadIDStr)
	if err != nil {
		return fmt.Errorf("reply not found")
	}

	threadID, _ := uuid.Parse(threadIDStr)
	return withPool(ctx, r.pool, func(tx pgx.Tx) error {
		// Unverify all replies in this thread
		if _, err := tx.Exec(ctx,
			`UPDATE forum_replies SET is_verified = FALSE, verified_by = NULL, verified_at = NULL WHERE thread_id = $1`,
			threadID,
		); err != nil {
			return fmt.Errorf("unverify replies: %w", err)
		}
		// Verify the target reply
		if _, err := tx.Exec(ctx,
			`UPDATE forum_replies SET is_verified = TRUE, verified_by = $1, verified_at = NOW() WHERE id = $2`,
			verifierID, replyID,
		); err != nil {
			return fmt.Errorf("verify reply: %w", err)
		}
		// Resolve the thread
		if _, err := tx.Exec(ctx,
			`UPDATE forum_threads SET status = 'resolved', updated_at = NOW() WHERE id = $1`,
			threadID,
		); err != nil {
			return fmt.Errorf("resolve thread: %w", err)
		}
		return nil
	})
}
