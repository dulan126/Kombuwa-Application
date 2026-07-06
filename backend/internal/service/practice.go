package service

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/miedvance/api/internal/httputil"
	"github.com/miedvance/api/internal/model"
	"github.com/miedvance/api/internal/repository"
)

// Past-paper practice reuses the exam engine's question delivery, no-answer-leak
// gating, and grading (scoreAnswers). It differs from Daily/SRP only in:
//   • multiple attempts (practice_attempts, no UNIQUE(user,paper))
//   • elapsed timing (now - started_at, no countdown/deadline)
//   • no rankings; answers revealed in a per-attempt review after submit.

// ── Responses ─────────────────────────────────────────────────────────────────

// PracticeOverviewResponse is the pre-start landing for one past paper.
type PracticeOverviewResponse struct {
	Paper        paperSummary      `json:"paper"`
	Parts        paperParts        `json:"parts"`
	AttemptCount int               `json:"attempt_count"`
	BestScore    *int16            `json:"best_score,omitempty"`
	PDFs         map[string]string `json:"pdfs,omitempty"` // slot → gated URL
}

type paperParts struct {
	HasMCQ        bool `json:"has_mcq"`
	HasStructured bool `json:"has_structured_pdf"`
	HasEssay      bool `json:"has_essay_pdf"`
	HasAnswers    bool `json:"has_answers_pdf"`
}

// PracticeStartResponse hands back the questions (no answers) for a new attempt.
type PracticeStartResponse struct {
	Paper     paperSummary     `json:"paper"`
	Questions []model.Question `json:"questions"`
	AttemptID uuid.UUID        `json:"attempt_id"`
	StartedAt time.Time        `json:"started_at"`
}

// PracticeSubmitResult is the graded result + full answer review.
type PracticeSubmitResult struct {
	AttemptID     uuid.UUID    `json:"attempt_id"`
	Score         int          `json:"score"`
	Total         int          `json:"total"`
	Percentage    int          `json:"percentage"`
	TimeTakenSecs int          `json:"timeTakenSecs"`
	Review        []MSQuestion `json:"review"` // reuses the marking-scheme shape
}

// PracticeHistoryPage is a paginated attempt history.
type PracticeHistoryPage struct {
	Attempts []repository.PracticeHistoryRow `json:"attempts"`
	Total    int                             `json:"total"`
}

// ── Engine ────────────────────────────────────────────────────────────────────

// loadPastPaper fetches a paper and enforces it is a published past paper.
func (s *PapersService) loadPastPaper(ctx context.Context, paperID uuid.UUID) (*repository.PaperRow, error) {
	paper, err := s.repo.GetPaper(ctx, paperID)
	if err != nil {
		return nil, fmt.Errorf("get paper: %w", err)
	}
	if paper == nil || paper.Type != model.PaperPastPaper {
		return nil, httputil.E(http.StatusNotFound, "Past paper not found")
	}
	return paper, nil
}

// PracticeOverview returns the landing data (parts present, attempt stats, PDFs).
func (s *PapersService) PracticeOverview(ctx context.Context, paperID, userID uuid.UUID) (*PracticeOverviewResponse, error) {
	paper, err := s.loadPastPaper(ctx, paperID)
	if err != nil {
		return nil, err
	}

	count, best, err := s.practice.Stats(ctx, userID, paperID)
	if err != nil {
		return nil, err
	}

	var pdfs map[string]string
	parts := paperParts{HasMCQ: paper.QuestionCount > 0}
	if s.media != nil {
		pdfs, err = s.media.PaperPDFs(ctx, paperID)
		if err != nil {
			return nil, err
		}
		parts.HasStructured = pdfs["structured"] != ""
		parts.HasEssay = pdfs["essay"] != ""
		parts.HasAnswers = pdfs["answers"] != ""
	}

	return &PracticeOverviewResponse{
		Paper:        summaryFromPaper(paper),
		Parts:        parts,
		AttemptCount: count,
		BestScore:    best,
		PDFs:         pdfs,
	}, nil
}

// StartPractice creates a fresh attempt and returns the questions (no answers).
func (s *PapersService) StartPractice(ctx context.Context, paperID, userID uuid.UUID) (*PracticeStartResponse, error) {
	paper, err := s.loadPastPaper(ctx, paperID)
	if err != nil {
		return nil, err
	}
	if paper.QuestionCount == 0 {
		return nil, httputil.E(http.StatusUnprocessableEntity, "This past paper has no MCQs to practice")
	}

	attemptID, startedAt, err := s.practice.CreateAttempt(ctx, userID, paperID, paper.QuestionCount)
	if err != nil {
		return nil, err
	}

	questions, err := s.repo.GetQuestionsNoAnswers(ctx, paperID)
	if err != nil {
		return nil, fmt.Errorf("get questions: %w", err)
	}
	if err := s.attachQuestionImages(ctx, paperID, questions); err != nil {
		return nil, err
	}

	return &PracticeStartResponse{
		Paper:     summaryFromPaper(paper),
		Questions: questions,
		AttemptID: attemptID,
		StartedAt: startedAt,
	}, nil
}

