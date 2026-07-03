package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"

	"github.com/miedvance/api/internal/httputil"
	"github.com/miedvance/api/internal/middleware"
	"github.com/miedvance/api/internal/repository"
	"github.com/miedvance/api/internal/service"
)

// StudentHandler exposes student-facing read-only endpoints for streams, subjects, and stats.
type StudentHandler struct {
	adminRepo *repository.AdminRepo
	papersSvc *service.PapersService
	authMW    *middleware.Auth
	log       *zap.Logger
}

// NewStudentHandler creates a StudentHandler.
func NewStudentHandler(
	adminRepo *repository.AdminRepo,
	papersSvc *service.PapersService,
	authMW *middleware.Auth,
	log *zap.Logger,
) *StudentHandler {
	return &StudentHandler{adminRepo: adminRepo, papersSvc: papersSvc, authMW: authMW, log: log}
}

// StreamRoutes returns routes mounted at /api/v1/streams.
func (h *StudentHandler) StreamRoutes() chi.Router {
	r := chi.NewRouter()
	r.Use(h.authMW.Authenticate)
	r.Get("/", h.listStreams)
	r.Get("/{id}/subjects", h.listStreamSubjects)
	return r
}

// SubjectRoutes returns routes mounted at /api/v1/subjects.
func (h *StudentHandler) SubjectRoutes() chi.Router {
	r := chi.NewRouter()
	r.Use(h.authMW.Authenticate)
	r.Get("/", h.listSubjects)
	return r
}

// UserRoutes returns routes mounted at /api/v1/users.
func (h *StudentHandler) UserRoutes() chi.Router {
	r := chi.NewRouter()
	r.Use(h.authMW.Authenticate)
	r.Get("/me/stats", h.myStats)
	return r
}

func (h *StudentHandler) listStreams(w http.ResponseWriter, r *http.Request) {
	streams, err := h.adminRepo.ListStreams(r.Context())
	if err != nil {
		h.log.Error("list streams", zap.Error(err))
		httputil.Error(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	if streams == nil {
		streams = []repository.StreamRow{}
	}
	httputil.JSON(w, http.StatusOK, streams)
}

func (h *StudentHandler) listStreamSubjects(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "id")
	subjects, err := h.adminRepo.ListStreamSubjects(r.Context(), streamID)
	if err != nil {
		h.log.Error("list stream subjects", zap.Error(err))
		httputil.Error(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	if subjects == nil {
		subjects = []repository.SubjectRow{}
	}
	httputil.JSON(w, http.StatusOK, subjects)
}

func (h *StudentHandler) listSubjects(w http.ResponseWriter, r *http.Request) {
	subjects, err := h.adminRepo.ListSubjects(r.Context())
	if err != nil {
		h.log.Error("list subjects", zap.Error(err))
		httputil.Error(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	if subjects == nil {
		subjects = []repository.SubjectRow{}
	}
	httputil.JSON(w, http.StatusOK, subjects)
}

func (h *StudentHandler) myStats(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromCtx(r.Context())
	stats, err := h.papersSvc.GetUserStats(r.Context(), user.ID)
	if err != nil {
		h.log.Error("get user stats", zap.Error(err))
		httputil.Error(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	httputil.JSON(w, http.StatusOK, stats)
}
