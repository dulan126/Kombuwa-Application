package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// QuestionMediaRepo handles the sparse question_media table (one row per image,
// keyed by question_id + slot). Slots: "question", "a", "b", "c", "d".
type QuestionMediaRepo struct {
	pool *pgxpool.Pool
}

// NewQuestionMediaRepo creates a QuestionMediaRepo.
func NewQuestionMediaRepo(pool *pgxpool.Pool) *QuestionMediaRepo {
	return &QuestionMediaRepo{pool: pool}
}

// Upsert inserts or replaces the media row for (questionID, slot) and returns
// the previous storage key (nil if none) so the caller can delete the old file.
func (r *QuestionMediaRepo) Upsert(ctx context.Context, questionID int, slot, storageKey, mime string) (*string, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx)

	var oldKey *string
	var existing string
	err = tx.QueryRow(ctx,
		`SELECT storage_key FROM question_media
		 WHERE question_id = $1 AND slot = $2 FOR UPDATE`,
		questionID, slot,
	).Scan(&existing)
	if err == nil {
		oldKey = &existing
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("select existing media: %w", err)
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO question_media (question_id, slot, storage_key, mime)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (question_id, slot)
		 DO UPDATE SET storage_key = $3, mime = $4, created_at = NOW()`,
		questionID, slot, storageKey, mime,
	)
	if err != nil {
		return nil, fmt.Errorf("upsert media: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return oldKey, nil
}

// Delete removes the media row for (questionID, slot) and returns its storage
// key (nil if there was no row) so the caller can delete the file.
func (r *QuestionMediaRepo) Delete(ctx context.Context, questionID int, slot string) (*string, error) {
	var key string
	err := r.pool.QueryRow(ctx,
		`DELETE FROM question_media
		 WHERE question_id = $1 AND slot = $2
		 RETURNING storage_key`,
		questionID, slot,
	).Scan(&key)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("delete media: %w", err)
	}
	return &key, nil
}

// ListKeys returns all storage keys for a question (used to clean up files
// before the question — and its cascaded rows — are deleted).
func (r *QuestionMediaRepo) ListKeys(ctx context.Context, questionID int) ([]string, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT storage_key FROM question_media WHERE question_id = $1`, questionID)
	if err != nil {
		return nil, fmt.Errorf("list media keys: %w", err)
	}
	defer rows.Close()
	var keys []string
	for rows.Next() {
		var k string
		if err := rows.Scan(&k); err != nil {
			return nil, fmt.Errorf("scan media key: %w", err)
		}
		keys = append(keys, k)
	}
	return keys, rows.Err()
}

// SlotKey identifies one image on one question.
type SlotKey struct {
	Slot       string
	StorageKey string
}

// MediaForQuestions batch-loads media for many questions in one query,
// returning questionID → (slot → storage_key). Avoids N+1 when building
// exam / marking-scheme payloads.
func (r *QuestionMediaRepo) MediaForQuestions(ctx context.Context, questionIDs []int) (map[int]map[string]string, error) {
	out := map[int]map[string]string{}
	if len(questionIDs) == 0 {
		return out, nil
	}
	rows, err := r.pool.Query(ctx,
		`SELECT question_id, slot, storage_key FROM question_media
		 WHERE question_id = ANY($1)`,
		questionIDs,
	)
	if err != nil {
		return nil, fmt.Errorf("media for questions: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var qid int
		var slot, key string
		if err := rows.Scan(&qid, &slot, &key); err != nil {
			return nil, fmt.Errorf("scan media row: %w", err)
		}
		if out[qid] == nil {
			out[qid] = map[string]string{}
		}
		out[qid][slot] = key
	}
	return out, rows.Err()
}

// Get returns the storage key + MIME for one (questionID, slot).
func (r *QuestionMediaRepo) Get(ctx context.Context, questionID int, slot string) (key, mime string, found bool, err error) {
	err = r.pool.QueryRow(ctx,
		`SELECT storage_key, mime FROM question_media WHERE question_id = $1 AND slot = $2`,
		questionID, slot,
	).Scan(&key, &mime)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", false, nil
	}
	if err != nil {
		return "", "", false, fmt.Errorf("get media: %w", err)
	}
	return key, mime, true, nil
}
