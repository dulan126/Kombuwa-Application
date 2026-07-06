package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PracticeRepo handles practice_attempts — multiple, elapsed-timed attempts on
// a past paper. Unlike the single-attempt `attempts` table, there is no
// UNIQUE(user, paper): every start creates a new row.
type PracticeRepo struct {
	pool *pgxpool.Pool
}

// NewPracticeRepo creates a PracticeRepo.
func NewPracticeRepo(pool *pgxpool.Pool) *PracticeRepo {
	return &PracticeRepo{pool: pool}
}

// PracticeAttemptRow is the state of one practice attempt.
type PracticeAttemptRow struct {
	ID          uuid.UUID
	UserID      uuid.UUID
	PaperID     uuid.UUID
	StartedAt   time.Time
	IsCompleted bool
}

// CreateAttempt inserts a fresh attempt and returns its id + started_at.
func (r *PracticeRepo) CreateAttempt(ctx context.Context, userID, paperID uuid.UUID, totalQ int16) (uuid.UUID, time.Time, error) {
	var id uuid.UUID
	var startedAt time.Time
	err := r.pool.QueryRow(ctx,
		`INSERT INTO practice_attempts (user_id, paper_id, total_questions, started_at)
		 VALUES ($1, $2, $3, NOW()) RETURNING id, started_at`,
		userID, paperID, totalQ,
	).Scan(&id, &startedAt)
	if err != nil {
		return uuid.UUID{}, time.Time{}, fmt.Errorf("create practice attempt: %w", err)
	}
	return id, startedAt, nil
}

// GetAttempt loads a single attempt's state (owner, paper, start, completion).
func (r *PracticeRepo) GetAttempt(ctx context.Context, attemptID uuid.UUID) (*PracticeAttemptRow, error) {
	var a PracticeAttemptRow
	err := r.pool.QueryRow(ctx,
		`SELECT id, user_id, paper_id, started_at, is_completed
		 FROM practice_attempts WHERE id = $1`,
		attemptID,
	).Scan(&a.ID, &a.UserID, &a.PaperID, &a.StartedAt, &a.IsCompleted)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get practice attempt: %w", err)
	}
	return &a, nil
}

// CompleteAttempt records the graded result + server-computed elapsed time.
func (r *PracticeRepo) CompleteAttempt(ctx context.Context, attemptID uuid.UUID, score int, answers map[string]string, timeTakenSecs int) error {
	answersJSON, err := json.Marshal(answers)
	if err != nil {
		return fmt.Errorf("marshal answers: %w", err)
	}
	_, err = r.pool.Exec(ctx,
		`UPDATE practice_attempts SET
		   score = $1, answers = $2, submitted_at = NOW(),
		   time_taken_secs = $3, is_completed = TRUE
		 WHERE id = $4`,
		score, string(answersJSON), timeTakenSecs, attemptID,
	)
	if err != nil {
		return fmt.Errorf("complete practice attempt: %w", err)
	}
	return nil
}

// PracticeHistoryRow is one row in a student's attempt history.
type PracticeHistoryRow struct {
	ID            uuid.UUID  `json:"id"`
	Score         int16      `json:"score"`
	Total         int16      `json:"total_questions"`
	TimeTakenSecs *int32     `json:"time_taken_secs"`
	SubmittedAt   *time.Time `json:"submitted_at,omitempty"`
	StartedAt     time.Time  `json:"started_at"`
	IsCompleted   bool       `json:"is_completed"`
}

// ListAttempts returns a paginated, newest-first history of completed attempts
// for (user, paper) plus the total count.
func (r *PracticeRepo) ListAttempts(ctx context.Context, userID, paperID uuid.UUID, page, limit int) ([]PracticeHistoryRow, int, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 20
	}
	offset := (page - 1) * limit

	var total int
	if err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM practice_attempts WHERE user_id = $1 AND paper_id = $2 AND is_completed = TRUE`,
		userID, paperID,
	).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count practice attempts: %w", err)
	}

	rows, err := r.pool.Query(ctx,
		`SELECT id, score, total_questions, time_taken_secs, submitted_at, started_at, is_completed
		 FROM practice_attempts
		 WHERE user_id = $1 AND paper_id = $2 AND is_completed = TRUE
		 ORDER BY submitted_at DESC
		 LIMIT $3 OFFSET $4`,
		userID, paperID, limit, offset,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("list practice attempts: %w", err)
	}
	defer rows.Close()

	var out []PracticeHistoryRow
	for rows.Next() {
		var h PracticeHistoryRow
		if err := rows.Scan(&h.ID, &h.Score, &h.Total, &h.TimeTakenSecs, &h.SubmittedAt, &h.StartedAt, &h.IsCompleted); err != nil {
			return nil, 0, fmt.Errorf("scan practice attempt: %w", err)
		}
		out = append(out, h)
	}
	return out, total, rows.Err()
}

// Stats returns the number of completed attempts and the best score for (user, paper).
func (r *PracticeRepo) Stats(ctx context.Context, userID, paperID uuid.UUID) (attemptCount int, bestScore *int16, err error) {
	err = r.pool.QueryRow(ctx,
		`SELECT COUNT(*), MAX(score)
		 FROM practice_attempts
		 WHERE user_id = $1 AND paper_id = $2 AND is_completed = TRUE`,
		userID, paperID,
	).Scan(&attemptCount, &bestScore)
	if err != nil {
		return 0, nil, fmt.Errorf("practice stats: %w", err)
	}
	return attemptCount, bestScore, nil
}
