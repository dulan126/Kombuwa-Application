import { apiClient } from './api-client';
import type {
  Paper,
  ExamOverviewResponse,
  ExamStartResponse,
  SubmitAnswersRequest,
  SubmitResult,
  MarkingSchemeResponse,
  PracticePaperCard,
  PracticeOverviewResponse,
  PracticeStartResponse,
  PracticeSubmitResult,
  PracticeHistoryPage,
  PaperPdfSlot,
} from '@/types';

export interface UserStats {
  papers_attempted: number;
  avg_score_pct: number;
  national_rank: number | null;
  day_streak: number;
}

// ─── Papers Service ──────────────────────────────────────────────────────────

export const papersService = {
  /**
   * Get list of papers for the current user, optionally filtered.
   */
  async getPapers(filters?: {
    type?: string;
    subject?: string;
    grade?: string;
  }): Promise<Paper[]> {
    const params = new URLSearchParams();
    if (filters?.type) params.set('type', filters.type);
    if (filters?.subject) params.set('subject', filters.subject);
    if (filters?.grade) params.set('grade', filters.grade);
    const qs = params.toString();
    return apiClient.get<Paper[]>(`/papers${qs ? '?' + qs : ''}`);
  },

  /**
   * Pre-start lobby data. Returns paper summary + attempt status only —
   * never questions or answers. Does not consume the attempt.
   */
  async getExamOverview(paperId: string): Promise<ExamOverviewResponse> {
    return apiClient.get<ExamOverviewResponse>(`/papers/${paperId}/overview`);
  },

  /**
   * Server-validated start. Consumes the single attempt (idempotent for an
   * in-progress attempt) and returns questions without answers, plus the
   * server-anchored remaining time.
   */
  async startExam(paperId: string): Promise<ExamStartResponse> {
    return apiClient.post<ExamStartResponse>(`/papers/${paperId}/start`, {});
  },

  /**
   * Submit exam answers. Server scores and returns result + rank.
   */
  async submitPaper(paperId: string, data: SubmitAnswersRequest): Promise<SubmitResult> {
    return apiClient.post<SubmitResult>(`/papers/${paperId}/submit`, data);
  },

  /**
   * Get marking scheme (correct answers) for a completed paper.
   */
  async getMarkingScheme(paperId: string): Promise<MarkingSchemeResponse> {
    return apiClient.get<MarkingSchemeResponse>(`/papers/${paperId}/marking-scheme`);
  },

  /**
   * Get the current user's stats (papers attempted, avg score, rank, streak).
   */
  async getUserStats(): Promise<UserStats> {
    return apiClient.get<UserStats>('/users/me/stats');
  },

  // ─── Past-paper practice (multi-attempt, elapsed) ──────────────────────────

  /** List published past papers in a subject with the student's practice stats. */
  async getPracticePapers(subject: string, grade?: string): Promise<PracticePaperCard[]> {
    const params = new URLSearchParams({ subject });
    if (grade) params.set('grade', grade);
    return apiClient.get<PracticePaperCard[]>(`/papers/practice-list?${params.toString()}`);
  },

  /** Landing data for one past paper (parts present, attempt stats, PDFs). */
  async getPracticeOverview(paperId: string): Promise<PracticeOverviewResponse> {
    return apiClient.get<PracticeOverviewResponse>(`/papers/${paperId}/practice/overview`);
  },

  /** Start a NEW practice attempt — returns questions (no answers) + attempt id. */
  async startPractice(paperId: string): Promise<PracticeStartResponse> {
    return apiClient.post<PracticeStartResponse>(`/papers/${paperId}/practice/start`, {});
  },

  /** Submit a practice attempt; server grades + times it and returns a review. */
  async submitPractice(paperId: string, attemptId: string, data: SubmitAnswersRequest): Promise<PracticeSubmitResult> {
    return apiClient.post<PracticeSubmitResult>(`/papers/${paperId}/practice/${attemptId}/submit`, data);
  },

  /** Paginated attempt history for a past paper. */
  async getPracticeAttempts(paperId: string, page = 1, limit = 20): Promise<PracticeHistoryPage> {
    return apiClient.get<PracticeHistoryPage>(`/papers/${paperId}/practice/attempts?page=${page}&limit=${limit}`);
  },

  /** Browser URL for a past paper's reference PDF (same-origin, gated). */
  paperPdfUrl(paperId: string, slot: PaperPdfSlot): string {
    return `/api/papers/${paperId}/pdf/${slot}`;
  },
};
