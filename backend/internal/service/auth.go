package service

import (
	"context"
	"fmt"
	"math/rand"
	"net/http"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"

	"github.com/miedvance/api/internal/config"
	"github.com/miedvance/api/internal/httputil"
	"github.com/miedvance/api/internal/model"
	"github.com/miedvance/api/internal/repository"
	"github.com/miedvance/api/internal/sms"
)

// AuthService implements all auth business logic.
type AuthService struct {
	repo *repository.AuthRepo
	rdb  *redis.Client
	sms  *sms.Client
	cfg  *config.Config
	log  *zap.Logger
}

// NewAuthService creates an AuthService.
func NewAuthService(
	repo *repository.AuthRepo,
	rdb *redis.Client,
	smsCli *sms.Client,
	cfg *config.Config,
	log *zap.Logger,
) *AuthService {
	return &AuthService{repo: repo, rdb: rdb, sms: smsCli, cfg: cfg, log: log}
}

// ── Register ──────────────────────────────────────────────────────────────────

type RegisterInput struct {
	Mobile   string  `json:"mobile"`
	Name     string  `json:"name"`
	Password string  `json:"password"`
	Stream   string  `json:"stream"`
	Grade    string  `json:"grade"`
	District string  `json:"district"`
	School   *string `json:"school"`
	ExamYear int     `json:"examYear"`
}

func (s *AuthService) Register(ctx context.Context, in RegisterInput) error {
	if !validMobile(in.Mobile) {
		return httputil.E(http.StatusBadRequest, "Invalid mobile number format")
	}
	exists, err := s.repo.MobileExists(ctx, in.Mobile)
	if err != nil {
		return fmt.Errorf("check mobile: %w", err)
	}
	if exists {
		return httputil.E(http.StatusConflict, "Mobile number already registered")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), 12)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	if err := s.repo.InsertUser(ctx,
		in.Mobile, in.Name, string(hash), in.Stream, in.Grade, in.District, in.School, in.ExamYear,
	); err != nil {
		return fmt.Errorf("insert user: %w", err)
	}

	return s.sendOTP(ctx, in.Mobile, "register")
}

// ── Verify OTP ────────────────────────────────────────────────────────────────

type TokenPair struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
}

func (s *AuthService) VerifyOTP(ctx context.Context, mobile, code, purpose string) (*TokenPair, error) {
	otp, err := s.repo.FindLatestOTP(ctx, mobile, purpose)
	if err != nil {
		return nil, fmt.Errorf("find otp: %w", err)
	}
	if otp == nil {
		return nil, httputil.E(http.StatusBadRequest, "OTP expired or not found")
	}
	if otp.Attempts >= int16(s.cfg.OTPMaxAttempts) {
		return nil, httputil.E(http.StatusTooManyRequests, "Maximum OTP attempts exceeded")
	}

	if err := s.repo.IncrementOTPAttempts(ctx, otp.ID); err != nil {
		s.log.Error("increment otp attempts", zap.Error(err))
	}

	ok, err := s.repo.MarkOTPVerified(ctx, otp.ID, code)
	if err != nil {
		return nil, fmt.Errorf("mark otp: %w", err)
	}
	if !ok {
		return nil, httputil.E(http.StatusBadRequest, "Invalid OTP")
	}

	user, err := s.repo.VerifyUserByMobile(ctx, mobile)
	if err != nil {
		return nil, fmt.Errorf("verify user: %w", err)
	}

	return s.issueTokens(user.ID, user.Role)
}

// ── Login ─────────────────────────────────────────────────────────────────────

type LoginInput struct {
	Mobile   string `json:"mobile"`
	Password string `json:"password"`
}

func (s *AuthService) Login(ctx context.Context, in LoginInput) (*TokenPair, error) {
	user, err := s.repo.FindByMobile(ctx, in.Mobile)
	if err != nil {
		return nil, fmt.Errorf("find user: %w", err)
	}
	if user == nil {
		return nil, httputil.E(http.StatusUnauthorized, "Invalid credentials")
	}
	if !user.IsActive {
		return nil, httputil.E(http.StatusForbidden, "Account deactivated")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(in.Password)); err != nil {
		return nil, httputil.E(http.StatusUnauthorized, "Invalid credentials")
	}

	if !user.IsVerified {
		// Resend OTP silently; best-effort.
		_ = s.sendOTP(ctx, in.Mobile, "register")
		return nil, httputil.Ewith(http.StatusForbidden, "Account not verified",
			map[string]any{"needsVerification": true})
	}

	_ = s.repo.UpdateLastLogin(ctx, user.ID)

	return s.issueTokens(user.ID, user.Role)
}

