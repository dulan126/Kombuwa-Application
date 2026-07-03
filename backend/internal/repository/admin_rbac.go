package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/miedvance/api/internal/model"
)

// RBACRepo handles permission storage queries.
type RBACRepo struct {
	pool *pgxpool.Pool
}

// NewRBACRepo creates a RBACRepo.
func NewRBACRepo(pool *pgxpool.Pool) *RBACRepo { return &RBACRepo{pool: pool} }

// GetPermissionsForRole returns all permission codes assigned to a role.
func (r *RBACRepo) GetPermissionsForRole(ctx context.Context, role model.UserRole) ([]string, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT permission_code FROM role_permissions WHERE role = $1::user_role`,
		string(role),
	)
	if err != nil {
		return nil, fmt.Errorf("get permissions: %w", err)
	}
	defer rows.Close()

	var codes []string
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err != nil {
			return nil, fmt.Errorf("scan permission: %w", err)
		}
		codes = append(codes, code)
	}
	return codes, rows.Err()
}

// SetPermissionsForRole replaces all permissions for a role in a single transaction.
func (r *RBACRepo) SetPermissionsForRole(ctx context.Context, role model.UserRole, codes []string) error {
	return withPool(ctx, r.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx,
			`DELETE FROM role_permissions WHERE role = $1::user_role`, string(role),
		); err != nil {
			return fmt.Errorf("delete old permissions: %w", err)
		}
		for _, code := range codes {
			if _, err := tx.Exec(ctx,
				`INSERT INTO role_permissions (role, permission_code) VALUES ($1::user_role, $2)`,
				string(role), code,
			); err != nil {
				return fmt.Errorf("insert permission %q: %w", code, err)
			}
		}
		return nil
	})
}

// ListPermissions returns all registered permission codes.
func (r *RBACRepo) ListPermissions(ctx context.Context) ([]model.Permission, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT code, description FROM permissions ORDER BY code`,
	)
	if err != nil {
		return nil, fmt.Errorf("list permissions: %w", err)
	}
	defer rows.Close()

	var out []model.Permission
	for rows.Next() {
		var p model.Permission
		if err := rows.Scan(&p.Code, &p.Description); err != nil {
			return nil, fmt.Errorf("scan permission: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
