package service

import (
	"bytes"
	"strings"
	"testing"

	"github.com/miedvance/api/internal/storage"
)

// Minimal valid image headers for content sniffing.
var (
	pngHeader  = []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}
	jpegHeader = []byte{0xFF, 0xD8, 0xFF, 0xE0}
	webpHeader = []byte("RIFF\x00\x00\x00\x00WEBPVP8 ")
)

// ── validateImage ─────────────────────────────────────────────────────────────

func TestValidateImage_AcceptsAllowedTypes(t *testing.T) {
	cases := map[string][]byte{".png": pngHeader, ".jpg": jpegHeader, ".webp": webpHeader}
	for wantExt, head := range cases {
		ext, mime, err := validateImage(head, 1024, 5<<20)
		if err != nil {
			t.Fatalf("%s: unexpected error: %v", wantExt, err)
		}
		if ext != wantExt {
			t.Fatalf("expected ext %s, got %s", wantExt, ext)
		}
		if !strings.HasPrefix(mime, "image/") {
			t.Fatalf("expected image mime, got %s", mime)
		}
	}
}

func TestValidateImage_RejectsRenamedNonImage(t *testing.T) {
	// A PDF's bytes — would pass a filename/extension check but must fail sniffing.
	pdf := []byte("%PDF-1.7\n%âãÏÓ")
	if _, _, err := validateImage(pdf, 1024, 5<<20); err == nil {
		t.Fatal("expected renamed non-image (PDF bytes) to be rejected")
	}
	// Plain text likewise.
	if _, _, err := validateImage([]byte("just some text, not an image at all"), 100, 5<<20); err == nil {
		t.Fatal("expected text to be rejected")
	}
}

func TestValidateImage_RejectsOversize(t *testing.T) {
	if _, _, err := validateImage(pngHeader, 6<<20, 5<<20); err == nil {
		t.Fatal("expected oversize image to be rejected")
	}
}

// ── mediaAccessAllowed (pure gating decision) ─────────────────────────────────

func TestMediaAccessAllowed(t *testing.T) {
	cases := []struct {
		name string
		v    mediaViewer
		want bool
	}{
		{"not started", mediaViewer{}, false},
		{"in progress", mediaViewer{hasInProgress: true}, true},
		{"completed, ms released", mediaViewer{hasCompleted: true, msAvailable: true}, true},
		{"completed, ms not released", mediaViewer{hasCompleted: true, msAvailable: false}, false},
		{"staff always", mediaViewer{isStaff: true}, true},
		{"staff even if nothing else", mediaViewer{isStaff: true, hasCompleted: true, msAvailable: false}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := mediaAccessAllowed(tc.v); got != tc.want {
				t.Fatalf("got %v want %v", got, tc.want)
			}
		})
	}
}

// ── DiskStorage ───────────────────────────────────────────────────────────────

func TestDiskStorage_RoundTripAndDelete(t *testing.T) {
	store, err := storage.NewDiskStorage(t.TempDir())
	if err != nil {
		t.Fatalf("new storage: %v", err)
	}
	key := "question-media/abc.png"
	if err := store.Save(key, bytes.NewReader([]byte("imagebytes"))); err != nil {
		t.Fatalf("save: %v", err)
	}
	body, _, err := store.Open(key)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	buf := new(bytes.Buffer)
	_, _ = buf.ReadFrom(body)
	body.Close()
	if buf.String() != "imagebytes" {
		t.Fatalf("round-trip mismatch: %q", buf.String())
	}
	if err := store.Delete(key); err != nil {
		t.Fatalf("delete: %v", err)
	}
	// Deleting a missing key is not an error.
	if err := store.Delete(key); err != nil {
		t.Fatalf("delete missing should be nil, got %v", err)
	}
}

func TestDiskStorage_RejectsTraversal(t *testing.T) {
	store, err := storage.NewDiskStorage(t.TempDir())
	if err != nil {
		t.Fatalf("new storage: %v", err)
	}
	for _, bad := range []string{"../escape.png", "../../etc/passwd", "a/../../b.png"} {
		if err := store.Save(bad, bytes.NewReader([]byte("x"))); err == nil {
			t.Fatalf("expected traversal key %q to be rejected", bad)
		}
	}
}
