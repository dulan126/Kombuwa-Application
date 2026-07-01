'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Select } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/ProgressBar';
import { STREAMS } from '@/lib/constants';
import { generateDemoPastPapersTree } from '@/lib/demo-data';
import { cn } from '@/lib/utils';
import type { PastPaperSubject, PastPaperYear } from '@/types';
import type { Stream } from '@/types/auth';

export default function PastPapersPage() {
  const router = useRouter();
  const { user, isLoggedIn } = useAuth();
  const [loading, setLoading] = useState(true);
  const [tree, setTree] = useState<PastPaperSubject[]>([]);
  const [openTopics, setOpenTopics] = useState<Set<string>>(new Set());

  // Filters
  const [filterSubject, setFilterSubject] = useState('');
  const [filterGrade, setFilterGrade] = useState('');
  const [filterYear, setFilterYear] = useState('');

  useEffect(() => {
    if (!isLoggedIn) { router.push('/'); return; }
    loadData();
  }, [isLoggedIn, router, filterSubject, filterGrade, filterYear]);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    // Demo data
    const data = generateDemoPastPapersTree(user.stream as Stream, {
      subject: filterSubject || undefined,
      grade: filterGrade || undefined,
      year: filterYear || undefined,
    });
    setTree(data);
    setLoading(false);
  }, [user, filterSubject, filterGrade, filterYear]);

  const toggleTopic = (id: string) => {
    setOpenTopics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (!isLoggedIn) return null;

  const stream = user?.stream ? STREAMS[user.stream as Stream] : STREAMS.phy;

  return (
    <div className="p-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">📚 Past Papers</h1>
          <p className="text-[11px] text-text-muted">Topic-wise restructured · MCQ + Essay · Marking Scheme · 2015–2024</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
            options={[{ value: '', label: 'විෂය — සියල්ල' }, ...stream.subjects.map((s) => ({ value: s.id, label: s.n }))]}
            className="w-auto"
          />
          <Select
            value={filterGrade}
            onChange={(e) => setFilterGrade(e.target.value)}
            options={[{ value: '', label: 'ශ්‍රේණිය — සියල්ල' }, { value: '12', label: '12 ශ්‍රේණිය' }, { value: '13', label: '13 ශ්‍රේණිය' }]}
            className="w-auto"
          />
          <Select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            options={[{ value: '', label: 'වර්ෂය — සියල්ල' }, ...Array.from({ length: 10 }, (_, i) => ({ value: String(2024 - i), label: String(2024 - i) }))]}
            className="w-auto"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : !tree.length ? (
        <div className="text-center py-10 text-text-muted">ඔබේ ධාරාවේ Past papers නොමැත.</div>
      ) : (
        tree.map((subj) => (
          <div key={subj.subject_id} className="mb-10">
            {/* Subject Header */}
            <div className="flex items-center gap-2.5 mb-3.5 pb-2 border-b border-border-dim">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: stream.color }} />
              <div className="text-sm font-bold">{subj.subject_name}</div>
              <div className="text-[10.5px] text-text-muted">{subj.topics.length} topics · Topic-wise restructured · 2015–2024</div>
            </div>

            {/* Topics */}
            {subj.topics.map((topic) => {
              const topicId = `${subj.subject_id}_${topic.topic_id}`;
              const isOpen = openTopics.has(topicId);
              const totalMCQ = topic.years.reduce((s, y) => s + y.mcqCount, 0);
              const totalEssay = topic.years.reduce((s, y) => s + y.essayCount, 0);

              return (
                <div key={topicId} className="mb-0">
                  {/* Topic Header */}
                  <div
                    className="flex items-center gap-2.5 px-4 py-2.5 bg-dark-2 border border-border-dim rounded-t-[var(--radius-base)] cursor-pointer select-none hover:bg-surface"
                    onClick={() => toggleTopic(topicId)}
                  >
                    <div className="w-2 h-2 rounded-full" style={{ background: stream.color }} />
                    <div className="text-[13px] font-bold flex-1">{topic.topic_name}</div>
                    <div className="text-[10.5px] text-text-muted">MCQ {totalMCQ} · Essay {totalEssay} · {topic.years.length} years</div>
                    <div className={cn('text-[11px] text-text-muted transition-transform', isOpen && 'rotate-180')}>▼</div>
                  </div>

                  {/* Topic Body */}
                  {isOpen && (
                    <div className="border border-t-0 border-border-dim rounded-b-[var(--radius-base)] bg-dark overflow-hidden mb-3">
                      {topic.years.map((yr) => (
                        <YearRow key={yr.id} year={yr} subjectId={subj.subject_id} topicName={topic.topic_name} subjectName={subj.subject_name} />
                      ))}
                    </div>
                  )}

                  {!isOpen && <div className="mb-3" />}
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}

// ─── Year Row Component ──────────────────────────────────────────────────────

const YearRow = React.memo(function YearRow({ year, subjectId, topicName, subjectName }: {
  year: PastPaperYear;
  subjectId: string;
  topicName: string;
  subjectName: string;
}) {
  return (
    <div className="flex items-center px-4 py-3 border-b border-white/[0.04] last:border-b-0 gap-4 flex-wrap">
      <div className="text-xs font-bold text-gold w-11 shrink-0">{year.year}</div>
      <div className="flex gap-2 flex-wrap flex-1">
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-[11px] font-semibold cursor-pointer border transition-all bg-accent/10 border-accent/[0.28] text-accent hover:bg-accent/[0.18] hover:border-accent">
          📝 MCQ {year.mcqCount}ක්
        </button>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-[11px] font-semibold cursor-pointer border transition-all bg-accent-2/10 border-accent-2/[0.28] text-accent-2 hover:bg-accent-2/[0.18] hover:border-accent-2">
          📄 Essay {year.essayCount}ක් PDF
        </button>
        {year.markingSchemeAvailable ? (
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-[11px] font-semibold cursor-pointer border transition-all bg-success/10 border-success/[0.28] text-success hover:bg-success/[0.18] hover:border-success">
            ✅ Marking Scheme
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-[11px] font-semibold border opacity-40 cursor-not-allowed bg-white/[0.03] border-white/10 text-text-muted">
            ⏳ Scheme
          </span>
        )}
      </div>
      <div className="text-[10px] text-text-muted whitespace-nowrap ml-auto">MCQ {year.mcqMarks}pts · Essay {year.essayMarks}pts</div>
    </div>
  );
});
