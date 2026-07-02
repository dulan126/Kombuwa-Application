package service

import (
	"context"
	"fmt"
	"net/http"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/kombuwaedu/api/internal/httputil"
	"github.com/kombuwaedu/api/internal/model"
	"github.com/kombuwaedu/api/internal/repository"
)

// PPListFilterFromQuery is a convenience constructor for handler use.
func PPListFilterFromQuery(subject, grade string, year int) repository.PPListFilter {
	return repository.PPListFilter{SubjectID: subject, Grade: grade, Year: year}
}

// PastPapersService implements all past-paper business logic.
type PastPapersService struct {
	repo *repository.PastPapersRepo
	log  *zap.Logger
}

// NewPastPapersService creates a PastPapersService.
func NewPastPapersService(repo *repository.PastPapersRepo, log *zap.Logger) *PastPapersService {
	return &PastPapersService{repo: repo, log: log}
}

// ── Tree listing ──────────────────────────────────────────────────────────────

// PPYearEntry is one row inside a topic.
type PPYearEntry struct {
	ID                    uuid.UUID `json:"id"`
	Year                  int16     `json:"year"`
	Grade                 string    `json:"grade"`
	MCQCount              int16     `json:"mcqCount"`
	EssayCount            int16     `json:"essayCount"`
	MCQMarks              int16     `json:"mcqMarks"`
	EssayMarks            int16     `json:"essayMarks"`
	HasEssayPDF           bool      `json:"hasEssayPdf"`
	MarkingSchemeAvailable bool     `json:"markingSchemeAvailable"`
	MSMCQUploaded         bool      `json:"msMcqUploaded"`
	HasMsEssay            bool      `json:"hasMsEssay"`
}

// PPTopicBranch is a topic with its year entries.
type PPTopicBranch struct {
	TopicID   int32         `json:"topic_id"`
	TopicName string        `json:"topic_name"`
	Years     []PPYearEntry `json:"years"`
}

// PPSubjectBranch is a subject with its topic branches.
type PPSubjectBranch struct {
	SubjectID   string          `json:"subject_id"`
	SubjectName string          `json:"subject_name"`
	Topics      []PPTopicBranch `json:"topics"`
}

// ListTree returns the hierarchical subject→topic→year tree.
func (s *PastPapersService) ListTree(ctx context.Context, f repository.PPListFilter) ([]PPSubjectBranch, error) {
	rows, err := s.repo.ListFlat(ctx, f)
	if err != nil {
		return nil, fmt.Errorf("list flat: %w", err)
	}

	// Build tree in Go (mirrors Node's JS grouping logic)
	subjectIndex := map[string]*PPSubjectBranch{}
	topicIndex := map[string]map[int32]*PPTopicBranch{}
	var subjectOrder []string

	for _, row := range rows {
		if _, ok := subjectIndex[row.SubjectID]; !ok {
			subjectIndex[row.SubjectID] = &PPSubjectBranch{
				SubjectID:   row.SubjectID,
				SubjectName: row.SubjectName,
			}
			topicIndex[row.SubjectID] = map[int32]*PPTopicBranch{}
			subjectOrder = append(subjectOrder, row.SubjectID)
		}

		subj := subjectIndex[row.SubjectID]
		if _, ok := topicIndex[row.SubjectID][row.TopicID]; !ok {
			topicIndex[row.SubjectID][row.TopicID] = &PPTopicBranch{
				TopicID:   row.TopicID,
				TopicName: row.TopicName,
			}
			subj.Topics = append(subj.Topics, PPTopicBranch{}) // placeholder, replaced at end
		}

		topicIndex[row.SubjectID][row.TopicID].Years = append(topicIndex[row.SubjectID][row.TopicID].Years, PPYearEntry{
			ID:                    row.ID,
			Year:                  row.Year,
			Grade:                 row.Grade,
			MCQCount:              row.MCQCount,
			EssayCount:            row.EssayCount,
			MCQMarks:              row.MCQMarks,
			EssayMarks:            row.EssayMarks,
			HasEssayPDF:           row.HasEssayPDF,
			MarkingSchemeAvailable: row.MarkingSchemeAvailable,
			MSMCQUploaded:         row.MSMCQUploaded,
			HasMsEssay:            row.HasMsEssay,
		})
	}

	// Assemble output (topics preserve DB order since we appended in order)
	result := make([]PPSubjectBranch, len(subjectOrder))
	for i, sID := range subjectOrder {
		subj := subjectIndex[sID]
		var topics []PPTopicBranch
		for _, t := range topicIndex[sID] {
			topics = append(topics, *t)
		}
		subj.Topics = topics
		result[i] = *subj
	}
	return result, nil
}

// ── Questions ─────────────────────────────────────────────────────────────────

type PPQuestionsResponse struct {
	PastPaper       *repository.PPMetaRow `json:"pastPaper"`
	Questions       []model.PPQuestion    `json:"questions"`
	AnswersAvailable bool                 `json:"answersAvailable"`
}

