'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { DashboardHero } from '@/components/home/DashboardHero';
import { subjectsService, type Stream, type Subject } from '@/services/subjects.service';
import { papersService, type UserStats } from '@/services/papers.service';

const QUICK_LINKS = [
  { icon: '📝', label: 'Daily MCQ',   href: (sid: string) => `/subject/${sid}/exam?type=daily` },
  { icon: '⭐', label: 'SRP Paper',    href: (sid: string) => `/subject/${sid}/exam?type=srp`   },
  { icon: '📚', label: 'Past Papers', href: (sid: string) => `/subject/${sid}/past-papers`     },
  { icon: '🏆', label: 'Leaderboard', href: (sid: string) => `/subject/${sid}/leaderboard`     },
];

const EXAM_DATE = new Date('2026-08-07T00:00:00+05:30');

function useCountdown() {
  const [diff, setDiff] = useState({ years: 0, months: 0, days: 0 });
  useEffect(() => {
    function compute() {
      const now = new Date();
      let y = EXAM_DATE.getFullYear() - now.getFullYear();
      let m = EXAM_DATE.getMonth() - now.getMonth();
      let d = EXAM_DATE.getDate() - now.getDate();
      if (d < 0) { m--; d += 30; }
      if (m < 0) { y--; m += 12; }
      setDiff({ years: Math.max(0, y), months: Math.max(0, m), days: Math.max(0, d) });
    }
    compute();
    const id = setInterval(compute, 60_000);
    return () => clearInterval(id);
  }, []);
  return diff;
}

