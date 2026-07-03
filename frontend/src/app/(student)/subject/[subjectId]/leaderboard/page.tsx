'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { papersService } from '@/services/papers.service';
import { rankingsService } from '@/services/rankings.service';
import { DISTRICTS } from '@/lib/constants';
import type { LeaderboardEntry, MyRank } from '@/types';

const PODIUM_ICONS = ['🥇', '🥈', '🥉'];

export default function LeaderboardPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const { user } = useAuth();
  const [district, setDistrict] = useState('');
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<MyRank | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [paperId, setPaperId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      try {
        const papers = await papersService.getPapers({ subject: subjectId });
        const latest = papers[0] ?? null;
        if (!latest) { setLoading(false); return; }
        if (cancelled) return;
        setPaperId(latest.id);
        const res = await rankingsService.getRankings(latest.id, {
          district: district || undefined,
          page: 1,
          limit: 50,
        });
        if (cancelled) return;
        setRows(res.rows);
        setMyRank(res.myRank ?? null);
        setTotal(res.total ?? null);
      } catch {
        // leave empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user, subjectId, district]);

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <div className="max-w-[780px]">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-[1.3rem] font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Leaderboard
          </h1>
          <div className="text-[12px] text-text-muted mt-0.5">
            Island-wide rankings · Updated after each exam window
            {total != null && ` · ${total.toLocaleString()} participants`}
          </div>
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

      {loading ? (
        <div className="flex items-center justify-center py-16 text-text-muted text-[13px]">Loading rankings…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-14 text-text-muted text-[13px]">
          {paperId ? 'No rankings available yet for this subject.' : 'No papers found for this subject.'}
        </div>
      ) : (
        <>
          {/* My rank card */}
          {myRank && (
            <div className="bg-gold/8 border border-gold/30 rounded-[14px] p-4 mb-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full gradient-brand flex items-center justify-center text-white font-bold text-[14px]">
                {user?.name?.charAt(0).toUpperCase() ?? 'U'}
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-bold text-text-primary">Your Rank</div>
                <div className="text-[11px] text-text-muted">{user?.name}</div>
              </div>
              <div className="text-right">
                <div className="text-[1.4rem] font-bold text-gold" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  #{myRank.national_rank ?? '—'}
                </div>
                <div className="text-[10.5px] text-text-muted">National</div>
              </div>
              <div className="text-right">
                <div className="text-[1.1rem] font-bold text-accent">#{myRank.district_rank ?? '—'}</div>
                <div className="text-[10.5px] text-text-muted">District</div>
              </div>
            </div>
          )}

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
                  <div className="w-16 rounded-t-[6px] flex items-center justify-center text-white text-[13px] font-bold"
                    style={{ height: 60, background: '#9a9ab0' }}>
                    {Math.round((top3[1].score / Math.max(top3[0].score, 1)) * 100)}%
                  </div>
                </div>
                {/* 1st */}
                <div className="flex flex-col items-center gap-2">
                  <span className="text-3xl">{PODIUM_ICONS[0]}</span>
                  <div className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-white text-[18px] gradient-brand">
                    {top3[0].name.charAt(0)}
                  </div>
                  <div className="text-[12px] font-bold text-text-primary text-center max-w-[80px] truncate">{top3[0].name}</div>
                  <div className="w-20 rounded-t-[6px] flex items-center justify-center text-white text-[14px] font-bold"
                    style={{ height: 80, background: '#8b90f0' }}>
                    {top3[0].score}pts
                  </div>
                </div>
                {/* 3rd */}
                <div className="flex flex-col items-center gap-2 mb-0">
                  <span className="text-2xl">{PODIUM_ICONS[2]}</span>
                  <div className="w-11 h-11 rounded-full bg-warning/15 flex items-center justify-center font-bold text-warning text-[15px]">
                    {top3[2].name.charAt(0)}
                  </div>
                  <div className="text-[11.5px] font-semibold text-text-primary text-center max-w-[70px] truncate">{top3[2].name}</div>
                  <div className="w-16 rounded-t-[6px] flex items-center justify-center text-white text-[13px] font-bold"
                    style={{ height: 45, background: '#f2994a' }}>
                    {top3[2].score}pts
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Full list */}
          <div className="bg-white rounded-[14px] border border-border-dim overflow-hidden">
            <div className="grid grid-cols-[40px_1fr_100px_70px_70px] px-4 py-2.5 border-b border-border-dim text-[10.5px] font-semibold text-text-muted uppercase tracking-wide">
              <span>#</span>
              <span>Student</span>
              <span>District</span>
              <span className="text-right">Score</span>
              <span className="text-right">Time</span>
            </div>
            {rows.map((row) => {
              const isMe = row.name === user?.name;
              return (
                <div
                  key={row.national_rank}
                  className="grid grid-cols-[40px_1fr_100px_70px_70px] px-4 py-3 border-b border-border-dim last:border-b-0 items-center hover:bg-surface-hover transition-colors"
                  style={isMe ? { background: '#8b90f010' } : undefined}
                >
                  <span
                    className="text-[13px] font-bold"
                    style={{ color: row.national_rank <= 3 ? '#8b90f0' : '#9a9ab0', fontFamily: 'var(--font-space-grotesk)' }}
                  >
                    {row.national_rank}
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
                      {row.score}
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-text-muted">
                    {Math.round(row.time_taken_secs / 60)}m
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
