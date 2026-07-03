package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// SeedAdmin ensures a super-admin user exists.
// Returns true if a new admin was created, false if one already existed.
// If a user with that mobile already exists it is left unchanged.
func SeedAdmin(ctx context.Context, pool *pgxpool.Pool, mobile, password string) (bool, error) {
	if mobile == "" || password == "" {
		return false, nil // not configured — skip silently
	}

	// Check if the user already exists
	var existing string
	err := pool.QueryRow(ctx,
		`SELECT id FROM users WHERE mobile = $1`, mobile,
	).Scan(&existing)

	if err == nil {
		// User already exists — do not overwrite
		return false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return false, err
	}

	// Hash the password
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return false, err
	}

	_, err = pool.Exec(ctx,
		`INSERT INTO users (mobile, name, password_hash, role, is_verified, is_active)
		 VALUES ($1, 'Super Admin', $2, 'admin', TRUE, TRUE)`,
		mobile, string(hash),
	)
	return err == nil, err
}
