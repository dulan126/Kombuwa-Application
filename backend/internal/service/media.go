package service

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/miedvance/api/internal/httputil"
	"github.com/miedvance/api/internal/model"
	"github.com/miedvance/api/internal/repository"
	"github.com/miedvance/api/internal/storage"
)

// validMediaSlots are the image slots a question can carry: the stem plus each
// of the four options.
var validMediaSlots = map[string]bool{
	"question": true, "a": true, "b": true, "c": true, "d": true, "e": true,
}

// MediaService owns media storage, validation, gated serving, and orphan
// cleanup. It is the single shared path for question/answer images AND for the
// two past-paper reference PDFs — one storage layer, content-specific validation.
type MediaService struct {
	store       storage.Storage
	repo        *repository.QuestionMediaRepo
	paperMedia  *repository.PaperMediaRepo
	papersRepo  *repository.PapersRepo
	maxBytes    int64
	maxPDFBytes int64
}

// NewMediaService creates a MediaService. maxImageMB caps image upload size;
// PDFs are capped at maxFileMB.
func NewMediaService(store storage.Storage, repo *repository.QuestionMediaRepo, paperMedia *repository.PaperMediaRepo, papersRepo *repository.PapersRepo, maxImageMB, maxFileMB int) *MediaService {
	if maxImageMB <= 0 {
		maxImageMB = 5
	}
	if maxFileMB <= 0 {
		maxFileMB = 10
	}
	return &MediaService{
		store:       store,
		repo:        repo,
		paperMedia:  paperMedia,
		papersRepo:  papersRepo,
		maxBytes:    int64(maxImageMB) << 20,
		maxPDFBytes: int64(maxFileMB) << 20,
	}
}

// ── Validation ────────────────────────────────────────────────────────────────

// validateImage sniffs the content type from the leading bytes (NOT the client
// filename or extension) and enforces the size cap. Returns the canonical
// extension + MIME for an allowed image, or an error.
func validateImage(head []byte, size, maxBytes int64) (ext, mime string, err error) {
	if size > maxBytes {
		return "", "", httputil.E(http.StatusBadRequest,
			fmt.Sprintf("Image exceeds the %d MB limit", maxBytes>>20))
	}
	switch http.DetectContentType(head) {
	case "image/jpeg":
		return ".jpg", "image/jpeg", nil
	case "image/png":
		return ".png", "image/png", nil
	case "image/webp":
		return ".webp", "image/webp", nil
	default:
		return "", "", httputil.E(http.StatusBadRequest, "Only JPEG, PNG, or WebP images are allowed")
	}
}

// ── Admin writes ──────────────────────────────────────────────────────────────

// Upload validates and stores an image for (questionID, slot), replacing any
// existing one and deleting the previous file. Keeps file and DB consistent:
// a DB failure removes the just-written file (no orphan); a successful replace
// removes the old file.
func (s *MediaService) Upload(ctx context.Context, questionID int, slot string, file io.Reader, size int64) (map[string]string, error) {
	if !validMediaSlots[slot] {
		return nil, httputil.E(http.StatusBadRequest, "Invalid image slot")
	}

	head := make([]byte, 512)
	n, err := io.ReadFull(file, head)
	if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
		return nil, fmt.Errorf("read image head: %w", err)
	}
	head = head[:n]

	ext, mime, err := validateImage(head, size, s.maxBytes)
	if err != nil {
		return nil, err
	}

	key := "question-media/" + uuid.NewString() + ext
	if err := s.store.Save(key, io.MultiReader(bytes.NewReader(head), file)); err != nil {
		return nil, fmt.Errorf("save image: %w", err)
	}

	oldKey, err := s.repo.Upsert(ctx, questionID, slot, key, mime)
	if err != nil {
		_ = s.store.Delete(key) // don't leave an orphaned file on DB failure
		return nil, fmt.Errorf("record image: %w", err)
	}
	if oldKey != nil {
		_ = s.store.Delete(*oldKey) // clean up the replaced file
	}

	return s.AdminImages(ctx, questionID)
}