// SubmitPractice grades an attempt, records server-authoritative elapsed time,
// and returns the score + a per-question review with correct answers.
func (s *PapersService) SubmitPractice(ctx context.Context, paperID, attemptID, userID uuid.UUID, in SubmitInput) (*PracticeSubmitResult, error) {
	attempt, err := s.practice.GetAttempt(ctx, attemptID)
	if err != nil {
		return nil, err
	}
	if attempt == nil || attempt.PaperID != paperID {
		return nil, httputil.E(http.StatusNotFound, "Attempt not found")
	}
	if attempt.UserID != userID {
		return nil, httputil.E(http.StatusForbidden, "Not your attempt")
	}
	if attempt.IsCompleted {
		return nil, httputil.E(http.StatusConflict, "Attempt already submitted")
	}

	questions, err := s.repo.GetQuestionsWithAnswers(ctx, paperID)
	if err != nil {
		return nil, fmt.Errorf("get questions: %w", err)
	}
	score := scoreAnswers(questions, in.Answers)

	// Server-authoritative elapsed time — no countdown, no clamp (past paper has
	// no time limit; the client stopwatch is display-only and not trusted).
	timeTaken := int(time.Since(attempt.StartedAt).Seconds())
	if timeTaken < 0 {
		timeTaken = 0
	}

	if err := s.practice.CompleteAttempt(ctx, attemptID, score, in.Answers, timeTaken); err != nil {
		return nil, err
	}

	// Build the review (question + correct + the student's own answer). Answers
	// are only ever revealed here, after submit — never during the attempt.
	review := make([]MSQuestion, len(questions))
	imgs := s.practiceImages(ctx, paperID, questions)
	for i, q := range questions {
		sa := in.Answers[fmt.Sprintf("%d", i)]
		var saPtr *string
		if sa != "" {
			saPtr = &sa
		}
		if m := imgs[int(q.ID)]; len(m) > 0 {
			q.Images = m
		}
		review[i] = MSQuestion{QuestionWithAnswer: q, StudentAnswer: saPtr}
	}

	total := len(questions)
	pct := 0
	if total > 0 {
		pct = score * 100 / total
	}
	return &PracticeSubmitResult{
		AttemptID:     attemptID,
		Score:         score,
		Total:         total,
		Percentage:    pct,
		TimeTakenSecs: timeTaken,
		Review:        review,
	}, nil
}

// practiceImages builds gated image URLs for the review, scoped to the paper.
func (s *PapersService) practiceImages(ctx context.Context, paperID uuid.UUID, questions []model.QuestionWithAnswer) map[int]map[string]string {
	if s.media == nil || len(questions) == 0 {
		return nil
	}
	ids := make([]int, len(questions))
	for i := range questions {
		ids[i] = int(questions[i].ID)
	}
	imgs, err := s.media.StudentImagesFor(ctx, paperID, ids)
	if err != nil {
		return nil
	}
	return imgs
}

// ServePaperPDF opens a reference PDF for a caller (delegates to the media service).
func (s *PapersService) ServePaperPDF(ctx context.Context, role model.UserRole, paperID uuid.UUID, slot string) (*Opened, error) {
	if s.media == nil {
		return nil, httputil.E(http.StatusNotFound, "Not found")
	}
	return s.media.ServePaperPDF(ctx, role, paperID, slot)
}

// PracticePaperCard is one past paper in the student subject list, with the
// student's practice stats and which parts (MCQ / PDFs) are present.
type PracticePaperCard struct {
	ID            uuid.UUID `json:"id"`
	Title         string    `json:"title"`
	SubjectID     string    `json:"subject_id"`
	SubjectName   string    `json:"subject_name"`
	Grade         string    `json:"grade"`
	QuestionCount int16     `json:"question_count"`
	HasMCQ        bool      `json:"has_mcq"`
	HasStructured bool      `json:"has_structured_pdf"`
	HasEssay      bool      `json:"has_essay_pdf"`
	HasAnswers    bool      `json:"has_answers_pdf"`
	AttemptCount  int       `json:"attempt_count"`
	BestScore     *int16    `json:"best_score,omitempty"`
}

// ListPracticePapers returns the published past papers in a subject with the
// caller's practice stats and part availability.
func (s *PapersService) ListPracticePapers(ctx context.Context, userID uuid.UUID, subjectID, grade string) ([]PracticePaperCard, error) {
	cards, err := s.repo.ListPapers(ctx, userID, repository.PaperListFilter{
		Type:      string(model.PaperPastPaper),
		SubjectID: subjectID,
		Grade:     grade,
	})
	if err != nil {
		return nil, fmt.Errorf("list past papers: %w", err)
	}

	out := make([]PracticePaperCard, 0, len(cards))
	for _, c := range cards {
		card := PracticePaperCard{
			ID:            c.ID,
			Title:         c.Title,
			SubjectID:     c.SubjectID,
			SubjectName:   c.SubjectName,
			Grade:         string(c.Grade),
			QuestionCount: c.QuestionCount,
			HasMCQ:        c.QuestionCount > 0,
		}
		if count, best, err := s.practice.Stats(ctx, userID, c.ID); err == nil {
			card.AttemptCount = count
			card.BestScore = best
		}
		if s.media != nil {
			if pdfs, err := s.media.PaperPDFs(ctx, c.ID); err == nil {
				card.HasStructured = pdfs["structured"] != ""
				card.HasEssay = pdfs["essay"] != ""
				card.HasAnswers = pdfs["answers"] != ""
			}
		}
		out = append(out, card)
	}
	return out, nil
}

// PracticeHistory returns a paginated attempt history for (user, paper).
func (s *PapersService) PracticeHistory(ctx context.Context, paperID, userID uuid.UUID, page, limit int) (*PracticeHistoryPage, error) {
	if _, err := s.loadPastPaper(ctx, paperID); err != nil {
		return nil, err
	}
	rows, total, err := s.practice.ListAttempts(ctx, userID, paperID, page, limit)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []repository.PracticeHistoryRow{}
	}
	return &PracticeHistoryPage{Attempts: rows, Total: total}, nil
}
