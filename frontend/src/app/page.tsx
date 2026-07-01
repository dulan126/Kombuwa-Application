import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Footer } from '@/components/layout/Footer';
import { LandingCTA } from '@/components/features/auth/LandingCTA';
import { STREAMS } from '@/lib/constants';
import type { Stream } from '@/types';

// ─── Feature Cards Data ─────────────────────────────────────────────────────

const FEATURES = [
  { icon: '📝', bg: 'rgba(79,127,232,0.12)', title: 'දෛනික MCQ', desc: 'ප්‍ර 10, 10 මිනිත්තු timer. Real-time: ලකුණු පමණ. Correct answers ඒ දිනෙ upload කෙරේ.' },
  { icon: '⭐', bg: 'var(--color-gold-bg)', title: 'SRP — Weekly Special Ranking', desc: 'ප්‍ර 30, 30 මිනිත්තු. Island-wide ranking. ලකුණු ක්‍රමය ඒ දිනෙ.', isSRP: true },
  { icon: '📖', bg: 'rgba(61,175,114,0.12)', title: 'ලකුණු ක්‍රමය', desc: 'ප්‍රශ්නනය ශේෂ දිනෙ upload. Subject + Grade + Type filter.' },
  { icon: '🏆', bg: 'rgba(232,160,32,0.12)', title: 'Grade-wise Rankings', desc: 'Daily + SRP separate. Grade 12 / 13 separate. National + District rank.' },
  { icon: '🎓', bg: 'rgba(46,196,182,0.12)', title: 'ශ්‍රේණිය Access', desc: 'Grade 12 → 12 & 13 papers. Papers uploaded per grade separately.' },
  { icon: '💬', bg: 'rgba(168,139,250,0.12)', title: 'Q&A Forum', desc: 'Photo questions. Verified teacher answers. Resolved/Pending. Subject filter.' },
];

const STATS = [
  { value: '42K+', label: 'ක්‍රියාශීලී සිසුන්' },
  { value: 'Daily', label: 'ප්‍ර 10 · 10 මිනිත්තු' },
  { value: '⭐ SRP', label: 'ප්‍ර 30 · 30 මිනිත්තු' },
  { value: '5', label: 'ධාරා · Grade 12 & 13' },
];

const STREAM_STYLES: Record<Stream, { bg: string; border: string; color: string }> = {
  phy: { bg: 'rgba(79,127,232,0.08)', border: 'rgba(79,127,232,0.2)', color: '#4f7fe8' },
  bio: { bg: 'rgba(61,175,114,0.08)', border: 'rgba(61,175,114,0.2)', color: '#3daf72' },
  com: { bg: 'var(--color-gold-bg)', border: 'var(--color-gold-border)', color: 'var(--color-gold)' },
  art: { bg: 'rgba(139,144,240,0.08)', border: 'rgba(139,144,240,0.2)', color: '#8b90f0' },
  tec: { bg: 'rgba(46,196,182,0.08)', border: 'rgba(46,196,182,0.2)', color: '#2ec4b6' },
};

