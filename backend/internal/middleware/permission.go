package middleware

import (
	"context"
	"net/http"

	"github.com/miedvance/api/internal/httputil"
	"github.com/miedvance/api/internal/model"
)

// PermissionChecker is satisfied by AdminService.HasPermission.
type PermissionChecker interface {
	HasPermission(ctx context.Context, role model.UserRole, code string) (bool, error)
}

// RequirePermission returns a middleware that enforces a named permission.
// Must be chained after Authenticate.
func (a *Auth) RequirePermission(svc PermissionChecker, code string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := UserFromCtx(r.Context())
			if user == nil {
				httputil.Error(w, http.StatusUnauthorized, "Authentication required")
				return
			}
			ok, err := svc.HasPermission(r.Context(), user.Role, code)
			if err != nil {
				httputil.Error(w, http.StatusInternalServerError, "Permission check failed")
				return
			}
			if !ok {
				httputil.Error(w, http.StatusForbidden, "Insufficient permissions")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
