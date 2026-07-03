package cron

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/robfig/cron/v3"
	"go.uber.org/zap"

	"github.com/miedvance/api/internal/repository"
	"github.com/miedvance/api/internal/service"
)

// Scheduler wraps robfig/cron with application-level job registrations.
type Scheduler struct {
	c          *cron.Cron
	pool       *pgxpool.Pool
	papersRepo *repository.PapersRepo
	papersSvc  *service.PapersService
	log        *zap.Logger
}

// New creates a Scheduler configured for UTC.
func New(pool *pgxpool.Pool, papersRepo *repository.PapersRepo, papersSvc *service.PapersService, log *zap.Logger) *Scheduler {
	return &Scheduler{
		c:          cron.New(cron.WithLocation(time.UTC)),
		pool:       pool,
		papersRepo: papersRepo,
		papersSvc:  papersSvc,
		log:        log,
	}
}

// Start registers all jobs and starts the scheduler in the background.
func (s *Scheduler) Start() {
	s.c.AddFunc("*/5 * * * *", s.srpRankingJob)    // every 5 min: rank closed SRP papers
	s.c.AddFunc("25 18 * * *", s.dailyMCQRankingJob) // 18:25 UTC = 23:55 SLST: rank daily papers
	s.c.AddFunc("30 18 * * *", s.markingSchemeJob)  // 18:30 UTC = midnight SLST: release answers
	s.c.AddFunc("0 1 * * *", s.otpCleanupJob)       // 01:00 UTC: purge expired OTPs

	s.c.Start()
	s.log.Info("[Cron] Scheduler started")
}

// Stop waits for in-flight jobs to finish, then shuts down.
func (s *Scheduler) Stop() {
	ctx := s.c.Stop()
	<-ctx.Done()
}

// ── Job implementations ───────────────────────────────────────────────────────

// srpRankingJob finds SRP papers whose window just closed and recomputes rankings.
// Mirrors cron.service.js:startSRPRankingJob (*/5 * * * *).
func (s *Scheduler) srpRankingJob() {
	ctx := context.Background()

	rows, err := s.pool.Query(ctx,
		`SELECT id FROM papers
		 WHERE type = 'srp'
		   AND is_published = TRUE
		   AND available_until IS NOT NULL
		   AND available_until BETWEEN NOW() - INTERVAL '5 minutes' AND NOW()`,
	)
	if err != nil {
		s.log.Error("[Cron] SRP ranking query failed", zap.Error(err))
		return
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			ids = append(ids, id)
		}
	}

	for _, idStr := range ids {
		paperID := parseUUID(idStr)
		s.log.Info("[Cron] Auto-ranking SRP paper", zap.String("paper_id", idStr))

		attempts, err := s.papersRepo.GetCompletedAttempts(ctx, paperID)
		if err != nil {
			s.log.Error("[Cron] Get attempts failed", zap.String("paper_id", idStr), zap.Error(err))
			continue
		}
		if err := s.papersRepo.DeleteRankings(ctx, paperID); err != nil {
			s.log.Error("[Cron] Delete rankings failed", zap.String("paper_id", idStr), zap.Error(err))
			continue
		}

		districtCounters := map[string]int32{}
		for i, a := range attempts {
			dist := "unknown"
			if a.District != nil {
				dist = *a.District
			}
			districtCounters[dist]++
			_ = s.papersRepo.UpsertRanking(ctx, repository.UpsertRankingParams{
				PaperID:       paperID,
				UserID:        a.UserID,
				Score:         a.Score,
				TimeTakenSecs: a.TimeTakenSecs,
				NationalRank:  int32(i + 1),
				DistrictRank:  districtCounters[dist],
				District:      a.District,
			})
		}

		s.papersSvc.InvalidateLeaderboardCache(ctx, paperID)
		s.log.Info("[Cron] Rankings computed", zap.String("paper_id", idStr), zap.Int("count", len(attempts)))
	}
}

// dailyMCQRankingJob finds daily papers whose window just closed and recomputes rankings.
// Runs at 18:25 UTC (= 23:55 SLST), 5 minutes before markingSchemeJob releases answers.
func (s *Scheduler) dailyMCQRankingJob() {
	ctx := context.Background()

	rows, err := s.pool.Query(ctx,
		`SELECT id FROM papers
		 WHERE type = 'daily'
		   AND is_published = TRUE
		   AND available_until IS NOT NULL
		   AND available_until BETWEEN NOW() - INTERVAL '5 minutes' AND NOW()`,
	)
	if err != nil {
		s.log.Error("[Cron] Daily ranking query failed", zap.Error(err))
		return
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			ids = append(ids, id)
		}
	}

	for _, idStr := range ids {
		paperID := parseUUID(idStr)
		s.log.Info("[Cron] Auto-ranking daily paper", zap.String("paper_id", idStr))

		attempts, err := s.papersRepo.GetCompletedAttempts(ctx, paperID)
		if err != nil {
			s.log.Error("[Cron] Get attempts failed", zap.String("paper_id", idStr), zap.Error(err))
			continue
		}
		if err := s.papersRepo.DeleteRankings(ctx, paperID); err != nil {
			s.log.Error("[Cron] Delete rankings failed", zap.String("paper_id", idStr), zap.Error(err))
			continue
		}

		districtCounters := map[string]int32{}
		for i, a := range attempts {
			dist := "unknown"
			if a.District != nil {
				dist = *a.District
			}
			districtCounters[dist]++
			_ = s.papersRepo.UpsertRanking(ctx, repository.UpsertRankingParams{
				PaperID:       paperID,
				UserID:        a.UserID,
				Score:         a.Score,
				TimeTakenSecs: a.TimeTakenSecs,
				NationalRank:  int32(i + 1),
				DistrictRank:  districtCounters[dist],
				District:      a.District,
			})
		}

		s.papersSvc.InvalidateLeaderboardCache(ctx, paperID)
		s.log.Info("[Cron] Daily rankings computed", zap.String("paper_id", idStr), zap.Int("count", len(attempts)))
	}
}

// markingSchemeJob releases marking schemes for yesterday's papers at SLST midnight.
// Mirrors cron.service.js:startMarkingSchemeJob (30 18 * * *).
func (s *Scheduler) markingSchemeJob() {
	ctx := context.Background()
	rows, err := s.pool.Query(ctx,
		`UPDATE papers
		 SET ms_available = TRUE, ms_available_at = NOW()
		 WHERE ms_available = FALSE
		   AND available_from::date = (NOW() AT TIME ZONE 'Asia/Colombo')::date - INTERVAL '1 day'
		   AND is_published = TRUE
		 RETURNING id`,
	)
	if err != nil {
		s.log.Error("[Cron] Marking scheme job failed", zap.Error(err))
		return
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		count++
	}
	if count > 0 {
		s.log.Info("[Cron] Marking schemes released", zap.Int("count", count))
	}
}

// otpCleanupJob removes expired OTP rows older than 1 hour.
// Mirrors cron.service.js:startOTPCleanupJob (0 1 * * *).
func (s *Scheduler) otpCleanupJob() {
	ctx := context.Background()
	tag, err := s.pool.Exec(ctx, `DELETE FROM otps WHERE expires_at < NOW() - INTERVAL '1 hour'`)
	if err != nil {
		s.log.Error("[Cron] OTP cleanup failed", zap.Error(err))
		return
	}
	s.log.Info("[Cron] Cleaned expired OTPs", zap.Int64("count", tag.RowsAffected()))
}

func parseUUID(s string) uuid.UUID {
	id, _ := uuid.Parse(s)
	return id
}