// Remove deletes the image (row + file) for (questionID, slot).
func (s *MediaService) Remove(ctx context.Context, questionID int, slot string) (map[string]string, error) {
	if !validMediaSlots[slot] {
		return nil, httputil.E(http.StatusBadRequest, "Invalid image slot")
	}
	key, err := s.repo.Delete(ctx, questionID, slot)
	if err != nil {
		return nil, fmt.Errorf("remove image: %w", err)
	}
	if key != nil {
		_ = s.store.Delete(*key)
	}
	return s.AdminImages(ctx, questionID)
}

// KeysForQuestion returns all storage keys for a question (call before deleting
// the question, since its media rows cascade away with it).
func (s *MediaService) KeysForQuestion(ctx context.Context, questionID int) ([]string, error) {
	return s.repo.ListKeys(ctx, questionID)
}

// DeleteFiles best-effort deletes files by key (used after a question delete).
func (s *MediaService) DeleteFiles(keys []string) {
	for _, k := range keys {
		_ = s.store.Delete(k)
	}
}

// ── DTO image maps ────────────────────────────────────────────────────────────

// AdminImages returns slot → admin-gated URL for one question's images.
func (s *MediaService) AdminImages(ctx context.Context, questionID int) (map[string]string, error) {
	media, err := s.repo.MediaForQuestions(ctx, []int{questionID})
	if err != nil {
		return nil, err
	}
	return adminImageURLs(questionID, media[questionID]), nil
}

// AdminImagesFor returns questionID → (slot → admin URL) for many questions.
func (s *MediaService) AdminImagesFor(ctx context.Context, questionIDs []int) (map[int]map[string]string, error) {
	media, err := s.repo.MediaForQuestions(ctx, questionIDs)
	if err != nil {
		return nil, err
	}
	out := make(map[int]map[string]string, len(media))
	for qid, slots := range media {
		out[qid] = adminImageURLs(qid, slots)
	}
	return out, nil
}

// StudentImagesFor returns questionID → (slot → paper-scoped gated URL) for the
// given questions in the context of a paper.
func (s *MediaService) StudentImagesFor(ctx context.Context, paperID uuid.UUID, questionIDs []int) (map[int]map[string]string, error) {
	media, err := s.repo.MediaForQuestions(ctx, questionIDs)
	if err != nil {
		return nil, err
	}
	out := make(map[int]map[string]string, len(media))
	for qid, slots := range media {
		m := make(map[string]string, len(slots))
		for slot := range slots {
			m[slot] = studentMediaURL(paperID, qid, slot)
		}
		out[qid] = m
	}
	return out, nil
}

func adminImageURLs(questionID int, slots map[string]string) map[string]string {
	if len(slots) == 0 {
		return nil
	}
	m := make(map[string]string, len(slots))
	for slot := range slots {
		m[slot] = adminMediaURL(questionID, slot)
	}
	return m
}

func studentMediaURL(paperID uuid.UUID, questionID int, slot string) string {
	// Browser-facing path: apiClient/rewrite prepend /api → /api/v1.
	return fmt.Sprintf("/api/papers/%s/questions/%d/media/%s", paperID, questionID, slot)
}

func adminMediaURL(questionID int, slot string) string {
	return fmt.Sprintf("/api/admin/questions/%d/media/%s", questionID, slot)
}

// ── Serving ───────────────────────────────────────────────────────────────────

// Opened is a servable image blob.
type Opened struct {
	Body    io.ReadSeekCloser
	MIME    string
	ModTime time.Time
	Key     string
}

// ServeAdmin opens an image for an admin/editor (authorization handled by the
// route's permission middleware).
func (s *MediaService) ServeAdmin(ctx context.Context, questionID int, slot string) (*Opened, error) {
	if !validMediaSlots[slot] {
		return nil, httputil.E(http.StatusNotFound, "Not found")
	}
	return s.openSlot(ctx, questionID, slot)
}

