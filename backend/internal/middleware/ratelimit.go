package middleware

import (
	"net/http"
	"time"

	limiter "github.com/ulule/limiter/v3"
	mhttp "github.com/ulule/limiter/v3/drivers/middleware/stdlib"
	"github.com/ulule/limiter/v3/drivers/store/memory"
)

// NewRateLimiter creates an in-memory sliding-window rate limiter middleware.
// This mirrors express-rate-limit's default in-memory store behaviour.
func NewRateLimiter(limit int64, period time.Duration) func(http.Handler) http.Handler {
	store := memory.NewStore()
	rate := limiter.Rate{Limit: limit, Period: period}
	l := limiter.New(store, rate)
	return mhttp.NewMiddleware(l).Handler
}

// GlobalRateLimiter returns 500 req / 15 min, matching server.js:49-54.
func GlobalRateLimiter() func(http.Handler) http.Handler {
	return NewRateLimiter(500, 15*time.Minute)
}

// OTPRateLimiter returns 10 req / 15 min, matching auth.routes.js OTP limiter.
func OTPRateLimiter() func(http.Handler) http.Handler {
	return NewRateLimiter(10, 15*time.Minute)
}

// LoginRateLimiter returns 20 req / 15 min, matching auth.routes.js login limiter.
func LoginRateLimiter() func(http.Handler) http.Handler {
	return NewRateLimiter(20, 15*time.Minute)
}
