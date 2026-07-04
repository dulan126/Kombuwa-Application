'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { useTimer } from '@/hooks/useTimer';
import { useExamGuard } from '@/hooks/useExamGuard';
import { papersService } from '@/services/papers.service';
import { Modal } from '@/components/ui/Modal';
import { isApiError } from '@/services/api-client';
import { cn } from '@/lib/utils';
import type { Question, AnswerOption, SubmitResult, Paper, ExamOverviewResponse } from '@/types';

const LEAVE_WARNING =
  'Leave the exam? Your attempt has already started and the timer keeps running while you are away.';

const TOTAL_SECONDS: Record<string, number> = { daily: 1200, srp: 7200 };
const OPTIONS = ['A', 'B', 'C', 'D'] as const;
type OptionKey = (typeof OPTIONS)[number];
const OPTION_FIELDS: Record<OptionKey, keyof Question> = {
  A: 'option_a', B: 'option_b', C: 'option_c', D: 'option_d',
};

// ── SLST countdown (for daily window) ────────────────────────────────────────

function msUntilNextMidnightSLST(): number {
  const now = new Date();
  const slst = new Date(now.getTime() + now.getTimezoneOffset() * 60_000 + 330 * 60_000);
  const midnight = new Date(slst);
  midnight.setHours(24, 0, 0, 0);
  return Math.max(0, midnight.getTime() - slst.getTime());
}

