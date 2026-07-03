'use client';

import { useEffect, useState } from 'react';
import { adminService, type AdminStats } from '@/services/admin.service';

const STAT_CARDS = [
  { key: 'totalStudents' as const, icon: '👥', label: 'Students'        },
  { key: 'totalPapers'   as const, icon: '📋', label: 'Published Papers' },
  { key: 'totalAttempts' as const, icon: '📝', label: 'Attempts'         },
  { key: 'dau'           as const, icon: '🔥', label: 'Active Today'     },
];

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminService.getStats()
      .then(setStats)
      .catch(() => setError('Failed to load stats'));
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-40 text-danger text-[13px]">{error}</div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[1.4rem] font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          Dashboard
        </h1>
        <p className="text-text-muted text-[12.5px] mt-0.5">Platform overview</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {STAT_CARDS.map((card) => (
          <div key={card.key} className="bg-surface rounded-base border border-border-dim p-5">
            <div className="text-[24px] mb-2">{card.icon}</div>
            <div className="text-[1.6rem] font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
              {stats ? stats[card.key].toLocaleString() : <span className="text-text-muted">—</span>}
            </div>
            <div className="text-[11px] text-text-muted mt-0.5">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface rounded-base border border-border-dim p-5">
          <h2 className="text-[13px] font-bold text-text-primary mb-3" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Weekly Active Users
          </h2>
          <div className="text-[2rem] font-bold text-gold" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            {stats ? stats.wau.toLocaleString() : '—'}
          </div>
          <p className="text-[11.5px] text-text-muted mt-1">Unique users in the last 7 days</p>
        </div>

        <div className="bg-surface rounded-base border border-border-dim p-5">
          <h2 className="text-[13px] font-bold text-text-primary mb-3" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Top Forum Subjects
          </h2>
          {stats ? (
            (stats.topForumSubjects ?? []).length > 0 ? (
              <ul className="space-y-2">
                {(stats.topForumSubjects ?? []).map((s) => (
                  <li key={s.subject_id} className="flex items-center justify-between text-[12.5px]">
                    <span className="text-text-primary font-medium">{s.subject_id}</span>
                    <span className="text-text-muted">{s.cnt} threads</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-text-muted text-[12.5px]">No forum activity yet.</p>
            )
          ) : (
            <div className="space-y-2">
              {[1,2,3].map(i => (
                <div key={i} className="h-4 rounded bg-dark animate-pulse" />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
