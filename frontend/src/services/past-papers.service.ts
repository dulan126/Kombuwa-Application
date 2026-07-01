import { apiClient } from './api-client';
import type { PastPaperSubject, PastPaperQuestionsResponse } from '@/types';
import { API_BASE_URL } from '@/lib/constants';

// ─── Past Papers Service ─────────────────────────────────────────────────────

export const pastPapersService = {
  /**
   * Get past papers tree (subjects → topics → years).
   */
  async getPastPapers(filters?: {
    subject?: string;
    grade?: string;
    year?: string;
  }): Promise<PastPaperSubject[]> {
    const params = new URLSearchParams();
    if (filters?.subject) params.set('subject', filters.subject);
    if (filters?.grade) params.set('grade', filters.grade);
    if (filters?.year) params.set('year', filters.year);
    const qs = params.toString();
    return apiClient.get<PastPaperSubject[]>(`/past-papers${qs ? '?' + qs : ''}`);
  },

  /**
   * Get questions for a specific past paper.
   */
  async getQuestions(ppId: string): Promise<PastPaperQuestionsResponse> {
    return apiClient.get<PastPaperQuestionsResponse>(`/past-papers/${ppId}/questions`);
  },

  /**
   * Get essay PDF download URL.
   */
  getEssayPdfUrl(ppId: string): string {
    return `${API_BASE_URL}/past-papers/${ppId}/essay-pdf`;
  },

  /**
   * Get marking scheme PDF download URL.
   */
  getMarkingSchemePdfUrl(ppId: string): string {
    return `${API_BASE_URL}/past-papers/${ppId}/marking-scheme-pdf`;
  },
};
