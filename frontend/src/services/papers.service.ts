import { apiClient } from './api-client';
import type {
  Paper,
  ExamPaperResponse,
  SubmitAnswersRequest,
  SubmitResult,
  MarkingSchemeResponse,
} from '@/types';

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
   * Get paper questions for exam (no correct answers).
   */
  async getPaperQuestions(paperId: string): Promise<ExamPaperResponse> {
    return apiClient.get<ExamPaperResponse>(`/papers/${paperId}/questions`);
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
};
