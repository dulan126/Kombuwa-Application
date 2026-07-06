package service

import (
	"bytes"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/miedvance/api/internal/storage"
)

// ── Gated URL contract (frontend depends on these exact shapes) ───────────────

func TestStudentMediaURL(t *testing.T) {
	paperID := uuid.MustParse("99c9eaa8-6f21-4752-a3d4-5fbe1e83689f")
	got := studentMediaURL(paperID, 42, "a")
	want := "/api/papers/99c9eaa8-6f21-4752-a3d4-5fbe1e83689f/questions/42/media/a"
	if got != want {
		t.Fatalf("student URL: got %q want %q", got, want)
	}
	// Must be browser-facing (/api, not /api/v1 — the BFF rewrite adds /v1).
	if strings.HasPrefix(got, "/api/v1") {
		t.Fatalf("student URL must not include /v1 (double-rewrite): %q", got)
	}
}

func TestAdminMediaURL(t *testing.T) {
	got := adminMediaURL(7, "question")
	want := "/api/admin/questions/7/media/question"
	if got != want {
		t.Fatalf("admin URL: got %q want %q", got, want)
	}
}

func TestValidMediaSlots(t *testing.T) {
	for _, ok := range []string{"question", "a", "b", "c", "d", "e"} {
		if !validMediaSlots[ok] {
			t.Fatalf("slot %q should be valid", ok)
		}
	}
	for _, bad := range []string{"", "f", "A", "stem", "question ", "a/b"} {
		if validMediaSlots[bad] {
			t.Fatalf("slot %q should be invalid", bad)
		}
	}
}

// ── validateImage additional edges ────────────────────────────────────────────

func TestValidateImage_RejectsGifAndEmpty(t *testing.T) {
	gif := []byte("GIF89a\x01\x00\x01\x00")
	if _, _, err := validateImage(gif, 100, 5<<20); err == nil {
		t.Fatal("GIF should be rejected (not in the allow-list)")
	}
	if _, _, err := validateImage(nil, 0, 5<<20); err == nil {
		t.Fatal("empty input should be rejected")
	}
}

func TestValidateImage_ExtMatchesSniffedType(t *testing.T) {
	ext, mime, err := validateImage([]byte{0xFF, 0xD8, 0xFF, 0xE0}, 10, 5<<20)
	if err != nil {
		t.Fatalf("jpeg: %v", err)
	}
	if ext != ".jpg" || mime != "image/jpeg" {
		t.Fatalf("jpeg: got ext=%q mime=%q", ext, mime)
	}
}

// ── DiskStorage additional edges ──────────────────────────────────────────────

func TestDiskStorage_OpenMissingErrors(t *testing.T) {
	store, err := storage.NewDiskStorage(t.TempDir())
	if err != nil {
		t.Fatalf("new: %v", err)
	}
	if _, _, err := store.Open("question-media/does-not-exist.png"); err == nil {
		t.Fatal("opening a missing key should error")
	}
}

func TestDiskStorage_CreatesNestedDirs(t *testing.T) {
	store, err := storage.NewDiskStorage(t.TempDir())
	if err != nil {
		t.Fatalf("new: %v", err)
	}
	key := "question-media/deep/nested/x.webp"
	if err := store.Save(key, bytes.NewReader([]byte("data"))); err != nil {
		t.Fatalf("save nested: %v", err)
	}
	body, _, err := store.Open(key)
	if err != nil {
		t.Fatalf("open nested: %v", err)
	}
	body.Close()
}

func TestDiskStorage_RejectsAbsoluteAndBackslashEscape(t *testing.T) {
	store, err := storage.NewDiskStorage(t.TempDir())
	if err != nil {
		t.Fatalf("new: %v", err)
	}
	for _, bad := range []string{"/etc/passwd", "..\\..\\windows", "a\\..\\..\\b"} {
		if err := store.Save(bad, bytes.NewReader([]byte("x"))); err == nil {
			t.Fatalf("key %q should be rejected", bad)
		}
	}
}
