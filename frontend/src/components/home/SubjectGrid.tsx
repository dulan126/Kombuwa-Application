'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { STREAMS } from '@/lib/constants';
import type { Stream } from '@/types/auth';

const GRADE_LABELS: Record<string, string> = { '12': 'Grade 12', '13': 'Grade 13' };
const GRADES = ['12', '13'] as const;

// Stream accent colors
const STREAM_COLORS: Record<Stream, { bg: string; border: string; icon: string }> = {
  phy: { bg: 'rgba(79,127,232,0.08)', border: 'rgba(79,127,232,0.2)', icon: '⚗️' },
  bio: { bg: 'rgba(61,175,114,0.08)', border: 'rgba(61,175,114,0.2)', icon: '🧬' },
  com: { bg: 'rgba(139,144,240,0.08)', border: 'rgba(139,144,240,0.2)', icon: '📊' },
  art: { bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.2)', icon: '🎨' },
  tec: { bg: 'rgba(46,196,182,0.08)', border: 'rgba(46,196,182,0.2)', icon: '💻' },
};

// Each subject card
function SubjectCard({ subjectId, name, grade, streamKey }: {
  subjectId: string;
  name: string;
  grade: string;
  streamKey: Stream;
}) {
  const colors = STREAM_COLORS[streamKey];
  const stream = STREAMS[streamKey];
  return (
    <Link
      href={`/subject/${subjectId}?grade=${grade}`}
      className="group block rounded-[14px] p-4 border transition-all duration-200 no-underline hover:scale-[1.02] hover:shadow-md"
      style={{ background: colors.bg, borderColor: colors.border }}
    >
      <div className="text-2xl mb-2">{stream.icon}</div>
      <div className="text-[13px] font-semibold text-text-primary leading-snug mb-1">{name}</div>
      <div className="text-[11px] text-text-muted">Grade {grade}</div>
      <div
        className="mt-3 text-[11.5px] font-semibold text-gold opacity-0 group-hover:opacity-100 transition-opacity"
      >
        Start →
      </div>
    </Link>
  );
}

// All streams grid (shown when not logged in)
function AllStreamsGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
      {(Object.entries(STREAMS) as [Stream, typeof STREAMS.phy][]).map(([key, s]) => {
        const colors = STREAM_COLORS[key];
        return (
          <Link
            key={key}
            href="/register"
            className="group block rounded-[14px] p-4 border text-center no-underline transition-all hover:scale-[1.02] hover:shadow-sm"
            style={{ background: colors.bg, borderColor: colors.border }}
          >
            <div className="text-3xl mb-2">{s.icon}</div>
            <div className="text-[12.5px] font-semibold text-text-primary">{s.name}</div>
            <div className="text-[11px] text-text-muted mt-1">{s.subjects.length} subjects</div>
          </Link>
        );
      })}
    </div>
  );
}

export function SubjectGrid() {
  const { user, isLoggedIn } = useAuth();

  return (
    <section className="py-12 px-6 max-w-[1100px] mx-auto">
      <div
        className="text-[10.5px] font-semibold tracking-[2px] uppercase text-gold mb-2"
      >
        {isLoggedIn ? `${STREAMS[user!.stream as Stream]?.name ?? ''} Stream` : 'Subject Streams'}
      </div>
      <h2
        className="text-[clamp(1.3rem,2.5vw,1.8rem)] font-bold text-text-primary mb-6"
        style={{ fontFamily: 'var(--font-space-grotesk)' }}
      >
        {isLoggedIn ? 'Your Subjects' : 'Choose Your Stream'}
      </h2>

      {!isLoggedIn ? (
        <>
          <AllStreamsGrid />
          <div className="mt-6 text-center">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-gold text-white text-[13px] font-semibold no-underline hover:bg-gold-dark transition-colors"
            >
              Register Free — Get Started
            </Link>
          </div>
        </>
      ) : (
        <>
          {GRADES.map((grade) => {
            const streamKey = user!.stream as Stream;
            const stream = STREAMS[streamKey];
            if (!stream) return null;
            return (
              <div key={grade} className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: stream.color ?? '#8b90f0' }}
                  />
                  <span className="text-[13px] font-semibold text-text-primary">
                    {GRADE_LABELS[grade]}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {stream.subjects.map((sub) => (
                    <SubjectCard
                      key={sub.id}
                      subjectId={sub.id}
                      name={sub.n}
                      grade={grade}
                      streamKey={streamKey}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
