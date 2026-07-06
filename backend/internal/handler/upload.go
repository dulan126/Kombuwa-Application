package handler

import (
	"io"
	"mime/multipart"
	"os"
)

// copyMultipart streams an uploaded multipart file to disk. Shared by the
// forum image upload path (and previously the past-paper PDF path).
func copyMultipart(dst *os.File, src multipart.File) (int64, error) {
	return io.Copy(dst, src)
}
