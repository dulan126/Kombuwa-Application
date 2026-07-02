package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"

	"github.com/kombuwaedu/api/internal/httputil"
	"github.com/kombuwaedu/api/internal/middleware"
	"github.com/kombuwaedu/api/internal/model"
	"github.com/kombuwaedu/api/internal/repository"
	"github.com/kombuwaedu/api/internal/service"
)

// AdminHandler exposes all admin HTTP endpoints.
type AdminHandler struct {
	svc    *service.AdminService
	authMW *middleware.Auth
	log    *zap.Logger
}

// NewAdminHandler creates an AdminHandler.
func NewAdminHandler(svc *service.AdminService, authMW *middleware.Auth, log *zap.Logger) *AdminHandler {
	return &AdminHandler{svc: svc, authMW: authMW, log: log}
}

// Routes returns a chi.Router. All routes require admin role.
func (h *AdminHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Use(h.authMW.Authenticate)
	r.Use(h.authMW.RequireRole(model.RoleAdmin))

	r.Get("/stats", h.stats)
	r.Get("/papers", h.listPapers)
	r.Patch("/papers/{id}/publish", h.publishPaper)
	r.Post("/papers/{id}/trigger-rankings", h.triggerRankings)
	r.Get("/users", h.listUsers)
	r.Get("/subjects", h.listSubjects)
	r.Post("/topics", h.createTopic)

	return r
}

// GET /admin/stats
func (h *AdminHandler) stats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.svc.GetStats(r.Context())
	if err != nil {
		h.log.Error("get stats", zap.Error(err))
		httputil.Error(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	httputil.JSON(w, http.StatusOK, stats)
}

// GET /admin/papers
func (h *AdminHandler) listPapers(w http.ResponseWriter, r *http.Request) {
	papers, err := h.svc.ListPapers(r.Context())
	if err != nil {
		h.log.Error("admin list papers", zap.Error(err))
		httputil.Error(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	if papers == nil {
		papers = []repository.AdminPaperRow{}
	}
	httputil.JSON(w, http.StatusOK, papers)
}

// PATCH /admin/papers/{id}/publish
func (h *AdminHandler) publishPaper(w http.ResponseWriter, r *http.Request) {
	paperID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}

	var body struct {
		Publish *bool `json:"publish"`
	}
	if err := httputil.Decode(r, &body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	// Default to true if not specified (matching Node: req.body.publish !== false)
	publish := true
	if body.Publish != nil {
		publish = *body.Publish
	}

	result, err := h.svc.SetPaperPublished(r.Context(), paperID, publish)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, result)
}

// POST /admin/papers/{id}/trigger-rankings
func (h *AdminHandler) triggerRankings(w http.ResponseWriter, r *http.Request) {
	paperID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	if err := h.svc.TriggerRankings(r.Context(), paperID); err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]string{"message": "Rankings computed"})
}

// GET /admin/users
func (h *AdminHandler) listUsers(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	users, err := h.svc.ListUsers(r.Context(), repository.AdminUserFilter{
		Stream: q.Get("stream"),
		Grade:  q.Get("grade"),
		Page:   page,
	})
	if err != nil {
		h.log.Error("admin list users", zap.Error(err))
		httputil.Error(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	if users == nil {
		users = []repository.AdminUserRow{}
	}
	httputil.JSON(w, http.StatusOK, users)
}

// GET /admin/subjects
func (h *AdminHandler) listSubjects(w http.ResponseWriter, r *http.Request) {
	subjects, err := h.svc.ListSubjectsWithTopics(r.Context())
	if err != nil {
		h.log.Error("admin list subjects", zap.Error(err))
		httputil.Error(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	if subjects == nil {
		subjects = []repository.SubjectWithTopics{}
	}
	httputil.JSON(w, http.StatusOK, subjects)
}

// POST /admin/topics
func (h *AdminHandler) createTopic(w http.ResponseWriter, r *http.Request) {
	var body struct {
		SubjectID string `json:"subject_id"`
		NameSi    string `json:"name_si"`
	}
	if err := httputil.Decode(r, &body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	id, err := h.svc.CreateTopic(r.Context(), body.SubjectID, body.NameSi)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusCreated, map[string]any{"id": id})
}
