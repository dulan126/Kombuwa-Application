package service

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/kombuwaedu/api/internal/httputil"
	"github.com/kombuwaedu/api/internal/repository"
)

// ForumService implements all forum business logic.
type ForumService struct {
	repo *repository.ForumRepo
	log  *zap.Logger
}

// NewForumService creates a ForumService.
func NewForumService(repo *repository.ForumRepo, log *zap.Logger) *ForumService {
	return &ForumService{repo: repo, log: log}
}

// ListThreadsResult is the paginated thread list response shape.
type ListThreadsResult struct {
	Threads []repository.ThreadListRow `json:"threads"`
	Total   int                        `json:"total"`
}

func (s *ForumService) ListThreads(ctx context.Context, f repository.ThreadListFilter) (*ListThreadsResult, error) {
	threads, total, err := s.repo.ListThreads(ctx, f)
	if err != nil {
		return nil, fmt.Errorf("list threads: %w", err)
	}
	if threads == nil {
		threads = []repository.ThreadListRow{}
	}
	return &ListThreadsResult{Threads: threads, Total: total}, nil
}

// ThreadDetailResult is the full thread + replies response.
type ThreadDetailResult struct {
	Thread  *repository.ThreadDetailRow `json:"thread"`
	Replies []repository.ReplyRow       `json:"replies"`
}

func (s *ForumService) GetThread(ctx context.Context, threadID uuid.UUID) (*ThreadDetailResult, error) {
	thread, err := s.repo.GetThread(ctx, threadID)
	if err != nil {
		return nil, httputil.E(http.StatusNotFound, "Thread not found")
	}

	// Increment view count best-effort (don't fail request if this errors)
	if err := s.repo.IncrementViewCount(ctx, threadID); err != nil {
		s.log.Warn("increment view count", zap.Error(err))
	}

	replies, err := s.repo.GetReplies(ctx, threadID)
	if err != nil {
		return nil, fmt.Errorf("get replies: %w", err)
	}
	if replies == nil {
		replies = []repository.ReplyRow{}
	}
	return &ThreadDetailResult{Thread: thread, Replies: replies}, nil
}

// CreateThreadInput carries the text fields for POST /forum/threads.
// Image URLs are resolved by the handler after saving uploads.
type CreateThreadInput struct {
	SubjectID string
	Title     string
	Body      string
	ImageURLs []string
}

type CreateThreadResult struct {
	ID        uuid.UUID `json:"id"`
	CreatedAt time.Time `json:"createdAt"`
}

func (s *ForumService) CreateThread(ctx context.Context, userID uuid.UUID, in CreateThreadInput) (*CreateThreadResult, error) {
	if len(in.ImageURLs) > 3 {
		return nil, httputil.E(http.StatusBadRequest, "Maximum 3 images allowed")
	}
	res, err := s.repo.CreateThread(ctx, userID, in.SubjectID, in.Title, in.Body, in.ImageURLs)
	if err != nil {
		return nil, fmt.Errorf("create thread: %w", err)
	}
	return &CreateThreadResult{ID: res.ID, CreatedAt: res.CreatedAt}, nil
}

type AddReplyResult struct {
	ID        uuid.UUID `json:"id"`
	CreatedAt time.Time `json:"createdAt"`
}

func (s *ForumService) AddReply(ctx context.Context, threadID, userID uuid.UUID, body string) (*AddReplyResult, error) {
	if len(body) < 5 {
		return nil, httputil.E(http.StatusBadRequest, "Reply body must be at least 5 characters")
	}
	id, createdAt, err := s.repo.AddReply(ctx, threadID, userID, body)
	if err != nil {
		return nil, fmt.Errorf("add reply: %w", err)
	}
	return &AddReplyResult{ID: id, CreatedAt: createdAt}, nil
}

func (s *ForumService) VerifyReply(ctx context.Context, replyID, verifierID uuid.UUID) error {
	if err := s.repo.VerifyReply(ctx, replyID, verifierID); err != nil {
		return httputil.E(http.StatusNotFound, "Reply not found")
	}
	return nil
}
