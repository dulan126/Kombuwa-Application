'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { pastPapersService } from '@/services/past-papers.service';
import type { PastPaperSubject, PastPaperYear } from '@/types';

const GRADE_OPTS = ['', '12', '13'] as const;
const YEAR_OPTS = ['', ...Array.from({ length: 10 }, (_, i) => String(2024 - i))];

function ActionBtn({
  color, label, icon, onClick,
}: { color: string; label: string; icon: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[8px] text-[11px] font-semibold border cursor-pointer transition-all font-[inherit]"
      style={{ color, borderColor: color + '40', background: color + '12' }}
    >
      {icon} {label}
    </button>
  );
}

function YearRow({ yr, subjectId }: { yr: PastPaperYear; subjectId: string }) {
  function openMCQ() {
    // Navigate to MCQ exam using past paper ID
    window.location.href = `/subject/${subjectId}/exam?paperId=${yr.id}`;
  }
  function openEssay() {
    window.open(pastPapersService.getEssayPdfUrl(yr.id), '_blank');
  }
  function openMarkingScheme() {
    window.open(pastPapersService.getMarkingSchemePdfUrl(yr.id), '_blank');
  }

  return (
    <div className="flex items-center px-5 py-3 border-b border-border-dim last:border-b-0 gap-4 flex-wrap hover:bg-surface-hover transition-colors">
      <div
        className="text-[12.5px] font-bold text-gold w-12 shrink-0"
        style={{ fontFamily: 'var(--font-space-grotesk)' }}
      >
        {yr.year}
      </div>
      <div className="flex gap-2 flex-wrap flex-1">
        {yr.mcqCount > 0 && (
          <ActionBtn color="#8b90f0" label={`MCQ ${yr.mcqCount}`} icon="📝" onClick={openMCQ} />
        )}
        {yr.essayCount > 0 && (
          <ActionBtn color="#6cd4da" label="Essay PDF" icon="📄" onClick={openEssay} />
        )}
        {yr.markingSchemeAvailable ? (
          <ActionBtn color="#2fae9e" label="Marking Scheme" icon="✅" onClick={openMarkingScheme} />
        ) : (
          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[8px] text-[11px] font-semibold border border-border-dim text-text-muted opacity-50 cursor-not-allowed">
            ⏳ Scheme
          </span>
        )}
      </div>
      <div className="text-[10.5px] text-text-muted whitespace-nowrap ml-auto">
        MCQ {yr.mcqMarks}pts · Essay {yr.essayMarks}pts
      </div>
    </div>
  );
}

export default function PastPapersPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const { user } = useAuth();
  const [grade, setGrade] = useState('');
  const [year, setYear] = useState('');
  const [tree, setTree] = useState<PastPaperSubject[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await pastPapersService.getPastPapers({
          subject: subjectId,
          grade: grade || undefined,
          year: year || undefined,
        });
        if (!cancelled) setTree(data);
      } catch {
        if (!cancelled) setTree([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user, subjectId, grade, year]);

  const toggle = (id: string) => setOpen((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <div className="max-w-[900px]">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-[1.3rem] font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Past Papers
          </h1>
          <div className="text-[12px] text-text-muted mt-0.5">Topic-wise · MCQ + Essay · 2015–2024</div>
        </div>

        <div className="flex gap-1.5">
          {GRADE_OPTS.map((g) => (
            <button
              key={g || 'all'}
              onClick={() => setGrade(g)}
              className="px-4 py-1.5 rounded-full text-[12px] font-semibold border cursor-pointer transition-all font-[inherit]"
              style={{
                background: grade === g ? '#8b90f0' : '#fff',
                color: grade === g ? '#fff' : '#9a9ab0',
                borderColor: grade === g ? '#8b90f0' : '#ecebf6',
              }}
            >
              {g ? `Grade ${g}` : 'All Grades'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
        {YEAR_OPTS.map((y) => (
          <button
            key={y || 'all'}
            onClick={() => setYear(y)}
            className="px-3 py-1 rounded-full text-[11px] font-semibold border cursor-pointer transition-all shrink-0 font-[inherit]"
            style={{
              background: year === y ? '#6cd4da' : '#fff',
              color: year === y ? '#fff' : '#9a9ab0',
              borderColor: year === y ? '#6cd4da' : '#ecebf6',
            }}
          >
            {y || 'All Years'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-text-muted text-[13px]">Loading past papers…</div>
      ) : tree.length === 0 ? (
        <div className="text-center py-12 text-text-muted text-[13px]">No past papers match the current filter.</div>
      ) : (
        tree.map((subj) => (
          <div key={subj.subject_id} className="mb-6">
            <div className="flex items-center gap-2.5 mb-3 pb-2 border-b border-border-dim">
              <div className="w-2.5 h-2.5 rounded-full bg-brand" />
              <div className="text-[13.5px] font-bold text-text-primary">{subj.subject_name}</div>
              <div className="text-[11px] text-text-muted">{subj.topics.length} topics</div>
            </div>

            {subj.topics.map((topic) => {
              const id = `${subj.subject_id}_${topic.topic_id}`;
              const isOpen = open.has(id);
              return (
                <div key={id} className="mb-2">
                  <button
                    onClick={() => toggle(id)}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 bg-white border border-border-dim rounded-t-[12px] cursor-pointer text-left transition-colors hover:bg-surface-hover font-[inherit]"
                    style={{ borderRadius: isOpen ? '12px 12px 0 0' : '12px' }}
                  >
                    <div className="w-2 h-2 rounded-full bg-brand" />
                    <div className="text-[13px] font-semibold text-text-primary flex-1">{topic.topic_name}</div>
                    <div className="text-[11px] text-text-muted">
                      MCQ {topic.years.reduce((s, y) => s + y.mcqCount, 0)} · Essay {topic.years.reduce((s, y) => s + y.essayCount, 0)} · {topic.years.length} yrs
                    </div>
                    <span
                      className="text-[11px] text-text-muted transition-transform"
                      style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}
                    >▼</span>
                  </button>

                  {isOpen && (
                    <div className="border border-t-0 border-border-dim rounded-b-[12px] bg-white overflow-hidden">
                      {topic.years.map((yr) => <YearRow key={yr.id} yr={yr} subjectId={subjectId} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
