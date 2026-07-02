package handler

import (
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"

	"github.com/miedvance/api/internal/config"
	"github.com/miedvance/api/internal/httputil"
	"github.com/miedvance/api/internal/middleware"
	"github.com/miedvance/api/internal/model"
	"github.com/miedvance/api/internal/service"
)

// PastPapersHandler exposes all past-paper HTTP endpoints.
type PastPapersHandler struct {
	svc    *service.PastPapersService
	authMW *middleware.Auth
	cfg    *config.Config
	log    *zap.Logger
}

// NewPastPapersHandler creates a PastPapersHandler.
func NewPastPapersHandler(svc *service.PastPapersService, authMW *middleware.Auth, cfg *config.Config, log *zap.Logger) *PastPapersHandler {
	return &PastPapersHandler{svc: svc, authMW: authMW, cfg: cfg, log: log}
}

// Routes returns a chi.Router with all past-paper sub-routes.
func (h *PastPapersHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Use(h.authMW.Authenticate)

	// Student endpoints
	r.Get("/", h.list)
	r.Get("/{id}/questions", h.getQuestions)
	r.Get("/{id}/essay-pdf", h.essayPDF)
	r.Get("/{id}/marking-scheme-pdf", h.markingSchemePDF)

	// Admin endpoints
	r.With(h.authMW.RequireRole(model.RoleAdmin)).Post("/", h.create)
	r.With(h.authMW.RequireRole(model.RoleAdmin)).Post("/{id}/essay-pdf", h.uploadEssayPDF)
	r.With(h.authMW.RequireRole(model.RoleAdmin)).Post("/{id}/marking-scheme-pdf", h.uploadMarkingSchemePDF)
	r.With(h.authMW.RequireRole(model.RoleAdmin)).Post("/{id}/questions", h.bulkUploadQuestions)
	r.With(h.authMW.RequireRole(model.RoleAdmin)).Post("/{id}/answer-key", h.uploadAnswerKey)

	return r
}

// GET /past-papers
func (h *PastPapersHandler) list(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	year, _ := strconv.Atoi(q.Get("year"))
	tree, err := h.svc.ListTree(r.Context(), service.PPListFilterFromQuery(q.Get("subject"), q.Get("grade"), year))
	if err != nil {
		h.log.Error("list past papers", zap.Error(err))
		httputil.Error(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	httputil.JSON(w, http.StatusOK, tree)
}

// GET /past-papers/{id}/questions
func (h *PastPapersHandler) getQuestions(w http.ResponseWriter, r *http.Request) {
	ppID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	resp, err := h.svc.GetQuestions(r.Context(), ppID)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, resp)
}

// GET /past-papers/{id}/essay-pdf
func (h *PastPapersHandler) essayPDF(w http.ResponseWriter, r *http.Request) {
	ppID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	filePath, filename, err := h.svc.GetEssayPDFPath(r.Context(), ppID)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	servePDF(w, r, filePath, filename)
}

// GET /past-papers/{id}/marking-scheme-pdf
func (h *PastPapersHandler) markingSchemePDF(w http.ResponseWriter, r *http.Request) {
	ppID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	filePath, filename, err := h.svc.GetMSPDFPath(r.Context(), ppID)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	servePDF(w, r, filePath, filename)
}

// POST /past-papers (admin)
func (h *PastPapersHandler) create(w http.ResponseWriter, r *http.Request) {
	var in service.CreatePPInput
	if err := httputil.Decode(r, &in); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	user := middleware.UserFromCtx(r.Context())
	id, err := h.svc.CreatePastPaper(r.Context(), user.ID, in)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusCreated, map[string]any{"id": id})
}

// POST /past-papers/{id}/essay-pdf (admin)
func (h *PastPapersHandler) uploadEssayPDF(w http.ResponseWriter, r *http.Request) {
	ppID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	path, size, err := h.savePDF(r, "file", ppID.String(), "essay")
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	if err := h.svc.SetEssayPDF(r.Context(), ppID, path, size); err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"message": "Essay PDF uploaded", "path": path})
}

