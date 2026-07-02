'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { useTimer } from '@/hooks/useTimer';
import { papersService } from '@/services/papers.service';
import { Modal } from '@/components/ui/Modal';
import { generateDemoPapers } from '@/lib/demo-data';
import { isApiError } from '@/services/api-client';
import { cn } from '@/lib/utils';
import type { Question, AnswerOption, SubmitResult } from '@/types';
import type { Stream } from '@/types/auth';

const TOTAL_SECONDS: Record<string, number> = { daily: 600, srp: 1800 };
const OPTIONS = ['A', 'B', 'C', 'D'] as const;
type OptionKey = (typeof OPTIONS)[number];
const OPTION_FIELDS: Record<OptionKey, keyof Question> = {
  A: 'option_a', B: 'option_b', C: 'option_c', D: 'option_d',
};

// ── TimerCircle ───────────────────────────────────────────────────────────────

function TimerCircle({ secs, total }: { secs: number; total: number }) {
  const pct = total > 0 ? secs / total : 0;
  const r = 26;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  const color = secs < 60 ? '#E25C5C' : secs < total * 0.25 ? '#f2994a' : '#8b90f0';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return (
    <div className="relative flex items-center justify-center" style={{ width: 68, height: 68 }}>
      <svg width={68} height={68} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={34} cy={34} r={r} fill="none" stroke="#ecebf6" strokeWidth={4} />
        <circle cx={34} cy={34} r={r} fill="none" stroke={color} strokeWidth={4}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }} />
      </svg>
      <span className="absolute text-[11px] font-bold" style={{ color, fontFamily: 'var(--font-space-grotesk)' }}>
        {m}:{String(s).padStart(2, '0')}
      </span>
    </div>
  );
}

// ── Exam Content ──────────────────────────────────────────────────────────────

