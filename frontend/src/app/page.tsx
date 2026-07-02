import Link from 'next/link';
import { HeroBg } from '@/components/home/HeroBg';
import { CountdownTimer } from '@/components/home/CountdownTimer';
import { HomeNavbar } from '@/components/layout/HomeNavbar';

// ─── Stream cards (server) ────────────────────────────────────────────────────
const STREAMS_DISPLAY = [
  { key: 'phy', icon: '⚗️', name: 'Physical Science', color: '#4F7FE8', subjects: ['Combined Maths', 'Physics', 'Chemistry'] },
  { key: 'bio', icon: '🧬', name: 'Bio Science',       color: '#3DAF72', subjects: ['Biology', 'Chemistry', 'Physics'] },
  { key: 'com', icon: '📊', name: 'Commerce',          color: '#8b90f0', subjects: ['Accounting', 'Economics', 'Business Studies'] },
  { key: 'art', icon: '🎨', name: 'Arts',              color: '#A78BFA', subjects: ['History', 'Political Science', 'Geography'] },
  { key: 'tec', icon: '💻', name: 'Technology',        color: '#2EC4B6', subjects: ['ICT', 'Engineering Technology', 'Science for Technology'] },
];

const FEATURES = [
  { icon: '📝', title: 'Daily MCQ',         desc: '10 targeted questions every day with a 10-minute timer. Scores update live island-wide.',         color: '#8b90f0' },
  { icon: '⭐', title: 'SRP Rankings',       desc: '30-question Special Ranking Papers. Compete island-wide and see exactly where you stand.',       color: '#f2994a' },
  { icon: '📚', title: 'Past Papers',        desc: 'Topic-wise MCQ and essay PDFs from 2015–2024 with marking schemes included.',                    color: '#6cd4da' },
  { icon: '🏆', title: 'Leaderboards',       desc: 'National and district rankings updated after every exam window. Grade 12 & 13 separate boards.', color: '#2fae9e' },
  { icon: '💬', title: 'Q&A Forum',          desc: 'Post photo questions and get verified answers from subject teachers.',                           color: '#a9adf5' },
  { icon: '🎯', title: 'Progress Tracking',  desc: 'See your performance per topic across all subjects and focus where it matters most.',            color: '#f2994a' },
];

