package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"

	"github.com/miedvance/api/internal/httputil"
	"github.com/miedvance/api/internal/middleware"
	"github.com/miedvance/api/internal/model"
	"github.com/miedvance/api/internal/repository"
	"github.com/miedvance/api/internal/service"
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

// Routes returns a chi.Router.
func (h *AdminHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Use(h.authMW.Authenticate)

	// Admin-only routes
	r.Group(func(r chi.Router) {
		r.Use(h.authMW.RequireRole(model.RoleAdmin))
		r.Get("/stats", h.stats)
		r.Get("/papers", h.listPapers)
		r.Patch("/papers/{id}/publish", h.publishPaper)
		r.Post("/papers/{id}/trigger-rankings", h.triggerRankings)
		r.Get("/users", h.listUsers)
		r.Post("/topics", h.createTopic)
		// Permission management
		r.Get("/permissions", h.listPermissions)
		r.Get("/roles/{role}/permissions", h.getRolePermissions)
		r.Put("/roles/{role}/permissions", h.setRolePermissions)
		// Streams management
		r.Post("/streams", h.createStream)
		r.Delete("/streams/{id}", h.deleteStream)
		// Subjects management
		r.Post("/subjects", h.createSubject)
		r.Delete("/subjects/{id}", h.deleteSubject)
		// Stream-subject assignments
		r.Post("/streams/{id}/subjects", h.addSubjectToStream)
		r.Delete("/streams/{id}/subjects/{subjectId}", h.removeSubjectFromStream)
	})

	// Read-only stream/subject endpoints accessible to admin+editor
	r.Get("/streams", h.listStreams)
	r.Get("/subjects", h.listSubjects)
	r.Get("/streams/{id}/subjects", h.listStreamSubjects)

	// Paper CRUD — permission-gated
	r.With(h.authMW.RequirePermission(h.svc, "papers:create")).Post("/papers", h.createDraftPaper)
	r.With(h.authMW.RequirePermission(h.svc, "papers:edit")).Patch("/papers/{id}", h.updatePaper)
	r.With(h.authMW.RequirePermission(h.svc, "papers:delete")).Delete("/papers/{id}", h.deletePaper)

	// Paper-question builder — permission-gated
	r.With(h.authMW.RequirePermission(h.svc, "papers:edit")).Get("/papers/{id}/questions", h.listPaperQuestions)
	r.With(h.authMW.RequirePermission(h.svc, "questions:create")).Post("/papers/{id}/questions", h.attachQuestion)
	r.With(h.authMW.RequirePermission(h.svc, "papers:edit")).Patch("/papers/{id}/questions/{qid}", h.reorderQuestion)
	r.With(h.authMW.RequirePermission(h.svc, "papers:edit")).Delete("/papers/{id}/questions/{qid}", h.detachQuestion)

	// Question pool — permission-gated
	r.With(h.authMW.RequirePermission(h.svc, "questions:create")).Get("/questions", h.listPoolQuestions)
	r.With(h.authMW.RequirePermission(h.svc, "questions:create")).Post("/questions", h.createPoolQuestion)
	r.With(h.authMW.RequirePermission(h.svc, "questions:edit")).Patch("/questions/{id}", h.updatePoolQuestion)
	r.With(h.authMW.RequirePermission(h.svc, "questions:delete")).Delete("/questions/{id}", h.deletePoolQuestion)

	// User management — permission-gated
	r.With(h.authMW.RequirePermission(h.svc, "users:manage")).Patch("/users/{id}/role", h.updateUserRole)
	r.With(h.authMW.RequirePermission(h.svc, "users:manage")).Patch("/users/{id}/status", h.updateUserStatus)

	return r
}

// ── Existing handlers (unchanged) ─────────────────────────────────────────────