func (s *PastPapersService) GetQuestions(ctx context.Context, ppID uuid.UUID) (*PPQuestionsResponse, error) {
	pp, err := s.repo.GetPastPaper(ctx, ppID)
	if err != nil {
		return nil, httputil.E(http.StatusNotFound, "Past paper not found")
	}

	questions, err := s.repo.GetPPQuestions(ctx, ppID, pp.MSMCQUploaded)
	if err != nil {
		return nil, fmt.Errorf("get pp questions: %w", err)
	}
	return &PPQuestionsResponse{
		PastPaper:       pp,
		Questions:       questions,
		AnswersAvailable: pp.MSMCQUploaded,
	}, nil
}

// ── PDF paths ─────────────────────────────────────────────────────────────────

// GetEssayPDFPath returns the stored essay PDF path and a filename hint.
func (s *PastPapersService) GetEssayPDFPath(ctx context.Context, ppID uuid.UUID) (filePath, filename string, err error) {
	pp, err := s.repo.GetPastPaper(ctx, ppID)
	if err != nil || pp.EssayPDFURL == nil {
		return "", "", httputil.E(http.StatusNotFound, "Essay PDF not available")
	}
	filename = fmt.Sprintf("%s_%d_essay.pdf", pp.SubjectID, pp.Year)
	return *pp.EssayPDFURL, filename, nil
}

// GetMSPDFPath returns the marking scheme PDF path or an error if not yet available.
func (s *PastPapersService) GetMSPDFPath(ctx context.Context, ppID uuid.UUID) (filePath, filename string, err error) {
	pp, err := s.repo.GetPastPaper(ctx, ppID)
	if err != nil {
		return "", "", httputil.E(http.StatusNotFound, "Past paper not found")
	}
	if !pp.MarkingSchemeAvailable || pp.MSEssayPDFURL == nil {
		return "", "", httputil.E(http.StatusForbidden, "Marking scheme not yet available")
	}
	filename = fmt.Sprintf("%s_%d_marking_scheme.pdf", pp.SubjectID, pp.Year)
	return *pp.MSEssayPDFURL, filename, nil
}

// ── Admin ─────────────────────────────────────────────────────────────────────

type CreatePPInput struct {
	SubjectID  string `json:"subject_id"`
	TopicID    int32  `json:"topic_id"`
	Year       int16  `json:"year"`
	Grade      string `json:"grade"`
	MCQMarks   int16  `json:"mcq_marks"`
	EssayMarks int16  `json:"essay_marks"`
}

func (s *PastPapersService) CreatePastPaper(ctx context.Context, createdBy uuid.UUID, in CreatePPInput) (uuid.UUID, error) {
	if in.Year < 2010 || in.Year > 2030 {
		return uuid.UUID{}, httputil.E(http.StatusBadRequest, "year must be between 2010 and 2030")
	}
	return s.repo.CreatePastPaper(ctx, repository.CreatePastPaperParams{
		SubjectID:  in.SubjectID,
		TopicID:    in.TopicID,
		Year:       in.Year,
		Grade:      model.Grade(in.Grade),
		MCQMarks:   in.MCQMarks,
		EssayMarks: in.EssayMarks,
		UploadedBy: createdBy,
	})
}

func (s *PastPapersService) SetEssayPDF(ctx context.Context, ppID uuid.UUID, path string, size int64) error {
	return s.repo.SetEssayPDF(ctx, ppID, path, size)
}

func (s *PastPapersService) SetMarkingSchemePDF(ctx context.Context, ppID uuid.UUID, path string, size int64) error {
	return s.repo.SetMarkingSchemePDF(ctx, ppID, path, size)
}

type PPBulkQInput struct {
	QuestionText  string  `json:"question_text"`
	OptionA       string  `json:"option_a"`
	OptionB       string  `json:"option_b"`
	OptionC       string  `json:"option_c"`
	OptionD       string  `json:"option_d"`
	CorrectOption *string `json:"correct_option,omitempty"`
}

func (s *PastPapersService) BulkReplaceQuestions(ctx context.Context, ppID uuid.UUID, qs []PPBulkQInput) error {
	if len(qs) == 0 {
		return httputil.E(http.StatusBadRequest, "questions array must not be empty")
	}
	inputs := make([]repository.PPQuestionInput, len(qs))
	for i, q := range qs {
		inputs[i] = repository.PPQuestionInput{
			QuestionText:  q.QuestionText,
			OptionA:       q.OptionA,
			OptionB:       q.OptionB,
			OptionC:       q.OptionC,
			OptionD:       q.OptionD,
			CorrectOption: q.CorrectOption,
		}
	}
	return s.repo.BulkReplacePPQuestions(ctx, ppID, inputs)
}

type AnswerKeyInput struct {
	SortOrder     int    `json:"sort_order"`
	CorrectOption string `json:"correct_option"`
}

func (s *PastPapersService) ApplyAnswerKey(ctx context.Context, ppID uuid.UUID, answers []AnswerKeyInput) error {
	if len(answers) == 0 {
		return httputil.E(http.StatusBadRequest, "answers array must not be empty")
	}
	entries := make([]repository.AnswerKeyEntry, len(answers))
	for i, a := range answers {
		entries[i] = repository.AnswerKeyEntry{SortOrder: a.SortOrder, CorrectOption: a.CorrectOption}
	}
	return s.repo.ApplyAnswerKey(ctx, ppID, entries)
}
