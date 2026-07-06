// Package storage provides a small file-storage abstraction so the current
// local-disk implementation can be swapped for object storage (S3, etc.)
// without touching call sites.
package storage

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Storage persists opaque binary blobs under string keys.
// A key is a relative, forward-slash path (e.g. "question-media/<uuid>.webp").
type Storage interface {
	Save(key string, r io.Reader) error
	Open(key string) (io.ReadSeekCloser, time.Time, error)
	Delete(key string) error // deleting a missing key is not an error
}

// DiskStorage stores blobs on the local filesystem rooted at base.
// base must be a PRIVATE directory (not served by any public static route).
type DiskStorage struct {
	base string
}

// NewDiskStorage roots storage at base, creating it if needed.
func NewDiskStorage(base string) (*DiskStorage, error) {
	if err := os.MkdirAll(base, 0o755); err != nil {
		return nil, fmt.Errorf("create media dir: %w", err)
	}
	return &DiskStorage{base: base}, nil
}

// resolve maps a key to a safe absolute path under base, rejecting traversal.
func (d *DiskStorage) resolve(key string) (string, error) {
	if key == "" {
		return "", fmt.Errorf("empty storage key")
	}
	slashed := strings.ReplaceAll(key, "\\", "/")
	// Reject absolute paths and any parent-dir segment outright.
	if strings.HasPrefix(slashed, "/") {
		return "", fmt.Errorf("absolute storage key not allowed: %q", key)
	}
	for _, seg := range strings.Split(slashed, "/") {
		if seg == ".." {
			return "", fmt.Errorf("storage key must not contain '..': %q", key)
		}
	}
	full := filepath.Join(d.base, filepath.FromSlash(slashed))
	// Defense in depth: ensure the resolved path stays within base.
	rel, err := filepath.Rel(d.base, full)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return "", fmt.Errorf("storage key escapes base: %q", key)
	}
	return full, nil
}

func (d *DiskStorage) Save(key string, r io.Reader) error {
	full, err := d.resolve(key)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return fmt.Errorf("create dir: %w", err)
	}
	f, err := os.Create(full)
	if err != nil {
		return fmt.Errorf("create file: %w", err)
	}
	if _, err := io.Copy(f, r); err != nil {
		f.Close()
		_ = os.Remove(full) // don't leave a partial file
		return fmt.Errorf("write file: %w", err)
	}
	return f.Close()
}

func (d *DiskStorage) Open(key string) (io.ReadSeekCloser, time.Time, error) {
	full, err := d.resolve(key)
	if err != nil {
		return nil, time.Time{}, err
	}
	f, err := os.Open(full)
	if err != nil {
		return nil, time.Time{}, err
	}
	stat, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, time.Time{}, err
	}
	return f, stat.ModTime(), nil
}

func (d *DiskStorage) Delete(key string) error {
	full, err := d.resolve(key)
	if err != nil {
		return err
	}
	if err := os.Remove(full); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("delete file: %w", err)
	}
	return nil
}
