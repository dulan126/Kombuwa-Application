'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, FileText, Clock, RotateCcw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { papersService } from '@/services/papers.service';
import { Pagination } from '@/components/ui/Pagination';
import { QuestionImage } from '@/components/exam/QuestionImage';
import { isApiError } from '@/services/api-client';
import { cn } from '@/lib/utils';
import type {
  Question, AnswerOption, PracticeOverviewResponse, PracticeSubmitResult, PracticeAttempt,
} from '@/types';

const OPTIONS = ['1', '2', '3', '4', '5'] as const;
type OptionKey = (typeof OPTIONS)[number];
const OPTION_FIELDS: Record<OptionKey, keyof Question> = { '1': 'option_a', '2': 'option_b', '3': 'option_c', '4': 'option_d', '5': 'option_e' };
const OPTION_SLOTS: Record<OptionKey, 'a' | 'b' | 'c' | 'd' | 'e'> = { '1': 'a', '2': 'b', '3': 'c', '4': 'd', '5': 'e' };

function fmtDuration(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return h > 0 ? `${h}:${mm}` : mm;
}

// ── Per-question review (answers revealed only after submit) ──────────────────

function ReviewList({ questions }: { questions: PracticeSubmitResult['review'] }) {
  return (
    <div className="mt-4 flex flex-col gap-2.5">
      {questions.map((q, i) => {
        const ca = (q.correct_option || 'A') as AnswerOption;
        const ua = q.studentAnswer ?? null;
        const opts = [q.option_a, q.option_b, q.option_c, q.option_d, q.option_e];
        return (
          <div key={i} className="border border-border-dim rounded-[12px] p-4 bg-dark">
            <div className="text-[9px] text-text-muted mb-1">Question {i + 1}</div>
            <div className="text-[13px] text-text-primary leading-[1.75] mb-3">{q.question_text}</div>
            {q.images?.question && <div className="mb-3"><QuestionImage src={q.images.question} alt={`Question ${i + 1} image`} /></div>}
            <div className="flex flex-col gap-1">
              {opts.map((o, j) => {
                const letter = '12345'[j] as AnswerOption;
                const optImg = q.images?.[('abcde'[j]) as 'a' | 'b' | 'c' | 'd' | 'e'];
                const isCorrect = letter === ca;
                const isWrong = ua && letter === ua && ua !== ca;
                return (
                  <div key={letter} className={cn('flex items-center gap-2 px-2.5 py-1.5 rounded-sm text-[12.5px]',
                    isCorrect ? 'bg-success/8 border border-success/25' : isWrong ? 'bg-danger/6 border border-danger/20' : 'bg-transparent border border-transparent')}>
                    <div className={cn('w-5.5 h-5.5 rounded-[5px] flex items-center justify-center text-[10px] font-bold shrink-0',
                      isCorrect ? 'bg-success/20 text-success' : isWrong ? 'bg-danger/20 text-danger' : 'bg-white/6 text-text-muted')}>
                      {letter}
                    </div>
                    <span className="flex-1 flex flex-col gap-1 min-w-0">
                      {o && <span className="text-text-primary">{o}</span>}
                      {optImg && <QuestionImage src={optImg} alt={`Option ${letter}`} className="max-h-32 max-w-full rounded-[6px] border border-border-dim object-contain" />}
                    </span>
                    {isCorrect && <span className="text-[10px] text-success font-bold shrink-0">✓ Correct</span>}
                    {isWrong && <span className="text-[10px] text-danger shrink-0">✗ Your answer</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Phase = 'overview' | 'running' | 'result';

export default function PastPaperPracticePage() {
  const { subjectId, paperId } = useParams<{ subjectId: string; paperId: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [phase, setPhase] = useState<Phase>('overview');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<PracticeOverviewResponse | null>(null);

  // Running state
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, OptionKey>>({});
  const [elapsed, setElapsed] = useState(0);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const startedAtRef = useRef<number>(0);

  const [result, setResult] = useState<PracticeSubmitResult | null>(null);

  // Attempt history
  const [history, setHistory] = useState<PracticeAttempt[]>([]);
  const [histTotal, setHistTotal] = useState(0);
  const [histPage, setHistPage] = useState(1);
  const HIST_LIMIT = 10;

  const loadOverview = useCallback(async () => {
    try {
      const ov = await papersService.getPracticeOverview(paperId);
      setOverview(ov);
    } catch {
      showToast('Failed to load past paper', 'error');
    } finally {
      setLoading(false);
    }
  }, [paperId, showToast]);

  const loadHistory = useCallback(async () => {
    try {
      const h = await papersService.getPracticeAttempts(paperId, histPage, HIST_LIMIT);
      setHistory(h.attempts ?? []);
      setHistTotal(h.total ?? 0);
    } catch { /* ignore */ }
  }, [paperId, histPage]);

  useEffect(() => { if (user) loadOverview(); }, [user, loadOverview]);
  useEffect(() => { if (user && phase === 'overview') loadHistory(); }, [user, phase, loadHistory]);

  // Count-up stopwatch (display only — server times the attempt authoritatively).
  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [phase]);

  async function handleStart() {
    if (starting) return;
    setStarting(true);
    try {
      const data = await papersService.startPractice(paperId);
      setAttemptId(data.attempt_id);
      setQuestions(data.questions ?? []);
      setAnswers({});
      setCurrent(0);
      startedAtRef.current = Date.now();
      setElapsed(0);
      setResult(null);
      setPhase('running');
    } catch (err) {
      showToast(isApiError(err) ? err.message : 'Failed to start practice', 'error');
    } finally {
      setStarting(false);
    }
  }

  const handleSubmit = useCallback(async () => {
    if (!attemptId || submitting) return;
    setSubmitting(true);
    const letterAnswers: Record<string, AnswerOption> = {};
    Object.entries(answers).forEach(([k, v]) => { letterAnswers[k] = v; });
    try {
      const res = await papersService.submitPractice(paperId, attemptId, { answers: letterAnswers });
      setResult(res);
      setPhase('result');
    } catch (err) {
      showToast(isApiError(err) ? err.message : 'Failed to submit', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [attemptId, answers, paperId, submitting, showToast]);

  const backLink = `/subject/${subjectId}/past-papers`;
  const answeredCount = Object.keys(answers).length;

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-text-muted text-[13px]">Loading…</div>;
  }
  if (!overview) {
    return (
      <div className="text-center py-14">
        <div className="text-[13px] text-text-muted mb-3">Past paper not found.</div>
        <Link href={backLink} className="text-[12.5px] text-gold no-underline">← Back to Past Papers</Link>
      </div>
    );
  }

  // ── Result ───────────────────────────────────────────────────────────────
  if (phase === 'result' && result) {
    const pct = result.percentage;
    return (
      <div className="max-w-[760px]">
        <div className="bg-white rounded-[18px] border border-border-dim p-7 mb-4 text-center">
          <div className="text-[10.5px] font-bold tracking-[1.5px] uppercase text-text-muted mb-2.5">Practice Result</div>
          <div className="text-[3.4rem] font-bold text-gold leading-none" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            {result.score}/{result.total}
          </div>
          <div className="text-[12.5px] text-text-muted mt-1.5">{pct}% · took {fmtDuration(result.timeTakenSecs)}</div>
        </div>

        <div className="flex gap-2.5 flex-wrap mb-2">
          <button onClick={handleStart} disabled={starting}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-gold text-white text-[12.5px] font-semibold cursor-pointer border-none hover:bg-gold-dark transition-colors disabled:opacity-60">
            <RotateCcw size={14} /> {starting ? 'Starting…' : 'Try again'}
          </button>
          <Link href={backLink} className="px-5 py-2 rounded-full border border-border-dim text-[12.5px] font-semibold text-text-primary bg-white no-underline hover:border-gold transition-colors">
            ← Past Papers
          </Link>
        </div>

        <div className="bg-white rounded-[14px] border border-border-dim p-4">
          <div className="text-[12px] font-semibold text-text-primary">Answer Review</div>
          <ReviewList questions={result.review} />
        </div>
      </div>
    );
  }

  // ── Running ──────────────────────────────────────────────────────────────
  if (phase === 'running') {
    const q = questions[current];
    if (!q) return <div className="text-center py-10 text-text-muted text-[13px]">No questions.</div>;
    return (
      <div className="max-w-[780px]">
        <div className="flex items-center justify-between rounded-[20px] mb-5" style={{ background: 'linear-gradient(115deg, #6f73d6, #8b90f0 60%, #6cd4da)', padding: '18px 24px' }}>
          <div>
            <div className="font-bold text-white text-[16px]" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Past Paper Practice</div>
            <div className="text-[12px] text-white/80 mt-0.5">Q {current + 1} / {questions.length} · no time limit</div>
          </div>
          <div className="flex items-center gap-2 text-white">
            <Clock size={16} />
            <span className="text-[22px] font-bold font-mono leading-none" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{fmtDuration(elapsed)}</span>
          </div>
        </div>

        <div className="h-1.5 bg-border-dim rounded-full mb-5 overflow-hidden">
          <div className="h-full bg-gold rounded-full transition-all" style={{ width: `${((current + 1) / questions.length) * 100}%` }} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-[14px] border border-border-dim p-6 mb-4">
              <div className="text-[10.5px] text-text-muted font-semibold tracking-wide uppercase mb-3">Question {current + 1}</div>
              <p className="text-[14px] text-text-primary leading-[1.8] mb-3">{q.question_text}</p>
              {q.images?.question && <div className="mb-5"><QuestionImage src={q.images.question} alt={`Question ${current + 1}`} /></div>}
              <div className="flex flex-col gap-2.5">
                {OPTIONS.map((opt) => {
                  const text = (q[OPTION_FIELDS[opt]] as string) ?? '';
                  const optImg = q.images?.[OPTION_SLOTS[opt]];
                  const isSelected = answers[current] === opt;
                  return (
                    <button key={opt} className={cn('answer-option text-left font-[inherit]', isSelected ? 'selected' : '')}
                      onClick={() => setAnswers((prev) => ({ ...prev, [current]: opt }))}>
                      <span className="w-7 h-7 rounded-full flex items-center justify-center text-[11.5px] font-bold shrink-0"
                        style={{ background: isSelected ? '#8b90f0' : '#f6f6fc', color: isSelected ? '#fff' : '#9a9ab0' }}>{opt}</span>
                      <span className="flex flex-col gap-1.5 min-w-0">
                        {text && <span className="text-[13px] text-text-primary">{text}</span>}
                        {optImg && <QuestionImage src={optImg} alt={`Option ${opt}`} className="max-h-40 max-w-full rounded-[8px] border border-border-dim object-contain" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0}
                className="px-5 py-2 rounded-full border border-border-dim text-[12.5px] font-medium text-text-primary disabled:opacity-40 cursor-pointer hover:border-gold transition-colors bg-white disabled:cursor-not-allowed font-[inherit]">← Previous</button>
              {current < questions.length - 1 ? (
                <button onClick={() => setCurrent((c) => c + 1)}
                  className="flex-1 py-2 rounded-full bg-gold text-white text-[12.5px] font-semibold cursor-pointer border-none hover:bg-gold-dark transition-colors font-[inherit]">Next →</button>
              ) : (
                <button onClick={handleSubmit} disabled={submitting}
                  className="flex-1 py-2 rounded-full bg-success text-white text-[12.5px] font-semibold cursor-pointer border-none hover:bg-success-dark transition-colors font-[inherit] disabled:opacity-60">
                  {submitting ? 'Submitting…' : 'Submit'}
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-[14px] border border-border-dim p-4">
            <div className="text-[12px] font-semibold text-text-primary mb-3">Answer Palette</div>
            <div className="grid grid-cols-5 gap-1.5">
              {questions.map((_, i) => (
                <button key={i} onClick={() => setCurrent(i)}
                  className={cn('palette-cell font-[inherit]', i === current ? 'current' : answers[i] ? 'answered' : '')}>{i + 1}</button>
              ))}
            </div>
            <button onClick={handleSubmit} disabled={submitting}
              className="mt-5 w-full py-2.5 rounded-full bg-gold text-white text-[12.5px] font-semibold cursor-pointer border-none hover:bg-gold-dark transition-colors font-[inherit] disabled:opacity-60">
              Submit ({answeredCount}/{questions.length})
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Overview (default) ───────────────────────────────────────────────────
  const p = overview.paper;
  const totalPages = Math.ceil(histTotal / HIST_LIMIT);
  return (
    <div className="max-w-[760px]">
      <Link href={backLink} className="inline-flex items-center gap-1 text-[12px] text-text-muted hover:text-text-primary no-underline transition-colors mb-3">
        <ArrowLeft size={13} /> Past Papers
      </Link>

      <div className="rounded-lg p-7 mb-4 text-white" style={{ background: 'linear-gradient(115deg, #6f73d6, #8b90f0 60%, #6cd4da)' }}>
        <div className="text-[1.35rem] font-bold leading-snug mb-1" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{p.title}</div>
        <div className="text-white/80 text-[12.5px]">
          {p.grade && <>Grade {p.grade} · </>}{overview.parts.has_mcq && <>{p.question_count} MCQ · </>}Unlimited attempts · No time limit
        </div>
        {overview.parts.has_mcq && (
          <button onClick={handleStart} disabled={starting}
            className="mt-5 py-2.5 px-6 rounded-full bg-white text-gold font-bold text-[13.5px] cursor-pointer border-none hover:bg-white/90 transition-colors disabled:opacity-60">
            {starting ? 'Starting…' : overview.attempt_count > 0 ? 'Practice again →' : 'Start Practice →'}
          </button>
        )}
      </div>

      {/* Reference PDFs */}
      {(overview.parts.has_structured_pdf || overview.parts.has_essay_pdf || overview.parts.has_answers_pdf) && (
        <div className="bg-white rounded-[14px] border border-border-dim p-4 mb-4">
          <div className="text-[12px] font-semibold text-text-primary mb-2">Question Papers &amp; Answers</div>
          <div className="flex flex-wrap gap-2">
            {overview.parts.has_structured_pdf && (
              <a href={papersService.paperPdfUrl(p.id, 'structured')} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-dark border border-border-dim text-[12px] text-text-muted no-underline hover:border-gold hover:text-gold transition-colors">
                <FileText size={13} /> Structured Questions
              </a>
            )}
            {overview.parts.has_essay_pdf && (
              <a href={papersService.paperPdfUrl(p.id, 'essay')} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-dark border border-border-dim text-[12px] text-text-muted no-underline hover:border-gold hover:text-gold transition-colors">
                <FileText size={13} /> Essay Questions
              </a>
            )}
            {overview.parts.has_answers_pdf && (
              <a href={papersService.paperPdfUrl(p.id, 'answers')} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-success/8 border border-success/25 text-[12px] text-success no-underline hover:bg-success/15 transition-colors">
                <FileText size={13} /> View Answers
              </a>
            )}
          </div>
        </div>
      )}

      {/* Attempt history */}
      {histTotal > 0 && (
        <div className="bg-white rounded-[14px] border border-border-dim overflow-hidden">
          <div className="px-4 py-3 border-b border-border-dim text-[12px] font-semibold text-text-primary">
            Your Attempts ({histTotal})
          </div>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-border-dim bg-dark text-text-muted">
                <th className="text-left px-4 py-2 font-semibold">Date</th>
                <th className="text-left px-4 py-2 font-semibold">Score</th>
                <th className="text-left px-4 py-2 font-semibold">Time</th>
              </tr>
            </thead>
            <tbody>
              {history.map((a) => (
                <tr key={a.id} className="border-b border-border-dim last:border-0">
                  <td className="px-4 py-2 text-text-muted">{a.submitted_at ? new Date(a.submitted_at).toLocaleString() : '—'}</td>
                  <td className="px-4 py-2 font-semibold text-text-primary">{a.score}/{a.total_questions}</td>
                  <td className="px-4 py-2 text-text-muted">{a.time_taken_secs != null ? fmtDuration(a.time_taken_secs) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={histPage} totalPages={totalPages} onPage={setHistPage} />
        </div>
      )}
    </div>
  );
}
