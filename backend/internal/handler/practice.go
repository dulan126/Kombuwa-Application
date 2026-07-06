package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"

	"github.com/miedvance/api/internal/httputil"
	"github.com/miedvance/api/internal/middleware"
	"github.com/miedvance/api/internal/service"
)

// GET /papers/{id}/practice/overview
func (h *PapersHandler) practiceOverview(w http.ResponseWriter, r *http.Request) {
	paperID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	user := middleware.UserFromCtx(r.Context())
	resp, err := h.svc.PracticeOverview(r.Context(), paperID, user.ID)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, resp)
}

// POST /papers/{id}/practice/start
func (h *PapersHandler) practiceStart(w http.ResponseWriter, r *http.Request) {
	paperID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	user := middleware.UserFromCtx(r.Context())
	resp, err := h.svc.StartPractice(r.Context(), paperID, user.ID)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, resp)
}

// POST /papers/{id}/practice/{attemptId}/submit
func (h *PapersHandler) practiceSubmit(w http.ResponseWriter, r *http.Request) {
	paperID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	attemptID, ok := parseUUID(w, chi.URLParam(r, "attemptId"))
	if !ok {
		return
	}
	var in service.SubmitInput
	if err := httputil.Decode(r, &in); err != nil || in.Answers == nil {
		httputil.Error(w, http.StatusBadRequest, "answers must be a key:value object")
		return
	}
	user := middleware.UserFromCtx(r.Context())
	result, err := h.svc.SubmitPractice(r.Context(), paperID, attemptID, user.ID, in)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, result)
}

// GET /papers/{id}/practice/attempts?page&limit
func (h *PapersHandler) practiceHistory(w http.ResponseWriter, r *http.Request) {
	paperID, ok := parseUUID(w, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	page, limit := parsePagination(r.URL.Query(), 20, 100)
	user := middleware.UserFromCtx(r.Context())
	resp, err := h.svc.PracticeHistory(r.Context(), paperID, user.ID, page, limit)
	if err != nil {
		httputil.HandleError(w, err)
		return
	}
	httputil.JSON(w, http.StatusOK, resp)
}

// GET /practice-papers?subject= — student list of published past papers in a subject.
func (h *PapersHandler) listPracticePapers(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromCtx(r.Context())
	q := r.URL.Query()
	cards, err := h.svc.ListPracticePapers(r.Context(), user.ID, q.Get("subject"), q.Get("grade"))
	if err != nil {
		h.log.Error("list practice papers", zap.Error(err))
		httputil.Error(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	httputil.JSON(w, http.StatusOK, cards)
}
