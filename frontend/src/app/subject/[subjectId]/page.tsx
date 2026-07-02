'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePapers } from '@/hooks/usePapers';
import { STREAMS, DEMO_TOPICS } from '@/lib/constants';
import type { Stream } from '@/types/auth';

function StatCard({ icon, value, label, color }: { icon: string; value: string; label: string; color: string }) {
  return (
    <div className="bg-white rounded-[14px] border border-border-dim p-4 flex items-start gap-3">
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

  const subjectPapers = papers.filter((p) => p.subject_id === subjectId);
  const done = subjectPapers.filter((p) => p.done).length;
  const total = subjectPapers.length;
  const avgScore = done
    ? Math.round(
        subjectPapers
          .filter((p) => p.done && p.score != null)
          .reduce((s, p) => s + (p.score! / p.question_count) * 100, 0) /
          Math.max(done, 1),
      )
    : 0;

  const streamKey = user?.stream as Stream | undefined;
  const stream = streamKey ? STREAMS[streamKey] : null;
  const topics = DEMO_TOPICS[subjectId] ?? [];

  const srp = subjectPapers.find((p) => p.type === 'srp' && !p.done);
  const daily = subjectPapers.find((p) => p.type === 'daily' && !p.done);

  return (
    <div className="max-w-[900px]">
      {/* SRP Live Banner */}
      {srp && (
        <div
          className="rounded-[14px] p-4 mb-6 flex items-center gap-4"
          style={{ background: 'linear-gradient(135deg, #8b90f0 0%, #6f73d6 100%)' }}
        >
          <span className="text-2xl shrink-0">⭐</span>
          <div className="flex-1">
            <div className="text-white font-bold text-[13.5px]">Live Special Ranking Paper</div>
            <div className="text-white/75 text-[12px] mt-0.5">{srp.title} · 30 Questions · 30 Minutes</div>
          </div>
          <Link
            href={`/subject/${subjectId}/exam?type=srp`}
            className="px-4 py-2 rounded-full bg-white/20 text-white text-[12.5px] font-semibold no-underline hover:bg-white/30 transition-colors shrink-0"
          >
            Start →
          </Link>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon="🏆" value="#12" label="Island Rank" color="#8b90f0" />
        <StatCard icon="📊" value={`${avgScore || 78}%`} label="Avg Score" color="#6cd4da" />
        <StatCard icon="🔥" value="23" label="Day Streak" color="#f2994a" />
        <StatCard icon="📋" value={String(total || 0)} label="Papers Total" color="#2fae9e" />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Daily MCQ card */}
          <div className="bg-white rounded-[14px] border border-border-dim p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[13.5px] font-bold text-text-primary">Today&apos;s Daily MCQ</div>
                <div className="text-[11.5px] text-text-muted mt-0.5">
                  {daily ? `${daily.question_count} Questions · 10 Minutes` : 'No paper available today'}
                </div>
              </div>
              <span className="text-2xl">📝</span>
            </div>
            {daily ? (
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
                  <span className="text-[11px] text-warning font-medium">⚠ Closes at midnight</span>
                </div>
              </>
            ) : (
              <div className="text-[12px] text-text-muted">Check back tomorrow for a new paper.</div>
            )}
          </div>

          {/* Progress overview */}
          <div className="bg-white rounded-[14px] border border-border-dim p-5">
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
          {/* Mini leaderboard */}
          <div className="bg-white rounded-[14px] border border-border-dim p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[13px] font-bold text-text-primary">Top Performers</div>
              <Link
                href={`/subject/${subjectId}/leaderboard`}
                className="text-[11px] text-gold no-underline hover:underline"
              >
                View all →
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              {(['🥇', '🥈', '🥉'] as const).map((medal, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span className="text-base">{medal}</span>
                  <div className="w-7 h-7 rounded-full bg-gold/15 flex items-center justify-center text-[11px] font-bold text-gold">
                    {String.fromCharCode(65 + i)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-text-primary truncate">
                      Student {i + 1}
                    </div>
                    <div className="text-[10.5px] text-text-muted">{95 - i * 3}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Topics grid */}
          <div className="bg-white rounded-[14px] border border-border-dim p-4">
            <div className="text-[13px] font-bold text-text-primary mb-3">Topics</div>
            <div className="flex flex-col gap-2">
              {topics.slice(0, 6).map((topic, i) => {
                const pct = Math.max(20, Math.min(100, 40 + i * 12));
                return (
                  <div key={topic}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[11.5px] text-text-primary">{topic}</span>
                      <span className="text-[10px] text-text-muted">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-dark rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: stream?.color ?? '#8b90f0' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