const HOW_STEPS = [
  { step: '01', title: 'Create your free account', desc: 'Sign up with your mobile number. Pick your A/L stream and grade.' },
  { step: '02', title: 'Study daily',               desc: 'Attempt Daily MCQ and SRP papers. Review correct answers. Track your progress.' },
  { step: '03', title: 'Rise in the rankings',      desc: 'Watch your national and district rank climb as you consistently outperform peers.' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function HomePage() {
  return (
    <div className="min-h-screen bg-dark overflow-x-hidden">
      <HomeNavbar />

      {/* ── HERO ──────────────────────────────────────────────────────────────── */}
      <section
        className="relative min-h-[calc(100vh-60px)] flex items-center justify-center overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1440 50%, #0d1b2e 100%)' }}
      >
        <HeroBg />

        <div className="relative z-10 max-w-[860px] mx-auto px-6 py-20 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 border border-white/15 bg-white/8 backdrop-blur-sm rounded-full px-4 py-1.5 mb-7 animate-hero-fade" style={{ animationDelay: '0.1s' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-dot inline-block" />
            <span className="text-white/75 text-[11.5px] font-medium tracking-wide">
              Sri Lanka&apos;s #1 A/L Exam Platform · 2026
            </span>
          </div>

          {/* Headline */}
          <h1
            className="text-[clamp(2.4rem,6vw,4.2rem)] font-bold leading-[1.1] text-white mb-5 animate-hero-fade"
            style={{ animationDelay: '0.2s', fontFamily: 'var(--font-space-grotesk)', textShadow: '0 2px 40px rgba(139,144,240,0.3)' }}
          >
            Ace Your A/L Exams.<br />
            <span style={{ background: 'linear-gradient(90deg, #8b90f0, #6cd4da)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Rank Island-wide.
            </span>
          </h1>

          {/* Sub */}
          <p className="text-white/60 text-[15px] leading-[1.9] max-w-[540px] mx-auto mb-9 animate-hero-fade" style={{ animationDelay: '0.3s' }}>
            Daily MCQ · SRP Special Ranking Papers · Past Papers 2015–2024 ·
            National &amp; District Leaderboards · Q&amp;A Forum
          </p>

          {/* CTAs */}
          <div className="flex gap-3 justify-center flex-wrap mb-12 animate-hero-fade" style={{ animationDelay: '0.4s' }}>
            <Link
              href="/register"
              className="px-7 py-3 rounded-full text-white font-semibold text-[14px] no-underline transition-all shadow-[0_0_30px_rgba(139,144,240,0.4)] hover:shadow-[0_0_50px_rgba(139,144,240,0.6)] hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #8b90f0, #6f73d6)' }}
            >
              Start for Free →
            </Link>
            <Link
              href="/login"
              className="px-7 py-3 rounded-full text-white/80 font-semibold text-[14px] no-underline border border-white/20 hover:bg-white/10 hover:text-white transition-all"
            >
              Sign In
            </Link>
          </div>

          {/* Stats */}
          <div className="flex gap-8 justify-center flex-wrap animate-hero-fade" style={{ animationDelay: '0.5s' }}>
            {[['42K+', 'Students'], ['5', 'A/L Streams'], ['10', 'Years of Papers'], ['Daily', 'Rankings']].map(([v, l]) => (
              <div key={l} className="text-center">
                <div className="text-white text-[1.5rem] font-bold" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{v}</div>
                <div className="text-white/45 text-[11px] mt-0.5">{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent, #f6f6fc)' }} />
      </section>

      {/* ── COUNTDOWN ─────────────────────────────────────────────────────────── */}
      <div className="bg-surface border-y border-border-dim">
        <CountdownTimer />
      </div>

      {/* ── FEATURES ──────────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-dark">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-12">
            <div className="text-[11px] font-bold tracking-[2.5px] uppercase text-gold mb-2">Platform Features</div>
            <h2 className="text-[clamp(1.5rem,3vw,2.2rem)] font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
              Everything You Need to Score an A
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-surface rounded-[16px] border border-border-dim p-6 hover:border-gold/40 hover:-translate-y-1 transition-all duration-200 group"
              >
                <div
                  className="w-11 h-11 rounded-[12px] flex items-center justify-center text-[22px] mb-4"
                  style={{ background: f.color + '18' }}
                >
                  {f.icon}
                </div>
                <h3 className="text-[14px] font-bold text-text-primary mb-2 group-hover:text-gold transition-colors">
                  {f.title}
                </h3>
                <p className="text-[12.5px] text-text-muted leading-[1.7]">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STREAMS ───────────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-surface border-y border-border-dim">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-10">
            <div className="text-[11px] font-bold tracking-[2.5px] uppercase text-gold mb-2">A/L Streams</div>
            <h2 className="text-[clamp(1.5rem,3vw,2rem)] font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
              Choose Your Stream
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {STREAMS_DISPLAY.map((s) => (
              <Link
                key={s.key}
                href="/register"
                className="group flex flex-col items-center text-center p-5 rounded-[16px] border-2 border-border-dim bg-dark hover:-translate-y-1 transition-all duration-200 no-underline"
                style={{ '--stream-color': s.color } as React.CSSProperties}
              >
                <div
                  className="w-14 h-14 rounded-[14px] flex items-center justify-center text-[28px] mb-3 group-hover:scale-110 transition-transform"
                  style={{ background: s.color + '18' }}
                >
                  {s.icon}
                </div>
                <div className="text-[13px] font-bold text-text-primary mb-2">{s.name}</div>
                <div className="flex flex-col gap-1">
                  {s.subjects.map((sub) => (
                    <div key={sub} className="text-[10.5px] text-text-muted">{sub}</div>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────────────── */}
      <section
        className="py-20 px-6"
        style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1440 100%)' }}
      >
        <div className="max-w-[860px] mx-auto text-center">
          <div className="text-[11px] font-bold tracking-[2.5px] uppercase text-gold/80 mb-2">How it works</div>
          <h2
            className="text-[clamp(1.5rem,3vw,2rem)] font-bold text-white mb-14"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            Up and running in minutes
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {HOW_STEPS.map((s, i) => (
              <div key={s.step} className="relative flex flex-col items-center text-center group">
                {/* Connector line */}
                {i < HOW_STEPS.length - 1 && (
                  <div className="hidden md:block absolute top-[30px] left-[calc(50%+40px)] right-0 h-px border-t border-dashed border-white/15" />
                )}
                <div
                  className="w-[60px] h-[60px] rounded-full flex items-center justify-center text-[1.1rem] font-bold mb-4 border border-white/20 group-hover:border-gold/50 transition-colors"
                  style={{ background: 'rgba(139,144,240,0.12)', color: '#8b90f0', fontFamily: 'var(--font-space-grotesk)' }}
                >
                  {s.step}
                </div>
                <h3 className="text-white font-bold text-[14px] mb-2">{s.title}</h3>
                <p className="text-white/50 text-[12.5px] leading-[1.7]">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-12">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-white font-semibold text-[14px] no-underline hover:scale-[1.03] transition-all"
              style={{ background: 'linear-gradient(135deg, #8b90f0, #6f73d6)', boxShadow: '0 0 40px rgba(139,144,240,0.4)' }}
            >
              Create Free Account →
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────────── */}
      <footer className="bg-dark border-t border-border-dim py-10 px-6">
        <div className="max-w-[1100px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-[8px] gradient-brand flex items-center justify-center text-white font-bold text-[14px]">M</div>
            <span className="font-bold text-text-primary" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Miedvance</span>
          </div>
          <div className="flex gap-5">
            <Link href="/login"    className="text-[12px] text-text-muted hover:text-gold no-underline transition-colors">Login</Link>
            <Link href="/register" className="text-[12px] text-text-muted hover:text-gold no-underline transition-colors">Register</Link>
            <Link href="/forum"    className="text-[12px] text-text-muted hover:text-gold no-underline transition-colors">Forum</Link>
          </div>
          <p className="text-[11.5px] text-text-muted">© {new Date().getFullYear()} Miedvance · Sri Lanka&apos;s Premier A/L Platform</p>
        </div>
      </footer>
    </div>
  );
}
