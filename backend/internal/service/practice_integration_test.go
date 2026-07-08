//go:build integration

// Integration tests for past-paper practice: the shared engine parameterized
// for multiple attempts + server-authoritative elapsed timing, plus the
// reference-PDF lifecycle. Uses the same harness as media_integration_test.go.
//
//	TEST_DATABASE_URL="postgres://miedvance_user:<pw>@localhost:5432/miedvance?sslmode=disable" \
//	  go test -tags=integration ./internal/service/ -run IntegrationPractice -v
package service

import (
	"bytes"
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"

	"github.com/miedvance/api/internal/model"
	"github.com/miedvance/api/internal/repository"
)

type ppFixture struct {
	subjectID string
	creatorID uuid.UUID
	studentID uuid.UUID
	paperID   uuid.UUID
	corrects  []string // correct option per question, in sort order
}

// seedPastPaper inserts a published pastpaper `papers` row with `n` pool
// questions (correct options cycling 1,2,3,4) linked via paper_questions.
func seedPastPaper(t *testing.T, pool *pgxpool.Pool, n int) ppFixture {
	t.Helper()
	ctx := context.Background()
	uniq := time.Now().UnixNano()
	f := ppFixture{subjectID: fmt.Sprintf("pp%d", uniq%100000000)}

	mustExec(t, pool, `INSERT INTO subjects (id, name_si) VALUES ($1, 'PP Test')`, f.subjectID)
	f.creatorID = mustUUID(t, pool,
		`INSERT INTO users (mobile, name, password_hash, role, is_verified, is_active)
		 VALUES ($1,'C','x','admin',true,true) RETURNING id`, fmt.Sprintf("+9477%08d", uniq%100000000))
	f.studentID = mustUUID(t, pool,
		`INSERT INTO users (mobile, name, password_hash, role, is_verified, is_active)
		 VALUES ($1,'S','x','student',true,true) RETURNING id`, fmt.Sprintf("+9476%08d", uniq%100000000))

	f.paperID = mustUUID(t, pool,
		`INSERT INTO papers (type, subject_id, grade, title, question_count, time_seconds,
		                     available_from, available_until, is_published, created_by)
		 VALUES ('pastpaper'::paper_type, $1, '13'::grade_enum, 'PP', $2, 0, NOW(), NULL, true, $3)
		 RETURNING id`, f.subjectID, n, f.creatorID)

	answerLabels := []string{"1", "2", "3", "4"}
	for i := 0; i < n; i++ {
		correct := answerLabels[i%4]
		f.corrects = append(f.corrects, correct)
		var qid int
		if err := pool.QueryRow(ctx,
			`INSERT INTO questions (slug, subject_id, question_text, option_a, option_b, option_c, option_d, correct_option, created_by)
			 VALUES ($1,$2,'Q','A','B','C','D',$3,$4) RETURNING id`,
			fmt.Sprintf("pp-%d-%d", uniq, i), f.subjectID, correct, f.creatorID,
		).Scan(&qid); err != nil {
			t.Fatalf("insert question: %v", err)
		}
		mustExec(t, pool, `INSERT INTO paper_questions (paper_id, question_id, sort_order) VALUES ($1,$2,$3)`,
			f.paperID, qid, i+1)
	}

	t.Cleanup(func() {
		c := context.Background()
		pool.Exec(c, `DELETE FROM practice_attempts WHERE paper_id=$1`, f.paperID)
		pool.Exec(c, `DELETE FROM paper_media WHERE paper_id=$1`, f.paperID)
		pool.Exec(c, `DELETE FROM paper_questions WHERE paper_id=$1`, f.paperID)
		pool.Exec(c, `DELETE FROM papers WHERE id=$1`, f.paperID)
		pool.Exec(c, `DELETE FROM questions WHERE subject_id=$1`, f.subjectID)
		pool.Exec(c, `DELETE FROM users WHERE id = ANY($1)`, []uuid.UUID{f.creatorID, f.studentID})
		pool.Exec(c, `DELETE FROM subjects WHERE id=$1`, f.subjectID)
	})
	return f
}