// POST /past-papers/{id}/marking-scheme-pdf (admin)
func (h *PastPapersHandler) uploadMarkingSchemePDF(w http.ResponseWriter, r *http.Request) {
	ppID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	path, size, err := h.savePDF(r, "file", ppID.String(), "scheme")
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	if err := h.svc.SetMarkingSchemePDF(r.Context(), ppID, path, size); err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]string{"message": "Marking scheme PDF uploaded"})
}

// POST /past-papers/{id}/questions (admin)
func (h *PastPapersHandler) bulkUploadQuestions(w http.ResponseWriter, r *http.Request) {
	ppID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	var body struct {
		Questions []service.PPBulkQInput `json:"questions"`
	}
	if err := httputil.Decode(r, &body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := h.svc.BulkReplaceQuestions(r.Context(), ppID, body.Questions); err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]string{
		"message": fmt.Sprintf("%d questions uploaded", len(body.Questions)),
	})
}

// POST /past-papers/{id}/answer-key (admin)
func (h *PastPapersHandler) uploadAnswerKey(w http.ResponseWriter, r *http.Request) {
	ppID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	var body struct {
		Answers []service.AnswerKeyInput `json:"answers"`
	}
	if err := httputil.Decode(r, &body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := h.svc.ApplyAnswerKey(r.Context(), ppID, body.Answers); err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]string{"message": "Answer key uploaded"})
}

// ── helpers ───────────────────────────────────────────────────────────────────

// servePDF sends a file as an inline PDF response, matching Node's res.sendFile behavior.
func servePDF(w http.ResponseWriter, r *http.Request, filePath, filename string) {
	clean := filepath.Clean(filePath)
	f, err := os.Open(clean)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "File not found")
		return
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "File error")
		return
	}

	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, filename))
	w.Header().Set("Cross-Origin-Resource-Policy", "cross-origin")
	http.ServeContent(w, r, filename, stat.ModTime(), f)
}

// savePDF parses a multipart PDF upload and writes it to the uploads dir.
func (h *PastPapersHandler) savePDF(r *http.Request, fieldName, id, suffix string) (string, int64, error) {
	maxBytes := int64(h.cfg.MaxFileSizeMB) << 20
	if err := r.ParseMultipartForm(maxBytes); err != nil {
		return "", 0, httputil.E(http.StatusBadRequest, "Failed to parse multipart form")
	}

	file, header, err := r.FormFile(fieldName)
	if err != nil {
		return "", 0, httputil.E(http.StatusBadRequest, "No PDF uploaded")
	}
	defer file.Close()

	if header.Size > maxBytes {
		return "", 0, httputil.E(http.StatusRequestEntityTooLarge, "File too large")
	}
	if !isPDF(header) {
		return "", 0, httputil.E(http.StatusBadRequest, "Only PDF files are accepted")
	}

	dir := filepath.Join(h.cfg.UploadDir, "pastpapers")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", 0, fmt.Errorf("mkdir: %w", err)
	}

	filename := fmt.Sprintf("%s_%s_%d.pdf", id, suffix, time.Now().Unix())
	dst := filepath.Join(dir, filename)

	out, err := os.Create(dst)
	if err != nil {
		return "", 0, fmt.Errorf("create file: %w", err)
	}
	defer out.Close()

	written, err := copyMultipart(out, file)
	if err != nil {
		return "", 0, fmt.Errorf("write file: %w", err)
	}
	return dst, written, nil
}

func isPDF(h *multipart.FileHeader) bool {
	ct := h.Header.Get("Content-Type")
	return ct == "application/pdf" || filepath.Ext(h.Filename) == ".pdf"
}

func copyMultipart(dst *os.File, src multipart.File) (int64, error) {
	return io.Copy(dst, src)
}
