'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { SubjectSummary } from '@/services/admin.service';

interface SubjectCardsProps {
  summaries: SubjectSummary[];
  loading: boolean;
  /** Icon rendered in each card's chip (page-specific, e.g. <FileText />). */
  icon: ReactNode;
  /** Builds the drill-in link for a subject. */
  hrefFor: (s: SubjectSummary) => string;
  /** Builds the count lines for a subject; return null primary for an empty state. */
  statsFor: (s: SubjectSummary) => { primary: string | null; secondary?: string };
  /** Shown on cards whose statsFor returns a null primary (no content yet). */
  emptyLabel: string;
}

/**
 * Subject-card landing grid shared by the admin Papers and Question Pool pages.
 * Presentational only — the parent fetches summaries and defines links/labels.
 */
export function SubjectCards({ summaries, loading, icon, hrefFor, statsFor, emptyLabel }: SubjectCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-surface rounded-2xl border border-border-dim p-5 animate-pulse h-28" />
        ))}
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className="bg-surface rounded-2xl border border-border-dim p-8 text-center text-text-muted text-[13px]">
        No subjects yet. Create subjects first in the Subjects page.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {summaries.map((s) => {
        const stats = statsFor(s);
        return (
          <Link
            key={s.id}
            href={hrefFor(s)}
            className="bg-surface rounded-2xl border border-border-dim p-5 hover:border-gold/50 hover:-translate-y-0.5 transition-all duration-200 group no-underline block"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-[10px] bg-brand/10 text-brand flex items-center justify-center shrink-0">
                {icon}
              </div>
              <div className="min-w-0">
                <div className="text-[13.5px] font-bold text-text-primary group-hover:text-gold transition-colors truncate">
                  {s.name_si}
                </div>
                <div className="text-[10.5px] text-text-muted uppercase tracking-wide">{s.id}</div>
              </div>
            </div>
            <div className="mt-3">
              {stats.primary ? (
                <>
                  <div className="text-[12.5px] font-semibold text-text-primary">{stats.primary}</div>
                  {stats.secondary && (
                    <div className="text-[11.5px] text-text-muted mt-0.5">{stats.secondary}</div>
                  )}
                </>
              ) : (
                <div className="text-[12px] text-text-muted italic">{emptyLabel}</div>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