function ExamContent() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoggedIn } = useAuth();
  const { showToast } = useToast();

  const paperType = (searchParams.get('type') ?? 'daily') as 'daily' | 'srp';
  const urlPaperId = searchParams.get('paperId');
  const totalSecs = TOTAL_SECONDS[paperType] ?? 600;
  const isSRP = paperType === 'srp';

  const [paperId, setPaperId] = useState<string | null>(urlPaperId);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, OptionKey>>({});
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showTimeUp, setShowTimeUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  const timer = useTimer({
    initialSeconds: totalSecs,
    onExpire: () => setShowTimeUp(true),
    autoStart: false,
  });

  useEffect(() => {
    if (!isLoggedIn) router.push('/login');
  }, [isLoggedIn, router]);

  useEffect(() => {
    if (!user) return;

    async function load() {
      setLoading(true);

      if (urlPaperId) {
        try {
          const data = await papersService.getPaperQuestions(urlPaperId);
          setPaperId(data.paper.id);
          setQuestions(data.questions);
          timer.reset(data.paper.time_seconds);
          timer.start();
          setLoading(false);
          return;
        } catch {
          // fall through to demo
        }
      }

      const stream = (user?.stream ?? 'phy') as Stream;
      const grade = parseInt(user?.grade ?? '12') as 12 | 13;
      const map = generateDemoPapers();
      const bucket = map[stream]?.[grade]?.[subjectId];
      if (bucket) {
        const papers = isSRP ? bucket.srp : bucket.daily;
        const paper = papers[0];
        if (paper) {
          setPaperId(paper.id);
          setQuestions(paper._qs);
        }
      }
      setIsDemo(true);
      timer.reset(totalSecs);
      timer.start();
      setLoading(false);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, subjectId, paperType]);

  const answeredCount = Object.keys(answers).length;
  const totalCount = questions.length;

  const handleSubmit = useCallback(async () => {
    setShowConfirm(false);
    setShowTimeUp(false);
    setLocked(true);
    setSubmitting(true);
    timer.pause();

    const letterAnswers: Record<string, AnswerOption> = {};
    Object.entries(answers).forEach(([k, v]) => {
      letterAnswers[k] = v as AnswerOption;
    });

    if (paperId && !isDemo) {
      try {
        const res = await papersService.submitPaper(paperId, { answers: letterAnswers });
        setResult(res);
        setSubmitting(false);
        return;
      } catch (err: unknown) {
        if (isApiError(err) && err.status === 409) {
          showToast('Already submitted', 'warning');
          router.push(`/subject/${subjectId}`);
          return;
        }
      }
    }

    // Local scoring (demo or API fallback)
    let sc = 0;
    questions.forEach((q, i) => {
      if (answers[i] === (q.correct_option as OptionKey)) sc++;
    });
    setResult({
      score: sc,
      total: totalCount,
      percentage: Math.round((sc / Math.max(totalCount, 1)) * 100),
      timeTakenSecs: totalSecs - timer.timeLeft,
      rank: {
        national_rank: Math.floor(Math.random() * 300) + 4,
        district_rank: Math.floor(Math.random() * 50) + 1,
      },
      demoMode: true,
    });
    setSubmitting(false);
  }, [answers, paperId, isDemo, questions, totalCount, totalSecs, timer, router, subjectId, showToast]);

  // ── Result view ──────────────────────────────────────────────────────────

  if (result) {
    const pct = result.percentage;
    const perf = pct >= 80 ? 'Excellent 🌟' : pct >= 60 ? 'Good 👍' : pct >= 40 ? 'Fair' : 'Keep going 💪';
    const totalParticipants = Math.floor(Math.random() * 4000) + 500;
    const topPct = Math.max(1, Math.round(((result.rank.national_rank || 50) / totalParticipants) * 100));

    return (
      <div className="max-w-[720px]">
        {isSRP && (
          <div className="bg-gradient-to-r from-gold/[0.12] to-gold/[0.03] border border-gold/[0.28] rounded-[14px] p-3 mb-4 text-[12.5px] text-gold font-bold">
            ⭐ SRP — Special Ranking Paper · Island-wide ranking
          </div>
        )}

        <div className="bg-white rounded-[18px] border border-border-dim p-7 mb-4 text-center">
          <div className="text-[10.5px] font-bold tracking-[1.5px] uppercase text-text-muted mb-2.5">
            {isSRP ? 'Special Ranking Paper' : 'Daily MCQ'}
            {result.demoMode ? ' · Demo Mode' : ''}
          </div>
          <div className="text-[3.4rem] font-bold text-gold leading-none" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            {result.score}/{result.total}
          </div>
          <div className="text-[12.5px] text-text-muted mt-1.5">{pct}% — {perf}</div>

          <div className="grid grid-cols-4 max-sm:grid-cols-2 gap-2.5 mt-5">
            <div className="bg-dark rounded-[10px] p-3 text-center">
              <div className="text-xl font-bold text-success">{result.score}</div>
              <div className="text-[9.5px] text-text-muted">Correct</div>
            </div>
            <div className="bg-dark rounded-[10px] p-3 text-center">
              <div className="text-xl font-bold text-danger">{result.total - result.score - (totalCount - answeredCount)}</div>
              <div className="text-[9.5px] text-text-muted">Wrong</div>
            </div>
            <div className="bg-dark rounded-[10px] p-3 text-center">
              <div className="text-xl font-bold text-warning">{totalCount - answeredCount}</div>
              <div className="text-[9.5px] text-text-muted">Skipped</div>
            </div>
            <div className="bg-dark rounded-[10px] p-3 text-center">
              <div className="text-xl font-bold text-gold">#{result.rank.national_rank || '—'}</div>
              <div className="text-[9.5px] text-text-muted">Rank</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[14px] border border-border-dim p-4 mb-4">
          <div className="text-[9.5px] font-bold tracking-[1px] uppercase text-text-muted mb-3">
            Rankings · {isSRP ? '⭐ SRP' : '📝 Daily'}
          </div>
          <div className="flex gap-6 flex-wrap">
            <div>
              <div className="text-xl font-bold text-gold">#{result.rank.national_rank || '—'}</div>
              <div className="text-[10.5px] text-text-muted">National</div>
            </div>
            <div>
              <div className="text-xl font-bold text-accent">#{result.rank.district_rank || '—'}</div>
              <div className="text-[10.5px] text-text-muted">District</div>
            </div>
            <div>
              <div className="text-xl font-bold text-text-primary">{totalParticipants.toLocaleString()}</div>
              <div className="text-[10.5px] text-text-muted">Participants</div>
            </div>
            <div>
              <div className="text-xl font-bold text-success">Top {topPct}%</div>
              <div className="text-[10.5px] text-text-muted">Percentile</div>
            </div>
          </div>
        </div>

        <div className="flex gap-2.5 flex-wrap">
          <button
            onClick={() => router.push(`/subject/${subjectId}`)}
            className="px-5 py-2 rounded-full border border-border-dim text-[12.5px] font-semibold text-text-primary bg-white cursor-pointer hover:border-gold transition-colors font-[inherit]"
          >
            ← Overview
          </button>
          <button
            onClick={() => router.push(`/subject/${subjectId}/leaderboard`)}
            className="px-5 py-2 rounded-full border border-border-dim text-[12.5px] font-semibold text-text-primary bg-white cursor-pointer hover:border-gold transition-colors font-[inherit]"
          >
            🏆 Leaderboard
          </button>
          <button
            onClick={() => router.push(`/subject/${subjectId}/marking-schemes`)}
            className="px-5 py-2 rounded-full bg-gold text-white text-[12.5px] font-semibold cursor-pointer border-none hover:bg-gold-dark transition-colors font-[inherit]"
          >
            📖 View Answers
          </button>
        </div>
      </div>
    );
  }

  // ── Auth guard ───────────────────────────────────────────────────────────

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="text-3xl">🔒</div>
        <div className="text-[14px] font-semibold text-text-primary">Sign in to take exams</div>
        <button
          onClick={() => router.push('/register')}
          className="px-5 py-2 rounded-full bg-gold text-white text-[13px] font-semibold border-none cursor-pointer font-[inherit]"
        >
          Register Free
        </button>
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-text-muted text-[13px]">
        Loading exam...
      </div>
    );
  }

  const q = questions[current];
  if (!q) {
    return (
      <div className="text-center py-10 text-text-muted text-[13px]">
        No questions available for this paper type.
      </div>
    );
  }

  // ── Exam view ────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[780px]">
      {/* Header */}
      <div className="flex items-center gap-4 mb-5">
        <button
          onClick={() => router.back()}
          className="text-[12px] text-text-muted hover:text-text-primary transition-colors bg-transparent border-none cursor-pointer font-[inherit]"
        >
          ← Back
        </button>
        <div className="flex-1 text-center">
          <span className="text-[12.5px] font-semibold text-text-primary">
            {isSRP ? '⭐ SRP · ' : '📝 Daily MCQ · '}
            Question {current + 1} / {questions.length}
          </span>
        </div>
        <TimerCircle secs={timer.timeLeft} total={totalSecs} />
      </div>

      {/* SRP banner */}
      {isSRP && (
        <div className="bg-gradient-to-r from-gold/[0.12] to-gold/[0.03] border border-gold/25 rounded-[10px] px-4 py-2 mb-4 text-[11px] text-gold font-bold flex items-center gap-2">
          ⭐ Special Ranking Paper · 30 Questions · 30 Minutes · Island-wide ranking
        </div>
      )}

      {/* Progress bar */}
      <div className="h-1.5 bg-border-dim rounded-full mb-5 overflow-hidden">
        <div
          className="h-full bg-gold rounded-full transition-all"
          style={{ width: `${((current + 1) / questions.length) * 100}%` }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Question card */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-[14px] border border-border-dim p-6 mb-4">
            <div className="text-[10.5px] text-text-muted font-semibold tracking-wide uppercase mb-3">
              Question {current + 1}
            </div>
            <p className="text-[14px] text-text-primary leading-[1.8] mb-6">{q.question_text}</p>

            <div className="flex flex-col gap-2.5">
              {OPTIONS.map((opt) => {
                const text = (q[OPTION_FIELDS[opt]] as string) ?? '';
                const isSelected = answers[current] === opt;
                return (
                  <button
                    key={opt}
                    disabled={locked}
                    className={cn(
                      'answer-option text-left font-[inherit]',
                      isSelected ? 'selected' : '',
                      locked ? 'cursor-default' : '',
                    )}
                    onClick={() => !locked && setAnswers((prev) => ({ ...prev, [current]: opt }))}
                  >
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[11.5px] font-bold shrink-0 transition-colors"
                      style={{
                        background: isSelected ? '#8b90f0' : '#f6f6fc',
                        color: isSelected ? '#fff' : '#9a9ab0',
                      }}
                    >
                      {opt}
                    </span>
                    <span className="text-[13px] text-text-primary">{text}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setCurrent((c) => Math.max(0, c - 1))}
              disabled={current === 0}
              className="px-5 py-2 rounded-full border border-border-dim text-[12.5px] font-medium text-text-primary disabled:opacity-40 cursor-pointer hover:border-gold transition-colors bg-white disabled:cursor-not-allowed font-[inherit]"
            >
              ← Previous
            </button>
            {current < questions.length - 1 ? (
              <button
                onClick={() => setCurrent((c) => c + 1)}
                className="flex-1 py-2 rounded-full bg-gold text-white text-[12.5px] font-semibold cursor-pointer border-none hover:bg-gold-dark transition-colors font-[inherit]"
              >
                Next →
              </button>
            ) : (
              <button
                onClick={() => setShowConfirm(true)}
                disabled={submitting}
                className="flex-1 py-2 rounded-full bg-success text-white text-[12.5px] font-semibold cursor-pointer border-none hover:bg-success-dark transition-colors font-[inherit] disabled:opacity-60"
              >
                Submit Exam
              </button>
            )}
          </div>
        </div>

        {/* Answer palette */}
        <div className="bg-white rounded-[14px] border border-border-dim p-4">
          <div className="text-[12px] font-semibold text-text-primary mb-3">Answer Palette</div>
          <div className="grid grid-cols-5 gap-1.5">
            {questions.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={cn(
                  'palette-cell font-[inherit]',
                  i === current ? 'current' : answers[i] ? 'answered' : '',
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            {[
              { cls: 'answered', label: 'Answered' },
              { cls: 'current', label: 'Current' },
              { cls: '', label: 'Unanswered' },
            ].map(({ cls, label }) => (
              <div key={label} className="flex items-center gap-2">
                <div
                  className={cn('palette-cell pointer-events-none', cls)}
                  style={{ width: 24, height: 24, fontSize: 10, flexShrink: 0 }}
                />
                <span className="text-[11px] text-text-muted">{label}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => setShowConfirm(true)}
            disabled={submitting}
            className="mt-5 w-full py-2.5 rounded-full bg-gold text-white text-[12.5px] font-semibold cursor-pointer border-none hover:bg-gold-dark transition-colors font-[inherit] disabled:opacity-60"
          >
            Submit ({answeredCount}/{questions.length})
          </button>
        </div>
      </div>

      {/* Confirm Modal */}
      <Modal isOpen={showConfirm} onClose={() => setShowConfirm(false)} maxWidth="max-w-[380px]">
        <div className="text-center">
          <h2 className="text-lg font-bold mb-1.5">Submit Exam?</h2>
          <p className="text-xs text-text-muted mb-5 leading-relaxed">
            {answeredCount < totalCount
              ? `${totalCount - answeredCount} question(s) unanswered. You cannot change answers after submitting.`
              : 'You cannot change your answers after submitting.'}
          </p>
          <div className="flex gap-2.5 justify-center">
            <button
              onClick={() => setShowConfirm(false)}
              className="px-5 py-2 rounded-full border border-border-dim text-[12.5px] font-semibold text-text-primary bg-white cursor-pointer hover:border-gold transition-colors font-[inherit]"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="px-5 py-2 rounded-full bg-gold text-white text-[12.5px] font-semibold cursor-pointer border-none hover:bg-gold-dark transition-colors font-[inherit]"
            >
              Yes, Submit
            </button>
          </div>
        </div>
      </Modal>

      {/* Time Up Modal */}
      <Modal isOpen={showTimeUp} onClose={() => {}} maxWidth="max-w-[340px]">
        <div className="text-center">
          <div className="text-[2.8rem] mb-2">⏰</div>
          <h2 className="text-lg font-bold mb-1.5">Time&apos;s Up!</h2>
          <p className="text-xs text-text-muted mb-4">Your exam was automatically submitted.</p>
          <button
            onClick={handleSubmit}
            className="px-5 py-2 rounded-full bg-gold text-white text-[12.5px] font-semibold cursor-pointer border-none hover:bg-gold-dark transition-colors font-[inherit]"
          >
            View Results
          </button>
        </div>
      </Modal>
    </div>
  );
}

// Suspense wrapper required for useSearchParams
export default function ExamPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh] text-text-muted text-[13px]">
        Loading...
      </div>
    }>
      <ExamContent />
    </Suspense>
  );
}