function fmtHms(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function DailyWindowCountdown() {
  const [display, setDisplay] = useState(() => fmtHms(msUntilNextMidnightSLST()));
  useEffect(() => {
    const id = setInterval(() => setDisplay(fmtHms(msUntilNextMidnightSLST())), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono font-bold text-white">{display}</span>;
}

// ── SRP upcoming lobby (paper exists but window hasn't opened) ────────────────

function SRPUpcomingCard({ paper, onBack }: { paper: Paper; onBack: () => void }) {
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    function update() {
      if (!paper.available_from) { setCountdown('—'); return; }
      const ms = Math.max(0, new Date(paper.available_from).getTime() - Date.now());
      const s = Math.floor(ms / 1000);
      const days = Math.floor(s / 86400);
      const h = Math.floor((s % 86400) / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      const hms = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
      setCountdown(days >= 1 ? `${days}d ${hms}` : hms);
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [paper.available_from]);

  const startDate = paper.available_from
    ? new Date(paper.available_from).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    : '—';
  const mins = Math.round(paper.time_seconds / 60);

  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <div className="w-full max-w-105">
        <div
          className="rounded-lg p-8 text-center"
          style={{ background: 'linear-gradient(115deg, #6f73d6, #8b90f0 60%, #6cd4da)' }}
        >
          <div className="text-[3rem] mb-3">⭐</div>
          <div
            className="text-white font-bold text-[1.35rem] leading-snug mb-1"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            Get Ready — Special Ranking Paper
          </div>
          <div className="text-white/75 text-[12.5px] mb-5">
            {paper.question_count} Questions · {mins} Minutes · Island-wide Ranking
          </div>

          <div className="bg-white/15 rounded-xl p-5 mb-5">
            <div className="text-white/70 text-[11px] uppercase tracking-widest mb-2">
              Starts {startDate}
            </div>
            <div
              className="text-[2.8rem] font-bold text-white leading-none font-mono"
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            >
              {countdown || '—'}
            </div>
          </div>

          <div className="text-white/60 text-[12px]">
            Available Saturday 00:00 → Sunday 23:59 SLST
          </div>
        </div>

        <button
          onClick={onBack}
          className="w-full mt-3 py-2 text-[12px] text-text-muted hover:text-text-primary transition-colors bg-transparent border-none cursor-pointer font-[inherit]"
        >
          ← Back to Overview
        </button>
      </div>
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
  const [examPaper, setExamPaper] = useState<ExamOverviewResponse['paper'] | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, OptionKey>>({});
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [locked, setLocked] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showTimeUp, setShowTimeUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alreadyAttempted, setAlreadyAttempted] = useState<Paper | null>(null);
  const [upcomingPaper, setUpcomingPaper] = useState<Paper | null>(null);

  const timer = useTimer({
    initialSeconds: totalSecs,
    onExpire: () => setShowTimeUp(true),
    autoStart: false,
  });
  const [paperTotalSecs, setPaperTotalSecs] = useState(totalSecs);

  useEffect(() => {
    if (!isLoggedIn) router.push('/login');
  }, [isLoggedIn, router]);

  useEffect(() => {
    if (!user) return;

    async function load() {
      setLoading(true);

      let resolvedId: string | null = urlPaperId ?? null;

      if (!resolvedId) {
        try {
          const list = await papersService.getPapers({ type: paperType, subject: subjectId, grade: user?.grade });
          const nowMs = Date.now();

          // Live: started and window still open (or no window set)
          const live = list.find((p) => !p.done &&
            (p.available_from == null || new Date(p.available_from).getTime() <= nowMs) &&
            (p.available_until == null || new Date(p.available_until).getTime() > nowMs));

          // Upcoming: window hasn't opened yet — soonest first
          const upcoming = [...list]
            .filter((p) => !p.done && p.available_from != null && new Date(p.available_from).getTime() > nowMs)
            .sort((a, b) => new Date(a.available_from!).getTime() - new Date(b.available_from!).getTime())[0] ?? null;

          const done = list.find((p) => p.done === true);

          if (live) {
            resolvedId = live.id;
          } else if (upcoming) {
            setUpcomingPaper(upcoming);
            setLoading(false);
            return;
          } else if (done) {
            setAlreadyAttempted(done);
            setLoading(false);
            return;
          } else {
            setLoading(false);
            return;
          }
        } catch {
          showToast('Failed to load papers', 'error');
          setLoading(false);
          return;
        }
      }

      try {
        // Pre-start: fetch ONLY the overview (no questions, no answers).
        const overview = await papersService.getExamOverview(resolvedId);
        setPaperId(overview.paper.id);
        setExamPaper(overview.paper);
        setPaperTotalSecs(overview.paper.time_seconds);

        if (overview.status === 'submitted') {
          showToast('You have already completed this paper', 'info');
          router.push(`/subject/${subjectId}`);
          return;
        }
        if (overview.status === 'in_progress' || overview.status === 'expired') {
          // in_progress → resume on the same server clock.
          // expired → start() finalises the attempt server-side (auto-submit,
          //           score 0) and responds 403, handled by the catch below.
          const data = await papersService.startExam(overview.paper.id);
          setQuestions(data.questions ?? []);
          timer.reset(data.remaining_seconds);
          setStarted(true);
          timer.start();
          setLoading(false);
          return;
        }

        // not_started → show the lobby; questions are fetched only on "Start".
        setLoading(false);
      } catch (err: unknown) {
        if (isApiError(err) && err.status === 403) {
          showToast(
            (err as { message?: string }).message ?? (isSRP ? 'SRP paper is not available' : 'Daily MCQ window is closed'),
            'warning',
          );
        } else {
          showToast('Failed to load exam paper', 'error');
        }
        router.push(`/subject/${subjectId}`);
      }
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

    if (!paperId) {
      setSubmitting(false);
      return;
    }

    try {
      const res = await papersService.submitPaper(paperId, { answers: letterAnswers });
      setResult(res);
      setSubmitting(false);
    } catch (err: unknown) {
      if (isApiError(err) && err.status === 409) {
        showToast('Already submitted', 'warning');
        router.push(`/subject/${subjectId}`);
        return;
      }
      showToast('Failed to submit exam', 'error');
      setSubmitting(false);
    }
  }, [answers, paperId, timer, router, subjectId, showToast]);

  // Start consumes the single attempt server-side and returns the questions.
  const handleStart = useCallback(async () => {
    if (!paperId || starting) return;
    setStarting(true);
    try {
      const data = await papersService.startExam(paperId);
      setQuestions(data.questions ?? []);
      setPaperTotalSecs(data.paper.time_seconds);
      timer.reset(data.remaining_seconds);
      setStarted(true);
      timer.start();
    } catch (err: unknown) {
      if (isApiError(err) && err.status === 403) {
        showToast(
          (err as { message?: string }).message ?? 'This exam is no longer available',
          'warning',
        );
        router.push(`/subject/${subjectId}`);
        return;
      }
      showToast('Failed to start exam', 'error');
    } finally {
      setStarting(false);
    }
  }, [paperId, starting, timer, router, subjectId, showToast]);

  // Warn on leaving while the attempt is live (not before start, not after submit).
  useExamGuard(started && !result && !submitting, LEAVE_WARNING);

  // ── Already attempted (daily MCQ only once) ──────────────────────────────

  if (alreadyAttempted) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="w-full max-w-105">
          <div className="rounded-lg p-8 text-center" style={{ background: 'linear-gradient(115deg, #8b90f0, #a9adf5)' }}>
            <div className="text-[3rem] mb-3">✅</div>
            <div
              className="text-white font-bold text-[1.35rem] leading-snug mb-1"
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            >
              Already Completed
            </div>
            <div className="text-white/80 text-[13px] mb-4">
              You scored{' '}
              <span className="font-bold text-white">
                {alreadyAttempted.score ?? '—'}/{alreadyAttempted.question_count}
              </span>{' '}
              on {isSRP ? 'this Special Ranking Paper' : "today's Daily MCQ"}
            </div>

            {alreadyAttempted.ms_available ? (
              <button
                onClick={() => router.push(`/subject/${subjectId}/marking-schemes`)}
                className="w-full py-3 rounded-full bg-white text-gold font-bold text-[14px] cursor-pointer border-none hover:bg-white/90 transition-colors font-[inherit] mb-3"
              >
                📖 View Answers →
              </button>
            ) : (
              <div className="bg-white/15 rounded-xl p-4 mb-4">
                <div className="text-white/80 text-[11.5px] mb-1.5">🔒 Answers available after</div>
                <div className="flex items-center justify-center gap-2">
                  <DailyWindowCountdown />
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => router.push(`/subject/${subjectId}`)}
            className="w-full mt-3 py-2 text-[12px] text-text-muted hover:text-text-primary transition-colors bg-transparent border-none cursor-pointer font-[inherit]"
          >
            ← Back to Overview
          </button>
        </div>
      </div>
    );
  }

  // ── SRP upcoming (window not open yet) ──────────────────────────────────

  if (upcomingPaper) {
    return <SRPUpcomingCard paper={upcomingPaper} onBack={() => router.push(`/subject/${subjectId}`)} />;
  }

  // ── Result view ──────────────────────────────────────────────────────────

  if (result) {
    const pct = result.percentage;
    const perf = pct >= 80 ? 'Excellent 🌟' : pct >= 60 ? 'Good 👍' : pct >= 40 ? 'Fair' : 'Keep going 💪';
    const nationalRank = result.rank?.national_rank ?? null;

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
              <div className="text-xl font-bold text-gold">#{nationalRank ?? '—'}</div>
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
              <div className="text-xl font-bold text-gold">#{nationalRank ?? '—'}</div>
              <div className="text-[10.5px] text-text-muted">National</div>
            </div>
            <div>
              <div className="text-xl font-bold text-accent">#{result.rank?.district_rank ?? '—'}</div>
              <div className="text-[10.5px] text-text-muted">District</div>
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
          {/* Answers are never revealed right after submission — only once the
              exam window closes and the marking scheme is released (ms_available). */}
          <div className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-border-dim text-[12px] text-text-muted bg-white">
            🔒 {isSRP ? 'Answers available after the paper window closes' : 'Answers available tomorrow at midnight'}
          </div>
        </div>
      </div>
    );
  }

  // ── No paper found after load ────────────────────────────────────────────

  if (!loading && !paperId && !started && !result) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="text-center">
          <div className="text-[2.5rem] mb-3">{isSRP ? '⭐' : '📝'}</div>
          <div className="text-[14px] font-semibold text-text-primary mb-1">
            No {isSRP ? 'Special Ranking Paper' : 'Daily MCQ'} available
          </div>
          <div className="text-[12px] text-text-muted mb-4">
            {isSRP ? 'Check back on Saturday for the next SRP.' : 'Check back tomorrow for the next daily paper.'}
          </div>
          <button
            onClick={() => router.push(`/subject/${subjectId}`)}
            className="px-5 py-2 rounded-full border border-border-dim text-[12.5px] font-semibold text-text-primary bg-white cursor-pointer hover:border-gold transition-colors font-[inherit]"
          >
            ← Back to Overview
          </button>
        </div>
      </div>
    );
  }

  // ── Lobby (pre-start) ────────────────────────────────────────────────────

  if (!loading && !started && !result) {
    const lobbyBg = isSRP
      ? 'linear-gradient(115deg, #6f73d6, #8b90f0 60%, #6cd4da)'
      : 'linear-gradient(115deg, #8b90f0, #a9adf5)';
    const mins = Math.round(paperTotalSecs / 60);
    const staticTimer = `${String(Math.floor(paperTotalSecs / 60)).padStart(2, '0')}:00`;

    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="w-full max-w-105">
          <div className="rounded-lg p-8 text-center" style={{ background: lobbyBg }}>
            <div className="text-[3rem] mb-3">{isSRP ? '⭐' : '📝'}</div>
            <div
              className="text-white font-bold text-[1.35rem] leading-snug mb-1"
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            >
              {isSRP ? 'Special Ranking Paper' : 'Daily MCQ'}
            </div>
            <div className="text-white/75 text-[12.5px] mb-5">
              {examPaper?.question_count ?? (isSRP ? 50 : 10)} Questions · {mins} Minutes
              {isSRP && ' · Island-wide Ranking'}
            </div>

            {/* Daily: live window countdown */}
            {!isSRP && (
              <div className="inline-flex items-center gap-2 bg-white/15 rounded-full px-4 py-1.5 mb-5">
                <span className="text-white/80 text-[11.5px]">⚠ Window closes in</span>
                <DailyWindowCountdown />
              </div>
            )}

            {/* Static exam duration — not ticking yet */}
            <div className="text-white/60 text-[10.5px] uppercase tracking-widest mb-1">Exam time</div>
            <div
              className="text-[3rem] font-bold text-white leading-none mb-7"
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            >
              {staticTimer}
            </div>

            <button
              onClick={handleStart}
              disabled={starting}
              className="w-full py-3 rounded-full bg-white text-gold font-bold text-[14px] cursor-pointer border-none hover:bg-white/90 transition-colors font-[inherit] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {starting ? 'Starting…' : 'Start Exam →'}
            </button>
          </div>

          <button
            onClick={() => router.back()}
            className="w-full mt-3 py-2 text-[12px] text-text-muted hover:text-text-primary transition-colors bg-transparent border-none cursor-pointer font-[inherit]"
          >
            ← Go back
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

  const headerBg = isSRP
    ? 'linear-gradient(115deg, #6f73d6, #8b90f0 60%, #6cd4da)'
    : 'linear-gradient(115deg, #8b90f0, #a9adf5)';

  const timerProgress = paperTotalSecs > 0 ? timer.timeLeft / paperTotalSecs : 0;
  const timerCirc = 2 * Math.PI * 22;

  return (
    <div className="max-w-[780px]">
      {/* Gradient card header (DC design) */}
      <div
        className="flex items-center justify-between rounded-[20px] mb-5"
        style={{ background: headerBg, padding: '22px 28px' }}
      >
        {/* Left: icon + title + subtitle */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center rounded-[13px] border-none cursor-pointer shrink-0"
            style={{ width: 46, height: 46, background: 'rgba(255,255,255,.2)' }}
            title="Go back"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
          <div>
            <div className="font-bold text-white text-[18px] leading-snug" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
              {isSRP ? 'Special Ranking Paper' : 'Daily MCQ'}
            </div>
            <div className="text-[12px] text-white/80 mt-0.5">
              Q {current + 1} / {questions.length}
              {isSRP
                ? ` · ${Math.round(paperTotalSecs / 60)} min · Island-wide ranking`
                : ` · ${Math.round(paperTotalSecs / 60)} min`}
            </div>
          </div>
        </div>

        {/* Right: timer text + circle */}
        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className="text-[10px] text-white/75 uppercase tracking-widest font-semibold">ශේෂ කාලය</div>
            <div
              className="text-[30px] font-bold text-white leading-none mt-0.5"
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            >
              {String(timer.minutes).padStart(2,'0')}:{String(timer.seconds).padStart(2,'0')}
            </div>
          </div>
          <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
            <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="5"/>
            <circle
              cx="26" cy="26" r="22" fill="none" stroke="#fff" strokeWidth="5"
              strokeLinecap="round" strokeDasharray={timerCirc}
              strokeDashoffset={timerCirc * (1 - timerProgress)}
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
        </div>
      </div>

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

// Forces ExamContent to fully remount when type or subject changes,
// preventing stale state (timer, paperTotalSecs, questions) from leaking
// across navigation between Daily MCQ and Special Paper.
function ExamContentKeyed() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const searchParams = useSearchParams();
  const type = searchParams.get('type') ?? 'daily';
  return <ExamContent key={`${subjectId}-${type}`} />;
}

export default function ExamPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh] text-text-muted text-[13px]">
        Loading...
      </div>
    }>
      <ExamContentKeyed />
    </Suspense>
  );
}
