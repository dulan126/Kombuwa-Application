'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FileStack, FileText, ListChecks, ChevronRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { papersService } from '@/services/papers.service';
import type { PracticePaperCard } from '@/types';

export default function PastPapersPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const { user } = useAuth();
  const [papers, setPapers] = useState<PracticePaperCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    papersService.getPracticePapers(subjectId)
      .then((data) => { if (!cancelled) setPapers(data ?? []); })
      .catch(() => { if (!cancelled) setPapers([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, subjectId]);

  return (
    <div className="max-w-[900px]">
      <div className="mb-5">
        <h1 className="text-[1.3rem] font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          Past Papers
        </h1>
        <div className="text-[12px] text-text-muted mt-0.5">
          Practice MCQs (unlimited attempts, no time limit) and read the question PDFs.
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2].map((i) => <div key={i} className="bg-surface rounded-2xl border border-border-dim p-5 animate-pulse h-40" />)}
        </div>
      ) : papers.length === 0 ? (
        <div className="text-center py-14 text-text-muted text-[13px]">
          No past papers available for this subject yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {papers.map((p) => (
            <div key={p.id} className="bg-surface rounded-2xl border border-border-dim p-5 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-[10px] bg-brand/10 text-brand flex items-center justify-center shrink-0">
                  <FileStack size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-bold text-text-primary leading-snug">{p.title}</div>
                  {p.grade && <div className="text-[11px] text-text-muted mt-0.5">Grade {p.grade}</div>}
                </div>
              </div>

              {/* Parts present */}
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {p.has_mcq && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand/8 text-brand border border-brand/20">
                    <ListChecks size={11} /> {p.question_count} MCQ
                  </span>
                )}
                {p.has_structured_pdf && (
                  <a href={papersService.paperPdfUrl(p.id, 'structured')} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-dark text-text-muted border border-border-dim no-underline hover:border-gold hover:text-gold transition-colors">
                    <FileText size={11} /> Structured PDF
                  </a>
                )}
                {p.has_essay_pdf && (
                  <a href={papersService.paperPdfUrl(p.id, 'essay')} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-dark text-text-muted border border-border-dim no-underline hover:border-gold hover:text-gold transition-colors">
                    <FileText size={11} /> Essay PDF
                  </a>
                )}
                {p.has_answers_pdf && (
                  <a href={papersService.paperPdfUrl(p.id, 'answers')} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/8 text-success border border-success/25 no-underline hover:bg-success/15 transition-colors">
                    <FileText size={11} /> Answers
                  </a>
                )}
              </div>

              {p.attempt_count > 0 && (
                <div className="text-[11.5px] text-text-muted">
                  {p.attempt_count} attempt{p.attempt_count !== 1 ? 's' : ''}
                  {p.best_score != null && <> · best {p.best_score}/{p.question_count}</>}
                </div>
              )}

              <Link
                href={`/subject/${subjectId}/past-papers/${p.id}`}
                className="mt-auto inline-flex items-center justify-center gap-1 py-2 rounded-sm bg-gold text-white text-[12.5px] font-semibold no-underline hover:bg-gold-dark transition-colors"
              >
                {p.has_mcq ? 'Practice MCQs' : 'Open'} <ChevronRight size={14} />
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
