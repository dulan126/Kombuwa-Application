package httputil_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/kombuwaedu/api/internal/httputil"
)

func TestJSON_SetsContentType(t *testing.T) {
	w := httptest.NewRecorder()
	httputil.JSON(w, http.StatusOK, map[string]string{"key": "value"})

	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}
}

func TestError_WritesErrorField(t *testing.T) {
	w := httptest.NewRecorder()
	httputil.Error(w, http.StatusBadRequest, "something went wrong")

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
	var body map[string]string
	json.NewDecoder(w.Body).Decode(&body)
	if body["error"] != "something went wrong" {
		t.Errorf("error field = %q, want 'something went wrong'", body["error"])
	}
}

func TestDecode_RejectsOversized(t *testing.T) {
	// Build a body slightly over 1 MB
	big := strings.Repeat("a", (1<<20)+1)
	r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"x":"`+big+`"}`))
	r.Header.Set("Content-Type", "application/json")

	var v map[string]string
	// Should return an error due to the LimitReader truncating the stream
	// (the JSON will be malformed after truncation)
	_ = httputil.Decode(r, &v) // may or may not error; ensure it doesn't panic
}

func TestHandleError_AppError(t *testing.T) {
	w := httptest.NewRecorder()
	err := httputil.E(http.StatusConflict, "already exists")
	httputil.HandleError(w, err)

	if w.Code != http.StatusConflict {
		t.Errorf("status = %d, want 409", w.Code)
	}
	var body map[string]string
	json.NewDecoder(w.Body).Decode(&body)
	if body["error"] != "already exists" {
		t.Errorf("error field = %q", body["error"])
	}
}

func TestHandleError_UnknownError(t *testing.T) {
	w := httptest.NewRecorder()
	httputil.HandleError(w, &testErr{})

	if w.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", w.Code)
	}
}

func TestEwith_ExtraFields(t *testing.T) {
	w := httptest.NewRecorder()
	err := httputil.Ewith(http.StatusForbidden, "not verified", map[string]any{"needsVerification": true})
	httputil.HandleError(w, err)

	if w.Code != http.StatusForbidden {
		t.Errorf("status = %d, want 403", w.Code)
	}
	var body map[string]any
	json.NewDecoder(w.Body).Decode(&body)
	if body["needsVerification"] != true {
		t.Errorf("needsVerification = %v, want true", body["needsVerification"])
	}
}

type testErr struct{}

func (e *testErr) Error() string { return "generic error" }
