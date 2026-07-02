package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/rs/cors"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	appCron "github.com/miedvance/api/internal/cron"
	"github.com/miedvance/api/internal/config"
	"github.com/miedvance/api/internal/db"
	"github.com/miedvance/api/internal/handler"
	"github.com/miedvance/api/internal/httputil"
	"github.com/miedvance/api/internal/middleware"
	redisclient "github.com/miedvance/api/internal/redis"
	"github.com/miedvance/api/internal/repository"
	"github.com/miedvance/api/internal/service"
	"github.com/miedvance/api/internal/sms"
)

func main() {
	// ── Config ────────────────────────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "config error: %v\n", err)
		os.Exit(1)
	}

	// ── Logger ────────────────────────────────────────────────────────────
	log := buildLogger(cfg)
	defer log.Sync() //nolint:errcheck

	ctx := context.Background()

	// ── Database ──────────────────────────────────────────────────────────
	pool, err := db.New(ctx, cfg)
	if err != nil {
		log.Fatal("database init failed", zap.Error(err))
	}
	defer pool.Close()
	log.Info("PostgreSQL connected")

	// ── Redis ─────────────────────────────────────────────────────────────
	rdb, err := redisclient.New(ctx, cfg)
	if err != nil {
		log.Fatal("redis init failed", zap.Error(err))
	}
	defer rdb.Close()
	log.Info("Redis connected")

	// ── Auth middleware ───────────────────────────────────────────────────
	auth := middleware.NewAuth(pool, rdb, cfg.JWTSecret, cfg.JWTRefreshSecret)

	// ── Repositories ──────────────────────────────────────────────────────
	authRepo := repository.NewAuthRepo(pool)
	papersRepo := repository.NewPapersRepo(pool)
	adminRepo := repository.NewAdminRepo(pool)
	ppRepo := repository.NewPastPapersRepo(pool)
	forumRepo := repository.NewForumRepo(pool)

	// ── Services ──────────────────────────────────────────────────────────
	smsCli := sms.New(cfg, log)
	authSvc := service.NewAuthService(authRepo, rdb, smsCli, cfg, log)
	papersSvc := service.NewPapersService(papersRepo, rdb, log)
	adminSvc := service.NewAdminService(adminRepo, papersRepo, papersSvc, log)
	ppSvc := service.NewPastPapersService(ppRepo, log)
	forumSvc := service.NewForumService(forumRepo, log)

	// ── Cron scheduler ────────────────────────────────────────────────────
	scheduler := appCron.New(pool, papersRepo, papersSvc, log)
	scheduler.Start()
	defer scheduler.Stop()

	// ── Handlers ──────────────────────────────────────────────────────────
	authHandler := handler.NewAuthHandler(
		authSvc, auth, log,
		middleware.OTPRateLimiter(),
		middleware.LoginRateLimiter(),
	)
	papersHandler := handler.NewPapersHandler(papersSvc, auth, log)
	adminHandler := handler.NewAdminHandler(adminSvc, auth, log)
	ppHandler := handler.NewPastPapersHandler(ppSvc, auth, cfg, log)
	forumHandler := handler.NewForumHandler(forumSvc, auth, cfg, log)

	// ── CORS ──────────────────────────────────────────────────────────────
	corsHandler := cors.New(cors.Options{
		AllowedOrigins:   cfg.CORSOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	})

	// ── Router ────────────────────────────────────────────────────────────
	r := chi.NewRouter()
	r.Use(chiMiddleware.RequestID)
	r.Use(chiMiddleware.RealIP)
	r.Use(chiMiddleware.Recoverer)
	r.Use(corsHandler.Handler)
	r.Use(middleware.ZapLogger(log))
	r.Use(middleware.GlobalRateLimiter())

	// ── Static uploads ────────────────────────────────────────────────────
	r.Handle("/uploads/*", http.StripPrefix("/uploads/",
		middleware.UploadFileServer(cfg.UploadDir)))

	// ── API routes ────────────────────────────────────────────────────────
	r.Mount("/api/v1/auth", authHandler.Routes())
	r.Mount("/api/v1/papers", papersHandler.Routes())
	r.Mount("/api/v1/admin", adminHandler.Routes())
	r.Mount("/api/v1/past-papers", ppHandler.Routes())
	r.Mount("/api/v1/forum", forumHandler.Routes())

	// ── Health ────────────────────────────────────────────────────────────
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		if err := pool.Ping(r.Context()); err != nil {
			httputil.JSON(w, http.StatusServiceUnavailable, map[string]any{
				"status": "degraded",
				"error":  err.Error(),
			})
			return
		}
		httputil.JSON(w, http.StatusOK, map[string]any{
			"status":    "ok",
			"timestamp": time.Now().UTC(),
			"env":       cfg.Env,
		})
	})

	// ── 404 ───────────────────────────────────────────────────────────────
	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		httputil.Error(w, http.StatusNotFound,
			"Route "+r.Method+" "+r.URL.Path+" not found")
	})

	// ── HTTP server ───────────────────────────────────────────────────────
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
		BaseContext:  func(_ net.Listener) context.Context { return ctx },
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGTERM, syscall.SIGINT)

	go func() {
		log.Info("MIEDVANCE API starting",
			zap.Int("port", cfg.Port),
			zap.String("env", cfg.Env),
		)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("server error", zap.Error(err))
		}
	}()

	<-stop
	log.Info("Shutting down…")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error("shutdown error", zap.Error(err))
	}
	log.Info("Server stopped")
}

// buildLogger constructs a zap.Logger that:
//   - In development: pretty-prints to stdout.
//   - In production: writes JSON to stdout AND to rotating log files under ./logs/.
//     combined.log receives all levels; error.log receives Error+.
//     File rotation is handled by the OS / Docker log driver. Files are capped by
//     Docker's --log-opt max-size; on bare metal use logrotate(8).
func buildLogger(cfg *config.Config) *zap.Logger {
	if !cfg.IsProd() {
		l, _ := zap.NewDevelopment()
		return l
	}

	logDir := "./logs"
	_ = os.MkdirAll(logDir, 0o755)

	enc := zapcore.NewJSONEncoder(zap.NewProductionEncoderConfig())
	stdout := zapcore.AddSync(os.Stdout)

	combinedFile := openLogFile(filepath.Join(logDir, "combined.log"))
	errorFile := openLogFile(filepath.Join(logDir, "error.log"))

	core := zapcore.NewTee(
		zapcore.NewCore(enc, stdout, zapcore.DebugLevel),
		zapcore.NewCore(enc, combinedFile, zapcore.InfoLevel),
		zapcore.NewCore(enc, errorFile, zapcore.ErrorLevel),
	)
	return zap.New(core, zap.AddCaller(), zap.AddStacktrace(zapcore.ErrorLevel))
}

// openLogFile opens (or creates) a log file in append mode.
// Errors are silently ignored — we fall back to stdout-only logging.
func openLogFile(path string) zapcore.WriteSyncer {
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return zapcore.AddSync(os.Stdout)
	}
	return zapcore.AddSync(f)
}
