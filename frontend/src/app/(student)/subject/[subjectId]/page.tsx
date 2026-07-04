'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePapers } from '@/hooks/usePapers';
import { papersService, type UserStats } from '@/services/papers.service';

// ── SLST time utilities ───────────────────────────────────────────────────────

function getSLSTNow(): Date {
  const now = new Date();
  // Always derive from UTC so the client's local timezone is irrelevant
  return new Date(now.getTime() + now.getTimezoneOffset() * 60_000 + 330 * 60_000);
}

function msUntilNextMidnightSLST(): number {
  const slst = getSLSTNow();
  const midnight = new Date(slst);
  midnight.setHours(24, 0, 0, 0);
  return Math.max(0, midnight.getTime() - slst.getTime());
}

function isDailyWindowOpen(availableUntil?: string): boolean {
  if (!availableUntil) return true; // legacy paper without window: treat as open
  return new Date(availableUntil).getTime() > Date.now();
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function SRPCountdownCard({ availableFrom, questionCount, timeSeconds }: {
  availableFrom: string;
  questionCount: number;
  timeSeconds: number;
}) {
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    function update() {
      const ms = Math.max(0, new Date(availableFrom).getTime() - Date.now());
      const s = Math.floor(ms / 1000);
      const days = Math.floor(s / 86400);
      const h = Math.floor((s % 86400) / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      const hms = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
      setCountdown(days >= 1 ? `${days}d ${hms}` : hms);
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [availableFrom]);

  const startDate = new Date(availableFrom).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeMins = Math.round(timeSeconds / 60);

  return (
    <div
      className="rounded-base p-4 mb-6 flex items-center gap-4"
      style={{ background: 'linear-gradient(135deg, #6f73d6 0%, #5a5ebd 100%)', opacity: 0.9 }}
    >
      <span className="text-2xl shrink-0">⭐</span>
      <div className="flex-1">
        <div className="text-white font-bold text-[13.5px]">Get Ready — Special Ranking Paper</div>
        <div className="text-white/75 text-[12px] mt-0.5">
          {questionCount} Questions · {timeMins} min · Island-wide Ranking
        </div>
        <div className="text-white/80 text-[12px] font-mono font-bold mt-1">{countdown}</div>
      </div>
      <div className="text-white/60 text-[11px] shrink-0 text-right leading-relaxed">
        Starts<br />{startDate}
      </div>
    </div>
  );
}

function DailyCountdown({ prefix }: { prefix: string }) {
  const [display, setDisplay] = useState(() => fmtCountdown(msUntilNextMidnightSLST()));
  useEffect(() => {
    const id = setInterval(() => setDisplay(fmtCountdown(msUntilNextMidnightSLST())), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="text-[11.5px] font-semibold text-warning font-mono">
      {prefix} {display}
    </span>
  );
}

function StatCard({ icon, value, label, color }: { icon: string; value: string; label: string; color: string }) {
  return (
    <div className="bg-white rounded-base border border-border-dim p-4 flex items-start gap-3">
      <div
        className="w-10 h-10 rounded-[10px] flex items-center justify-center text-lg shrink-0"
        style={{ background: color + '18' }}
      >
        {icon}
      </div>
      <div>
        <div
          className="text-[1.4rem] font-bold text-text-primary leading-none"
          style={{ fontFamily: 'var(--font-space-grotesk)' }}
        >
          {value}
        </div>
        <div className="text-[11.5px] text-text-muted mt-0.5">{label}</div>
      </div>
    </div>
  );
}

export default function SubjectOverviewPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const { user } = useAuth();
  const { papers, loading } = usePapers({ user, grade: (user?.grade as '12' | '13') || '12' });
  const [stats, setStats] = useState<UserStats | null>(null);

  useEffect(() => {
    if (!user) return;
    papersService.getUserStats().then(setStats).catch(() => {});
  }, [user]);

  const subjectPapers = papers.filter((p) => p.subject_id === subjectId);
  const done = subjectPapers.filter((p) => p.done === true).length;
  const total = subjectPapers.length;
  const avgScore = done
    ? Math.round(
        subjectPapers
          .filter((p) => p.done === true && p.score != null)
          .reduce((s, p) => s + (p.score! / p.question_count) * 100, 0) /
          Math.max(done, 1),
      )
    : 0;

  const now = Date.now();
  const srpLive = subjectPapers.find((p) =>
    p.type === 'srp' && !p.done &&
    (p.available_from == null || new Date(p.available_from).getTime() <= now) &&
    (p.available_until == null || new Date(p.available_until).getTime() > now),
  );
  const srpUpcoming = [...subjectPapers]
    .filter((p) => p.type === 'srp' && !p.done && p.available_from != null && new Date(p.available_from).getTime() > now)
    .sort((a, b) => new Date(a.available_from!).getTime() - new Date(b.available_from!).getTime())[0] ?? null;

  // Most recent daily paper (includes completed ones so we can show score/MS state)
  const daily = [...subjectPapers]
    .filter((p) => p.type === 'daily')
    .sort((a, b) => {
      const af = a.available_from ? new Date(a.available_from).getTime() : 0;
      const bf = b.available_from ? new Date(b.available_from).getTime() : 0;
      return bf - af; // descending — most recent first
    })[0] ?? null;

  const windowOpen = isDailyWindowOpen(daily?.available_until);

  return (
    <div className="max-w-225">
      {/* SRP Live Banner */}
      {srpLive && (
        <div
          className="rounded-base p-4 mb-6 flex items-center gap-4"
          style={{ background: 'linear-gradient(135deg, #8b90f0 0%, #6f73d6 100%)' }}
        >
          <span className="text-2xl shrink-0">⭐</span>
          <div className="flex-1">
            <div className="text-white font-bold text-[13.5px]">Live Special Ranking Paper</div>
            <div className="text-white/75 text-[12px] mt-0.5">
              {srpLive.title} · {srpLive.question_count} Questions · {Math.round(srpLive.time_seconds / 60)} Minutes
            </div>
          </div>
          <Link
            href={`/subject/${subjectId}/exam?type=srp&paperId=${srpLive.id}`}
            className="px-4 py-2 rounded-full bg-white/20 text-white text-[12.5px] font-semibold no-underline hover:bg-white/30 transition-colors shrink-0"
          >
            Start →
          </Link>
        </div>
      )}

      {/* SRP Upcoming Countdown */}
      {srpUpcoming && !srpLive && (
        <SRPCountdownCard
          availableFrom={srpUpcoming.available_from!}
          questionCount={srpUpcoming.question_count}
          timeSeconds={srpUpcoming.time_seconds}
        />
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon="🏆" value={stats?.national_rank != null ? `#${stats.national_rank}` : '—'} label="Island Rank" color="#8b90f0" />
        <StatCard icon="📊" value={avgScore > 0 ? `${avgScore}%` : stats ? `${stats.avg_score_pct.toFixed(1)}%` : '—'} label="Avg Score" color="#6cd4da" />
        <StatCard icon="🔥" value={stats ? `${stats.day_streak}d` : '—'} label="Day Streak" color="#f2994a" />
        <StatCard icon="📋" value={String(total)} label="Papers Total" color="#2fae9e" />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Daily MCQ card — 5 states */}
          <div className="bg-white rounded-base border border-border-dim p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[13.5px] font-bold text-text-primary">Today&apos;s Daily MCQ</div>
                <div className="text-[11.5px] text-text-muted mt-0.5">
                  {daily
                    ? `${daily.question_count} Questions · ${Math.round(daily.time_seconds / 60)} Minutes`
                    : 'No paper available today'}
                </div>
              </div>
              <span className="text-2xl">
                {!daily ? '📅' : daily.done ? '✅' : windowOpen ? '📝' : '🔒'}
              </span>
            </div>

            {!daily ? (
              /* State 5: no paper */
              <div className="text-[12px] text-text-muted">No paper today. Check back tomorrow.</div>
            ) : daily.done && daily.ms_available ? (
              /* State 1: completed + answers ready */
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[13px] font-bold text-success">
                  ✓ {daily.score}/{daily.question_count}
                </span>
                <Link
                  href={`/subject/${subjectId}/marking-schemes`}
                  className="px-4 py-1.5 rounded-full bg-gold text-white text-[12px] font-semibold no-underline hover:bg-gold-dark transition-colors"
                >
                  📖 View Answers →
                </Link>
              </div>
            ) : daily.done ? (
              /* State 2: completed + answers pending until next midnight */
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[13px] font-bold text-success">
                  ✓ {daily.score}/{daily.question_count}
                </span>
                <DailyCountdown prefix="🔒 Answers in" />
              </div>
            ) : windowOpen ? (
              /* State 3: window open, not yet attempted */
              <>
                <div className="h-1.5 bg-dark rounded-full mb-3 overflow-hidden">
                  <div className="h-full bg-gold rounded-full w-0" />
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <Link
                    href={`/subject/${subjectId}/exam?type=daily`}
                    className="px-5 py-2 rounded-full bg-gold text-white text-[12.5px] font-semibold no-underline hover:bg-gold-dark transition-colors"
                  >
                    Start Exam →
                  </Link>
                  <DailyCountdown prefix="⚠ Closes in" />
                </div>
              </>
            ) : (
              /* State 4: window closed, not attempted */
              <div className="flex flex-col gap-2">
                <div className="text-[12px] text-text-muted">Today&apos;s paper has closed.</div>
                <DailyCountdown prefix="🕛 New paper in" />
              </div>
            )}
          </div>

          {/* Progress overview */}
          <div className="bg-white rounded-base border border-border-dim p-5">
            <div className="text-[13.5px] font-bold text-text-primary mb-4">Papers Progress</div>
            {loading ? (
              <div className="text-[12px] text-text-muted">Loading...</div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {(['srp', 'daily'] as const).map((type) => {
                  const typePapers = subjectPapers.filter((p) => p.type === type);
                  const typeDone = typePapers.filter((p) => p.done).length;
                  const pct = typePapers.length ? Math.round((typeDone / typePapers.length) * 100) : 0;
                  return (
                    <div key={type}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] text-text-primary font-medium">
                          {type === 'srp' ? '⭐ SRP Papers' : '📝 Daily Papers'}
                        </span>
                        <span className="text-[11px] text-text-muted">{typeDone}/{typePapers.length}</span>
                      </div>
                      <div className="h-2 bg-dark rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            background: type === 'srp' ? '#f2994a' : '#8b90f0',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Leaderboard shortcut */}
          <div className="bg-white rounded-base border border-border-dim p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[13px] font-bold text-text-primary">Leaderboard</div>
              <Link
                href={`/subject/${subjectId}/leaderboard`}
                className="text-[11px] text-gold no-underline hover:underline"
              >
                View all →
              </Link>
            </div>
            <Link
              href={`/subject/${subjectId}/leaderboard`}
              className="flex items-center gap-3 px-3 py-2.5 rounded-sm bg-dark border border-border-dim no-underline hover:border-gold transition-colors"
            >
              <span className="text-2xl">🏆</span>
              <div>
                <div className="text-[12px] font-semibold text-text-primary">Island Rankings</div>
                <div className="text-[10.5px] text-text-muted">See how you compare with all students</div>
              </div>
            </Link>
          </div>

          {/* Quick links */}
          <div className="bg-white rounded-base border border-border-dim p-4">
            <div className="text-[13px] font-bold text-text-primary mb-3">Resources</div>
            <div className="flex flex-col gap-2">
              {[
                { href: `/subject/${subjectId}/past-papers`, icon: '📚', label: 'Past Papers', sub: 'Topic-wise questions' },
                { href: `/subject/${subjectId}/marking-schemes`, icon: '📖', label: 'Marking Schemes', sub: 'Correct answers' },
              ].map((item) => (
                <Link key={item.href} href={item.href}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-sm bg-dark border border-border-dim no-underline hover:border-gold transition-colors">
                  <span className="text-lg">{item.icon}</span>
                  <div>
                    <div className="text-[12px] font-semibold text-text-primary">{item.label}</div>
                    <div className="text-[10.5px] text-text-muted">{item.sub}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
