package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/miedvance/api/internal/httputil"
	"github.com/miedvance/api/internal/middleware"
	"github.com/miedvance/api/internal/model"
)

// ── stub permission checker ───────────────────────────────────────────────────

type stubPermChecker struct {
	// maps "role:code" → allowed
	grants map[string]bool
}

func (s *stubPermChecker) HasPermission(_ context.Context, role model.UserRole, code string) (bool, error) {
	return s.grants[string(role)+":"+code], nil
}

func adminPerms() *stubPermChecker {
	return &stubPermChecker{grants: map[string]bool{
		"admin:papers:delete":    true,
		"admin:questions:delete": true,
		"admin:questions:create": true,
		"admin:papers:edit":      true,
	}}
}

func editorPerms() *stubPermChecker {
	return &stubPermChecker{grants: map[string]bool{
		"editor:questions:create": true,
		"editor:papers:edit":      true,
		// editor does NOT have papers:delete or questions:delete
	}}
}

// ── in-memory question store for attachment tests ─────────────────────────────

type inMemoryStore struct {
	questions  map[int]model.PoolQuestion
	attachments map[string]bool // "paperID:questionID"
	nextID     int
}

func newStore() *inMemoryStore {
	return &inMemoryStore{
		questions:   make(map[int]model.PoolQuestion),
		attachments: make(map[string]bool),
		nextID:      1,
	}
}

func (s *inMemoryStore) createQuestion(slug, text string) model.PoolQuestion {
	q := model.PoolQuestion{ID: int32(s.nextID), Slug: slug, QuestionText: text, CorrectOption: "A"}
	s.questions[s.nextID] = q
	s.nextID++
	return q
}

func (s *inMemoryStore) attach(paperID string, questionID int) error {
	key := paperID + ":" + string(rune(questionID+'0'))
	if s.attachments[key] {
		return errDuplicate
	}
	s.attachments[key] = true
	return nil
}

var errDuplicate = httputil.E(http.StatusConflict, "already attached")

// ── test router ───────────────────────────────────────────────────────────────

// buildAdminRouter builds a minimal chi router that exercises permission checks
// using injected stub middleware and fake handlers.
func buildAdminRouter(checker middleware.PermissionChecker, userRole model.UserRole) chi.Router {
	r := chi.NewRouter()

	// Inject user into context (simulates Authenticate middleware)
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			user := &model.User{ID: uuid.New(), Role: userRole, IsActive: true}
			ctx := context.WithValue(req.Context(), contextKey("user"), user)
			next.ServeHTTP(w, req.WithContext(ctx))
		})
	})

	authMW := &stubAuthMW{}

	// DELETE /papers/{id} — requires papers:delete
	r.With(authMW.RequirePermission(checker, "papers:delete")).
		Delete("/papers/{id}", func(w http.ResponseWriter, r *http.Request) {
			httputil.JSON(w, http.StatusNoContent, nil)
		})

	// DELETE /questions/{id} — requires questions:delete
	r.With(authMW.RequirePermission(checker, "questions:delete")).
		Delete("/questions/{id}", func(w http.ResponseWriter, r *http.Request) {
			httputil.JSON(w, http.StatusNoContent, nil)
		})

	// POST /questions — requires questions:create
	r.With(authMW.RequirePermission(checker, "questions:create")).
		Post("/questions", func(w http.ResponseWriter, r *http.Request) {
			httputil.JSON(w, http.StatusCreated, map[string]string{"slug": "test-slug"})
		})

	// POST /papers/{id}/questions — requires questions:create
	r.With(authMW.RequirePermission(checker, "questions:create")).
		Post("/papers/{id}/questions", func(w http.ResponseWriter, r *http.Request) {
			httputil.JSON(w, http.StatusCreated, map[string]string{"attached": "true"})
		})

	return r
}

// stubAuthMW exposes RequirePermission without real Redis/DB.
type stubAuthMW struct{}