func newPapersSvc(t *testing.T, pool *pgxpool.Pool) *PapersService {
	t.Helper()
	media, _ := newMediaSvc(t, pool)
	return NewPapersService(
		repository.NewPapersRepo(pool),
		repository.NewPracticeRepo(pool),
		nil, // redis unused by practice
		media,
		zap.NewNop(),
	)
}

func allCorrect(corrects []string) map[string]string {
	m := map[string]string{}
	for i, c := range corrects {
		m[fmt.Sprintf("%d", i)] = c
	}
	return m
}

// ── Multiple attempts, each recorded with its own result ──────────────────────

func TestIntegrationPractice_MultiAttempt(t *testing.T) {
	pool := testPool(t)
	f := seedPastPaper(t, pool, 4)
	svc := newPapersSvc(t, pool)
	ctx := context.Background()

	// Attempt 1: all correct.
	s1, err := svc.StartPractice(ctx, f.paperID, f.studentID)
	if err != nil {
		t.Fatalf("start 1: %v", err)
	}
	if len(s1.Questions) != 4 {
		t.Fatalf("expected 4 questions, got %d", len(s1.Questions))
	}
	r1, err := svc.SubmitPractice(ctx, f.paperID, s1.AttemptID, f.studentID, SubmitInput{Answers: allCorrect(f.corrects)})
	if err != nil {
		t.Fatalf("submit 1: %v", err)
	}
	if r1.Score != 4 || r1.Total != 4 || r1.Percentage != 100 {
		t.Fatalf("attempt 1 result: %+v", r1)
	}
	if len(r1.Review) != 4 || r1.Review[0].CorrectOption == "" {
		t.Fatal("review should reveal correct answers after submit")
	}

	// Attempt 2: a fresh attempt with a DIFFERENT id, partial answers.
	s2, err := svc.StartPractice(ctx, f.paperID, f.studentID)
	if err != nil {
		t.Fatalf("start 2: %v", err)
	}
	if s2.AttemptID == s1.AttemptID {
		t.Fatal("second start must create a new attempt (multi-attempt)")
	}
	r2, err := svc.SubmitPractice(ctx, f.paperID, s2.AttemptID, f.studentID, SubmitInput{Answers: map[string]string{"0": f.corrects[0]}})
	if err != nil {
		t.Fatalf("submit 2: %v", err)
	}
	if r2.Score != 1 {
		t.Fatalf("attempt 2 score: got %d want 1", r2.Score)
	}

	// History shows both, newest first; stats reflect best.
	hist, err := svc.PracticeHistory(ctx, f.paperID, f.studentID, 1, 10)
	if err != nil {
		t.Fatalf("history: %v", err)
	}
	if hist.Total != 2 || len(hist.Attempts) != 2 {
		t.Fatalf("expected 2 attempts, got total=%d len=%d", hist.Total, len(hist.Attempts))
	}
	ov, err := svc.PracticeOverview(ctx, f.paperID, f.studentID)
	if err != nil {
		t.Fatalf("overview: %v", err)
	}
	if ov.AttemptCount != 2 || ov.BestScore == nil || *ov.BestScore != 4 {
		t.Fatalf("overview stats: count=%d best=%v", ov.AttemptCount, ov.BestScore)
	}
}

// ── Server-authoritative elapsed time (client cannot spoof) ───────────────────

func TestIntegrationPractice_ElapsedIsServerSide(t *testing.T) {
	pool := testPool(t)
	f := seedPastPaper(t, pool, 2)
	svc := newPapersSvc(t, pool)
	ctx := context.Background()

	// Create an attempt that started 90s ago (bypassing the service).
	attemptID := mustUUID(t, pool,
		`INSERT INTO practice_attempts (user_id, paper_id, total_questions, started_at)
		 VALUES ($1,$2,2, NOW() - INTERVAL '90 seconds') RETURNING id`, f.studentID, f.paperID)

	r, err := svc.SubmitPractice(ctx, f.paperID, attemptID, f.studentID, SubmitInput{Answers: map[string]string{}})
	if err != nil {
		t.Fatalf("submit: %v", err)
	}
	// Server computes ~90s from the DB started_at; the client sent nothing.
	if r.TimeTakenSecs < 88 || r.TimeTakenSecs > 120 {
		t.Fatalf("expected ~90s server-side elapsed, got %d", r.TimeTakenSecs)
	}
}