// ServeStudent opens an image only if the caller may currently see the question
// (in-progress attempt, or completed + ms released; admins always). This is the
// leak guard — it mirrors the StartExam / GetMarkingScheme gates.
func (s *MediaService) ServeStudent(ctx context.Context, userID uuid.UUID, role model.UserRole, paperID uuid.UUID, questionID int, slot string) (*Opened, error) {
	if !validMediaSlots[slot] {
		return nil, httputil.E(http.StatusNotFound, "Not found")
	}
	inPaper, err := s.papersRepo.QuestionInPaper(ctx, paperID, questionID)
	if err != nil {
		return nil, fmt.Errorf("question in paper: %w", err)
	}
	if !inPaper {
		return nil, httputil.E(http.StatusNotFound, "Not found")
	}

	allowed, err := s.studentCanView(ctx, userID, role, paperID)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, httputil.E(http.StatusForbidden, "Not available")
	}
	return s.openSlot(ctx, questionID, slot)
}

func (s *MediaService) openSlot(ctx context.Context, questionID int, slot string) (*Opened, error) {
	key, mime, found, err := s.repo.Get(ctx, questionID, slot)
	if err != nil {
		return nil, fmt.Errorf("get media: %w", err)
	}
	if !found {
		return nil, httputil.E(http.StatusNotFound, "Not found")
	}
	body, modTime, err := s.store.Open(key)
	if err != nil {
		return nil, httputil.E(http.StatusNotFound, "Not found")
	}
	return &Opened{Body: body, MIME: mime, ModTime: modTime, Key: key}, nil
}

// ── Access decision ───────────────────────────────────────────────────────────

// mediaViewer captures everything the access decision needs.
type mediaViewer struct {
	isStaff       bool // admin or editor
	hasInProgress bool // started, not completed, not past deadline
	hasCompleted  bool
	msAvailable   bool
}

// mediaAccessAllowed is the pure gating decision (unit-tested).
func mediaAccessAllowed(v mediaViewer) bool {
	switch {
	case v.isStaff:
		return true
	case v.hasInProgress:
		return true
	case v.hasCompleted && v.msAvailable:
		return true
	default:
		return false
	}
}

func (s *MediaService) studentCanView(ctx context.Context, userID uuid.UUID, role model.UserRole, paperID uuid.UUID) (bool, error) {
	v := mediaViewer{isStaff: role == model.RoleAdmin || role == model.RoleEditor}
	if v.isStaff {
		return true, nil
	}

	paper, err := s.papersRepo.GetPaper(ctx, paperID)
	if err != nil {
		return false, fmt.Errorf("get paper: %w", err)
	}
	if paper == nil {
		return false, nil
	}
	attempt, err := s.papersRepo.FindAttempt(ctx, paperID, userID)
	if err != nil {
		return false, fmt.Errorf("find attempt: %w", err)
	}
	if attempt == nil {
		return false, nil
	}
	if attempt.IsCompleted {
		v.hasCompleted = true
		v.msAvailable = paper.MSAvailable
	} else if remainingSeconds(examDeadline(attempt.StartedAt, paper), time.Now()) > 0 {
		v.hasInProgress = true
	}
	return mediaAccessAllowed(v), nil
}

// ── Past-paper PDFs (same storage layer, PDF validation) ──────────────────────

var validPaperSlots = map[string]bool{"structured": true, "essay": true, "answers": true}

// validatePDF content-sniffs the leading bytes (not the filename) and enforces
// the size cap.
func validatePDF(head []byte, size, maxBytes int64) error {
	if size > maxBytes {
		return httputil.E(http.StatusBadRequest,
			fmt.Sprintf("PDF exceeds the %d MB limit", maxBytes>>20))
	}
	if http.DetectContentType(head) != "application/pdf" {
		return httputil.E(http.StatusBadRequest, "Only PDF files are allowed")
	}
	return nil
}

func paperPDFURL(paperID uuid.UUID, slot string) string {
	return fmt.Sprintf("/api/papers/%s/pdf/%s", paperID, slot)
}

