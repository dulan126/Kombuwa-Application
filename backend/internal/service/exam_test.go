package service

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/miedvance/api/internal/model"
	"github.com/miedvance/api/internal/repository"
)

// ── Answer-stripping DTOs (leak regression guard) ─────────────────────────────

// The in-exam payloads must never carry correct answers. This guards against a
// future change to model.Question or the start DTO re-exposing the answer key.
func TestExamStartResponse_OmitsCorrectOption(t *testing.T) {
	resp := ExamStartResponse{
		Paper:  paperSummary{ID: uuid.New(), Type: "daily", Title: "Daily"},
		Status: StatusInProgress,
		Questions: []model.Question{{
			ID:            1,
			SortOrder:     1,
			QuestionText:  "2 + 2 = ?",
			OptionA:       "3",
			OptionB:       "4",
			OptionC:       "5",
			OptionD:       "6",
			CorrectOption: "B", // must NOT appear in JSON
		}},
		RemainingSeconds: 1200,
	}

	raw, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	got := string(raw)

	if strings.Contains(got, "correct_option") {
		t.Fatalf("start payload leaked correct_option key: %s", got)
	}
	// Guard against the value leaking under any key too. "B" is a common letter,
	// so assert on the specific field encoding rather than the bare letter.
	if strings.Contains(got, `"correct`) {
		t.Fatalf("start payload leaked a correct-answer field: %s", got)
	}
}

// The pre-start overview must carry no questions at all.
func TestExamOverviewResponse_HasNoQuestionsField(t *testing.T) {
	resp := ExamOverviewResponse{
		Paper:            paperSummary{ID: uuid.New(), Type: "srp", Title: "SRP"},
		Status:           StatusNotStarted,
		RemainingSeconds: 0,
	}
	raw, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if strings.Contains(string(raw), "questions") {
		t.Fatalf("overview payload must not contain questions: %s", string(raw))
	}
}

// ── Deadline math ─────────────────────────────────────────────────────────────

func TestExamDeadline_CappedByWindow(t *testing.T) {
	started := time.Date(2026, 7, 4, 10, 0, 0, 0, time.UTC)

	// Duration (20m) ends before the window closes → duration wins.
	until := started.Add(2 * time.Hour)
	p := &repository.PaperRow{TimeSeconds: 1200, AvailableUntil: &until}
	if got, want := examDeadline(started, p), started.Add(20*time.Minute); !got.Equal(want) {
		t.Fatalf("duration deadline: got %v want %v", got, want)
	}

	// Window closes before the duration elapses → window caps the deadline.
	early := started.Add(5 * time.Minute)
	p2 := &repository.PaperRow{TimeSeconds: 1200, AvailableUntil: &early}
	if got := examDeadline(started, p2); !got.Equal(early) {
		t.Fatalf("window cap: got %v want %v", got, early)
	}

	// No window set → duration is the deadline.
	p3 := &repository.PaperRow{TimeSeconds: 600}
	if got, want := examDeadline(started, p3), started.Add(10*time.Minute); !got.Equal(want) {
		t.Fatalf("no-window deadline: got %v want %v", got, want)
	}
}

func TestRemainingSeconds_ClampsAtZero(t *testing.T) {
	now := time.Date(2026, 7, 4, 10, 0, 0, 0, time.UTC)
	if got := remainingSeconds(now.Add(90*time.Second), now); got != 90 {
		t.Fatalf("got %d want 90", got)
	}
	if got := remainingSeconds(now.Add(-1*time.Second), now); got != 0 {
		t.Fatalf("expired should clamp to 0, got %d", got)
	}
}

// ── Window enforcement (fresh start) ──────────────────────────────────────────

func TestEnsureWindowOpen(t *testing.T) {
	base := time.Date(2026, 7, 4, 10, 0, 0, 0, time.UTC)
	from := base
	until := base.Add(time.Hour)
	p := &repository.PaperRow{Type: model.PaperDaily, AvailableFrom: from, AvailableUntil: &until}

	if err := ensureWindowOpen(p, base.Add(30*time.Minute)); err != nil {
		t.Fatalf("mid-window should be open: %v", err)
	}
	if err := ensureWindowOpen(p, from.Add(-time.Minute)); err == nil {
		t.Fatal("before window should be rejected")
	}
	if err := ensureWindowOpen(p, until.Add(time.Minute)); err == nil {
		t.Fatal("after window should be rejected")
	}
}
