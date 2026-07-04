'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { papersService } from '@/services/papers.service';
import { Pagination } from '@/components/ui/Pagination';
import { cn } from '@/lib/utils';
import type { Paper, Question, AnswerOption } from '@/types';

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

function MSCard({ paper }: { paper: Paper }) {
  const [expanded, setExpanded] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [studentAnswers, setStudentAnswers] = useState<Record<number, AnswerOption | null>>({});
  const [loadingScheme, setLoadingScheme] = useState(false);

  const available = paper.ms_available;
  const isSRP = paper.type === 'srp';

  async function handleExpand() {
    if (!available) return;
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (questions.length > 0) return;
    setLoadingScheme(true);
    try {
      const res = await papersService.getMarkingScheme(paper.id);
      const qs = res.questions ?? [];
      setQuestions(qs);
      const sa: Record<number, AnswerOption | null> = {};
      qs.forEach((q, i) => { sa[i] = q.studentAnswer ?? null; });
      setStudentAnswers(sa);
    } catch {
      // leave empty
    } finally {
      setLoadingScheme(false);
    }
  }

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
            {isSRP ? 'SRP' : 'Daily'} · {paper.question_count} Questions · {paper.question_count} marks
          </div>
          {paper.score != null && (
            <div className="text-[11px] text-success font-semibold mt-1">
              Your score: {paper.score}/{paper.question_count}
            </div>
          )}
        </div>

        {available ? (
          <button
            onClick={handleExpand}
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

      {expanded && (
        <div className="px-4 pb-4">
          <div className="border-t border-border-dim pt-4">
            {loadingScheme ? (
              <div className="text-center py-4 text-text-muted text-[12px]">Loading answers…</div>
            ) : questions.length > 0 ? (
              <QuestionReview questions={questions} studentAnswers={studentAnswers} />
            ) : (
              <div className="text-center py-4 text-text-muted text-[12px]">No questions available.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 12;

export default function MarkingSchemesPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const { user } = useAuth();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [availFilter, setAvailFilter] = useState<'all' | 'available' | 'pending'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'daily' | 'srp'>('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      try {
        const all = await papersService.getPapers({ subject: subjectId });
        if (cancelled) return;
        setPapers(all.filter((p) => p.done === true));
      } catch {
        // leave empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user, subjectId]);

  const filtered = papers.filter((p) => {
    const matchAvail = availFilter === 'all' ? true : availFilter === 'available' ? p.ms_available : !p.ms_available;
    const matchType = typeFilter === 'all' ? true : p.type === typeFilter;
    return matchAvail && matchType;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageSlice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function changeAvailFilter(f: typeof availFilter) { setAvailFilter(f); setPage(1); }
  function changeTypeFilter(f: typeof typeFilter) { setTypeFilter(f); setPage(1); }

  return (
    <div className="max-w-225">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-[1.3rem] font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Marking Schemes
          </h1>
          <div className="text-[12px] text-text-muted mt-0.5">
            {filtered.length} scheme{filtered.length !== 1 ? 's' : ''} · Correct answers released after the exam window closes
          </div>
        </div>

        <div className="flex flex-col gap-2 items-end">
          <div className="flex gap-1.5">
            {(['all', 'available', 'pending'] as const).map((f) => (
              <button
                key={f}
                onClick={() => changeAvailFilter(f)}
                className="px-3 py-1.5 rounded-full text-[12px] font-semibold border cursor-pointer transition-all font-[inherit]"
                style={{
                  background: availFilter === f ? '#8b90f0' : '#fff',
                  color: availFilter === f ? '#fff' : '#9a9ab0',
                  borderColor: availFilter === f ? '#8b90f0' : '#ecebf6',
                }}
              >
                {f === 'all' ? 'All' : f === 'available' ? '✓ Available' : '⏳ Pending'}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {(['all', 'daily', 'srp'] as const).map((f) => (
              <button
                key={f}
                onClick={() => changeTypeFilter(f)}
                className="px-3 py-1.5 rounded-full text-[11.5px] font-semibold border cursor-pointer transition-all font-[inherit]"
                style={{
                  background: typeFilter === f ? '#f2994a' : '#fff',
                  color: typeFilter === f ? '#fff' : '#9a9ab0',
                  borderColor: typeFilter === f ? '#f2994a' : '#ecebf6',
                }}
              >
                {f === 'all' ? 'All Types' : f === 'daily' ? 'Daily MCQ' : '⭐ SRP'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2].map((i) => <div key={i} className="bg-white rounded-base border border-border-dim p-4 animate-pulse h-36" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-14 text-text-muted text-[13px]">
          {papers.length === 0
            ? 'Complete exams first to unlock marking schemes.'
            : 'No marking schemes match this filter.'}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {pageSlice.map((p) => <MSCard key={p.id} paper={p} />)}
          </div>
          {totalPages > 1 && (
            <div className="mt-4 bg-white rounded-base border border-border-dim overflow-hidden">
              <Pagination page={page} totalPages={totalPages} onPage={setPage} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
