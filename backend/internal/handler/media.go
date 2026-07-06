package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/miedvance/api/internal/httputil"
	"github.com/miedvance/api/internal/middleware"
	"github.com/miedvance/api/internal/service"
)

// maxImageUploadForm caps the multipart parse buffer for image uploads.
const maxImageUploadForm = 8 << 20

// serveOpened streams an opened image blob with a private long-cache header.
// The bytes are gated content, so the cache is private (per-user), not shared.
func serveOpened(w http.ResponseWriter, r *http.Request, o *service.Opened) {
	defer o.Body.Close()
	w.Header().Set("Content-Type", o.MIME)
	w.Header().Set("Cache-Control", "private, max-age=86400, immutable")
	w.Header().Set("ETag", `"`+etagFromKey(o.Key)+`"`)
	http.ServeContent(w, r, o.Key, o.ModTime, o.Body)
}

func etagFromKey(key string) string {
	// The storage key already contains a uuid — stable and unique per image.
	return key
}

// ── Admin media (permission-gated by route middleware) ────────────────────────

// POST /admin/questions/{id}/media/{slot}
func (h *AdminHandler) uploadQuestionMedia(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid question ID")
		return
	}
	slot := chi.URLParam(r, "slot")

	if err := r.ParseMultipartForm(maxImageUploadForm); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid upload")
		return
	}
	file, header, err := r.FormFile("image")
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "image file is required")
		return
	}
	defer file.Close()

	images, err := h.svc.Media().Upload(r.Context(), id, slot, file, header.Size)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"images": images})
}

// DELETE /admin/questions/{id}/media/{slot}
func (h *AdminHandler) deleteQuestionMedia(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid question ID")
		return
	}
	slot := chi.URLParam(r, "slot")

	images, err := h.svc.Media().Remove(r.Context(), id, slot)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"images": images})
}

// GET /admin/questions/{id}/media/{slot}
func (h *AdminHandler) serveQuestionMedia(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid question ID")
		return
	}
	slot := chi.URLParam(r, "slot")

	o, err := h.svc.Media().ServeAdmin(r.Context(), id, slot)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	serveOpened(w, r, o)
}

// ── Admin past-paper PDFs ─────────────────────────────────────────────────────

// POST /admin/papers/{id}/pdf/{slot}
func (h *AdminHandler) uploadPaperPDF(w http.ResponseWriter, r *http.Request) {
	paperID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	slot := chi.URLParam(r, "slot")
	if err := r.ParseMultipartForm(maxImageUploadForm); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid upload")
		return
	}
	file, header, err := r.FormFile("pdf")
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "pdf file is required")
		return
	}
	defer file.Close()

	pdfs, err := h.svc.Media().UploadPaperPDF(r.Context(), paperID, slot, file, header.Size)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"pdfs": pdfs})
}

// DELETE /admin/papers/{id}/pdf/{slot}
func (h *AdminHandler) deletePaperPDF(w http.ResponseWriter, r *http.Request) {
	paperID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	slot := chi.URLParam(r, "slot")
	pdfs, err := h.svc.Media().RemovePaperPDF(r.Context(), paperID, slot)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"pdfs": pdfs})
}

// ── Student media (exam-gated) ────────────────────────────────────────────────

// GET /papers/{id}/pdf/{slot} — reference PDF for a published past paper.
func (h *PapersHandler) servePaperPDF(w http.ResponseWriter, r *http.Request) {
	paperID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	slot := chi.URLParam(r, "slot")
	user := middleware.UserFromCtx(r.Context())
	o, err := h.svc.ServePaperPDF(r.Context(), user.Role, paperID, slot)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	serveOpened(w, r, o)
}

// GET /papers/{id}/questions/{qid}/media/{slot}
func (h *PapersHandler) serveQuestionMedia(w http.ResponseWriter, r *http.Request) {
	paperID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	qid, err := strconv.Atoi(chi.URLParam(r, "qid"))
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid question ID")
		return
	}
	slot := chi.URLParam(r, "slot")

	user := middleware.UserFromCtx(r.Context())
	o, err := h.svc.ServeQuestionMedia(r.Context(), user.ID, user.Role, paperID, qid, slot)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	serveOpened(w, r, o)
}
