// ─── Paper & Exam Types ──────────────────────────────────────────────────────

import type { Grade } from './auth';

export type PaperType = 'daily' | 'srp';

export interface Paper {
  id: string;
  type: PaperType;
  subject_id: string;
  subject_name?: string;
  grade: Grade;
  title: string;
  question_count: number;
  time_seconds: number;
  available_from?: string;
  available_until?: string;
  ms_available: boolean;
  ms_available_at?: string;
  /** Whether the current user has completed this paper */
  done: boolean | null;
  /** User's score on this paper (null if not attempted) */
  score: number | null;
  submitted_at?: string;
}

export interface Question {
  id?: string;
  sort_order: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  /** Only available in marking scheme, never during exam */
  correct_option?: AnswerOption;
  explanation?: string;
  image_url?: string;
}

export type AnswerOption = 'A' | 'B' | 'C' | 'D';

export interface ExamPaperResponse {
  paper: Pick<Paper, 'id' | 'type' | 'title' | 'subject_id' | 'subject_name' | 'grade' | 'time_seconds' | 'question_count' | 'available_until'>;
  questions: Question[];
}

export interface SubmitAnswersRequest {
  answers: Record<string, AnswerOption>;
}

export interface SubmitResult {
  score: number;
  total: number;
  percentage: number;
  timeTakenSecs: number;
  rank: RankInfo | null;
  demoMode?: boolean;
}

export interface RankInfo {
  national_rank: number | null;
  district_rank: number | null;
}

export interface MarkingSchemeResponse {
  questions: (Question & { studentAnswer: AnswerOption | null })[];
  studentScore: number | null;
  totalQuestions: number;
}

// ─── Exam Engine State ───────────────────────────────────────────────────────

export type ExamStatus = 'idle' | 'loading' | 'active' | 'submitting' | 'submitted';

export interface ExamState {
  status: ExamStatus;
  paperId: string | null;
  paper: ExamPaperResponse['paper'] | null;
  questions: Question[];
  currentQuestionIndex: number;
  answers: Record<number, number>; // questionIndex → optionIndex (0-3)
  timeLeftSeconds: number;
  result: SubmitResult | null;
}
