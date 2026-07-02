package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/miedvance/api/internal/httputil"
)

// paperRouter wires minimal paper routes for unit testing request/response shapes.
func paperRouter() *chi.Mux {
	r := chi.NewRouter()

	// POST /papers/{id}/submit — validates answers is an object
	r.Post("/papers/{id}/submit", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Answers map[string]string `json:"answers"`
		}
		if err := httputil.Decode(r, &body); err != nil || body.Answers == nil {
			httputil.Error(w, http.StatusBadRequest, "answers must be a key:value object")
			return
		}
		httputil.JSON(w, http.StatusOK, map[string]any{
			"score": 8, "total": 10, "percentage": 80, "timeTakenSecs": 300, "rank": nil,
		})
	})

	// GET /papers — returns empty array when no papers
	r.Get("/papers", func(w http.ResponseWriter, r *http.Request) {
		httputil.JSON(w, http.StatusOK, []any{})
	})

	// GET /papers/{id}/rankings — returns leaderboard shape
	r.Get("/papers/{id}/rankings", func(w http.ResponseWriter, r *http.Request) {
		httputil.JSON(w, http.StatusOK, map[string]any{
			"rows": []any{}, "total": 0, "myRank": nil,
		})
	})

	return r
}

func TestSubmit_MissingAnswers(t *testing.T) {
	r := paperRouter()
	body, _ := json.Marshal(map[string]any{}) // no answers key
	req := httptest.NewRequest(http.MethodPost, "/papers/550e8400-e29b-41d4-a716-446655440000/submit",
		bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestSubmit_ValidAnswers_ReturnsScoreShape(t *testing.T) {
	r := paperRouter()
	payload := map[string]any{
		"answers": map[string]string{"0": "A", "1": "B", "2": "C"},
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/papers/550e8400-e29b-41d4-a716-446655440000/submit",
		bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	for _, field := range []string{"score", "total", "percentage", "timeTakenSecs"} {
		if _, ok := resp[field]; !ok {
			t.Fatalf("response missing field %q", field)
		}
	}
}

func TestListPapers_ReturnsArray(t *testing.T) {
	r := paperRouter()
	req := httptest.NewRequest(http.MethodGet, "/papers", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp []any
	json.NewDecoder(w.Body).Decode(&resp)
	if resp == nil {
		t.Fatal("expected array response, got nil")
	}
}

func TestLeaderboard_ReturnsShape(t *testing.T) {
	r := paperRouter()
	req := httptest.NewRequest(http.MethodGet,
		"/papers/550e8400-e29b-41d4-a716-446655440000/rankings?page=1&limit=20", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	if _, ok := resp["rows"]; !ok {
		t.Fatal("response missing 'rows' field")
	}
	if _, ok := resp["total"]; !ok {
		t.Fatal("response missing 'total' field")
	}
}