// UploadPaperPDF validates and stores a reference PDF for (paperID, slot),
// replacing any existing one and deleting the previous file (orphan-safe).
func (s *MediaService) UploadPaperPDF(ctx context.Context, paperID uuid.UUID, slot string, file io.Reader, size int64) (map[string]string, error) {
	if !validPaperSlots[slot] {
		return nil, httputil.E(http.StatusBadRequest, "Invalid PDF slot")
	}
	head := make([]byte, 512)
	n, err := io.ReadFull(file, head)
	if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
		return nil, fmt.Errorf("read pdf head: %w", err)
	}
	head = head[:n]
	if err := validatePDF(head, size, s.maxPDFBytes); err != nil {
		return nil, err
	}

	key := "paper-media/" + uuid.NewString() + ".pdf"
	if err := s.store.Save(key, io.MultiReader(bytes.NewReader(head), file)); err != nil {
		return nil, fmt.Errorf("save pdf: %w", err)
	}
	oldKey, err := s.paperMedia.Upsert(ctx, paperID, slot, key, "application/pdf", size)
	if err != nil {
		_ = s.store.Delete(key) // no orphan on DB failure
		return nil, fmt.Errorf("record pdf: %w", err)
	}
	if oldKey != nil {
		_ = s.store.Delete(*oldKey)
	}
	return s.PaperPDFs(ctx, paperID)
}

// RemovePaperPDF deletes the PDF (row + file) for (paperID, slot).
func (s *MediaService) RemovePaperPDF(ctx context.Context, paperID uuid.UUID, slot string) (map[string]string, error) {
	if !validPaperSlots[slot] {
		return nil, httputil.E(http.StatusBadRequest, "Invalid PDF slot")
	}
	key, err := s.paperMedia.Delete(ctx, paperID, slot)
	if err != nil {
		return nil, fmt.Errorf("remove pdf: %w", err)
	}
	if key != nil {
		_ = s.store.Delete(*key)
	}
	return s.PaperPDFs(ctx, paperID)
}

// PaperPDFs returns slot → gated URL for the paper's reference PDFs.
func (s *MediaService) PaperPDFs(ctx context.Context, paperID uuid.UUID) (map[string]string, error) {
	slots, err := s.paperMedia.SlotsForPaper(ctx, paperID)
	if err != nil {
		return nil, err
	}
	if len(slots) == 0 {
		return nil, nil
	}
	out := make(map[string]string, len(slots))
	for slot := range slots {
		out[slot] = paperPDFURL(paperID, slot)
	}
	return out, nil
}

// KeysForPaper returns all PDF storage keys for a paper (for delete cleanup).
func (s *MediaService) KeysForPaper(ctx context.Context, paperID uuid.UUID) ([]string, error) {
	return s.paperMedia.ListKeys(ctx, paperID)
}

// ServePaperPDF opens a reference PDF. PDFs are question papers (no answers), so
// any authenticated caller may read them once the past paper is published;
// staff may always read (for admin preview).
func (s *MediaService) ServePaperPDF(ctx context.Context, role model.UserRole, paperID uuid.UUID, slot string) (*Opened, error) {
	if !validPaperSlots[slot] {
		return nil, httputil.E(http.StatusNotFound, "Not found")
	}
	staff := role == model.RoleAdmin || role == model.RoleEditor
	if !staff {
		paper, err := s.papersRepo.GetPaper(ctx, paperID) // GetPaper only returns published papers
		if err != nil {
			return nil, fmt.Errorf("get paper: %w", err)
		}
		if paper == nil || paper.Type != model.PaperPastPaper {
			return nil, httputil.E(http.StatusNotFound, "Not found")
		}
	}
	key, mime, found, err := s.paperMedia.Get(ctx, paperID, slot)
	if err != nil {
		return nil, fmt.Errorf("get pdf: %w", err)
	}
	if !found {
		return nil, httputil.E(http.StatusNotFound, "Not found")
	}
	body, modTime, err := s.store.Open(key)
	if err != nil {
		return nil, httputil.E(http.StatusNotFound, "Not found")
	}
	return &Opened{Body: body, MIME: mime, ModTime: modTime, Key: key}, nil
}