// ─── Home Page ───────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden min-h-[calc(100vh-58px)] flex items-center justify-center text-center px-8 py-12">
        <div className="hero-bg absolute inset-0" />
        <div className="hero-grid absolute inset-0" />
        <div className="relative z-10 max-w-[740px]">
          <div className="inline-flex items-center gap-1.5 bg-gold-bg border border-gold-border rounded-full px-3.5 py-1.5 text-[11px] text-gold mb-6">
            <span className="w-[5px] h-[5px] rounded-full bg-gold animate-pulse-dot inline-block" />
            ශ්‍රී ලංකාවේ ප්‍රමුඛ අ/පෙළ MCQ වේදිකාව — 2026
          </div>
          <h1 className="text-[clamp(1.7rem,4vw,2.8rem)] font-bold leading-tight mb-4">
            ඔබේ <span className="text-gold">අ/පෙළ</span> ජය ගන්න
            <br />
            Daily MCQ · ⭐ SRP · ශ්‍රේණිගත
          </h1>
          <p className="text-[13.5px] text-text-muted leading-[1.9] max-w-[520px] mx-auto mb-8 font-light">
            Daily ප්‍ර 10 (10 මිනි) · SRP ප්‍ර 30 (30 මිනි) · ශ්‍රේණිය + ධාරාව paper access · Real-time ලකුණු · ලකුණු ක්‍රමය ඒ දිනෙ
          </p>
          <div className="flex gap-2.5 justify-center flex-wrap">
            <LandingCTA />
          </div>
        </div>
      </section>

      {/* Stats Strip */}
      <div className="grid grid-cols-4 max-md:grid-cols-2 gap-px bg-border-dim border-t border-border-dim">
        {STATS.map((stat) => (
          <div key={stat.label} className="bg-dark py-6 px-3 text-center">
            <div className="text-[1.8rem] font-bold text-gold">{stat.value}</div>
            <div className="text-[11px] text-text-muted mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Features */}
      <section className="py-12 px-8 max-w-[1100px] mx-auto">
        <div className="text-[10px] font-bold tracking-[2px] uppercase text-gold mb-2.5">Platform Features</div>
        <h2 className="text-[clamp(1.35rem,2.5vw,1.9rem)] font-bold mb-2.5 leading-tight">
          A සාමාර්ථ ලබා ගැනීමට ඔබට අවශ්‍ය සියල්ල
        </h2>
        <div className="grid grid-cols-3 max-md:grid-cols-2 max-sm:grid-cols-1 gap-4 mt-6">
          {FEATURES.map((feat) => (
            <div
              key={feat.title}
              className={`bg-surface border border-border-dim rounded-[var(--radius-base)] p-5 transition-all duration-200 hover:border-gold-border hover:translate-y-[-2px] ${feat.isSRP ? 'border-t-[3px] border-t-gold' : ''}`}
            >
              <div
                className="w-10 h-10 rounded-[9px] mb-3 flex items-center justify-center text-[18px]"
                style={{ background: feat.bg }}
              >
                {feat.icon}
              </div>
              <h3 className="text-[13px] font-semibold mb-1.5">
                {feat.isSRP ? (
                  <>SRP — <span className="text-gold">Weekly Special Ranking</span></>
                ) : (
                  feat.title
                )}
              </h3>
              <p className="text-[11.5px] text-text-muted leading-[1.7]">{feat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Streams */}
      <section className="bg-dark-2 border-y border-border-dim py-11 px-8 text-center">
        <div className="text-[10px] font-bold tracking-[2px] uppercase text-gold mb-2.5">Subject Streams</div>
        <h2 className="text-[clamp(1.35rem,2.5vw,1.9rem)] font-bold mb-2.5 leading-tight">
          ධාරාව + ශ්‍රේණිය — ඔබේ subjects auto-filtered
        </h2>
        <div className="flex gap-2 flex-wrap justify-center mt-4">
          {(Object.keys(STREAMS) as Stream[]).map((key) => {
            const s = STREAM_STYLES[key];
            const stream = STREAMS[key];
            return (
              <Link key={key} href="/register">
                <span
                  className="rounded-full px-5 py-2 text-[12.5px] font-semibold cursor-pointer border transition-opacity hover:opacity-80"
                  style={{ background: s.bg, borderColor: s.border, color: s.color }}
                >
                  {stream.icon} {stream.name}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="text-center py-14 px-8">
        <div className="text-[10px] font-bold tracking-[2px] uppercase text-gold mb-2.5">Register Now</div>
        <h2 className="text-[clamp(1.35rem,2.5vw,1.9rem)] font-bold mb-2.5 leading-tight">
          දූපතේ ඉහළම ස්ථානය ලබා ගැනීමට සූදානමිද?
        </h2>
        <p className="text-text-muted text-[13px] mb-7 max-w-[420px] mx-auto">
          ධාරාව + ශ්‍රේණිය select — ඔබේ subjects auto-filtered.
        </p>
        <Link href="/register">
          <Button variant="primary" size="lg">ලියාපදිංචිය — Free</Button>
        </Link>
      </section>

      <Footer />
    </>
  );
}
