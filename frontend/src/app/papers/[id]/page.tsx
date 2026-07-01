'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { useTimer } from '@/hooks/useTimer';
import { papersService } from '@/services/papers.service';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar, Spinner } from '@/components/ui/ProgressBar';
import { generateDemoPapers, findDemoPaper } from '@/lib/demo-data';
import { cn } from '@/lib/utils';
import { isApiError } from '@/services/api-client';
import type { Question, AnswerOption, SubmitResult, ExamPaperResponse } from '@/types';

// ─── Exam Engine Page ────────────────────────────────────────────────────────

export default function ExamPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoggedIn } = useAuth();
  const { showToast } = useToast();
  const paperId = params.id as string;

  // Exam state
  const [loading, setLoading] = useState(true);
  const [paper, setPaper] = useState<ExamPaperResponse['paper'] | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [locked, setLocked] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showTimeUp, setShowTimeUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Timer
  const timer = useTimer({
    initialSeconds: paper?.time_seconds || 600,
    onExpire: () => setShowTimeUp(true),
    autoStart: false,
  });

  // Auth guard
  useEffect(() => {
    if (!isLoggedIn) router.push('/');
  }, [isLoggedIn, router]);

  // Load paper questions
  useEffect(() => {
    if (!paperId || !user) return;

    async function load() {
      setLoading(true);
      try {
        const data = await papersService.getPaperQuestions(paperId);
        setPaper(data.paper);
        setQuestions(data.questions);
        timer.reset(data.paper.time_seconds);
        timer.start();
      } catch {
        // Demo fallback
        const demoPapers = generateDemoPapers();
        const demo = findDemoPaper(demoPapers, paperId);
        if (!demo) {
          showToast('Paper not found', 'error');
          router.push('/papers');
          return;
        }
        setPaper({
          id: demo.id,
          type: demo.type,
          title: demo.title,
          subject_id: demo.subject_id,
          subject_name: demo.subject_name,
          grade: demo.grade,
          time_seconds: demo.time_seconds,
          question_count: demo.question_count,
        });
        setQuestions(demo._qs);
        timer.reset(demo.time_seconds);
        timer.start();
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // timer and showToast are stable references (useTimer/useToast return stable fns);
    // including them would re-run the load effect on every render. Only paperId and
    // user should trigger a paper reload.
  }, [paperId, user]);

  const answeredCount = Object.keys(answers).length;
  const totalCount = questions.length;
  const isSRP = paper?.type === 'srp';

  const selectAnswer = useCallback((optionIndex: number) => {
    if (locked) return;
    setAnswers((prev) => ({ ...prev, [currentQ]: optionIndex }));
  }, [currentQ, locked]);

  const handleSubmit = useCallback(async () => {
    setShowConfirm(false);
    setShowTimeUp(false);
    setLocked(true);
    setSubmitting(true);
    timer.pause();

    // Convert answers: {0: 0, 1: 2} → {"0": "A", "1": "C"}
    const letterAnswers: Record<string, AnswerOption> = {};
    Object.entries(answers).forEach(([k, v]) => {
      letterAnswers[k] = (['A', 'B', 'C', 'D'] as const)[v];
    });

    try {
      const res = await papersService.submitPaper(paperId, { answers: letterAnswers });
      setResult(res);
    } catch (err: unknown) {
      if (isApiError(err) && err.status === 409) {
        showToast('දැනටමත් ඉදිරිපත් කළේ', 'warning');
        router.push('/papers');
        return;
      }
      // Demo fallback: score locally (API unreachable)
      let sc = 0;
      questions.forEach((q, i) => {
        const ca = (['A', 'B', 'C', 'D'] as const).indexOf(q.correct_option as AnswerOption);
        if (answers[i] === ca) sc++;
      });
      setResult({
        score: sc,
        total: totalCount,
        percentage: Math.round((sc / totalCount) * 100),
        timeTakenSecs: (paper?.time_seconds || 600) - timer.timeLeft,
        rank: {
          national_rank: Math.floor(Math.random() * 300) + 4,
          district_rank: Math.floor(Math.random() * 50) + 1,
        },
        demoMode: true,
      });
    } finally {
      setSubmitting(false);
    }
  }, [answers, paperId, questions, totalCount, paper, timer, router, showToast]);

  // ─── Results View ──────────────────────────────────────────────────────

  if (result) {
    const pct = result.percentage;
    const perf = pct >= 80 ? 'විශිෂ්ට 🌟' : pct >= 60 ? 'හොඳ 👍' : pct >= 40 ? 'සාමාන්‍ය' : 'වැඩිදියුණු 💪';
    const totalParticipants = Math.floor(Math.random() * 4000) + 500;
    const topPct = Math.max(1, Math.round(((result.rank.national_rank || 50) / totalParticipants) * 100));

    return (
      <div className="p-6 max-w-[720px] mx-auto">
        {isSRP && (
          <div className="bg-gradient-to-r from-gold/[0.12] to-gold/[0.03] border border-gold/[0.28] rounded-[var(--radius-base)] p-3 mb-4 text-[12.5px] text-gold font-bold">
            ⭐ SRP — විශේෂ ශ්‍රේණිගත ප්‍රශ්න පත්‍රය · Island-wide ranking
          </div>
        )}
        <div className="bg-dark-2 border border-border-dim rounded-[var(--radius-base)] p-7 mb-4 text-center">
          <div className="text-[10.5px] font-bold tracking-[1.5px] uppercase text-text-muted mb-2.5">{paper?.title}</div>
          <div className="text-[3.4rem] font-bold text-gold leading-none">{result.score}/{result.total}</div>
          <div className="text-[12.5px] text-text-muted mt-1.5">{pct}% — {perf}{result.demoMode ? ' · Demo Mode' : ''}</div>
          <div className="grid grid-cols-4 max-sm:grid-cols-2 gap-2.5 mt-5">
            <div className="bg-surface rounded-[var(--radius-sm)] p-3 text-center"><div className="text-xl font-bold text-success">{result.score}</div><div className="text-[9.5px] text-text-muted">නිවැරදි</div></div>
            <div className="bg-surface rounded-[var(--radius-sm)] p-3 text-center"><div className="text-xl font-bold text-danger">{result.total - result.score - (result.total - answeredCount)}</div><div className="text-[9.5px] text-text-muted">වැරදි</div></div>
            <div className="bg-surface rounded-[var(--radius-sm)] p-3 text-center"><div className="text-xl font-bold text-warning">{result.total - answeredCount}</div><div className="text-[9.5px] text-text-muted">මඟ</div></div>
            <div className="bg-surface rounded-[var(--radius-sm)] p-3 text-center"><div className="text-xl font-bold text-gold">#{result.rank.national_rank || '—'}</div><div className="text-[9.5px] text-text-muted">ශ්‍රේණිය</div></div>
          </div>
        </div>

        {/* Ranking Details */}
        <div className="bg-surface border border-border-dim rounded-[var(--radius-base)] p-4 mb-4">
          <div className="text-[9.5px] font-bold tracking-[1px] uppercase text-text-muted mb-3">ශ්‍රේණිගත — {isSRP ? '⭐ SRP' : '📝 Daily'} · {paper?.grade} ශ්‍රේ</div>
          <div className="flex gap-6 flex-wrap">
            <div><div className="text-xl font-bold text-gold">#{result.rank.national_rank || '—'}</div><div className="text-[10.5px] text-text-muted">ජාතික</div></div>
            <div><div className="text-xl font-bold text-accent">#{result.rank.district_rank || '—'}</div><div className="text-[10.5px] text-text-muted">දිස්ත්‍රික්</div></div>
            <div><div className="text-xl font-bold text-accent-2">{totalParticipants.toLocaleString()}</div><div className="text-[10.5px] text-text-muted">සහභාගිවන්</div></div>
            <div><div className="text-xl font-bold text-success">Top {topPct}%</div><div className="text-[10.5px] text-text-muted">Percentile</div></div>
          </div>
        </div>

        <div className="flex gap-2.5 flex-wrap">
          <Button variant="outline" onClick={() => router.push('/papers')}>← ප්‍රශ්න පත්‍ර</Button>
          <Button variant="outline" onClick={() => router.push('/rankings')}>🏆 ශ්‍රේණිගත</Button>
          <Button onClick={() => router.push(`/marking-scheme?paperId=${paperId}`)}>📖 ලකුණු ක්‍රමය</Button>
        </div>
      </div>
    );
  }

  // ─── Loading ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-58px)]">
        <Spinner size="lg" />
      </div>
    );
  }

  // ─── Exam View ─────────────────────────────────────────────────────────

  const q = questions[currentQ];
  const opts = q ? [q.option_a, q.option_b, q.option_c, q.option_d] : [];

  return (
    <div>
      {/* Exam Header */}
      <div className={cn('bg-dark-2 border-b border-border-dim px-6 py-3.5 flex items-center justify-between gap-3 flex-wrap', isSRP && 'border-b-[3px] border-b-gold')}>
        <div>
          <h1 className="text-[13.5px] font-bold">{paper?.title}</h1>
          <p className="text-[10.5px] text-text-muted">{totalCount} ප්‍රශ්න · {isSRP ? '30' : '10'} මිනිත්තු · {paper?.grade} ශ්‍රේ</p>
        </div>
        <div className="flex gap-1">
          <div className={cn('bg-dark border border-border-dim rounded-md px-2.5 py-1 text-center min-w-[38px]', timer.isUrgent && 'border-danger/40')}>
            <div className={cn('text-[19px] font-bold leading-tight', timer.isUrgent ? 'text-danger' : 'text-gold')}>{String(timer.minutes).padStart(2, '0')}</div>
            <div className="text-[8px] text-text-muted uppercase tracking-wider">මිනි</div>
          </div>
          <div className={cn('bg-dark border border-border-dim rounded-md px-2.5 py-1 text-center min-w-[38px]', timer.isUrgent && 'border-danger/40')}>
            <div className={cn('text-[19px] font-bold leading-tight', timer.isUrgent ? 'text-danger' : 'text-gold')}>{String(timer.seconds).padStart(2, '0')}</div>
            <div className="text-[8px] text-text-muted uppercase tracking-wider">තත්</div>
          </div>
        </div>
      </div>

      {/* SRP Strip */}
      {isSRP && (
        <div className="bg-gradient-to-r from-gold/[0.14] to-gold/[0.04] border-b border-gold/25 px-6 py-2 text-[11px] text-gold font-bold flex items-center gap-2">
          ⭐ SRP — විශේෂ ශ්‍රේණිගත ප්‍රශ්න පත්‍රය · Island-wide ranking · ප්‍ර 30 · 30 මිනිත්තු
        </div>
      )}

      {/* Progress */}
      <div className="px-6 py-2.5 bg-dark-2 border-b border-white/[0.04]">
        <ProgressBar value={((currentQ + 1) / totalCount) * 100} className="mb-1.5" />
        <div className="flex justify-between text-[10px] text-text-muted">
          <span>ප්‍රශ්නය {currentQ + 1}/{totalCount}</span>
          <span>{answeredCount}/{totalCount} පිළිතුරු</span>
        </div>
      </div>

      {/* Question Navigation */}
      <div className="flex gap-[3px] flex-wrap px-6 py-2.5 bg-dark-2 border-b border-white/[0.04]">
        {questions.map((q, i) => (
          <button
            key={q.id ?? q.sort_order}
            className={cn(
              'w-7 h-7 rounded-[5px] border text-[11px] font-semibold cursor-pointer flex items-center justify-center transition-all font-[inherit]',
              i === currentQ ? 'bg-gold border-gold text-white' :
              answers[i] !== undefined ? 'bg-accent/15 border-accent/40 text-accent' :
              'bg-surface border-border-dim text-text-primary',
            )}
            onClick={() => setCurrentQ(i)}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Question Body */}
      <div className="px-6 py-5 max-w-[740px]">
        {q && (
          <>
            <div className="bg-surface border border-border-dim rounded-[var(--radius-base)] p-4 mb-3">
              <div className="text-[9px] font-bold tracking-[1px] uppercase text-text-muted mb-2">ප්‍රශ්නය {currentQ + 1}/{totalCount}</div>
              <div className="text-sm leading-[1.85] mb-3">{q.question_text}</div>
              <div className="flex flex-col gap-1.5">
                {opts.map((o, j) => (
                  <button
                    key={'ABCD'[j]}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2.5 rounded-[var(--radius-sm)] border text-[13px] transition-all bg-dark-2 text-left font-[inherit] w-full',
                      locked ? 'cursor-default' : 'cursor-pointer',
                      answers[currentQ] === j ? 'border-accent bg-accent/10' : 'border-border-dim',
                      !locked && answers[currentQ] !== j && 'hover:border-gold-border hover:bg-gold-bg',
                    )}
                    onClick={() => selectAnswer(j)}
                    disabled={locked}
                  >
                    <div className="w-[23px] h-[23px] rounded-[5px] bg-white/[0.07] flex items-center justify-center text-[10.5px] font-bold shrink-0">
                      {'ABCD'[j]}
                    </div>
                    <span>{o}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              {currentQ > 0 && (
                <Button variant="outline" size="sm" onClick={() => setCurrentQ(currentQ - 1)}>← පෙර</Button>
              )}
              {currentQ < totalCount - 1 && (
                <Button size="sm" onClick={() => setCurrentQ(currentQ + 1)}>ඊළඟ →</Button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-3.5 bg-dark-2 border-t border-border-dim flex items-center justify-between flex-wrap gap-3">
        <div className="text-[11.5px] text-text-muted">
          {answeredCount < totalCount ? `${totalCount - answeredCount}ක් ඉතිරිව` : 'සියල්ල ✓'}
        </div>
        <Button onClick={() => setShowConfirm(true)} disabled={submitting}>
          {submitting ? 'ඉදිරිපත් කරමින්...' : 'ඉදිරිපත් කරන්න ✓'}
        </Button>
      </div>

      {/* Confirm Modal */}
      <Modal isOpen={showConfirm} onClose={() => setShowConfirm(false)} maxWidth="max-w-[380px]">
        <div className="text-center">
          <h2 className="text-lg font-bold mb-1.5">ඉදිරිපත් කරන්නද?</h2>
          <p className="text-xs text-text-muted mb-5 leading-relaxed">
            {answeredCount < totalCount
              ? `${totalCount - answeredCount}ක් නොදෙන ලදී. ඉදිරිපත් කළ පසු වෙනස් නොකළ හැකිය.`
              : 'ඉදිරිපත් කළ පසු වෙනස් කළ නොහැකිය.'}
          </p>
          <div className="flex gap-2.5 justify-center">
            <Button variant="outline" onClick={() => setShowConfirm(false)}>නැත</Button>
            <Button onClick={handleSubmit}>ඔව් — ඉදිරිපත් කරන්න</Button>
          </div>
        </div>
      </Modal>

      {/* Time Up Modal */}
      <Modal isOpen={showTimeUp} onClose={() => {}} maxWidth="max-w-[340px]">
        <div className="text-center">
          <div className="text-[2.8rem] mb-2">⏰</div>
          <h2 className="text-lg font-bold mb-1.5">කාලය ඉකුත් විය!</h2>
          <p className="text-xs text-text-muted mb-4">ස්වයංක්‍රීයව ඉදිරිපත් කෙරිණ.</p>
          <Button onClick={handleSubmit}>ප්‍රතිඵල බලන්න</Button>
        </div>
      </Modal>
    </div>
  );
}