// ── Ownership / state guards ──────────────────────────────────────────────────

func TestIntegrationPractice_Guards(t *testing.T) {
	pool := testPool(t)
	f := seedPastPaper(t, pool, 2)
	svc := newPapersSvc(t, pool)
	ctx := context.Background()

	s, err := svc.StartPractice(ctx, f.paperID, f.studentID)
	if err != nil {
		t.Fatalf("start: %v", err)
	}

	// Wrong owner → 403.
	assertStatus(t, func() error {
		_, e := svc.SubmitPractice(ctx, f.paperID, s.AttemptID, f.creatorID, SubmitInput{Answers: map[string]string{}})
		return e
	}(), 403)

	// Correct owner submits → ok.
	if _, err := svc.SubmitPractice(ctx, f.paperID, s.AttemptID, f.studentID, SubmitInput{Answers: map[string]string{}}); err != nil {
		t.Fatalf("owner submit: %v", err)
	}
	// Re-submit same attempt → 409.
	assertStatus(t, func() error {
		_, e := svc.SubmitPractice(ctx, f.paperID, s.AttemptID, f.studentID, SubmitInput{Answers: map[string]string{}})
		return e
	}(), 409)
}

// StartPractice must refuse a non-pastpaper (e.g. daily) paper.
func TestIntegrationPractice_RejectsNonPastPaper(t *testing.T) {
	pool := testPool(t)
	daily := seedFixture(t, pool) // a daily paper from the media harness
	svc := newPapersSvc(t, pool)
	assertStatus(t, func() error {
		_, e := svc.StartPractice(context.Background(), daily.paperID, daily.studentID)
		return e
	}(), 404)
}

// ── Reference-PDF lifecycle via the shared storage ────────────────────────────

func TestIntegrationPractice_PaperPDFLifecycle(t *testing.T) {
	pool := testPool(t)
	f := seedPastPaper(t, pool, 1)
	media, store := newMediaSvc(t, pool)
	ctx := context.Background()

	pdf := []byte("%PDF-1.7\n%\xe2\xe3\xcf\xd3 structured questions...")

	pdfs, err := media.UploadPaperPDF(ctx, f.paperID, "structured", bytes.NewReader(pdf), int64(len(pdf)))
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	if pdfs["structured"] == "" {
		t.Fatalf("expected a structured pdf url, got %v", pdfs)
	}
	key1, _, _, _ := repository.NewPaperMediaRepo(pool).Get(ctx, f.paperID, "structured")
	assertFileExists(t, store, key1)

	// Student can view a published past paper's PDF.
	o, err := media.ServePaperPDF(ctx, model.RoleStudent, f.paperID, "structured")
	if err != nil {
		t.Fatalf("student serve: %v", err)
	}
	o.Body.Close()

	// Non-PDF is rejected.
	if _, err := media.UploadPaperPDF(ctx, f.paperID, "essay", bytes.NewReader([]byte{0x89, 'P', 'N', 'G'}), 4); err == nil {
		t.Fatal("non-PDF upload should be rejected")
	}

	// Replace deletes the old file.
	if _, err := media.UploadPaperPDF(ctx, f.paperID, "structured", bytes.NewReader(pdf), int64(len(pdf))); err != nil {
		t.Fatalf("replace: %v", err)
	}
	assertFileGone(t, store, key1)

	// Remove deletes row + file.
	key2, _, _, _ := repository.NewPaperMediaRepo(pool).Get(ctx, f.paperID, "structured")
	if _, err := media.RemovePaperPDF(ctx, f.paperID, "structured"); err != nil {
		t.Fatalf("remove: %v", err)
	}
	assertFileGone(t, store, key2)
}
