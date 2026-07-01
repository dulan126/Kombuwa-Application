'use client';

import React, { useEffect, useState } from 'react';
import { PAPER_TYPES } from '@/lib/constants';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Select } from '@/components/ui/Input';
import { Spinner, Avatar } from '@/components/ui/ProgressBar';
import { DEMO_LEADERBOARD } from '@/lib/demo-data';
import { formatTime, getInitials } from '@/lib/utils';
import type { LeaderboardEntry, MyRank } from '@/types';

export default function RankingsPage() {
  const router = useRouter();
  const { user, isLoggedIn } = useAuth();
  const [loading, setLoading] = useState(true);
  const [lbData, setLbData] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<MyRank | null>(null);

  useEffect(() => {
    if (!isLoggedIn) { router.push('/'); return; }
    // Demo data for now
    setLbData(DEMO_LEADERBOARD);
    setMyRank({ national_rank: 12, district_rank: 3, score: 24, time_taken_secs: 1200 });
    setLoading(false);
  }, [isLoggedIn, router]);

  if (!isLoggedIn) return null;

  const tot = 30;
  const top3 = lbData.slice(0, 3);
  const rest = lbData.slice(3);
  const pc = (Math.floor(Math.random() * 2000) + 600).toLocaleString();

  const medals = ['🥈', '🥇', '🥉'];
  const podiumOrder = [1, 0, 2];
  const podiumColors = [
    { bg: 'rgba(176,176,176,0.07)', border: 'rgba(176,176,176,0.2)', color: '#9a9ab8' },
    { bg: 'rgba(201,168,76,0.08)', border: 'rgba(201,168,76,0.28)', color: '#c9a84c' },
    { bg: 'rgba(205,127,50,0.07)', border: 'rgba(205,127,50,0.2)', color: '#cd7f32' },
  ];

  return (
    <div className="p-6 max-w-[880px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">🏆 ශ්‍රේණිගත කිරීම</h1>
          <p className="text-[11px] text-text-muted">Paper type · Subject · Grade · District</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select options={[{ value: PAPER_TYPES.SRP, label: '⭐ SRP' }, { value: PAPER_TYPES.DAILY, label: '📝 Daily MCQ' }]} className="w-auto" />
          <Select options={[{ value: 'm', label: 'ඒකාබද්ධ ගණිතය' }, { value: 'ph', label: 'භෞතිකය' }, { value: 'ch', label: 'රසායනය' }]} className="w-auto" />
          <Select options={[{ value: '12', label: '12 ශ්‍රේණිය' }, { value: '13', label: '13 ශ්‍රේණිය' }]} className="w-auto" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <>
          {/* My Rank */}
          {myRank && (
            <div className="bg-dark-2 border border-gold-border rounded-[var(--radius-base)] p-4 mb-5 flex items-center gap-3.5 flex-wrap">
              <div className="w-[50px] h-[50px] rounded-full bg-gold-bg border-2 border-gold-border flex items-center justify-center text-xl font-bold text-gold shrink-0">
                #{myRank.national_rank}
              </div>
              <div className="flex-1">
                <div className="text-xs font-semibold mb-0.5">{user?.name} ශ්‍රේණිය</div>
                <div className="text-xl font-bold text-gold">
                  #{myRank.national_rank} <span className="text-[11px] text-text-muted">/ {pc}</span>
                </div>
                <div className="text-[11px] text-text-muted mt-0.5">ලකුණු: {myRank.score}/{tot} · දිස්ත්‍රික්: #{myRank.district_rank}</div>
              </div>
              <div className="text-right">
                <div className="text-[1.9rem] font-bold text-success">{myRank.score}</div>
                <div className="text-[9.5px] text-text-muted">ලකුණු</div>
              </div>
            </div>
          )}

          {/* Podium */}
          <div className="grid grid-cols-3 max-sm:grid-cols-1 gap-3.5 mb-7 items-end">
            {podiumOrder.map((i) => {
              const entry = top3[i];
              if (!entry) return <div key={`empty-${i}`} />;
              const c = podiumColors[i];
              return (
                <div key={entry.national_rank} className="text-center">
                  <div
                    className="rounded-t-[var(--radius-base)] p-4 border border-b-0"
                    style={{ background: c.bg, borderColor: c.border, paddingTop: i === 0 ? '1.3rem' : '1rem' }}
                  >
                    <div className="w-[46px] h-[46px] rounded-full mx-auto mb-2 flex items-center justify-center text-sm font-extrabold" style={{ background: c.bg, color: c.color }}>
                      {getInitials(entry.name)}
                    </div>
                    <div className="text-xs font-semibold mb-1">{entry.name}</div>
                    <div className="text-[10px] text-text-muted">{entry.score}/{tot}·{entry.district}</div>
                    <div className="text-[1.7rem] font-bold" style={{ color: c.color }}>{i + 1}</div>
                  </div>
                  <div className="h-8 flex items-center justify-center rounded-b-[var(--radius-base)] text-lg" style={{ background: c.bg }}>
                    {medals[i]}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Leaderboard Rows */}
          <div className="flex flex-col gap-1.5">
            {rest.map((r) => (
              <LeaderboardRow
                key={r.national_rank}
                rank={r.national_rank}
                name={r.name}
                district={r.district}
                score={r.score}
                total={tot}
                timeTakenSecs={r.time_taken_secs}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Leaderboard Row Component ──────────────────────────────────────────────

const LeaderboardRow = React.memo(function LeaderboardRow({
  rank,
  name,
  district,
  score,
  total,
  timeTakenSecs,
}: {
  rank: number;
  name: string;
  district: string;
  score: number;
  total: number;
  timeTakenSecs: number;
}) {
  return (
    <div className="flex items-center gap-3 bg-surface border border-border-dim rounded-[var(--radius-sm)] px-3.5 py-2.5">
      <div className="w-[22px] text-center text-[11px] font-bold text-text-muted">{rank}</div>
      <Avatar name={name} />
      <div className="flex-1">
        <div className="text-xs font-medium">{name}</div>
        <div className="text-[10px] text-text-muted">{district}</div>
      </div>
      <div className="text-[13.5px] font-bold text-gold">{score}/{total}</div>
      <div className="text-[10px] text-text-muted">{formatTime(timeTakenSecs)}</div>
    </div>
  );
});
