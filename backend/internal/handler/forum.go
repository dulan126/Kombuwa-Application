package handler

import (
	"fmt"
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
	"github.com/miedvance/api/internal/repository"
	"github.com/miedvance/api/internal/service"
)

const (
	maxForumImages    = 3
	maxImageSizeBytes = 5 << 20 // 5 MB
)

// ForumHandler exposes all forum HTTP endpoints.
type ForumHandler struct {
	svc    *service.ForumService
	authMW *middleware.Auth
	cfg    *config.Config
	log    *zap.Logger
}

// NewForumHandler creates a ForumHandler.
func NewForumHandler(svc *service.ForumService, authMW *middleware.Auth, cfg *config.Config, log *zap.Logger) *ForumHandler {
	return &ForumHandler{svc: svc, authMW: authMW, cfg: cfg, log: log}
}

// Routes returns a chi.Router with all forum sub-routes.
func (h *ForumHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Use(h.authMW.Authenticate)

	r.Get("/threads", h.listThreads)
	r.Post("/threads", h.createThread)
	r.Get("/threads/{id}", h.getThread)
	r.Post("/threads/{id}/replies", h.addReply)
	r.With(h.authMW.RequireRole(model.RoleTeacher, model.RoleAdmin)).
		Patch("/replies/{id}/verify", h.verifyReply)

	return r
}

// GET /forum/threads
func (h *ForumHandler) listThreads(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	limit, _ := strconv.Atoi(q.Get("limit"))

	result, err := h.svc.ListThreads(r.Context(), repository.ThreadListFilter{
		Subject: q.Get("subject"),
		Status:  q.Get("status"),
		Page:    page,
		Limit:   limit,
	})
	if err != nil {
		h.log.Error("list threads", zap.Error(err))
		httputil.Error(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	httputil.JSON(w, http.StatusOK, result)
}

// GET /forum/threads/{id}
func (h *ForumHandler) getThread(w http.ResponseWriter, r *http.Request) {
	threadID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	result, err := h.svc.GetThread(r.Context(), threadID)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, result)
}

// POST /forum/threads (multipart: up to 3 images)
func (h *ForumHandler) createThread(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(int64(maxForumImages) * maxImageSizeBytes); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Failed to parse form")
		return
	}

	subjectID := r.FormValue("subject_id")
	title := r.FormValue("title")
	body := r.FormValue("body")

	if subjectID == "" || len(title) < 10 || len(body) < 20 {
		httputil.Error(w, http.StatusBadRequest, "subject_id, title (min 10) and body (min 20) are required")
		return
	}

	imageURLs, err := h.saveForumImages(r)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}

	user := middleware.UserFromCtx(r.Context())
	result, err := h.svc.CreateThread(r.Context(), user.ID, service.CreateThreadInput{
		SubjectID: subjectID,
		Title:     title,
		Body:      body,
		ImageURLs: imageURLs,
	})
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusCreated, result)
}

// POST /forum/threads/{id}/replies
func (h *ForumHandler) addReply(w http.ResponseWriter, r *http.Request) {
	threadID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	var body struct {
		Body string `json:"body"`
	}
	if err := httputil.Decode(r, &body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	user := middleware.UserFromCtx(r.Context())
	result, err := h.svc.AddReply(r.Context(), threadID, user.ID, body.Body)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusCreated, result)
}

// PATCH /forum/replies/{id}/verify
func (h *ForumHandler) verifyReply(w http.ResponseWriter, r *http.Request) {
	replyID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	user := middleware.UserFromCtx(r.Context())
	if err := h.svc.VerifyReply(r.Context(), replyID, user.ID); err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]string{"message": "Reply verified, thread resolved"})
}

// ── image upload helper ────────────────────────────────────────────────────────

var allowedImageMIMEs = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/webp": true,
}

// saveForumImages reads up to 3 "images" form files, validates them, saves to disk,
// and returns their public URL paths (matching Node: /uploads/forum-images/{filename}).
func (h *ForumHandler) saveForumImages(r *http.Request) ([]string, error) {
	files := r.MultipartForm.File["images"]
	if len(files) > maxForumImages {
		return nil, httputil.E(http.StatusBadRequest, "Maximum 3 images allowed")
	}

	dir := filepath.Join(h.cfg.UploadDir, "forum-images")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("mkdir forum-images: %w", err)
	}

	var urls []string
	for _, fh := range files {
		if fh.Size > maxImageSizeBytes {
			return nil, httputil.E(http.StatusRequestEntityTooLarge, "Each image must be under 5 MB")
		}
		ct := fh.Header.Get("Content-Type")
		if !allowedImageMIMEs[ct] {
			return nil, httputil.E(http.StatusBadRequest, "Only JPEG, PNG, and WebP images are accepted")
		}

		f, err := fh.Open()
		if err != nil {
			return nil, fmt.Errorf("open image: %w", err)
		}
		defer f.Close()

		ext := filepath.Ext(fh.Filename)
		if ext == "" {
			ext = ".jpg"
		}
		fname := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
		dst := filepath.Join(dir, fname)
		out, err := os.Create(dst)
		if err != nil {
			return nil, fmt.Errorf("create image file: %w", err)
		}
		if _, err := copyMultipart(out, f); err != nil {
			out.Close()
			return nil, fmt.Errorf("write image: %w", err)
		}
		out.Close()

		urls = append(urls, "/uploads/forum-images/"+fname)
	}
	return urls, nil
}
