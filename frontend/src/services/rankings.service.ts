import { apiClient } from './api-client';
import type { LeaderboardResponse } from '@/types';

// ─── Rankings Service ────────────────────────────────────────────────────────

export const rankingsService = {
  /**
   * Get leaderboard for a specific paper.
   */
  async getRankings(
    paperId: string,
    filters?: { district?: string; page?: number; limit?: number },
  ): Promise<LeaderboardResponse> {
    const params = new URLSearchParams();
    if (filters?.district) params.set('district', filters.district);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();
    return apiClient.get<LeaderboardResponse>(`/papers/${paperId}/rankings${qs ? '?' + qs : ''}`);
  },
};
