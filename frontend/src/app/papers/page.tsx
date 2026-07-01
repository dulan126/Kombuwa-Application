'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { papersService } from '@/services/papers.service';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/ProgressBar';
import { STREAMS } from '@/lib/constants';
import { generateDemoPapers } from '@/lib/demo-data';
import { usePapers } from '@/hooks/usePapers';
import type { Paper } from '@/types';
import type { Grade } from '@/types/auth';

// ─── Paper Card Component ────────────────────────────────────────────────────

const PaperCard = React.memo(function PaperCard({ paper, streamColor, streamBg, onClick }: {
  paper: Paper;
  streamColor: string;
  streamBg: string;
  onClick: (paper: Paper) => void;
}) {
  const isSRP = paper.type === 'srp';
  const tot = paper.question_count;

  return (
    <Card isSRP={isSRP} isDone={paper.done} isHoverable onClick={() => onClick(paper)} className="overflow-hidden">
      <div className="h-[70px] flex items-center justify-center text-[28px] relative" style={{ background: streamBg }}>
        {isSRP ? '⭐' : '📝'}
        <span className="absolute top-1.5 right-1.5">
          <Badge variant={paper.done ? 'success' : isSRP ? 'srp' : 'info'}>
            {paper.done ? '✓' : isSRP ? 'SRP' : 'Daily'}
          </Badge>
        </span>
      </div>
      <div className="p-3">
        <div className="text-[8px] font-bold tracking-[1.5px] uppercase text-gold mb-0.5">
          {paper.subject_name}{isSRP ? ' · SRP' : ' · Daily'}
        </div>
        <div className="text-xs font-semibold mb-1 leading-snug">{paper.title}</div>
        <div className="flex items-center gap-2 flex-wrap mt-1.5">
          <span className="text-[10px] text-text-muted">📋 ප්‍ර {tot}</span>
          <span className={`text-[9.5px] rounded px-1.5 py-px border ${
            paper.done
              ? 'bg-success/10 border-success/20 text-success'
              : 'bg-danger/10 border-danger/20 text-danger'
          }`}>
            {paper.done && paper.score != null
              ? `${paper.score}/${tot}`
              : `⏱ ${tot === 30 ? '30' : '10'}මිනි`}
          </span>
        </div>
        {paper.done && paper.ms_available && (
          <div className="mt-1.5">
            <Badge variant="success" className="text-[9px] cursor-pointer">📖 ලකුණු ක්‍රමය</Badge>
          </div>
        )}
        {paper.done && !paper.ms_available && (
          <div className="mt-1.5 text-[9.5px] text-warning">⏳ ලකුණු ක්‍රමය — ශේෂ දිනෙ</div>
        )}
      </div>
    </Card>
  );
});

// ─── Papers Dashboard Page ──────────────────────────────────────────────────

export default function PapersPage() {
  const router = useRouter();
  const { user, isLoggedIn } = useAuth();
  const { showToast } = useToast();
  const [viewGrade, setViewGrade] = useState<Grade>((user?.grade as Grade) || '12');

  const { papers, loading, isDemoMode } = usePapers({ user, grade: viewGrade });

  // Auth guard
  useEffect(() => {
    if (!isLoggedIn) router.push('/');
  }, [isLoggedIn, router]);

  const stream = user?.stream ? STREAMS[user.stream] : STREAMS.phy;

  // Group papers by subject
  const bySubject = useMemo(() => {
    const map: Record<string, Paper[]> = {};
    papers.forEach((p) => {
      if (!map[p.subject_id]) map[p.subject_id] = [];
      map[p.subject_id].push(p);
    });
    return map;
  }, [papers]);

  const handlePaperClick = useCallback((paper: Paper) => {
    if (paper.done) {
      if (paper.ms_available) {
        router.push(`/marking-scheme?paperId=${paper.id}`);
      } else {
        showToast('⏳ ලකුණු ක්‍රමය — ශේෂ දිනෙ', 'warning');
      }
    } else {
      router.push(`/papers/${paper.id}`);
    }
  }, [router, showToast]);

  if (!isLoggedIn) return null;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">{stream.icon} {stream.name} — ප්‍රශ්න පත්‍ර</h1>
          <p className="text-[11px] text-text-muted mt-1">
            {viewGrade} ශ්‍රේණිය papers · Grade 12 & 13 access{isDemoMode ? ' · Demo Mode' : ''}
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            className={`px-[18px] py-1.5 rounded-full text-xs font-semibold border cursor-pointer transition-all font-[inherit] ${
              viewGrade === '12' ? 'bg-gold border-gold text-white' : 'bg-surface border-border-dim text-text-muted hover:border-gold'
            }`}
            onClick={() => setViewGrade('12')}
          >
            12 ශ්‍රේණිය
          </button>
          <button
            className={`px-[18px] py-1.5 rounded-full text-xs font-semibold border cursor-pointer transition-all font-[inherit] ${
              viewGrade === '13' ? 'bg-gold border-gold text-white' : 'bg-surface border-border-dim text-text-muted hover:border-gold'
            }`}
            onClick={() => setViewGrade('13')}
          >
            13 ශ්‍රේණිය
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          {/* SRP Highlight Banner */}
          <div className="bg-gradient-to-r from-gold/10 to-gold/[0.03] border border-gold/[0.22] rounded-[var(--radius-base)] p-3 mb-5 flex items-center gap-3">
            <span className="text-xl">⭐</span>
            <div className="flex-1">
              <div className="text-[12.5px] font-bold text-gold">SRP — Weekly Special Ranking Papers</div>
              <div className="text-[10.5px] text-text-muted mt-0.5">
                ප්‍ර 30 · 30 මිනිත්තු · Island-wide · {viewGrade} ශ්‍රේ · ලකුණු ක්‍රමය ඒ දිනෙ upload
                {isDemoMode ? ' · Demo mode — backend offline' : ''}
              </div>
            </div>
          </div>

          {/* Subject Blocks */}
          {stream.subjects.map((sub) => {
            const subPapers = bySubject[sub.id] || [];
            if (!subPapers.length) return null;
            const done = subPapers.filter((p) => p.done).length;
            const srps = subPapers.filter((p) => p.type === 'srp');
            const dailies = subPapers.filter((p) => p.type === 'daily');

            return (
              <div key={sub.id} className="mb-8">
                <div className="flex items-center gap-2.5 mb-3 pb-2 border-b border-border-dim">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: stream.color }} />
                  <div className="text-[13.5px] font-bold">{sub.n}</div>
                  <div className="text-[10.5px] text-text-muted">{done}/{subPapers.length} සම්.</div>
                  <div className="text-[10.5px] text-text-muted ml-auto">{viewGrade}ශ්‍රේ</div>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(175px,1fr))] gap-3">
                  {[...srps, ...dailies].map((p) => (
                    <PaperCard
                      key={p.id}
                      paper={p}
                      streamColor={stream.color}
                      streamBg={stream.bg}
                      onClick={handlePaperClick}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
