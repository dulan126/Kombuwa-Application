package service

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/miedvance/api/internal/httputil"
	"github.com/miedvance/api/internal/model"
	"github.com/miedvance/api/internal/repository"
)

// ── One-paper-per-day conflict message ────────────────────────────────────────

func TestDayConflictMsg(t *testing.T) {
	if got := dayConflictMsg(model.PaperDaily); !strings.Contains(got, "Daily MCQ") {
		t.Fatalf("daily message should mention Daily MCQ, got %q", got)
	}
	if got := dayConflictMsg(model.PaperSRP); !strings.Contains(got, "SRP") {
		t.Fatalf("srp message should mention SRP, got %q", got)
	}
}

// ── Subject-required validation ───────────────────────────────────────────────

func TestValidatePoolQuestion_SubjectRequired(t *testing.T) {
	valid := "chem"
	empty := ""

	base := PoolQuestionInput{
		QuestionText:  "2 + 2 = ?",
		OptionA:       "3",
		OptionB:       "4",
		OptionC:       "5",
		OptionD:       "6",
		OptionE:       "7",
		CorrectOption: "B",
	}

	cases := []struct {
		name      string
		subjectID *string
		wantErr   bool
	}{
		{"nil subject", nil, true},
		{"empty subject", &empty, true},
		{"valid subject", &valid, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			in := base
			in.SubjectID = tc.subjectID
			err := validatePoolQuestion(in)
			if tc.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				appErr, ok := err.(*httputil.AppError)
				if !ok {
					t.Fatalf("expected AppError, got %T", err)
				}
				if appErr.Status != http.StatusBadRequest {
					t.Fatalf("expected 400, got %d", appErr.Status)
				}
			} else if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

// Existing rules must still hold after adding the subject check.
func TestValidatePoolQuestion_ExistingRulesUnchanged(t *testing.T) {
	subj := "phy"
	in := PoolQuestionInput{
		SubjectID:     &subj,
		QuestionText:  "", // missing text
		OptionA:       "a", OptionB: "b", OptionC: "c", OptionD: "d", OptionE: "e",
		CorrectOption: "A",
	}
	if err := validatePoolQuestion(in); err == nil {
		t.Fatal("missing question_text should be rejected")
	}

	in.QuestionText = "q"
	in.CorrectOption = "X"
	if err := validatePoolQuestion(in); err == nil {
		t.Fatal("invalid correct_option should be rejected")
	}

	// A missing 5th option must now be rejected.
	valid := PoolQuestionInput{
		SubjectID: &subj, QuestionText: "q",
		OptionA: "a", OptionB: "b", OptionC: "c", OptionD: "d", OptionE: "",
		CorrectOption: "A",
	}
	if err := validatePoolQuestion(valid); err == nil {
		t.Fatal("missing option_e should be rejected (5 options required)")
	}
}

// ── Subject summary JSON contract ─────────────────────────────────────────────

// Guards the field names the frontend SubjectSummary type depends on.
func TestSubjectSummaryRow_JSONShape(t *testing.T) {
	row := repository.SubjectSummaryRow{
		ID:             "chem",
		NameSi:         "රසායන විද්‍යාව",
		DailyCount:     12,
		DailyPublished: 10,
		SRPCount:       3,
		SRPPublished:   2,
		QuestionCount:  340,
	}
	raw, err := json.Marshal(row)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	for _, key := range []string{
		"id", "name_si",
		"daily_count", "daily_published",
		"srp_count", "srp_published",
		"question_count",
	} {
		if _, ok := decoded[key]; !ok {
			t.Fatalf("summary JSON missing key %q: %s", key, string(raw))
		}
	}
}
