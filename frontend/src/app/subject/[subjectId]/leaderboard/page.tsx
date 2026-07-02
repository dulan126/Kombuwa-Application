'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { DISTRICTS } from '@/lib/constants';

interface RankEntry { rank: number; name: string; district: string; score: number; pct: number; trend: 'up' | 'down' | 'same'; }

function generateDemo(subjectId: string): RankEntry[] {
  const names = ['Kavitha P.', 'Lahiru S.', 'Nimasha F.', 'Dilshan R.', 'Tharindu M.', 'Sathya J.', 'Amaya K.', 'Roshan B.'];
  const ds = DISTRICTS.slice(0, 5).map((d) => d.en);
  return names.map((name, i) => ({
    rank: i + 1,
    name,
    district: ds[i % ds.length],
    score: Math.round(28 - i * 1.5),
    pct: Math.round(93 - i * 3.5),
    trend: i < 3 ? 'up' : i < 6 ? 'same' : 'down',
  }));
}

const PODIUM_ICONS = ['🥇', '🥈', '🥉'];
const TREND_ICON: Record<string, { icon: string; color: string }> = {
  up: { icon: '↑', color: '#2fae9e' },
  down: { icon: '↓', color: '#E25C5C' },
  same: { icon: '—', color: '#9a9ab0' },
};

export default function LeaderboardPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const { user } = useAuth();
  const [district, setDistrict] = useState('');
  const [rows, setRows] = useState<RankEntry[]>([]);

  useEffect(() => {
    setRows(generateDemo(subjectId));
  }, [subjectId]);

  const filtered = district ? rows.filter((r) => r.district === district) : rows;
  const top3 = filtered.slice(0, 3);
  const rest = filtered.slice(3);

  return (
    <div className="max-w-[780px]">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-[1.3rem] font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Leaderboard
          </h1>
          <div className="text-[12px] text-text-muted mt-0.5">Island-wide rankings · Updated after each exam window</div>
        </div>

        <select
          value={district}
          onChange={(e) => setDistrict(e.target.value)}
          className="px-3 py-1.5 rounded-full border border-border-dim text-[12px] text-text-primary bg-white outline-none focus:border-gold cursor-pointer"
        >
          <option value="">All Districts</option>
          {DISTRICTS.map((d) => (
            <option key={d.en} value={d.en}>{d.si} ({d.en})</option>
          ))}
        </select>
      </div>

      {/* Podium */}
      {top3.length >= 3 && (
        <div className="bg-white rounded-[18px] border border-border-dim p-6 mb-5">
          <div className="flex items-end justify-center gap-4">
            {/* 2nd */}
            <div className="flex flex-col items-center gap-2 mb-0">
              <span className="text-2xl">{PODIUM_ICONS[1]}</span>
              <div className="w-11 h-11 rounded-full bg-text-muted/15 flex items-center justify-center font-bold text-text-muted text-[15px]">
                {top3[1].name.charAt(0)}
              </div>
              <div className="text-[11.5px] font-semibold text-text-primary text-center max-w-[70px] truncate">{top3[1].name}</div>
              <div
                className="w-16 rounded-t-[6px] flex items-center justify-center text-white text-[13px] font-bold"
                style={{ height: 60, background: '#9a9ab0' }}
              >
                {top3[1].pct}%
              </div>
            </div>
            {/* 1st */}
            <div className="flex flex-col items-center gap-2">
              <span className="text-3xl">{PODIUM_ICONS[0]}</span>
              <div className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-white text-[18px] gradient-brand">
                {top3[0].name.charAt(0)}
              </div>
              <div className="text-[12px] font-bold text-text-primary text-center max-w-[80px] truncate">{top3[0].name}</div>
              <div
                className="w-20 rounded-t-[6px] flex items-center justify-center text-white text-[14px] font-bold"
                style={{ height: 80, background: '#8b90f0' }}
              >
                {top3[0].pct}%
              </div>
            </div>
            {/* 3rd */}
            <div className="flex flex-col items-center gap-2 mb-0">
              <span className="text-2xl">{PODIUM_ICONS[2]}</span>
              <div className="w-11 h-11 rounded-full bg-warning/15 flex items-center justify-center font-bold text-warning text-[15px]">
                {top3[2].name.charAt(0)}
              </div>
              <div className="text-[11.5px] font-semibold text-text-primary text-center max-w-[70px] truncate">{top3[2].name}</div>
              <div
                className="w-16 rounded-t-[6px] flex items-center justify-center text-white text-[13px] font-bold"
                style={{ height: 45, background: '#f2994a' }}
              >
                {top3[2].pct}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full list */}
      <div className="bg-white rounded-[14px] border border-border-dim overflow-hidden">
        <div className="grid grid-cols-[40px_1fr_100px_70px_40px] px-4 py-2.5 border-b border-border-dim text-[10.5px] font-semibold text-text-muted uppercase tracking-wide">
          <span>#</span>
          <span>Student</span>
          <span>District</span>
          <span className="text-right">Score</span>
          <span className="text-right">↕</span>
        </div>
        {filtered.map((row) => {
          const t = TREND_ICON[row.trend];
          const isMe = row.name === user?.name;
          return (
            <div
              key={row.rank}
              className="grid grid-cols-[40px_1fr_100px_70px_40px] px-4 py-3 border-b border-border-dim last:border-b-0 items-center hover:bg-surface-hover transition-colors"
              style={isMe ? { background: '#8b90f010' } : undefined}
            >
              <span
                className="text-[13px] font-bold"
                style={{ color: row.rank <= 3 ? '#8b90f0' : '#9a9ab0', fontFamily: 'var(--font-space-grotesk)' }}
              >
                {row.rank}
              </span>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-gold/12 flex items-center justify-center text-[12px] font-bold text-gold shrink-0">
                  {row.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-text-primary truncate">
                    {row.name} {isMe && <span className="text-[10px] text-gold">(you)</span>}
                  </div>
                </div>
              </div>
              <span className="text-[11.5px] text-text-muted capitalize">{row.district}</span>
              <div className="text-right">
                <div className="text-[12.5px] font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  {row.pct}%
                </div>
                <div className="text-[10px] text-text-muted">{row.score}/30</div>
              </div>
              <span className="text-right text-[13px] font-bold" style={{ color: t.color }}>{t.icon}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
