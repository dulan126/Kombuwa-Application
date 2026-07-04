import { apiClient } from './api-client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AdminStats {
  totalStudents: number;
  totalPapers: number;
  totalAttempts: number;
  totalThreads: number;
  dau: number;
  wau: number;
  topForumSubjects: { subject_id: string; cnt: number }[] | null;
}

export interface AdminPaper {
  id: string;
  type: string;
  subject_id: string;
  grade: string;
  title: string;
  question_count: number;
  is_published: boolean;
  ms_available: boolean;
  available_from: string | null;
  available_until: string | null;
  created_at: string;
  subject_name: string;
  attempt_count: number;
}

export interface Topic {
  id: number;
  subject_id: string;
  name_si: string;
  sort_order: number;
}

export interface PoolQuestion {
  id: number;
  slug: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  explanation?: string;
  image_url?: string;
  subject_id?: string;
  topic_id?: number | null;
  created_by?: string;
  created_at?: string;
}

export interface PaperQuestion extends PoolQuestion {
  sort_order: number;
}

export interface AdminUser {
  id: string;
  name: string;
  mobile: string;
  stream?: string;
  grade?: string;
  district?: string;
  school?: string;
  exam_year?: number;
  created_at: string;
  last_login?: string;
}

export interface Permission {
  code: string;
  description: string;
}

export interface CreateDraftPaperInput {
  type: string;
  subject_id: string;
  grade: string;
  title: string;
  time_seconds: number;
  available_from: string;
  available_until?: string;
}

export interface UpdatePaperInput {
  title?: string;
  subject_id?: string;
  grade?: string;
  time_seconds?: number;
  available_from?: string;
  available_until?: string;
}

export interface PoolQuestionInput {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  explanation?: string;
  image_url?: string;
  subject_id?: string;
  topic_id?: number | null;
  slug?: string;
}

export interface PoolQuestionsResponse {
  questions: PoolQuestion[];
  total: number;
}

export interface Stream {
  id: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
}

export interface Subject {
  id: string;
  name_si: string;
  stream_ids: string[];
}

export interface CreateStreamInput {
  id: string;
  name: string;
  icon: string;
  color: string;
  sort_order?: number;
}

export interface AdminPapersPage {
  papers: AdminPaper[];
  total: number;
}

export interface AdminUsersPage {
  users: AdminUser[];
  total: number;
}

// ─── Admin Service ────────────────────────────────────────────────────────────