// ── Logout ────────────────────────────────────────────────────────────────────

func (s *AuthService) Logout(ctx context.Context, tokenStr string) error {
	exp, err := tokenExpiry(tokenStr, s.cfg.JWTSecret)
	if err != nil {
		return nil // already expired / invalid — nothing to blocklist
	}
	ttl := time.Until(exp)
	if ttl <= 0 {
		return nil
	}
	return s.rdb.Set(ctx, "bl:"+tokenStr, "1", ttl).Err()
}

// ── Refresh ───────────────────────────────────────────────────────────────────

func (s *AuthService) Refresh(ctx context.Context, refreshToken string) (*TokenPair, error) {
	if blocked, _ := s.rdb.Exists(ctx, "bl:"+refreshToken).Result(); blocked > 0 {
		return nil, httputil.E(http.StatusUnauthorized, "Token revoked")
	}

	claims, err := parseTokenClaims(refreshToken, s.cfg.JWTRefreshSecret)
	if err != nil {
		return nil, httputil.E(http.StatusUnauthorized, "Invalid or expired refresh token")
	}

	// Blocklist used refresh token (one-time use).
	if exp := claims.ExpiresAt; exp != nil {
		ttl := time.Until(exp.Time)
		if ttl > 0 {
			_ = s.rdb.Set(ctx, "bl:"+refreshToken, "1", ttl).Err()
		}
	}

	userID, err := uuid.Parse(claims.Subject)
	if err != nil {
		return nil, httputil.E(http.StatusUnauthorized, "Invalid token subject")
	}

	user, err := s.repo.GetProfile(ctx, userID)
	if err != nil {
		return nil, httputil.E(http.StatusUnauthorized, "User not found")
	}

	return s.issueTokens(user.ID, user.Role)
}

// ── Resend OTP ────────────────────────────────────────────────────────────────

func (s *AuthService) ResendOTP(ctx context.Context, mobile, purpose string) error {
	if !validMobile(mobile) {
		return httputil.E(http.StatusBadRequest, "Invalid mobile number format")
	}
	return s.sendOTP(ctx, mobile, purpose)
}

// ── Forgot Password ───────────────────────────────────────────────────────────

// ForgotPassword sends a reset OTP if the mobile exists; always returns success
// to prevent user enumeration.
func (s *AuthService) ForgotPassword(ctx context.Context, mobile string) error {
	if !validMobile(mobile) {
		return httputil.E(http.StatusBadRequest, "Invalid mobile number format")
	}
	exists, err := s.repo.MobileExists(ctx, mobile)
	if err != nil {
		s.log.Error("forgot password check", zap.Error(err))
		return nil // swallow — don't leak internal errors on this endpoint
	}
	if exists {
		_ = s.sendOTP(ctx, mobile, "reset") // best-effort; errors swallowed
	}
	return nil
}

// ── Reset Password ────────────────────────────────────────────────────────────

type ResetPasswordInput struct {
	Mobile      string `json:"mobile"`
	Code        string `json:"code"`
	NewPassword string `json:"newPassword"`
}

func (s *AuthService) ResetPassword(ctx context.Context, in ResetPasswordInput) error {
	otp, err := s.repo.FindLatestOTP(ctx, in.Mobile, "reset")
	if err != nil {
		return fmt.Errorf("find otp: %w", err)
	}
	if otp == nil {
		return httputil.E(http.StatusBadRequest, "OTP expired or not found")
	}
	if otp.Attempts >= int16(s.cfg.OTPMaxAttempts) {
		return httputil.E(http.StatusTooManyRequests, "Maximum OTP attempts exceeded")
	}

	if err := s.repo.IncrementOTPAttempts(ctx, otp.ID); err != nil {
		s.log.Error("increment otp attempts", zap.Error(err))
	}

	ok, err := s.repo.MarkOTPVerified(ctx, otp.ID, in.Code)
	if err != nil {
		return fmt.Errorf("mark otp: %w", err)
	}
	if !ok {
		return httputil.E(http.StatusBadRequest, "Invalid OTP")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(in.NewPassword), 12)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	return s.repo.UpdatePassword(ctx, in.Mobile, string(hash))
}

