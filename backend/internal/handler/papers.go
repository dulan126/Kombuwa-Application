package handler

import (
	"net/http"
	"net/url"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/miedvance/api/internal/httputil"
	"github.com/miedvance/api/internal/middleware"
	"github.com/miedvance/api/internal/model"
	"github.com/miedvance/api/internal/repository"
	"github.com/miedvance/api/internal/service"
)

// PapersHandler exposes all paper HTTP endpoints.
type PapersHandler struct {
	svc    *service.PapersService
	authMW *middleware.Auth
	log    *zap.Logger
}

// NewPapersHandler creates a PapersHandler.
func NewPapersHandler(svc *service.PapersService, authMW *middleware.Auth, log *zap.Logger) *PapersHandler {
	return &PapersHandler{svc: svc, authMW: authMW, log: log}
}

// Routes returns a chi.Router with all paper sub-routes.
func (h *PapersHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Use(h.authMW.Authenticate)

	r.Get("/", h.listPapers)
	r.Get("/{id}/overview", h.examOverview)
	r.Post("/{id}/start", h.startExam)
	r.Post("/{id}/submit", h.submit)
	r.Get("/{id}/marking-scheme", h.markingScheme)
	r.Get("/{id}/rankings", h.rankings)

	// Admin-only
	r.With(h.authMW.RequireRole(model.RoleAdmin)).Post("/", h.createPaper)
	r.With(h.authMW.RequireRole(model.RoleAdmin)).Patch("/{id}/marking-scheme", h.enableMarkingScheme)

	return r
}

// GET /papers
func (h *PapersHandler) listPapers(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromCtx(r.Context())
	q := r.URL.Query()
	cards, err := h.svc.ListPapers(r.Context(), user.ID, repository.PaperListFilter{
		Type:      q.Get("type"),
		SubjectID: q.Get("subject"),
		Grade:     q.Get("grade"),
	})
	if err != nil {
		h.log.Error("list papers", zap.Error(err))
		httputil.Error(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	if cards == nil {
		cards = []repository.PaperCard{}
	}
	httputil.JSON(w, http.StatusOK, cards)
}

// GET /papers/{id}/overview — pre-start lobby data. Never returns questions or answers.
func (h *PapersHandler) examOverview(w http.ResponseWriter, r *http.Request) {
	paperID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	user := middleware.UserFromCtx(r.Context())
	resp, err := h.svc.GetExamOverview(r.Context(), paperID, user.ID)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, resp)
}

// POST /papers/{id}/start — server-validated start; consumes the single attempt
// and returns questions (without answers). Idempotent for an in-progress attempt.
func (h *PapersHandler) startExam(w http.ResponseWriter, r *http.Request) {
	paperID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	user := middleware.UserFromCtx(r.Context())
	resp, err := h.svc.StartExam(r.Context(), paperID, user.ID)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, resp)
}

// POST /papers/{id}/submit
func (h *PapersHandler) submit(w http.ResponseWriter, r *http.Request) {
	paperID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	var in service.SubmitInput
	if err := httputil.Decode(r, &in); err != nil || in.Answers == nil {
		httputil.Error(w, http.StatusBadRequest, "answers must be a key:value object")
		return
	}
	user := middleware.UserFromCtx(r.Context())
	result, err := h.svc.Submit(r.Context(), paperID, user.ID, in)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, result)
}

// GET /papers/{id}/marking-scheme
func (h *PapersHandler) markingScheme(w http.ResponseWriter, r *http.Request) {
	paperID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	user := middleware.UserFromCtx(r.Context())
	result, err := h.svc.GetMarkingScheme(r.Context(), paperID, user.ID)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, result)
}

// GET /papers/{id}/rankings
func (h *PapersHandler) rankings(w http.ResponseWriter, r *http.Request) {
	paperID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	q := r.URL.Query()
	page := queryInt(q.Get("page"), 1)
	limit := queryInt(q.Get("limit"), 50)
	if limit > 100 {
		limit = 100
	}

	user := middleware.UserFromCtx(r.Context())
	result, err := h.svc.GetLeaderboard(r.Context(), paperID, user.ID, q.Get("district"), page, limit)
	if err != nil {
		h.log.Error("get leaderboard", zap.Error(err))
		httputil.Error(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	httputil.JSON(w, http.StatusOK, result)
}

// POST /papers (admin)
func (h *PapersHandler) createPaper(w http.ResponseWriter, r *http.Request) {
	var in service.CreatePaperInput
	if err := httputil.Decode(r, &in); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	user := middleware.UserFromCtx(r.Context())
	id, err := h.svc.CreatePaper(r.Context(), user.ID, in)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusCreated, map[string]any{"id": id, "message": "Paper created"})
}

// PATCH /papers/{id}/marking-scheme (admin)
func (h *PapersHandler) enableMarkingScheme(w http.ResponseWriter, r *http.Request) {
	paperID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	if err := h.svc.EnableMarkingScheme(r.Context(), paperID); err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]string{"message": "Marking scheme now available"})
}

// ── helpers ───────────────────────────────────────────────────────────────────

func parseUUID(w http.ResponseWriter, s string) (uuid.UUID, bool) {
	id, err := uuid.Parse(s)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid ID format")
		return uuid.UUID{}, false
	}
	return id, true
}

func queryInt(s string, fallback int) int {
	if n, err := strconv.Atoi(s); err == nil && n > 0 {
		return n
	}
	return fallback
}

// parsePagination reads page and limit from query params, applying defaults and an upper cap.
func parsePagination(q url.Values, defaultLimit, maxLimit int) (page, limit int) {
	page = queryInt(q.Get("page"), 1)
	limit = queryInt(q.Get("limit"), defaultLimit)
	if limit > maxLimit {
		limit = maxLimit
	}
	return
}
