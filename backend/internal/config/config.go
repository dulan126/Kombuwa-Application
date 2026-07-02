package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config holds all runtime configuration, loaded once at startup.
type Config struct {
	Port int
	Env  string

	DBHost     string
	DBPort     int
	DBName     string
	DBUser     string
	DBPassword string

	RedisURL string

	JWTSecret        string
	JWTExpiry        time.Duration
	JWTRefreshSecret string
	JWTRefreshExpiry time.Duration

	SMSProvider string
	SMSApiURL   string
	SMSApiKey   string
	SMSSenderID string

	UploadDir     string
	MaxFileSizeMB int

	CORSOrigins []string

	OTPExpireMinutes     int
	OTPResendCooldownSec int
	OTPMaxAttempts       int
}

// Load reads env vars (and optionally a .env file in non-production) and validates required fields.
func Load() (*Config, error) {
	if os.Getenv("NODE_ENV") != "production" {
		_ = godotenv.Load()
	}

	var errs []string
	c := &Config{}

	c.Port = parseInt("PORT", 3000)
	c.Env = getEnv("NODE_ENV", "development")

	c.DBHost = getEnv("DB_HOST", "localhost")
	c.DBPort = parseInt("DB_PORT", 5432)
	c.DBName = getEnv("DB_NAME", "kombuwaedu")
	c.DBUser = getEnv("DB_USER", "kombuwaedu_user")
	if pw := os.Getenv("DB_PASSWORD"); pw == "" {
		errs = append(errs, "DB_PASSWORD is required")
	} else {
		c.DBPassword = pw
	}

	c.RedisURL = getEnv("REDIS_URL", "redis://localhost:6379")

	if s := os.Getenv("JWT_SECRET"); len(s) < 32 {
		errs = append(errs, "JWT_SECRET must be at least 32 characters")
	} else {
		c.JWTSecret = s
	}
	c.JWTExpiry = parseDurationOrDefault("JWT_EXPIRES_IN", 30*24*time.Hour)
	c.JWTRefreshSecret = getEnv("JWT_REFRESH_SECRET", c.JWTSecret)
	c.JWTRefreshExpiry = parseDurationOrDefault("JWT_REFRESH_EXPIRES_IN", 30*24*time.Hour)

	c.SMSProvider = getEnv("SMS_PROVIDER", "dialog")
	c.SMSApiURL = getEnv("SMS_API_URL", "")
	c.SMSApiKey = getEnv("SMS_API_KEY", "")
	c.SMSSenderID = getEnv("SMS_SENDER_ID", "KOMBUWAEDU")

	c.UploadDir = getEnv("UPLOAD_DIR", "./uploads")
	c.MaxFileSizeMB = parseInt("MAX_FILE_SIZE_MB", 10)

	c.CORSOrigins = strings.Split(getEnv("CORS_ORIGIN", "http://localhost:8080"), ",")

	c.OTPExpireMinutes = parseInt("OTP_EXPIRE_MINUTES", 5)
	c.OTPResendCooldownSec = parseInt("OTP_RESEND_COOLDOWN_SECONDS", 60)
	c.OTPMaxAttempts = parseInt("OTP_MAX_ATTEMPTS", 5)

	if len(errs) > 0 {
		return nil, fmt.Errorf("config validation failed:\n  - %s", strings.Join(errs, "\n  - "))
	}
	return c, nil
}

// IsProd reports whether the service is running in production mode.
func (c *Config) IsProd() bool { return c.Env == "production" }

// DSN returns a postgres connection string for pgx.
func (c *Config) DSN() string {
	return fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=disable",
		c.DBUser, c.DBPassword, c.DBHost, c.DBPort, c.DBName)
}

// ── helpers ──────────────────────────────────────────────────────────────────

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func parseInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

// parseDurationOrDefault handles both Go duration strings ("24h") and Node-style
// day strings ("30d") as used in JWT_EXPIRES_IN.
func parseDurationOrDefault(key string, fallback time.Duration) time.Duration {
	s := os.Getenv(key)
	if s == "" {
		return fallback
	}
	if strings.HasSuffix(s, "d") {
		days, err := strconv.Atoi(strings.TrimSuffix(s, "d"))
		if err == nil {
			return time.Duration(days) * 24 * time.Hour
		}
	}
	if d, err := time.ParseDuration(s); err == nil {
		return d
	}
	return fallback
}
