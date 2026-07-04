import { apiClient } from './api-client';
import type {
  Paper,
  ExamOverviewResponse,
  ExamStartResponse,
  SubmitAnswersRequest,
  SubmitResult,
  MarkingSchemeResponse,
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
};
