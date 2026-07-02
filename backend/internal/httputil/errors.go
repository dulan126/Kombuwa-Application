package httputil

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
)

// AppError is a business-logic error that carries an HTTP status code.
// Services return these; handlers translate them to JSON responses.
type AppError struct {
	Status  int
	Message string
	Extra   map[string]any
}

func (e *AppError) Error() string { return e.Message }

// E constructs an AppError.
func E(status int, msg string) *AppError {
	return &AppError{Status: status, Message: msg}
}

// Ewith constructs an AppError with extra JSON fields (e.g. needsVerification).
func Ewith(status int, msg string, extra map[string]any) *AppError {
	return &AppError{Status: status, Message: msg, Extra: extra}
}

// HandleError writes an AppError as JSON, or a generic 500 for unknown errors.
func HandleError(w http.ResponseWriter, err error) {
	var appErr *AppError
	if errors.As(err, &appErr) {
		body := map[string]any{"error": appErr.Message}
		for k, v := range appErr.Extra {
			body[k] = v
		}
		JSON(w, appErr.Status, body)
		return
	}
	Error(w, http.StatusInternalServerError, "Internal server error")
}

// Decode reads at most 1 MB of JSON from the request body into v.
func Decode(r *http.Request, v any) error {
	return json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(v)
}
