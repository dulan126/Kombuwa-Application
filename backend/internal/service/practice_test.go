package service

import (
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/miedvance/api/internal/model"
)

// ── Shared scorer (used by Daily/SRP and practice) ────────────────────────────

func qwa(sortOrder int16, correct string) model.QuestionWithAnswer {
	var q model.QuestionWithAnswer
	q.SortOrder = sortOrder
	q.CorrectOption = correct
	return q
}

func TestScoreAnswers(t *testing.T) {
	// Answer labels are numbers (1–5) matching real past-paper keys.
	questions := []model.QuestionWithAnswer{
		qwa(1, "1"), qwa(2, "2"), qwa(3, "3"), qwa(4, "4"),
	}
	// answers are 0-indexed keys against 1-indexed sort_order.
	cases := []struct {
		name    string
		answers map[string]string
		want    int
	}{
		{"all correct", map[string]string{"0": "1", "1": "2", "2": "3", "3": "4"}, 4},
		{"none", map[string]string{}, 0},
		{"some correct", map[string]string{"0": "1", "1": "2", "2": "9"}, 2},
		{"wrong all", map[string]string{"0": "2", "1": "3", "2": "4", "3": "1"}, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := scoreAnswers(questions, tc.answers); got != tc.want {
				t.Fatalf("got %d want %d", got, tc.want)
			}
		})
	}
}

// ── PDF validation ────────────────────────────────────────────────────────────

func TestValidatePDF(t *testing.T) {
	pdf := []byte("%PDF-1.7\n%\xe2\xe3\xcf\xd3 rest of a pdf...")
	if err := validatePDF(pdf, 1024, 10<<20); err != nil {
		t.Fatalf("real PDF should pass: %v", err)
	}
	// A PNG renamed/served as pdf must be rejected (content sniff).
	png := []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}
	if err := validatePDF(png, 1024, 10<<20); err == nil {
		t.Fatal("non-PDF bytes should be rejected")
	}
	if err := validatePDF(pdf, 11<<20, 10<<20); err == nil {
		t.Fatal("oversize PDF should be rejected")
	}
}

func TestValidPaperSlots(t *testing.T) {
	for _, ok := range []string{"structured", "essay"} {
		if !validPaperSlots[ok] {
			t.Fatalf("slot %q should be valid", ok)
		}
	}
	for _, bad := range []string{"", "question", "a", "mcq"} {
		if validPaperSlots[bad] {
			t.Fatalf("slot %q should be invalid", bad)
		}
	}
}

func TestPaperPDFURL(t *testing.T) {
	id := uuid.MustParse("99c9eaa8-6f21-4752-a3d4-5fbe1e83689f")
	got := paperPDFURL(id, "essay")
	want := "/api/papers/99c9eaa8-6f21-4752-a3d4-5fbe1e83689f/pdf/essay"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
	if strings.HasPrefix(got, "/api/v1") {
		t.Fatalf("URL must be browser-facing (no /v1): %q", got)
	}
}
