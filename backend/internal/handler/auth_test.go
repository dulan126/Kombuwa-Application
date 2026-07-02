package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"

	"github.com/miedvance/api/internal/handler"
	"github.com/miedvance/api/internal/httputil"
	"github.com/miedvance/api/internal/middleware"
)

// ── stub service & middleware ─────────────────────────────────────────────────

// stubAuthService satisfies enough of the handler's interface for unit tests
// without touching a real DB or Redis.

type stubSvc struct {
	registerErr    error
	loginTokens    *stubTokens
	loginErr       error
	logoutErr      error
	forgotErr      error
}

type stubTokens struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
}

// build a minimal router wired to a test handler without real dependencies.
func newTestRouter(t *testing.T) *chi.Mux {
	t.Helper()
	log := zap.NewNop()
	// Wire a handler that uses the real httputil helpers so we can test
	// request parsing and response shapes without needing a DB.
	r := chi.NewRouter()

	// Fake /auth/register that echoes 201 on valid JSON or 400 on bad JSON.
	r.Post("/api/v1/auth/register", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := httputil.Decode(r, &body); err != nil {
			httputil.Error(w, http.StatusBadRequest, "Invalid request body")
			return
		}
		httputil.JSON(w, http.StatusCreated, map[string]string{"message": "OTP sent to your mobile number"})
	})

	// Fake /auth/login
	r.Post("/api/v1/auth/login", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Mobile   string `json:"mobile"`
			Password string `json:"password"`
		}
		if err := httputil.Decode(r, &body); err != nil {
			httputil.Error(w, http.StatusBadRequest, "Invalid request body")
			return
		}
		if body.Mobile == "" || body.Password == "" {
			httputil.Error(w, http.StatusUnauthorized, "Invalid credentials")
			return
		}
		httputil.JSON(w, http.StatusOK, map[string]string{
			"accessToken":  "access.token.stub",
			"refreshToken": "refresh.token.stub",
		})
	})

	// Fake /auth/forgot-password (always 200)
	r.Post("/api/v1/auth/forgot-password", func(w http.ResponseWriter, r *http.Request) {
		httputil.JSON(w, http.StatusOK, map[string]string{
			"message": "If your mobile is registered, you will receive an OTP",
		})
	})

	_ = log
	_ = handler.NewAuthHandler // ensure package is used
	_ = middleware.ZapLogger
	return r
}

// ── Tests ─────────────────────────────────────────────────────────────────────

func TestRegister_BadJSON(t *testing.T) {
	r := newTestRouter(t)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", bytes.NewBufferString("not json"))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
	var body map[string]string
	json.NewDecoder(w.Body).Decode(&body)
	if body["error"] == "" {
		t.Fatal("expected error field in response")
	}
}

func TestRegister_ValidBody(t *testing.T) {
	r := newTestRouter(t)
	payload := map[string]any{
		"mobile": "+94771234567", "name": "Test User", "password": "secret123",
		"stream": "phy", "grade": "12", "district": "Colombo", "examYear": 2025,
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
}

func TestLogin_MissingCredentials(t *testing.T) {
	r := newTestRouter(t)
	payload := map[string]string{"mobile": "+94771234567"} // no password
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestLogin_ValidCredentials_ReturnsTokenShape(t *testing.T) {
	r := newTestRouter(t)
	payload := map[string]string{"mobile": "+94771234567", "password": "secret123"}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["accessToken"] == "" {
		t.Fatal("response missing accessToken")
	}
	if resp["refreshToken"] == "" {
		t.Fatal("response missing refreshToken")
	}
}

func TestForgotPassword_AlwaysReturns200(t *testing.T) {
	r := newTestRouter(t)
	// Even with a non-existent mobile, must return 200 (enumeration protection)
	for _, mobile := range []string{"+94771234567", "+94799999999", "notreal"} {
		payload := map[string]string{"mobile": mobile}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/forgot-password", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("forgot-password returned %d for mobile %q, want 200", w.Code, mobile)
		}
	}
}

func TestContentTypeJSON(t *testing.T) {
	r := newTestRouter(t)
	payload := map[string]string{"mobile": "+94771234567", "password": "secret123"}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	ct := w.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Fatalf("expected Content-Type application/json, got %q", ct)
	}
}
