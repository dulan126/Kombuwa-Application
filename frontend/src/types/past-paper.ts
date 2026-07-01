// ─── Past Paper Types ────────────────────────────────────────────────────────

export interface PastPaperSubject {
  subject_id: string;
  subject_name: string;
  topics: PastPaperTopic[];
}

export interface PastPaperTopic {
  topic_id: number;
  topic_name: string;
  years: PastPaperYear[];
}

export interface PastPaperYear {
  id: string;
  year: number;
  grade: string;
  mcqCount: number;
  essayCount: number;
  mcqMarks: number;
  essayMarks: number;
  markingSchemeAvailable: boolean;
  msMcqUploaded: boolean;
  hasEssayPdf: boolean;
  hasMsEssay: boolean;
}

export interface PastPaperQuestion {
  id: number;
  sort_order: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string | null;
}

export interface PastPaperQuestionsResponse {
  questions: PastPaperQuestion[];
  answersAvailable: boolean;
}

export interface PastPaperFilters {
  stream?: string;
  subject?: string;
  grade?: string;
  year?: string;
}
