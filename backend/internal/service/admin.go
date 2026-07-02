package service

import (
	"context"
	"fmt"
	"net/http"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/miedvance/api/internal/httputil"
	"github.com/miedvance/api/internal/repository"
)

// AdminService implements all admin business logic.
type AdminService struct {
	repo       *repository.AdminRepo
	papersRepo *repository.PapersRepo
	papersSvc  *PapersService
	log        *zap.Logger
}

// NewAdminService creates an AdminService.
func NewAdminService(
	repo *repository.AdminRepo,
	papersRepo *repository.PapersRepo,
	papersSvc *PapersService,
	log *zap.Logger,
) *AdminService {
	return &AdminService{repo: repo, papersRepo: papersRepo, papersSvc: papersSvc, log: log}
}

func (s *AdminService) GetStats(ctx context.Context) (*repository.Stats, error) {
	return s.repo.GetStats(ctx)
}

func (s *AdminService) ListPapers(ctx context.Context) ([]repository.AdminPaperRow, error) {
	return s.repo.ListAllPapers(ctx)
}

func (s *AdminService) SetPaperPublished(ctx context.Context, paperID uuid.UUID, publish bool) (map[string]any, error) {
	result, err := s.repo.SetPaperPublished(ctx, paperID, publish)
	if err != nil {
		return nil, fmt.Errorf("set published: %w", err)
	}
	return map[string]any{"id": paperID, "is_published": result}, nil
}

// TriggerRankings synchronously computes rankings for a paper (admin-initiated).
func (s *AdminService) TriggerRankings(ctx context.Context, paperID uuid.UUID) error {
	paper, err := s.papersRepo.GetPaper(ctx, paperID)
	if err != nil {
		return fmt.Errorf("get paper: %w", err)
	}
	if paper == nil {
		return httputil.E(http.StatusNotFound, "Paper not found")
	}

	attempts, err := s.papersRepo.GetCompletedAttempts(ctx, paperID)
	if err != nil {
		return fmt.Errorf("get attempts: %w", err)
	}
	if err := s.papersRepo.DeleteRankings(ctx, paperID); err != nil {
		return fmt.Errorf("delete rankings: %w", err)
	}

	districtCounters := map[string]int32{}
	for i, a := range attempts {
		nat := int32(i + 1)
		dist := "unknown"
		if a.District != nil {
			dist = *a.District
		}
		districtCounters[dist]++
		if err := s.papersRepo.UpsertRanking(ctx, repository.UpsertRankingParams{
			PaperID:       paperID,
			UserID:        a.UserID,
			Score:         a.Score,
			TimeTakenSecs: a.TimeTakenSecs,
			NationalRank:  nat,
			DistrictRank:  districtCounters[dist],
			District:      a.District,
		}); err != nil {
			return fmt.Errorf("upsert ranking: %w", err)
		}
	}

	s.papersSvc.InvalidateLeaderboardCache(ctx, paperID)
	s.log.Info("rankings triggered by admin", zap.String("paper_id", paperID.String()))
	return nil
}

func (s *AdminService) ListUsers(ctx context.Context, f repository.AdminUserFilter) ([]repository.AdminUserRow, error) {
	return s.repo.ListUsers(ctx, f)
}

func (s *AdminService) ListSubjectsWithTopics(ctx context.Context) ([]repository.SubjectWithTopics, error) {
	return s.repo.ListSubjectsWithTopics(ctx)
}

func (s *AdminService) CreateTopic(ctx context.Context, subjectID, nameSi string) (int32, error) {
	if subjectID == "" || len(nameSi) < 2 {
		return 0, httputil.E(http.StatusBadRequest, "subject_id and name_si (min 2 chars) are required")
	}
	return s.repo.CreateTopic(ctx, subjectID, nameSi)
}
