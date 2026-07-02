package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kombuwaedu/api/internal/model"
)

// AuthRepo handles all auth-related DB queries.
type AuthRepo struct {
	pool *pgxpool.Pool
}

// NewAuthRepo creates an AuthRepo.
func NewAuthRepo(pool *pgxpool.Pool) *AuthRepo { return &AuthRepo{pool: pool} }

// ── User queries ──────────────────────────────────────────────────────────────

// UserLoginRow holds columns needed for login validation.
type UserLoginRow struct {
	ID           uuid.UUID
	PasswordHash string
	Name         string
	Role         model.UserRole
	Stream       *string
	Grade        *string
	District     *string
	IsActive     bool
	IsVerified   bool
}

// FindByMobile returns the user row needed for login. Returns nil if not found.
func (r *AuthRepo) FindByMobile(ctx context.Context, mobile string) (*UserLoginRow, error) {
	const q = `SELECT id, password_hash, name, role, stream, grade, district, is_active, is_verified
	           FROM users WHERE mobile = $1`
	row := r.pool.QueryRow(ctx, q, mobile)

	var u UserLoginRow
	var idStr, role string
	err := row.Scan(&idStr, &u.PasswordHash, &u.Name, &role,
		&u.Stream, &u.Grade, &u.District, &u.IsActive, &u.IsVerified)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find user by mobile: %w", err)
	}
	u.ID, err = uuid.Parse(idStr)
	if err != nil {
		return nil, fmt.Errorf("parse user uuid: %w", err)
	}
	u.Role = model.UserRole(role)
	return &u, nil
}

// MobileExists reports whether a user with the given mobile already exists.
func (r *AuthRepo) MobileExists(ctx context.Context, mobile string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE mobile = $1)`, mobile).Scan(&exists)
	return exists, err
}

// InsertUser creates a new unverified user record.
func (r *AuthRepo) InsertUser(ctx context.Context,
	mobile, name, passwordHash, stream, grade, district string,
	school *string, examYear int,
) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO users (mobile, name, password_hash, stream, grade, district, school, exam_year)
		 VALUES ($1,$2,$3,$4::stream_enum,$5::grade_enum,$6::district_enum,$7,$8)`,
		mobile, name, passwordHash, stream, grade, district, school, examYear,
	)
	return err
}

// VerifyUserByMobile sets is_verified=TRUE and returns the user's public fields.
func (r *AuthRepo) VerifyUserByMobile(ctx context.Context, mobile string) (*model.User, error) {
	const q = `UPDATE users SET is_verified = TRUE
	           WHERE mobile = $1
	           RETURNING id, name, role, stream, grade, district`
	row := r.pool.QueryRow(ctx, q, mobile)

	var u model.User
	var idStr, role string
	var stream, grade, district *string
	err := row.Scan(&idStr, &u.Name, &role, &stream, &grade, &district)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("user not found")
	}
	if err != nil {
		return nil, fmt.Errorf("verify user: %w", err)
	}
	u.ID, _ = uuid.Parse(idStr)
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
	return &u, nil
}

// UpdateLastLogin stamps last_login = NOW() for the given user.
func (r *AuthRepo) UpdateLastLogin(ctx context.Context, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `UPDATE users SET last_login = NOW() WHERE id = $1`, userID)
	return err
}

// GetProfile returns the full user profile for GET /auth/me.
func (r *AuthRepo) GetProfile(ctx context.Context, userID uuid.UUID) (*model.User, error) {
	const q = `SELECT id, mobile, name, role, stream, grade, district, school, exam_year, created_at
	           FROM users WHERE id = $1`
	row := r.pool.QueryRow(ctx, q, userID)

	var u model.User
	var idStr, role string
	var stream, grade, district *string
	err := row.Scan(&idStr, &u.Mobile, &u.Name, &role,
		&stream, &grade, &district, &u.School, &u.ExamYear, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("user not found")
	}
	if err != nil {
		return nil, fmt.Errorf("get profile: %w", err)
	}
	u.ID, _ = uuid.Parse(idStr)
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
	return &u, nil
}

// UpdateProfileParams carries the optional fields for PATCH /auth/me.
type UpdateProfileParams struct {
	UserID   uuid.UUID
	Name     *string
	School   *string
	District *string
	ExamYear *int
}

// UpdateProfile applies a partial update (COALESCE keeps existing values for nil fields).
func (r *AuthRepo) UpdateProfile(ctx context.Context, p UpdateProfileParams) (*model.User, error) {
	const q = `UPDATE users SET
	             name      = COALESCE($1, name),
	             school    = COALESCE($2, school),
	             district  = COALESCE($3::district_enum, district),
	             exam_year = COALESCE($4, exam_year)
	           WHERE id = $5
	           RETURNING id, name, school, district, exam_year`
	row := r.pool.QueryRow(ctx, q, p.Name, p.School, p.District, p.ExamYear, p.UserID)

	var u model.User
	var idStr string
	err := row.Scan(&idStr, &u.Name, &u.School, &u.District, &u.ExamYear)
	if err != nil {
		return nil, fmt.Errorf("update profile: %w", err)
	}
	u.ID, _ = uuid.Parse(idStr)
	return &u, nil
}

// UpdatePassword replaces the password hash for the given mobile.
func (r *AuthRepo) UpdatePassword(ctx context.Context, mobile, passwordHash string) error {
	_, err := r.pool.Exec(ctx, `UPDATE users SET password_hash = $1 WHERE mobile = $2`, passwordHash, mobile)
	return err
}

// ── OTP queries ───────────────────────────────────────────────────────────────

// InsertOTP creates a new OTP record.
func (r *AuthRepo) InsertOTP(ctx context.Context, mobile, code, purpose string, expiresAt time.Time) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO otps (mobile, code, purpose, expires_at) VALUES ($1,$2,$3,$4)`,
		mobile, code, purpose, expiresAt,
	)
	return err
}

// OTPRow is the minimal OTP data needed for verification.
type OTPRow struct {
	ID       uuid.UUID
	Attempts int16
}

// FindLatestOTP returns the latest unverified, unexpired OTP for mobile+purpose.
// Returns nil if none found.
func (r *AuthRepo) FindLatestOTP(ctx context.Context, mobile, purpose string) (*OTPRow, error) {
	const q = `SELECT id, attempts FROM otps
	           WHERE mobile=$1 AND purpose=$2 AND verified=FALSE AND expires_at > NOW()
	           ORDER BY created_at DESC LIMIT 1`
	row := r.pool.QueryRow(ctx, q, mobile, purpose)

	var o OTPRow
	var idStr string
	err := row.Scan(&idStr, &o.Attempts)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find otp: %w", err)
	}
	o.ID, _ = uuid.Parse(idStr)
	return &o, nil
}

// IncrementOTPAttempts adds 1 to the attempt counter for the given OTP.
func (r *AuthRepo) IncrementOTPAttempts(ctx context.Context, otpID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `UPDATE otps SET attempts = attempts + 1 WHERE id = $1`, otpID)
	return err
}

// MarkOTPVerified sets verified=TRUE only when id AND code match.
// Returns true if the update succeeded (i.e. code was correct).
func (r *AuthRepo) MarkOTPVerified(ctx context.Context, otpID uuid.UUID, code string) (bool, error) {
	tag, err := r.pool.Exec(ctx,
		`UPDATE otps SET verified = TRUE WHERE id = $1 AND code = $2`, otpID, code)
	if err != nil {
		return false, fmt.Errorf("mark otp verified: %w", err)
	}
	return tag.RowsAffected() == 1, nil
}
