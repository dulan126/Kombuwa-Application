package middleware

import (
	"net/http"
	"strings"
)

// UploadFileServer serves static files from uploadDir, setting
// Content-Type: application/pdf for .pdf files and denying dotfiles.
// It also sets Cross-Origin-Resource-Policy: cross-origin so the Next.js
// frontend can embed PDFs across origins (mirrors Helmet's crossOriginResourcePolicy
// setting in the Node service).
func UploadFileServer(uploadDir string) http.Handler {
	fs := http.FileServer(http.Dir(uploadDir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Deny dotfile paths
		for _, seg := range strings.Split(r.URL.Path, "/") {
			if strings.HasPrefix(seg, ".") {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
		}
		// Allow cross-origin access (needed for frontend PDF embedding)
		w.Header().Set("Cross-Origin-Resource-Policy", "cross-origin")
		if strings.HasSuffix(r.URL.Path, ".pdf") {
			w.Header().Set("Content-Type", "application/pdf")
		}
		fs.ServeHTTP(w, r)
	})
}
