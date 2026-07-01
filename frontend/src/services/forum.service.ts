import { apiClient } from './api-client';
import { FORUM_FILTERS } from '@/lib/constants';
import type { Thread, ThreadDetailResponse, Reply } from '@/types';

// ─── Forum Service ───────────────────────────────────────────────────────────

export const forumService = {
  /**
   * Get forum threads with optional filtering.
   */
  async getThreads(filters?: {
    subject?: string;
    status?: string;
  }): Promise<{ threads: Thread[] }> {
    const params = new URLSearchParams();
    if (filters?.subject && filters.subject !== FORUM_FILTERS.ALL) params.set('subject', filters.subject);
    if (filters?.status) params.set('status', filters.status);
    const qs = params.toString();
    return apiClient.get<{ threads: Thread[] }>(`/forum/threads${qs ? '?' + qs : ''}`);
  },

  /**
   * Get a single thread with its replies.
   */
  async getThread(threadId: string): Promise<ThreadDetailResponse> {
    return apiClient.get<ThreadDetailResponse>(`/forum/threads/${threadId}`);
  },

  /**
   * Create a new forum thread.
   */
  async createThread(data: FormData): Promise<Thread> {
    return apiClient.post<Thread>('/forum/threads', data, true);
  },

  /**
   * Post a reply to a thread.
   */
  async postReply(threadId: string, body: string): Promise<Reply> {
    return apiClient.post<Reply>(`/forum/threads/${threadId}/replies`, { body });
  },
};
