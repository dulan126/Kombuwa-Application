// ─── Forum Types ─────────────────────────────────────────────────────────────

export interface Thread {
  id: string;
  subject_id: string;
  subject_name: string;
  title: string;
  body?: string;
  status: ThreadStatus;
  view_count: number;
  reply_count: number;
  author_name: string;
  author_role?: string;
  image_urls?: string[];
  created_at: string;
}

export type ThreadStatus = 'resolved' | 'pending';

export interface Reply {
  id: string;
  body: string;
  is_verified: boolean;
  name: string;
  author_role?: string;
  role?: string;
  created_at?: string;
}

export interface ThreadDetailResponse {
  thread: Thread;
  replies: Reply[];
}

export interface CreateThreadRequest {
  subject_id: string;
  title: string;
  body: string;
  images?: File[];
}

export interface CreateReplyRequest {
  body: string;
}

export type ForumFilter = 'all' | string; // 'all' | subject_id | 'resolved' | 'pending'