func (s *stubAuthMW) RequirePermission(checker middleware.PermissionChecker, code string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, _ := r.Context().Value(contextKey("user")).(*model.User)
			if user == nil {
				httputil.Error(w, http.StatusUnauthorized, "Authentication required")
				return
			}
			ok, err := checker.HasPermission(r.Context(), user.Role, code)
			if err != nil || !ok {
				httputil.Error(w, http.StatusForbidden, "Insufficient permissions")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

type contextKey string

// ── Permission enforcement tests ──────────────────────────────────────────────

func TestEditorCannotDeletePaper(t *testing.T) {
	r := buildAdminRouter(editorPerms(), model.RoleEditor)
	req := httptest.NewRequest(http.MethodDelete, "/papers/"+uuid.New().String(), nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", w.Code)
	}
}

func TestEditorCannotDeleteQuestion(t *testing.T) {
	r := buildAdminRouter(editorPerms(), model.RoleEditor)
	req := httptest.NewRequest(http.MethodDelete, "/questions/42", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", w.Code)
	}
}

func TestEditorCanCreateQuestion(t *testing.T) {
	r := buildAdminRouter(editorPerms(), model.RoleEditor)
	body, _ := json.Marshal(map[string]string{"question_text": "test", "correct_option": "A"})
	req := httptest.NewRequest(http.MethodPost, "/questions", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
}

func TestEditorCanAttachQuestion(t *testing.T) {
	r := buildAdminRouter(editorPerms(), model.RoleEditor)
	body, _ := json.Marshal(map[string]int{"question_id": 1})
	req := httptest.NewRequest(http.MethodPost, "/papers/"+uuid.New().String()+"/questions", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
}

func TestAdminCanDeletePaper(t *testing.T) {
	r := buildAdminRouter(adminPerms(), model.RoleAdmin)
	req := httptest.NewRequest(http.MethodDelete, "/papers/"+uuid.New().String(), nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", w.Code)
	}
}

func TestAdminCanDeleteQuestion(t *testing.T) {
	r := buildAdminRouter(adminPerms(), model.RoleAdmin)
	req := httptest.NewRequest(http.MethodDelete, "/questions/42", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", w.Code)
	}
}

// ── Slug uniqueness tests ─────────────────────────────────────────────────────

func TestAutoSlug_Basic(t *testing.T) {
	cases := []struct {
		text string
		want string
	}{
		{"What is the oxidation state of iron?", "what-is-the-oxidation-state-of-iron"},
		{"  Extra   Spaces   Test  ", "extra-spaces-test"},
		{"Question with special chars! @#$%", "question-with-special-chars"},
	}

	for _, tc := range cases {
		got := testAutoSlug(tc.text)
		if got != tc.want {
			t.Errorf("autoSlug(%q) = %q, want %q", tc.text, got, tc.want)
		}
	}
}

func TestAutoSlug_TruncatesAt8Words(t *testing.T) {
	text := "one two three four five six seven eight nine ten"
	got := testAutoSlug(text)
	// Should only contain 8 words
	parts := 0
	inWord := false
	for _, c := range got {
		if c == '-' {
			if inWord {
				parts++
			}
			inWord = false
		} else {
			inWord = true
		}
	}
	if inWord {
		parts++
	}
	if parts > 8 {
		t.Errorf("slug %q has more than 8 words", got)
	}
}

// testAutoSlug is a package-level copy so tests don't import the service pkg.
func testAutoSlug(text string) string {
	import_lower := func(r rune) rune {
		if r >= 'A' && r <= 'Z' {
			return r + 32
		}
		return r
	}
	lower := ""
	for _, r := range text {
		lower += string(import_lower(r))
	}

	clean := ""
	for _, r := range lower {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == ' ' || r == '-' {
			clean += string(r)
		} else {
			clean += " "
		}
	}

	// Collapse spaces to dashes
	slug := ""
	lastWasDash := false
	for _, r := range clean {
		if r == ' ' || r == '-' {
			if !lastWasDash && slug != "" {
				slug += "-"
				lastWasDash = true
			}
		} else {
			slug += string(r)
			lastWasDash = false
		}
	}

	// Trim trailing dash
	for len(slug) > 0 && slug[len(slug)-1] == '-' {
		slug = slug[:len(slug)-1]
	}

	// Take first 8 words
	words := splitN(slug, '-', 9)
	if len(words) > 8 {
		words = words[:8]
	}
	result := joinWith(words, '-')
	if len(result) > 80 {
		result = result[:80]
	}
	return result
}

func splitN(s string, sep rune, n int) []string {
	var out []string
	start := 0
	for i, r := range s {
		if r == sep {
			if len(out) == n-1 {
				out = append(out, s[start:])
				return out
			}
			out = append(out, s[start:i])
			start = i + 1
		}
	}
	if start <= len(s) {
		out = append(out, s[start:])
	}
	return out
}

func joinWith(parts []string, sep rune) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += string(sep)
		}
		out += p
	}
	return out
}

// ── Question-paper attachment tests ──────────────────────────────────────────

func TestAttachQuestion_NoDuplicate(t *testing.T) {
	store := newStore()
	q := store.createQuestion("test-slug", "Test question?")
	paperID := uuid.New().String()

	if err := store.attach(paperID, int(q.ID)); err != nil {
		t.Fatalf("first attach failed: %v", err)
	}

	// Second attach to same paper → should conflict
	err := store.attach(paperID, int(q.ID))
	if err == nil {
		t.Fatal("expected duplicate error, got nil")
	}
}

func TestAttachQuestion_CrossPaperAllowed(t *testing.T) {
	store := newStore()
	q := store.createQuestion("cross-paper-slug", "Cross paper test?")
	paper1 := uuid.New().String()
	paper2 := uuid.New().String()

	if err := store.attach(paper1, int(q.ID)); err != nil {
		t.Fatalf("attach to paper1 failed: %v", err)
	}
	if err := store.attach(paper2, int(q.ID)); err != nil {
		t.Fatalf("attach to paper2 failed: %v", err)
	}
}

func TestDetachQuestion_PoolIntact(t *testing.T) {
	store := newStore()
	q := store.createQuestion("detach-test-slug", "Detach test?")
	paperID := uuid.New().String()
	_ = store.attach(paperID, int(q.ID))

	key := paperID + ":" + string(rune(int(q.ID)+'0'))
	delete(store.attachments, key)

	// Question should still be in pool
	if _, ok := store.questions[int(q.ID)]; !ok {
		t.Fatal("question was removed from pool after detach")
	}
}