function CountdownBox({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-base bg-white"
      style={{ width: 80, paddingTop: 16, paddingBottom: 14, boxShadow: '0 4px 20px rgba(139,144,240,.14)' }}
    >
      <div className="text-[2rem] font-bold leading-none text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
        {String(value).padStart(2, '0')}
      </div>
      <div className="text-[10.5px] text-text-muted font-semibold mt-1.5 uppercase tracking-wide">{label}</div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoggedIn, isLoading, logout } = useAuth();
  const countdown = useCountdown();

  const [streamInfo, setStreamInfo] = useState<Stream | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && !isLoggedIn) router.replace('/login');
  }, [isLoading, isLoggedIn, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      try {
        const [streams, subs, userStats] = await Promise.all([
          subjectsService.getStreams(),
          subjectsService.getStreamSubjects(user!.stream),
          papersService.getUserStats(),
        ]);
        if (cancelled) return;
        const found = streams.find((s) => s.id === user!.stream) ?? null;
        setStreamInfo(found);
        setSubjects(subs);
        setStats(userStats);
      } catch {
        // silently leave states empty — UI shows dashes
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-gold border-t-transparent animate-spin" />
          <span className="text-text-muted text-[13px]">Loading your dashboard…</span>
        </div>
      </div>
    );
  }

  const statCards = [
    { icon: '📝', label: 'Papers Attempted', value: stats ? String(stats.papers_attempted) : '—' },
    { icon: '🎯', label: 'Avg. Score',        value: stats ? `${stats.avg_score_pct.toFixed(1)}%` : '—' },
    { icon: '🏆', label: 'National Rank',     value: stats?.national_rank != null ? `#${stats.national_rank}` : '—' },
    { icon: '🔥', label: 'Day Streak',        value: stats ? `${stats.day_streak}d` : '—' },
  ];

  return (
    <div className="min-h-screen bg-dark">
      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 bg-surface border-b border-border-dim glass">
        <div className="max-w-275 mx-auto flex items-center h-15 px-5 gap-4">
          <Link href="/" className="flex items-center gap-2 no-underline">
            <div className="w-8 h-8 rounded-sm gradient-brand flex items-center justify-center text-white font-bold text-[14px]">M</div>
            <span className="text-[17px] font-bold text-text-primary hidden sm:block" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
              Mied<span className="text-gold">vance</span>
            </span>
          </Link>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-text-muted hidden sm:block">{user.name}</span>
            <div className="w-9 h-9 rounded-full gradient-brand flex items-center justify-center text-white font-bold text-[13px]">
              {user.name?.charAt(0).toUpperCase() ?? 'U'}
            </div>
            <button onClick={logout}
              className="text-[12px] text-text-muted hover:text-danger transition-colors bg-transparent border-none cursor-pointer">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-275 mx-auto px-5 py-8">

        {/* ── Hero animation + countdown ── */}
        <div className="flex flex-col items-center mb-10 overflow-hidden">
          <DashboardHero />
          <div className="flex flex-col items-center gap-3 mt-6">
            <div className="text-[10.5px] font-bold uppercase tracking-[2px] text-text-muted">A/L Exam Countdown</div>
            <div className="flex items-end gap-3">
              <CountdownBox value={countdown.years}  label="Years"  />
              <div className="text-[1.6rem] font-bold text-gold pb-4 select-none">:</div>
              <CountdownBox value={countdown.months} label="Months" />
              <div className="text-[1.6rem] font-bold text-gold pb-4 select-none">:</div>
              <CountdownBox value={countdown.days}   label="Days"   />
            </div>
          </div>
        </div>

        {/* ── Greeting ── */}
        <div className="mb-8">
          <h1 className="text-[1.6rem] font-bold text-text-primary mb-1" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Good {getGreeting()}, {user.name?.split(' ')[0]} 👋
          </h1>
          <p className="text-text-muted text-[13px]">
            {streamInfo?.name ?? user.stream} · Grade {user.grade} · {user.district}
          </p>
        </div>

        {/* ── Quick stats ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {statCards.map((s) => (
            <div key={s.label} className="bg-surface rounded-base border border-border-dim p-4 flex items-center gap-3">
              <span className="text-[22px]">{s.icon}</span>
              <div>
                <div className="text-[1.1rem] font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{s.value}</div>
                <div className="text-[10.5px] text-text-muted">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Your Subjects ── */}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[1rem] font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Your Subjects
          </h2>
          <span className="text-[11.5px] text-text-muted">{streamInfo?.name ?? user.stream} stream</span>
        </div>

        {dataLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-surface rounded-2xl border border-border-dim p-5 animate-pulse h-48" />
            ))}
          </div>
        ) : subjects.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-border-dim p-8 mb-8 text-center text-text-muted text-[13px]">
            No subjects added to your stream yet. Ask your admin to add subjects.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {subjects.map((sub) => (
              <div key={sub.id}
                className="bg-surface rounded-2xl border border-border-dim p-5 hover:border-gold/50 hover:-translate-y-0.5 transition-all duration-200 group"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-[10px] flex items-center justify-center text-[18px]"
                    style={{ background: (streamInfo?.color ?? '#8b90f0') + '15' }}>
                    {streamInfo?.icon ?? '📚'}
                  </div>
                  <div>
                    <div className="text-[13.5px] font-bold text-text-primary group-hover:text-gold transition-colors">{sub.name_si}</div>
                    <div className="text-[10.5px] text-text-muted">Grade {user.grade}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {QUICK_LINKS.map((ql) => (
                    <Link key={ql.label} href={ql.href(sub.id)}
                      className="flex items-center gap-1.5 px-2.5 py-2 rounded-sm bg-dark border border-border-dim text-[11px] text-text-muted no-underline hover:border-gold hover:text-gold transition-all">
                      <span>{ql.icon}</span>
                      <span className="font-medium">{ql.label}</span>
                    </Link>
                  ))}
                </div>

                <Link href={`/subject/${sub.id}`}
                  className="mt-3 w-full flex items-center justify-center py-2 rounded-sm text-[12px] font-semibold text-gold border border-gold/30 bg-gold/5 no-underline hover:bg-gold hover:text-white transition-all">
                  Open Subject →
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* ── Today's activity ── */}
        <div className="bg-surface rounded-2xl border border-border-dim p-6">
          <h2 className="text-[1rem] font-bold text-text-primary mb-4" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Today&apos;s Activity
          </h2>
          <div className="text-center py-6 text-text-muted text-[13px]">
            <div className="text-[2.5rem] mb-3">📖</div>
            <p className="font-medium text-text-primary mb-1">Start your first paper!</p>
            <p className="text-[12px]">Pick a subject above and attempt today&apos;s Daily MCQ.</p>
          </div>
        </div>
      </main>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
