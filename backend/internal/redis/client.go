package redisclient

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"

	"github.com/kombuwaedu/api/internal/config"
)

// New creates a go-redis client and verifies connectivity.
func New(ctx context.Context, cfg *config.Config) (*redis.Client, error) {
	opts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}

	client := redis.NewClient(opts)
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("ping redis: %w", err)
	}
	return client, nil
}
