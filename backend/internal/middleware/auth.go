package middleware

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/kombuwaedu/api/internal/httputil"
	"github.com/kombuwaedu/api/internal/model"
)

type contextKey string

const (
	ctxUser  contextKey = "user"
	ctxToken contextKey = "token"
)

// Auth provides JWT authentication middleware backed by PostgreSQL and Redis.
type Auth struct {
	pool             *pgxpool.Pool
	rdb              *redis.Client
	jwtSecret        []byte
	jwtRefreshSecret []byte
}

// NewAuth creates an Auth middleware using the given dependencies.
func NewAuth(pool *pgxpool.Pool, rdb *redis.Client, jwtSecret, refreshSecret string) *Auth {
	return &Auth{
		pool:             pool,
		rdb:              rdb,
		jwtSecret:        []byte(jwtSecret),
		jwtRefreshSecret: []byte(refreshSecret),
	}
}

// Authenticate verifies a Bearer JWT, checks the Redis blocklist, and attaches
// the user record to the request context. Mirrors auth.js:authenticate().
func (a *Auth) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, err := extractBearer(r)
		if err != nil {
			httputil.Error(w, http.StatusUnauthorized, "Authentication required")
			return
		}

		if blocked, _ := a.rdb.Exists(r.Context(), "bl:"+token).Result(); blocked > 0 {
			httputil.Error(w, http.StatusUnauthorized, "Token revoked")
			return
		}

		claims, err := a.parseClaims(token, a.jwtSecret)
		if err != nil {
			code, msg := tokenError(err)
			httputil.Error(w, code, msg)
			return
		}

		user, err := fetchUser(r.Context(), a.pool, claims.Subject)
		if err != nil || !user.IsActive {
			httputil.Error(w, http.StatusUnauthorized, "Account not found or deactivated")
			return
		}

		ctx := context.WithValue(r.Context(), ctxUser, user)
		ctx = context.WithValue(ctx, ctxToken, token)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireRole returns a middleware that enforces role membership.
// Must be chained after Authenticate.
func (a *Auth) RequireRole(roles ...model.UserRole) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := UserFromCtx(r.Context())
			if user == nil {
				httputil.Error(w, http.StatusUnauthorized, "Authentication required")
				return
			}
			for _, role := range roles {
				if user.Role == role {
					next.ServeHTTP(w, r)
					return
				}
			}
			httputil.Error(w, http.StatusForbidden, "Insufficient permissions")
		})
	}
}

// Optional attaches a verified user to the context if a valid token is present,
// but never blocks requests without one.
func (a *Auth) Optional(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, err := extractBearer(r)
		if err != nil {
			next.ServeHTTP(w, r)
			return
		}
		if blocked, _ := a.rdb.Exists(r.Context(), "bl:"+token).Result(); blocked > 0 {
			next.ServeHTTP(w, r)
			return
		}
		if claims, err := a.parseClaims(token, a.jwtSecret); err == nil {
			if user, err := fetchUser(r.Context(), a.pool, claims.Subject); err == nil {
				r = r.WithContext(context.WithValue(r.Context(), ctxUser, user))
			}
		}
		next.ServeHTTP(w, r)
	})
}

// ParseRefreshToken validates a refresh token and returns its subject (user ID).
// Used by the /auth/refresh handler.
func (a *Auth) ParseRefreshToken(tokenStr string) (string, error) {
	claims, err := a.parseClaims(tokenStr, a.jwtRefreshSecret)
	if err != nil {
		return "", err
	}
	return claims.Subject, nil
}

// UserFromCtx retrieves the authenticated user from the request context.
func UserFromCtx(ctx context.Context) *model.User {
	u, _ := ctx.Value(ctxUser).(*model.User)
	return u
}

// TokenFromCtx retrieves the raw JWT string from the request context.
func TokenFromCtx(ctx context.Context) string {
	t, _ := ctx.Value(ctxToken).(string)
	return t
}

// ── private helpers ───────────────────────────────────────────────────────────

func extractBearer(r *http.Request) (string, error) {
	h := r.Header.Get("Authorization")
	if len(h) < 8 || h[:7] != "Bearer " {
		return "", fmt.Errorf("no bearer token")
	}
	return h[7:], nil
}

type kombuwaClaims struct {
	jwt.RegisteredClaims
	Role string `json:"role,omitempty"`
}

func (a *Auth) parseClaims(tokenStr string, secret []byte) (*kombuwaClaims, error) {
	tok, err := jwt.ParseWithClaims(tokenStr, &kombuwaClaims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return secret, nil
	})
	if err != nil {
		return nil, err
	}
	if claims, ok := tok.Claims.(*kombuwaClaims); ok {
		return claims, nil
	}
	return nil, jwt.ErrTokenInvalidClaims
}

// fetchUser loads id, mobile, name, role, stream, grade, district, is_active from DB.
func fetchUser(ctx context.Context, pool *pgxpool.Pool, userID string) (*model.User, error) {
	const q = `SELECT id, mobile, name, role, stream, grade, district, is_active
	           FROM users WHERE id = $1`

	row := pool.QueryRow(ctx, q, userID)
	u := &model.User{}
	var stream, grade, district *string
	var role string

	err := row.Scan(&u.ID, &u.Mobile, &u.Name, &role, &stream, &grade, &district, &u.IsActive)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("user not found")
	}
	if err != nil {
		return nil, err
	}

	u.Role = model.UserRole(role)
	if stream != nil {
		s := model.Stream(*stream)
		u.Stream = &s
	}
	if grade != nil {
		g := model.Grade(*grade)
		u.Grade = &g
	}
	u.District = district
	return u, nil
}

func tokenError(err error) (int, string) {
	if errors.Is(err, jwt.ErrTokenExpired) {
		return http.StatusUnauthorized, "Token expired"
	}
	return http.StatusUnauthorized, "Invalid token"
}