func (h *AdminHandler) stats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.svc.GetStats(r.Context())
	if err != nil {
		h.log.Error("get stats", zap.Error(err))
		httputil.Error(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	httputil.JSON(w, http.StatusOK, stats)
}

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

func (h *AdminHandler) listSubjects(w http.ResponseWriter, r *http.Request) {
	subjects, err := h.svc.ListSubjects(r.Context())
	if err != nil {
		h.log.Error("admin list subjects", zap.Error(err))
		httputil.Error(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	httputil.JSON(w, http.StatusOK, subjects)
}

// ── Streams ────────────────────────────────────────────────────────────────────

func (h *AdminHandler) listStreams(w http.ResponseWriter, r *http.Request) {
	streams, err := h.svc.ListStreams(r.Context())
	if err != nil {
		h.log.Error("list streams", zap.Error(err))
		httputil.Error(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	httputil.JSON(w, http.StatusOK, streams)
}

func (h *AdminHandler) createStream(w http.ResponseWriter, r *http.Request) {
	var body repository.StreamRow
	if err := httputil.Decode(r, &body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := h.svc.CreateStream(r.Context(), body); err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusCreated, body)
}

func (h *AdminHandler) deleteStream(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.svc.DeleteStream(r.Context(), id); err != nil {
		httputil.HandleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminHandler) listStreamSubjects(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	subjects, err := h.svc.ListStreamSubjects(r.Context(), id)
	if err != nil {
		h.log.Error("list stream subjects", zap.Error(err))
		httputil.Error(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	httputil.JSON(w, http.StatusOK, subjects)
}

func (h *AdminHandler) addSubjectToStream(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "id")
	var body struct {
		SubjectID string `json:"subject_id"`
	}
	if err := httputil.Decode(r, &body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := h.svc.AddSubjectToStream(r.Context(), streamID, body.SubjectID); err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusCreated, map[string]string{"stream_id": streamID, "subject_id": body.SubjectID})
}

func (h *AdminHandler) removeSubjectFromStream(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "id")
	subjectID := chi.URLParam(r, "subjectId")
	if err := h.svc.RemoveSubjectFromStream(r.Context(), streamID, subjectID); err != nil {
		httputil.HandleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── Subjects ───────────────────────────────────────────────────────────────────

func (h *AdminHandler) createSubject(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID     string `json:"id"`
		NameSi string `json:"name_si"`
	}
	if err := httputil.Decode(r, &body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := h.svc.CreateSubject(r.Context(), body.ID, body.NameSi); err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusCreated, map[string]string{"id": body.ID, "name_si": body.NameSi})
}

func (h *AdminHandler) deleteSubject(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.svc.DeleteSubject(r.Context(), id); err != nil {
		httputil.HandleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

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

// ── Paper CRUD ────────────────────────────────────────────────────────────────

// POST /admin/papers
func (h *AdminHandler) createDraftPaper(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromCtx(r.Context())
	var in service.CreateDraftPaperInput
	if err := httputil.Decode(r, &in); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	id, err := h.svc.CreateDraftPaper(r.Context(), user.ID, in)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusCreated, map[string]any{"id": id})
}

// PATCH /admin/papers/{id}
func (h *AdminHandler) updatePaper(w http.ResponseWriter, r *http.Request) {
	paperID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	var in service.UpdatePaperInput
	if err := httputil.Decode(r, &in); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	paper, err := h.svc.UpdatePaper(r.Context(), paperID, in)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, paper)
}

// DELETE /admin/papers/{id}
func (h *AdminHandler) deletePaper(w http.ResponseWriter, r *http.Request) {
	paperID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	if err := h.svc.DeletePaper(r.Context(), paperID); err != nil {
		httputil.HandleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── Paper-question builder ────────────────────────────────────────────────────

// GET /admin/papers/{id}/questions
func (h *AdminHandler) listPaperQuestions(w http.ResponseWriter, r *http.Request) {
	paperID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	qs, err := h.svc.ListPaperQuestions(r.Context(), paperID)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	if qs == nil {
		qs = []model.PaperQuestion{}
	}
	httputil.JSON(w, http.StatusOK, qs)
}

// POST /admin/papers/{id}/questions
func (h *AdminHandler) attachQuestion(w http.ResponseWriter, r *http.Request) {
	paperID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	user := middleware.UserFromCtx(r.Context())
	var in service.AttachQuestionInput
	if err := httputil.Decode(r, &in); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	pq, err := h.svc.AttachQuestion(r.Context(), paperID, user.ID, in)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusCreated, pq)
}

// PATCH /admin/papers/{id}/questions/{qid}
func (h *AdminHandler) reorderQuestion(w http.ResponseWriter, r *http.Request) {
	paperID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	qid, err := strconv.Atoi(chi.URLParam(r, "qid"))
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid question ID")
		return
	}
	var body struct {
		SortOrder int16 `json:"sort_order"`
	}
	if err := httputil.Decode(r, &body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := h.svc.ReorderQuestion(r.Context(), paperID, qid, body.SortOrder); err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"sort_order": body.SortOrder})
}

// DELETE /admin/papers/{id}/questions/{qid}
func (h *AdminHandler) detachQuestion(w http.ResponseWriter, r *http.Request) {
	paperID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	qid, err := strconv.Atoi(chi.URLParam(r, "qid"))
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid question ID")
		return
	}
	if err := h.svc.DetachQuestion(r.Context(), paperID, qid); err != nil {
		httputil.HandleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── Question pool ─────────────────────────────────────────────────────────────

// GET /admin/questions
func (h *AdminHandler) listPoolQuestions(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	limit, _ := strconv.Atoi(q.Get("limit"))
	qs, total, err := h.svc.ListPoolQuestions(r.Context(), repository.PoolFilter{
		SubjectID:    q.Get("subject_id"),
		SlugContains: q.Get("slug_contains"),
		Page:         page,
		Limit:        limit,
	})
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	if qs == nil {
		qs = []model.PoolQuestion{}
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"questions": qs, "total": total})
}

// POST /admin/questions
func (h *AdminHandler) createPoolQuestion(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromCtx(r.Context())
	var in service.PoolQuestionInput
	if err := httputil.Decode(r, &in); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	q, err := h.svc.CreatePoolQuestion(r.Context(), user.ID, in)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusCreated, q)
}

// PATCH /admin/questions/{id}
func (h *AdminHandler) updatePoolQuestion(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid question ID")
		return
	}
	var in service.PoolQuestionInput
	if err := httputil.Decode(r, &in); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	q, err := h.svc.UpdatePoolQuestion(r.Context(), id, in)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, q)
}

// DELETE /admin/questions/{id}
func (h *AdminHandler) deletePoolQuestion(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid question ID")
		return
	}
	if err := h.svc.DeletePoolQuestion(r.Context(), id); err != nil {
		httputil.HandleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── User management ───────────────────────────────────────────────────────────

// PATCH /admin/users/{id}/role
func (h *AdminHandler) updateUserRole(w http.ResponseWriter, r *http.Request) {
	userID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	var body struct {
		Role string `json:"role"`
	}
	if err := httputil.Decode(r, &body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := h.svc.UpdateUserRole(r.Context(), userID, body.Role); err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]string{"role": body.Role})
}

// PATCH /admin/users/{id}/status
func (h *AdminHandler) updateUserStatus(w http.ResponseWriter, r *http.Request) {
	userID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	var body struct {
		IsActive *bool `json:"is_active"`
	}
	if err := httputil.Decode(r, &body); err != nil || body.IsActive == nil {
		httputil.Error(w, http.StatusBadRequest, "is_active (bool) is required")
		return
	}
	if err := h.svc.UpdateUserStatus(r.Context(), userID, *body.IsActive); err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]bool{"is_active": *body.IsActive})
}

// ── Permission management ─────────────────────────────────────────────────────

// GET /admin/permissions
func (h *AdminHandler) listPermissions(w http.ResponseWriter, r *http.Request) {
	perms, err := h.svc.ListPermissions(r.Context())
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	if perms == nil {
		perms = []model.Permission{}
	}
	httputil.JSON(w, http.StatusOK, perms)
}

// GET /admin/roles/{role}/permissions
func (h *AdminHandler) getRolePermissions(w http.ResponseWriter, r *http.Request) {
	role := model.UserRole(chi.URLParam(r, "role"))
	codes, err := h.svc.GetRolePermissions(r.Context(), role)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	if codes == nil {
		codes = []string{}
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"role": role, "permissions": codes})
}

// PUT /admin/roles/{role}/permissions
func (h *AdminHandler) setRolePermissions(w http.ResponseWriter, r *http.Request) {
	role := model.UserRole(chi.URLParam(r, "role"))
	var body struct {
		Permissions []string `json:"permissions"`
	}
	if err := httputil.Decode(r, &body); err != nil {
		httputil.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := h.svc.SetRolePermissions(r.Context(), role, body.Permissions); err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"role": role, "permissions": body.Permissions})
}
