'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/ui/ProgressBar';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { generateDemoPapers, findDemoPaper } from '@/lib/demo-data';
import type { AnswerOption } from '@/types';


function MarkingSchemeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoggedIn, user } = useAuth();
  const paperId = searchParams.get('paperId');

  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<{
    question_text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_option: AnswerOption;
    studentAnswer: AnswerOption | null;
  }[]>([]);
  const [title, setTitle] = useState('');
  const [studentScore, setStudentScore] = useState<number | null>(null);

  useEffect(() => {
    if (!isLoggedIn) { router.push('/'); return; }
    if (!paperId) { setLoading(false); return; }

    // Demo data
    const papers = generateDemoPapers();
    const demo = findDemoPaper(papers, paperId);
    if (demo) {
      setTitle(demo.title);
      setQuestions(demo._qs.map((q, i) => ({
        question_text: q.question_text,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_option: (q.correct_option || 'A') as AnswerOption,
        studentAnswer: null,
      })));
      setStudentScore(null);
    }
    setLoading(false);
  }, [isLoggedIn, paperId, router, user]);

  if (!isLoggedIn) return null;

  return (
    <div className="p-6 max-w-[780px] mx-auto">
      <h1 className="text-xl font-bold mb-1">📖 ලකුණු ක්‍රමය</h1>
      <p className="text-[11px] text-text-muted mb-6">ශේෂ දිනෙ upload · Subject · Grade · Paper Type filter</p>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : !paperId ? (
        <div className="text-center py-10 text-text-muted">Paper ID select කරන්න. Dashboard-ලින් paper click කරන්න.</div>
      ) : (
        <>
          {/* Paper Header */}
          <div className="bg-surface border border-border-dim rounded-[var(--radius-base)] p-4 mb-5 flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-[13px] font-bold">{title || 'ලකුණු ක්‍රමය'}</div>
              <div className="text-[10.5px] text-text-muted mt-0.5">ලකුණු ක්‍රමය</div>
            </div>
            {studentScore != null && <Badge variant="success">ලකුණු: {studentScore}/{questions.length}</Badge>}
          </div>

          {/* Questions */}
          {questions.map((q, i) => {
            const ca = q.correct_option;
            const ua = q.studentAnswer;
            const isCorrect = ua === ca;
            const isSkipped = !ua;
            const opts = [q.option_a, q.option_b, q.option_c, q.option_d];

            return (
              <div key={q.question_text} className="bg-surface border border-border-dim rounded-[var(--radius-base)] p-4 mb-2.5">
                <div className="flex items-start justify-between gap-2.5 mb-2">
                  <div className="flex-1">
                    <div className="text-[9px] text-text-muted mb-0.5">ප්‍රශ්නය {i + 1}</div>
                    <div className="text-[13px] leading-[1.75]">{q.question_text}</div>
                  </div>
                  {ua != null && (
                    <Badge variant={isSkipped ? 'warning' : isCorrect ? 'success' : 'danger'}>
                      {isSkipped ? 'මඟ' : isCorrect ? '✓' : '✗'}
                    </Badge>
                  )}
                </div>
                <div>
                  {opts.map((o, j) => {
                    const letter = 'ABCD'[j] as AnswerOption;
                    const isCor = letter === ca;
                    const isWr = ua && letter === ua && ua !== ca;

                    return (
                      <div
                        key={letter}
                        className={cn(
                          'flex items-center gap-2 px-2.5 py-1.5 rounded-[5px] text-[12.5px] mb-1',
                          isCor ? 'bg-success/[0.08] border border-success/[0.22]' : 'bg-white/[0.02] border border-transparent',
                        )}
                      >
                        <div className={cn(
                          'w-[22px] h-[22px] rounded-[5px] flex items-center justify-center text-[10px] font-bold',
                          isCor ? 'bg-success/[0.22]' : isWr ? 'bg-danger/20' : 'bg-white/[0.06]',
                        )}>
                          {letter}
                        </div>
                        <span className="flex-1">{o}</span>
                        {isCor && <span className="text-[10px] text-success font-bold">✓ නිවැරදි</span>}
                        {isWr && <span className="text-[10px] text-danger">✗ ඔබේ</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

export default function MarkingSchemePage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><Spinner size="lg" /></div>}>
      <MarkingSchemeContent />
    </Suspense>
  );
}