export const adminService = {
  async getStats(): Promise<AdminStats> {
    return apiClient.get<AdminStats>('/admin/stats');
  },

  // Papers
  async listPapers(params?: { page?: number; limit?: number }): Promise<AdminPapersPage> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    const raw = await apiClient.get<AdminPaper[] | AdminPapersPage>(`/admin/papers${q ? '?' + q : ''}`);
    if (Array.isArray(raw)) return { papers: raw, total: raw.length };
    return raw;
  },

  async getPaper(id: string): Promise<AdminPaper> {
    return apiClient.get<AdminPaper>(`/admin/papers/${id}`);
  },

  async createDraftPaper(data: CreateDraftPaperInput): Promise<{ id: string }> {
    return apiClient.post<{ id: string }>('/admin/papers', data);
  },

  async updatePaper(id: string, data: UpdatePaperInput): Promise<AdminPaper> {
    return apiClient.patch<AdminPaper>(`/admin/papers/${id}`, data);
  },

  async deletePaper(id: string): Promise<void> {
    await apiClient.delete(`/admin/papers/${id}`);
  },

  async publishPaper(id: string, publish: boolean): Promise<void> {
    await apiClient.patch(`/admin/papers/${id}/publish`, { publish });
  },

  // Paper questions
  async listPaperQuestions(paperId: string): Promise<PaperQuestion[]> {
    return apiClient.get<PaperQuestion[]>(`/admin/papers/${paperId}/questions`);
  },

  async attachQuestion(paperId: string, body: { question_id: number } | PoolQuestionInput): Promise<PaperQuestion> {
    return apiClient.post<PaperQuestion>(`/admin/papers/${paperId}/questions`, body);
  },

  async reorderQuestion(paperId: string, questionId: number, sortOrder: number): Promise<void> {
    await apiClient.patch(`/admin/papers/${paperId}/questions/${questionId}`, { sort_order: sortOrder });
  },

  async detachQuestion(paperId: string, questionId: number): Promise<void> {
    await apiClient.delete(`/admin/papers/${paperId}/questions/${questionId}`);
  },

  // Question pool
  async listPoolQuestions(params?: {
    subject_id?: string;
    slug_contains?: string;
    page?: number;
    limit?: number;
  }): Promise<PoolQuestionsResponse> {
    const qs = new URLSearchParams();
    if (params?.subject_id) qs.set('subject_id', params.subject_id);
    if (params?.slug_contains) qs.set('slug_contains', params.slug_contains);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return apiClient.get<PoolQuestionsResponse>(`/admin/questions${q ? '?' + q : ''}`);
  },

  async createPoolQuestion(data: PoolQuestionInput): Promise<PoolQuestion> {
    return apiClient.post<PoolQuestion>('/admin/questions', data);
  },

  async updatePoolQuestion(id: number, data: PoolQuestionInput): Promise<PoolQuestion> {
    return apiClient.patch<PoolQuestion>(`/admin/questions/${id}`, data);
  },

  async deletePoolQuestion(id: number): Promise<void> {
    await apiClient.delete(`/admin/questions/${id}`);
  },

  // Users
  async listUsers(params?: { stream?: string; grade?: string; page?: number; limit?: number }): Promise<AdminUsersPage> {
    const qs = new URLSearchParams();
    if (params?.stream) qs.set('stream', params.stream);
    if (params?.grade) qs.set('grade', params.grade);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    const raw = await apiClient.get<AdminUser[] | AdminUsersPage>(`/admin/users${q ? '?' + q : ''}`);
    if (Array.isArray(raw)) return { users: raw, total: raw.length };
    return raw;
  },

  async updateUserRole(userId: string, role: string): Promise<void> {
    await apiClient.patch(`/admin/users/${userId}/role`, { role });
  },

  async updateUserStatus(userId: string, isActive: boolean): Promise<void> {
    await apiClient.patch(`/admin/users/${userId}/status`, { is_active: isActive });
  },

  // Streams
  async listStreams(): Promise<Stream[]> {
    return apiClient.get<Stream[]>('/admin/streams');
  },

  async createStream(data: CreateStreamInput): Promise<Stream> {
    return apiClient.post<Stream>('/admin/streams', data);
  },

  async deleteStream(id: string): Promise<void> {
    await apiClient.delete(`/admin/streams/${id}`);
  },

  async listStreamSubjects(streamId: string): Promise<Subject[]> {
    return apiClient.get<Subject[]>(`/admin/streams/${streamId}/subjects`);
  },

  async addSubjectToStream(streamId: string, subjectId: string): Promise<void> {
    await apiClient.post(`/admin/streams/${streamId}/subjects`, { subject_id: subjectId });
  },

  async removeSubjectFromStream(streamId: string, subjectId: string): Promise<void> {
    await apiClient.delete(`/admin/streams/${streamId}/subjects/${subjectId}`);
  },

  // Topics
  async listTopics(subjectId: string): Promise<Topic[]> {
    return apiClient.get<Topic[]>(`/admin/topics?subject_id=${encodeURIComponent(subjectId)}`);
  },

  async createTopic(data: { subject_id: string; name_si: string }): Promise<Topic> {
    return apiClient.post<Topic>('/admin/topics', data);
  },

  async deleteTopic(id: number): Promise<void> {
    await apiClient.delete(`/admin/topics/${id}`);
  },

  // Subjects
  async listSubjects(): Promise<Subject[]> {
    return apiClient.get<Subject[]>('/admin/subjects');
  },

  async createSubject(data: { id: string; name_si: string }): Promise<Subject> {
    return apiClient.post<Subject>('/admin/subjects', data);
  },

  async deleteSubject(id: string): Promise<void> {
    await apiClient.delete(`/admin/subjects/${id}`);
  },

  // Permissions
  async listPermissions(): Promise<Permission[]> {
    return apiClient.get<Permission[]>('/admin/permissions');
  },

  async getRolePermissions(role: string): Promise<{ role: string; permissions: string[] }> {
    return apiClient.get(`/admin/roles/${role}/permissions`);
  },

  async setRolePermissions(role: string, permissions: string[]): Promise<void> {
    await apiClient.put(`/admin/roles/${role}/permissions`, { permissions });
  },
};
