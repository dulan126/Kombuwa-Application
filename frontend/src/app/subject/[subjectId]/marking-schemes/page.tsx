'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { generateDemoPapers } from '@/lib/demo-data';
import { cn } from '@/lib/utils';
import type { Paper, Question, AnswerOption } from '@/types';
import type { Stream } from '@/types/auth';

// ── Per-question review ───────────────────────────────────────────────────────

function QuestionReview({
  questions,
  studentAnswers,
}: {
  questions: Question[];
  studentAnswers: Record<number, AnswerOption | null>;
}) {
  return (
    <div className="mt-4 flex flex-col gap-2.5">
      {questions.map((q, i) => {
        const ca = (q.correct_option || 'A') as AnswerOption;
        const ua = studentAnswers[i] ?? null;
        const opts = [q.option_a, q.option_b, q.option_c, q.option_d] as string[];

        return (
          <div key={i} className="border border-border-dim rounded-[12px] p-4 bg-dark">
            <div className="text-[9px] text-text-muted mb-1">Question {i + 1}</div>
            <div className="text-[13px] text-text-primary leading-[1.75] mb-3">{q.question_text}</div>
            <div className="flex flex-col gap-1">
              {opts.map((o, j) => {
                const letter = 'ABCD'[j] as AnswerOption;
                const isCorrect = letter === ca;
                const isWrong = ua && letter === ua && ua !== ca;
                return (
                  <div
                    key={letter}
                    className={cn(
                      'flex items-center gap-2 px-2.5 py-1.5 rounded-sm text-[12.5px]',
                      isCorrect
                        ? 'bg-success/8 border border-success/25'
                        : isWrong
                        ? 'bg-danger/6 border border-danger/20'
                        : 'bg-transparent border border-transparent',
                    )}
                  >
                    <div
                      className={cn(
                        'w-5.5 h-5.5 rounded-[5px] flex items-center justify-center text-[10px] font-bold shrink-0',
                        isCorrect ? 'bg-success/20 text-success' :
                        isWrong ? 'bg-danger/20 text-danger' :
                        'bg-white/6 text-text-muted',
                      )}
                    >
                      {letter}
                    </div>
                    <span className="flex-1 text-text-primary">{o}</span>
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

// ── Paper card ────────────────────────────────────────────────────────────────

function MSCard({
  paper,
  questions,
}: {
  paper: Paper;
  questions: Question[];
}) {
  const [expanded, setExpanded] = useState(false);
  const available = paper.ms_available;
  const isSRP = paper.type === 'srp';
  // In demo mode student answers are not persisted; show only correct answers
  const studentAnswers: Record<number, AnswerOption | null> = {};
  questions.forEach((_, i) => { studentAnswers[i] = null; });

  return (
    <div
      className="bg-white rounded-base border transition-all duration-200"
      style={{ borderColor: available ? '#ecebf6' : '#f0f0f0', opacity: available ? 1 : 0.65 }}
    >
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div
            className="w-10 h-10 rounded-[10px] flex items-center justify-center text-xl"
            style={{ background: isSRP ? '#f2994a18' : '#8b90f018' }}
          >
            {available ? '📖' : '🔒'}
          </div>
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
            style={
              available
                ? { background: '#2fae9e12', color: '#2fae9e', borderColor: '#2fae9e30' }
                : { background: '#f6f6fc', color: '#9a9ab0', borderColor: '#ecebf6' }
            }
          >
            {available ? '✓ Available' : '⏳ Pending'}
          </span>
        </div>

        <div>
          <div className="text-[12.5px] font-bold text-text-primary leading-snug">{paper.title}</div>
          <div className="text-[11px] text-text-muted mt-0.5">
            {isSRP ? 'SRP · 30 Questions' : 'Daily · 10 Questions'} · {paper.question_count} marks
          </div>
        </div>

        {available ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-auto py-2 rounded-sm bg-gold text-white text-[12px] font-semibold cursor-pointer border-none hover:bg-gold-dark transition-colors font-[inherit]"
          >
            {expanded ? 'Hide Answers ↑' : 'View Answers ↓'}
          </button>
        ) : (
          <div className="mt-auto py-2 rounded-sm bg-dark border border-border-dim text-text-muted text-[12px] font-semibold text-center">
            Released after exam window
          </div>
        )}
      </div>

      {expanded && questions.length > 0 && (
        <div className="px-4 pb-4">
          <div className="border-t border-border-dim pt-4">
            <QuestionReview questions={questions} studentAnswers={studentAnswers} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MarkingSchemesPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const { user } = useAuth();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [questionMap, setQuestionMap] = useState<Record<string, Question[]>>({});
  const [filter, setFilter] = useState<'all' | 'available' | 'pending'>('all');

  useEffect(() => {
    if (!user) return;
    const stream = user.stream as Stream;
    const grade = parseInt(user.grade ?? '12') as 12 | 13;
    const map = generateDemoPapers();
    const bucket = map[stream]?.[grade]?.[subjectId];
    const all: Paper[] = [];
    const qmap: Record<string, Question[]> = {};
    if (bucket) {
      [...bucket.srp, ...bucket.daily].forEach((p) => {
        const { _qs, ...paper } = p;
        const withDone = { ...paper, done: paper.type === 'srp', score: paper.type === 'srp' ? 24 : null };
        all.push(withDone);
        qmap[paper.id] = _qs;
      });
    }
    setPapers(all.filter((p) => p.done));
    setQuestionMap(qmap);
  }, [user, subjectId]);

  const filtered = papers.filter((p) =>
    filter === 'all' ? true : filter === 'available' ? p.ms_available : !p.ms_available,
  );

  return (
    <div className="max-w-225">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-[1.3rem] font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Marking Schemes
          </h1>
          <div className="text-[12px] text-text-muted mt-0.5">
            Correct answers released after the exam window closes
          </div>
        </div>

        <div className="flex gap-1.5">
          {(['all', 'available', 'pending'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-4 py-1.5 rounded-full text-[12px] font-semibold border cursor-pointer capitalize transition-all font-[inherit]"
              style={{
                background: filter === f ? '#8b90f0' : '#fff',
                color: filter === f ? '#fff' : '#9a9ab0',
                borderColor: filter === f ? '#8b90f0' : '#ecebf6',
              }}
            >
              {f === 'all' ? 'All' : f === 'available' ? '✓ Available' : '⏳ Pending'}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-14 text-text-muted text-[13px]">
          {papers.length === 0
            ? 'Complete exams first to unlock marking schemes.'
            : 'No marking schemes match this filter.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((p) => (
            <MSCard key={p.id} paper={p} questions={questionMap[p.id] ?? []} />
          ))}
        </div>
      )}
    </div>
  );
}
