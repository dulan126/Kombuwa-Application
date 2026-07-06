package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PaperMediaRepo handles the paper_media table — the two reference PDFs
// (slots "structured" and "essay") attached to a past paper.
type PaperMediaRepo struct {
	pool *pgxpool.Pool
}

// NewPaperMediaRepo creates a PaperMediaRepo.
func NewPaperMediaRepo(pool *pgxpool.Pool) *PaperMediaRepo {
	return &PaperMediaRepo{pool: pool}
}

// Upsert inserts or replaces the PDF for (paperID, slot) and returns the
// previous storage key (nil if none) so the caller can delete the old file.
func (r *PaperMediaRepo) Upsert(ctx context.Context, paperID uuid.UUID, slot, storageKey, mime string, size int64) (*string, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx)

	var oldKey *string
	var existing string
	err = tx.QueryRow(ctx,
		`SELECT storage_key FROM paper_media WHERE paper_id = $1 AND slot = $2 FOR UPDATE`,
		paperID, slot,
	).Scan(&existing)
	if err == nil {
		oldKey = &existing
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("select existing paper media: %w", err)
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO paper_media (paper_id, slot, storage_key, mime, size_bytes)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (paper_id, slot)
		 DO UPDATE SET storage_key = $3, mime = $4, size_bytes = $5, created_at = NOW()`,
		paperID, slot, storageKey, mime, size,
	)
	if err != nil {
		return nil, fmt.Errorf("upsert paper media: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return oldKey, nil
}

// Delete removes the row for (paperID, slot) and returns its storage key.
func (r *PaperMediaRepo) Delete(ctx context.Context, paperID uuid.UUID, slot string) (*string, error) {
	var key string
	err := r.pool.QueryRow(ctx,
		`DELETE FROM paper_media WHERE paper_id = $1 AND slot = $2 RETURNING storage_key`,
		paperID, slot,
	).Scan(&key)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("delete paper media: %w", err)
	}
	return &key, nil
}

// Get returns the storage key + MIME for one (paperID, slot).
func (r *PaperMediaRepo) Get(ctx context.Context, paperID uuid.UUID, slot string) (key, mime string, found bool, err error) {
	err = r.pool.QueryRow(ctx,
		`SELECT storage_key, mime FROM paper_media WHERE paper_id = $1 AND slot = $2`,
		paperID, slot,
	).Scan(&key, &mime)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", false, nil
	}
	if err != nil {
		return "", "", false, fmt.Errorf("get paper media: %w", err)
	}
	return key, mime, true, nil
}

// ListKeys returns all storage keys for a paper (call before deleting the paper,
// since its media rows cascade away with it).
func (r *PaperMediaRepo) ListKeys(ctx context.Context, paperID uuid.UUID) ([]string, error) {
	rows, err := r.pool.Query(ctx, `SELECT storage_key FROM paper_media WHERE paper_id = $1`, paperID)
	if err != nil {
		return nil, fmt.Errorf("list paper media keys: %w", err)
	}
	defer rows.Close()
	var keys []string
	for rows.Next() {
		var k string
		if err := rows.Scan(&k); err != nil {
			return nil, fmt.Errorf("scan paper media key: %w", err)
		}
		keys = append(keys, k)
	}
	return keys, rows.Err()
}

// SlotsForPaper returns the set of slots that have a PDF for the paper.
func (r *PaperMediaRepo) SlotsForPaper(ctx context.Context, paperID uuid.UUID) (map[string]bool, error) {
	rows, err := r.pool.Query(ctx, `SELECT slot FROM paper_media WHERE paper_id = $1`, paperID)
	if err != nil {
		return nil, fmt.Errorf("slots for paper: %w", err)
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, fmt.Errorf("scan slot: %w", err)
		}
		out[s] = true
	}
	return out, rows.Err()
}