// ── Profile ───────────────────────────────────────────────────────────────────

func (s *AuthService) GetProfile(ctx context.Context, userID uuid.UUID) (*model.User, error) {
	return s.repo.GetProfile(ctx, userID)
}

func (s *AuthService) UpdateProfile(ctx context.Context, p repository.UpdateProfileParams) (*model.User, error) {
	return s.repo.UpdateProfile(ctx, p)
}

// ── private helpers ───────────────────────────────────────────────────────────

// validMobile matches the Node regex: /^\+947[0-9]{8}$/
func validMobile(m string) bool {
	if len(m) != 12 {
		return false
	}
	if m[:4] != "+947" {
		return false
	}
	for _, c := range m[4:] {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

// sendOTP generates a 6-digit code, persists it, enforces the cooldown, and sends SMS.
func (s *AuthService) sendOTP(ctx context.Context, mobile, purpose string) error {
	cdKey := fmt.Sprintf("otp:cd:%s:%s", mobile, purpose)
	if n, _ := s.rdb.Exists(ctx, cdKey).Result(); n > 0 {
		return httputil.E(http.StatusTooManyRequests, "Please wait before requesting a new OTP")
	}

	code := strconv.Itoa(100000 + rand.Intn(900000))
	expiresAt := time.Now().Add(time.Duration(s.cfg.OTPExpireMinutes) * time.Minute)

	if err := s.repo.InsertOTP(ctx, mobile, code, purpose, expiresAt); err != nil {
		return fmt.Errorf("insert otp: %w", err)
	}

	cooldown := time.Duration(s.cfg.OTPResendCooldownSec) * time.Second
	_ = s.rdb.Set(ctx, cdKey, "1", cooldown).Err()

	if err := s.sms.Send(ctx, mobile, code); err != nil {
		s.log.Error("send sms", zap.Error(err))
		// Don't fail the request — OTP is in DB; user can retry
	}
	return nil
}

// miedvanceClaims mirrors the middleware type for internal use.
type miedvanceClaims struct {
	jwt.RegisteredClaims
	Role string `json:"role,omitempty"`
}

func (s *AuthService) issueTokens(userID uuid.UUID, role model.UserRole) (*TokenPair, error) {
	now := time.Now()

	accessClaims := miedvanceClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.cfg.JWTExpiry)),
		},
		Role: string(role),
	}
	accessToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims).
		SignedString([]byte(s.cfg.JWTSecret))
	if err != nil {
		return nil, fmt.Errorf("sign access token: %w", err)
	}

	refreshClaims := miedvanceClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.cfg.JWTRefreshExpiry)),
		},
	}
	refreshToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims).
		SignedString([]byte(s.cfg.JWTRefreshSecret))
	if err != nil {
		return nil, fmt.Errorf("sign refresh token: %w", err)
	}

	return &TokenPair{AccessToken: accessToken, RefreshToken: refreshToken}, nil
}

// tokenExpiry parses a token and returns its expiry time (used for blocklist TTL).
func tokenExpiry(tokenStr, secret string) (time.Time, error) {
	claims, err := parseTokenClaims(tokenStr, secret)
	if err != nil {
		return time.Time{}, err
	}
	if claims.ExpiresAt == nil {
		return time.Time{}, fmt.Errorf("no expiry")
	}
	return claims.ExpiresAt.Time, nil
}

func parseTokenClaims(tokenStr, secret string) (*miedvanceClaims, error) {
	tok, err := jwt.ParseWithClaims(tokenStr, &miedvanceClaims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	if claims, ok := tok.Claims.(*miedvanceClaims); ok {
		return claims, nil
	}
	return nil, jwt.ErrTokenInvalidClaims
}
