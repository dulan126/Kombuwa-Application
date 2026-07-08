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
  option_e: string;
  /** Only available in marking scheme, never during exam */
  correct_option?: AnswerOption;
  explanation?: string;
  image_url?: string;
  /** slot ("question"/"a"/"b"/"c"/"d"/"e") → gated image URL. Sparse. */
  images?: Partial<Record<'question' | 'a' | 'b' | 'c' | 'd' | 'e', string>>;
}

export type AnswerOption = '1' | '2' | '3' | '4' | '5';

export interface ExamPaperResponse {
  paper: Pick<Paper, 'id' | 'type' | 'title' | 'subject_id' | 'subject_name' | 'grade' | 'time_seconds' | 'question_count' | 'available_until'>;
  questions: Question[];
}

/** Server-side attempt state machine (mirrors the Go ExamStatus). */
export type AttemptStatus = 'not_started' | 'in_progress' | 'submitted' | 'expired';

type ExamPaperSummary = Pick<
  Paper,
  'id' | 'type' | 'title' | 'subject_id' | 'subject_name' | 'grade' | 'time_seconds' | 'question_count' | 'available_from' | 'available_until'
>;

/** Pre-start lobby payload — deliberately carries NO questions and NO answers. */
export interface ExamOverviewResponse {
  paper: ExamPaperSummary;
  status: AttemptStatus;
  remaining_seconds: number;
}

/** Returned only after a server-validated start. Questions never include answers. */
export interface ExamStartResponse {
  paper: ExamPaperSummary;
  questions: Question[];
  status: AttemptStatus;
  remaining_seconds: number;
  started_at: string;
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

// ─── Past-paper practice (multi-attempt, elapsed timing) ─────────────────────

export type PaperPdfSlot = 'structured' | 'essay' | 'answers';

/** One past paper in the student subject list. */
export interface PracticePaperCard {
  id: string;
  title: string;
  subject_id: string;
  subject_name: string;
  grade: string;
  question_count: number;
  has_mcq: boolean;
  has_structured_pdf: boolean;
  has_essay_pdf: boolean;
  has_answers_pdf: boolean;
  attempt_count: number;
  best_score?: number;
}

/** Pre-start landing for one past paper. */
export interface PracticeOverviewResponse {
  paper: ExamPaperSummary;
  parts: { has_mcq: boolean; has_structured_pdf: boolean; has_essay_pdf: boolean; has_answers_pdf: boolean };
  attempt_count: number;
  best_score?: number;
  pdfs?: Partial<Record<PaperPdfSlot, string>>;
}

/** Returned after starting a practice attempt (no answers). */
export interface PracticeStartResponse {
  paper: ExamPaperSummary;
  questions: Question[];
  attempt_id: string;
  started_at: string;
}

/** Graded practice result with per-question review (answers revealed post-submit). */
export interface PracticeSubmitResult {
  attempt_id: string;
  score: number;
  total: number;
  percentage: number;
  timeTakenSecs: number;
  review: (Question & { studentAnswer: AnswerOption | null })[];
}

export interface PracticeAttempt {
  id: string;
  score: number;
  total_questions: number;
  time_taken_secs: number | null;
  submitted_at?: string;
  started_at: string;
  is_completed: boolean;
}

export interface PracticeHistoryPage {
  attempts: PracticeAttempt[];
  total: number;
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
