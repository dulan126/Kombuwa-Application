//go:build integration

// Integration tests for the question/answer image feature. They exercise the
// real MediaService against a live Postgres + on-disk storage, covering the
// parts most likely to break silently: the exam gating matrix and file cleanup.
//
// Run with a database URL (the dev DB works):
//
//	TEST_DATABASE_URL="postgres://miedvance_user:<pw>@localhost:5432/miedvance?sslmode=disable" \
//	  go test -tags=integration ./internal/service/ -run Integration -v
//
// Every test seeds its own fixtures with unique ids and removes them afterwards,
// so it is safe to run against the shared dev database.
package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/miedvance/api/internal/httputil"
	"github.com/miedvance/api/internal/model"
	"github.com/miedvance/api/internal/repository"
	"github.com/miedvance/api/internal/storage"
)

// A minimal valid 1x1 PNG.
var onePixelPNG = []byte{
	0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
	0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
	0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
	0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
	0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
	0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
}

// ── Harness ───────────────────────────────────────────────────────────────────

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to run media integration tests")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	if err := pool.Ping(context.Background()); err != nil {
		t.Fatalf("ping: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

type fixture struct {
	subjectID  string
	creatorID  uuid.UUID
	studentID  uuid.UUID
	questionID int
	paperID    uuid.UUID
}

// seedFixture inserts a subject, creator, student, question and a published
// paper linking that question, and registers cleanup.
func seedFixture(t *testing.T, pool *pgxpool.Pool) fixture {
	t.Helper()
	ctx := context.Background()
	uniq := time.Now().UnixNano()
	f := fixture{subjectID: fmt.Sprintf("zt%d", uniq%100000000)}

	mustExec(t, pool, `INSERT INTO subjects (id, name_si) VALUES ($1, 'Media Test')`, f.subjectID)

	f.creatorID = mustUUID(t, pool,
		`INSERT INTO users (mobile, name, password_hash, role, is_verified, is_active)
		 VALUES ($1, 'Creator', 'x', 'admin', true, true) RETURNING id`,
		fmt.Sprintf("+9477%08d", uniq%100000000))
	f.studentID = mustUUID(t, pool,
		`INSERT INTO users (mobile, name, password_hash, role, is_verified, is_active)
		 VALUES ($1, 'Student', 'x', 'student', true, true) RETURNING id`,
		fmt.Sprintf("+9476%08d", uniq%100000000))

	err := pool.QueryRow(ctx,
		`INSERT INTO questions (slug, subject_id, question_text, option_a, option_b, option_c, option_d, correct_option, created_by)
		 VALUES ($1, $2, 'Q?', 'A', 'B', 'C', 'D', 'A', $3) RETURNING id`,
		fmt.Sprintf("zt-slug-%d", uniq), f.subjectID, f.creatorID,
	).Scan(&f.questionID)
	if err != nil {
		t.Fatalf("insert question: %v", err)
	}

	// available_until NULL → deadline = started_at + time_seconds, so a fresh
	// attempt is genuinely in-progress.
	f.paperID = mustUUID(t, pool,
		`INSERT INTO papers (type, subject_id, grade, title, question_count, time_seconds,
		                     available_from, available_until, ms_available, is_published, created_by)
		 VALUES ('daily'::paper_type, $1, '13'::grade_enum, 'Media Test Paper', 10, 1800,
		         NOW(), NULL, false, true, $2) RETURNING id`,
		f.subjectID, f.creatorID)

	mustExec(t, pool, `INSERT INTO paper_questions (paper_id, question_id, sort_order) VALUES ($1, $2, 1)`,
		f.paperID, f.questionID)

	t.Cleanup(func() {
		c := context.Background()
		pool.Exec(c, `DELETE FROM attempts WHERE paper_id = $1`, f.paperID)
		pool.Exec(c, `DELETE FROM question_media WHERE question_id = $1`, f.questionID)
		pool.Exec(c, `DELETE FROM paper_questions WHERE paper_id = $1`, f.paperID)
		pool.Exec(c, `DELETE FROM papers WHERE id = $1`, f.paperID)
		pool.Exec(c, `DELETE FROM questions WHERE id = $1`, f.questionID)
		pool.Exec(c, `DELETE FROM users WHERE id = ANY($1)`, []uuid.UUID{f.creatorID, f.studentID})
		pool.Exec(c, `DELETE FROM subjects WHERE id = $1`, f.subjectID)
	})
	return f
}

func newMediaSvc(t *testing.T, pool *pgxpool.Pool) (*MediaService, storage.Storage) {
	t.Helper()
	store, err := storage.NewDiskStorage(t.TempDir())
	if err != nil {
		t.Fatalf("storage: %v", err)
	}
	svc := NewMediaService(store,
		repository.NewQuestionMediaRepo(pool),
		repository.NewPaperMediaRepo(pool),
		repository.NewPapersRepo(pool), 5, 10)
	return svc, store
}

// ── Lifecycle: upload → replace → remove, with file + row consistency ─────────

func TestIntegration_MediaLifecycle(t *testing.T) {
	pool := testPool(t)
	f := seedFixture(t, pool)
	svc, store := newMediaSvc(t, pool)
	ctx := context.Background()

	// Upload to the question stem.
	images, err := svc.Upload(ctx, f.questionID, "question", bytes.NewReader(onePixelPNG), int64(len(onePixelPNG)))
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	if images["question"] == "" {
		t.Fatalf("expected a question image URL, got %v", images)
	}
	key1 := mustKey(t, pool, f.questionID, "question")
	assertFileExists(t, store, key1)

	// Replace → new file exists, old file deleted.
	if _, err := svc.Upload(ctx, f.questionID, "question", bytes.NewReader(onePixelPNG), int64(len(onePixelPNG))); err != nil {
		t.Fatalf("replace: %v", err)
	}
	key2 := mustKey(t, pool, f.questionID, "question")
	if key2 == key1 {
		t.Fatal("replace should produce a new storage key")
	}
	assertFileGone(t, store, key1) // old file deleted on replace
	assertFileExists(t, store, key2)

	// Remove → row + file gone.
	if _, err := svc.Remove(ctx, f.questionID, "question"); err != nil {
		t.Fatalf("remove: %v", err)
	}
	if keyNullable(t, pool, f.questionID, "question") != nil {
		t.Fatal("row should be gone after remove")
	}
	assertFileGone(t, store, key2)
}

func TestIntegration_UploadRejectsNonImage(t *testing.T) {
	pool := testPool(t)
	f := seedFixture(t, pool)
	svc, _ := newMediaSvc(t, pool)

	pdf := []byte("%PDF-1.7\nnot an image, just pretending")
	if _, err := svc.Upload(context.Background(), f.questionID, "a", bytes.NewReader(pdf), int64(len(pdf))); err == nil {
		t.Fatal("non-image upload should be rejected")
	}
	// Nothing must be persisted on rejection.
	if keyNullable(t, pool, f.questionID, "a") != nil {
		t.Fatal("no media row should exist after a rejected upload")
	}
}

// ── The gating matrix (security-critical) ─────────────────────────────────────

func TestIntegration_StudentGatingMatrix(t *testing.T) {
	pool := testPool(t)
	f := seedFixture(t, pool)
	svc, _ := newMediaSvc(t, pool)
	ctx := context.Background()

	if _, err := svc.Upload(ctx, f.questionID, "a", bytes.NewReader(onePixelPNG), int64(len(onePixelPNG))); err != nil {
		t.Fatalf("seed upload: %v", err)
	}

	serve := func() error {
		o, err := svc.ServeStudent(ctx, f.studentID, model.RoleStudent, f.paperID, f.questionID, "a")
		if o != nil {
			o.Body.Close()
		}
		return err
	}
	setAttempt := func(completed bool) {
		mustExec(t, pool,
			`INSERT INTO attempts (user_id, paper_id, total_questions, started_at, is_completed, submitted_at)
			 VALUES ($1, $2, 10, NOW(), $3, CASE WHEN $3 THEN NOW() ELSE NULL END)
			 ON CONFLICT (user_id, paper_id) DO UPDATE
			 SET started_at = NOW(), is_completed = $3, submitted_at = CASE WHEN $3 THEN NOW() ELSE NULL END`,
			f.studentID, f.paperID, completed)
	}
	setMS := func(available bool) {
		mustExec(t, pool, `UPDATE papers SET ms_available = $1 WHERE id = $2`, available, f.paperID)
	}

	// A. No attempt → forbidden (no leak before start).
	assertStatus(t, serve(), 403)

	// B. In-progress → allowed.
	setAttempt(false)
	if err := serve(); err != nil {
		t.Fatalf("in-progress should be allowed, got %v", err)
	}

	// C. Completed, MS not released → forbidden.
	setAttempt(true)
	setMS(false)
	assertStatus(t, serve(), 403)

	// D. Completed, MS released → allowed (review).
	setMS(true)
	if err := serve(); err != nil {
		t.Fatalf("completed+ms should be allowed, got %v", err)
	}

	// E. Staff bypass regardless of attempt state.
	mustExec(t, pool, `DELETE FROM attempts WHERE paper_id = $1`, f.paperID)
	setMS(false)
	for _, role := range []model.UserRole{model.RoleAdmin, model.RoleEditor} {
		o, err := svc.ServeStudent(ctx, f.creatorID, role, f.paperID, f.questionID, "a")
		if err != nil {
			t.Fatalf("staff %s should be allowed, got %v", role, err)
		}
		o.Body.Close()
	}

	// F. Question not attached to the paper → 404 (even for staff).
	assertStatus(t, func() error {
		_, err := svc.ServeStudent(ctx, f.creatorID, model.RoleAdmin, f.paperID, 999999999, "a")
		return err
	}(), 404)

	// G. Invalid slot → 404.
	assertStatus(t, func() error {
		_, err := svc.ServeStudent(ctx, f.creatorID, model.RoleAdmin, f.paperID, f.questionID, "zzz")
		return err
	}(), 404)
}

// ── Cleanup when the question is deleted ──────────────────────────────────────

func TestIntegration_DeleteQuestionCleansFiles(t *testing.T) {
	pool := testPool(t)
	f := seedFixture(t, pool)
	svc, store := newMediaSvc(t, pool)
	ctx := context.Background()

	for _, slot := range []string{"question", "a", "b"} {
		if _, err := svc.Upload(ctx, f.questionID, slot, bytes.NewReader(onePixelPNG), int64(len(onePixelPNG))); err != nil {
			t.Fatalf("upload %s: %v", slot, err)
		}
	}

	// Mirror AdminService.DeletePoolQuestion: capture keys, delete the question
	// (rows cascade), then delete the files.
	keys, err := svc.KeysForQuestion(ctx, f.questionID)
	if err != nil {
		t.Fatalf("keys: %v", err)
	}
	if len(keys) != 3 {
		t.Fatalf("expected 3 media keys, got %d", len(keys))
	}
	mustExec(t, pool, `DELETE FROM questions WHERE id = $1`, f.questionID)
	svc.DeleteFiles(keys)

	for _, k := range keys {
		if _, _, err := store.Open(k); err == nil {
			t.Fatalf("file %s should be deleted", k)
		}
	}
	// Media rows cascaded away with the question.
	var n int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM question_media WHERE question_id = $1`, f.questionID).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Fatalf("expected media rows to cascade, found %d", n)
	}
}

// ── Repo-level checks ─────────────────────────────────────────────────────────

func TestIntegration_UpsertReturnsOldKeyAndBatchLoads(t *testing.T) {
	pool := testPool(t)
	f := seedFixture(t, pool)
	repo := repository.NewQuestionMediaRepo(pool)
	ctx := context.Background()

	old, err := repo.Upsert(ctx, f.questionID, "a", "question-media/first.png", "image/png")
	if err != nil {
		t.Fatalf("upsert 1: %v", err)
	}
	if old != nil {
		t.Fatalf("first upsert should have no old key, got %v", *old)
	}
	old, err = repo.Upsert(ctx, f.questionID, "a", "question-media/second.png", "image/png")
	if err != nil {
		t.Fatalf("upsert 2: %v", err)
	}
	if old == nil || *old != "question-media/first.png" {
		t.Fatalf("second upsert should return the first key, got %v", old)
	}

	_, _ = repo.Upsert(ctx, f.questionID, "question", "question-media/stem.png", "image/png")
	media, err := repo.MediaForQuestions(ctx, []int{f.questionID})
	if err != nil {
		t.Fatalf("batch: %v", err)
	}
	if got := media[f.questionID]; len(got) != 2 || got["a"] == "" || got["question"] == "" {
		t.Fatalf("batch load mismatch: %v", media[f.questionID])
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

func mustExec(t *testing.T, pool *pgxpool.Pool, sql string, args ...any) {
	t.Helper()
	if _, err := pool.Exec(context.Background(), sql, args...); err != nil {
		t.Fatalf("exec %q: %v", sql, err)
	}
}

func mustUUID(t *testing.T, pool *pgxpool.Pool, sql string, args ...any) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	if err := pool.QueryRow(context.Background(), sql, args...).Scan(&id); err != nil {
		t.Fatalf("query uuid %q: %v", sql, err)
	}
	return id
}

func mustKey(t *testing.T, pool *pgxpool.Pool, questionID int, slot string) string {
	t.Helper()
	k := keyNullable(t, pool, questionID, slot)
	if k == nil {
		t.Fatalf("expected a media row for slot %s", slot)
	}
	return *k
}

func keyNullable(t *testing.T, pool *pgxpool.Pool, questionID int, slot string) *string {
	t.Helper()
	var key string
	err := pool.QueryRow(context.Background(),
		`SELECT storage_key FROM question_media WHERE question_id = $1 AND slot = $2`,
		questionID, slot).Scan(&key)
	if err != nil {
		return nil
	}
	return &key
}

// assertFileExists opens the key and immediately closes it (leaving no open
// handle — Windows refuses to delete files with open handles).
func assertFileExists(t *testing.T, store storage.Storage, key string) {
	t.Helper()
	body, _, err := store.Open(key)
	if err != nil {
		t.Fatalf("file %s should exist: %v", key, err)
	}
	body.Close()
}

func assertFileGone(t *testing.T, store storage.Storage, key string) {
	t.Helper()
	body, _, err := store.Open(key)
	if err == nil {
		body.Close()
		t.Fatalf("file %s should be gone", key)
	}
}

func assertStatus(t *testing.T, err error, want int) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected error with status %d, got nil", want)
	}
	var appErr *httputil.AppError
	if !errors.As(err, &appErr) {
		t.Fatalf("expected *httputil.AppError, got %T (%v)", err, err)
	}
	if appErr.Status != want {
		t.Fatalf("expected status %d, got %d (%s)", want, appErr.Status, appErr.Message)
	}
}
