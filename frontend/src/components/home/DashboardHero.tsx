// Animated hero sphere for the dashboard — CSS-only animations, no client state needed

const BUBBLES = [
  { color: '#6cd4da', shadow: 'rgba(108,212,218,.5)',  top: '70px',  left: '82px',  delay: '0s',   size: 60 },
  { color: '#f2994a', shadow: 'rgba(242,153,74,.45)',   top: '22px',  left: '206px', delay: '0.4s', size: 64 },
  { color: '#f2c94c', shadow: 'rgba(242,201,76,.48)',   top: '74px',  right: '78px', delay: '0.8s', size: 60 },
  { color: '#7c81ee', shadow: 'rgba(124,129,238,.5)',   top: '210px', left: '66px',  delay: '0.2s', size: 56 },
  { color: '#9b51e0', shadow: 'rgba(155,81,224,.45)',   top: '214px', right: '64px', delay: '0.6s', size: 58 },
];

const BUBBLE_ICONS = [
  // graduation cap
  <svg key="cap" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1 3 2 6 2s6-1 6-2v-5"/></svg>,
  // globe
  <svg key="globe" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></svg>,
  // lightbulb
  <svg key="bulb" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12c1 1 1 2 1 3h6c0-1 0-2 1-3a7 7 0 00-4-12z"/></svg>,
  // flask
  <svg key="flask" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M9 2v6l-4.5 9A2 2 0 007.3 20h9.4a2 2 0 001.8-3L14 8V2"/><path d="M9 2h6"/></svg>,
  // network
  <svg key="net" width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><circle cx="12" cy="12" r="2"/><path d="M12 2a16 16 0 010 20M12 2a16 16 0 000 20M4 7a16 16 0 0016 10M4 17A16 16 0 0120 7"/></svg>,
];

export function DashboardHero() {
  return (
    <div className="relative mx-auto hidden md:block" style={{ width: 470, height: 400 }}>

      {/* ── Main sphere ─────────────────────────────────────────────────────── */}
      <div className="absolute" style={{
        left: '50%', top: 20, transform: 'translateX(-50%)',
        width: 360, height: 360, borderRadius: '50%',
        background: 'radial-gradient(circle at 50% 36%, #b6b9f8, #8b90f0 62%, #6f73d6 100%)',
      }} />
      {/* sphere highlight */}
      <div className="absolute pointer-events-none" style={{
        left: '50%', top: 20, transform: 'translateX(-50%)',
        width: 360, height: 360, borderRadius: '50%',
        background: 'radial-gradient(circle at 68% 28%, rgba(255,255,255,.35), transparent 42%)',
      }} />

      {/* ── Orbit ring 1 (outer, clockwise) ─────────────────────────────────── */}
      <div className="absolute" style={{ left: '50%', top: 200, transform: 'translate(-50%,-50%)', width: 322, height: 322 }}>
        <div className="w-full h-full rounded-full animate-spin-slow" style={{
          border: '2px dashed rgba(255,255,255,.5)', position: 'relative',
        }}>
          <div className="absolute bg-white rounded-full shadow-sm" style={{ width: 14, height: 14, top: -7, left: '50%', transform: 'translateX(-50%)' }} />
          <div className="absolute rounded-full" style={{ width: 10, height: 10, bottom: -6, left: '50%', transform: 'translateX(-50%)', background: '#6cd4da' }} />
        </div>
      </div>

      {/* ── Orbit ring 2 (inner, counter-clockwise) ──────────────────────────── */}
      <div className="absolute" style={{ left: '50%', top: 200, transform: 'translate(-50%,-50%)', width: 236, height: 236 }}>
        <div className="w-full h-full rounded-full animate-spin-rev" style={{
          border: '2px dotted rgba(255,255,255,.6)', position: 'relative',
        }}>
          <div className="absolute rounded-full" style={{ width: 11, height: 11, top: -6, left: '50%', transform: 'translateX(-50%)', background: '#c9ccff' }} />
          <div className="absolute bg-white rounded-full" style={{ width: 9, height: 9, top: '50%', right: -6, transform: 'translateY(-50%)' }} />
        </div>
      </div>

      {/* ── Sparkles ─────────────────────────────────────────────────────────── */}
      <div className="absolute animate-twinkle" style={{ left: 150, top: 60 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/></svg>
      </div>
      <div className="absolute animate-twinkle" style={{ right: 118, top: 250, animationDelay: '0.6s' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="#fff"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/></svg>
      </div>
      <div className="absolute animate-twinkle" style={{ left: 120, top: 250, animationDelay: '1s' }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="#c9ccff"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/></svg>
      </div>

      {/* ── Floating subject bubbles ─────────────────────────────────────────── */}
      {BUBBLES.map((b, i) => (
        <div
          key={i}
          className="absolute animate-floaty flex items-center justify-center rounded-full"
          style={{
            width: b.size, height: b.size,
            background: b.color,
            boxShadow: `0 12px 24px ${b.shadow}`,
            top: b.top,
            left: 'left' in b ? (b as { left: string } & typeof b).left : undefined,
            right: 'right' in b ? (b as { right: string } & typeof b).right : undefined,
            animationDelay: b.delay,
          }}
        >
          {BUBBLE_ICONS[i]}
        </div>
      ))}

      {/* ── Center emblem ────────────────────────────────────────────────────── */}
      <div
        className="absolute flex items-center justify-center rounded-full animate-pulse-glow"
        style={{
          left: '50%', top: 200, transform: 'translate(-50%,-50%)',
          width: 134, height: 134,
          background: 'linear-gradient(145deg, #fff, #f0f0ff)',
        }}
      >
        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#6f73d6" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 10L12 5 2 10l10 5 10-5z"/>
          <path d="M6 12v5c0 1.5 3 2.6 6 2.6s6-1.1 6-2.6v-5"/>
          <path d="M22 10v5"/>
        </svg>
        {/* Growth badge */}
        <div
          className="absolute flex items-center justify-center"
          style={{
            right: -6, bottom: 2, width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(135deg, #6cd4da, #4fc4cb)',
            boxShadow: '0 8px 16px rgba(79,196,203,.5)',
            border: '3px solid #fff',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/>
          </svg>
        </div>
      </div>

      {/* ── Mini stat card (bottom-left) ─────────────────────────────────────── */}
      <div
        className="absolute animate-floaty flex items-center gap-2.5 bg-white rounded-[14px]"
        style={{
          left: 8, bottom: 34,
          padding: '12px 14px',
          boxShadow: '0 12px 28px rgba(80,80,140,.16)',
          animationDelay: '0.3s',
        }}
      >
        <div className="flex items-end gap-[3px]" style={{ height: 26 }}>
          <div style={{ width: 6, height: '40%', background: '#c9ccff', borderRadius: 2 }} />
          <div style={{ width: 6, height: '65%', background: '#8b90f0', borderRadius: 2 }} />
          <div style={{ width: 6, height: '100%', background: '#6cd4da', borderRadius: 2 }} />
        </div>
        <div>
          <div className="text-[15px] font-bold text-text-primary leading-none" style={{ fontFamily: 'var(--font-space-grotesk)' }}>+18%</div>
          <div className="text-[9px] font-semibold text-text-muted mt-[3px]">Score Trend</div>
        </div>
      </div>

      {/* ── Rank pill (bottom-right) ──────────────────────────────────────────── */}
      <div
        className="absolute animate-floaty flex items-center gap-2 bg-white rounded-[14px]"
        style={{
          right: 4, bottom: 52,
          padding: '11px 15px',
          boxShadow: '0 12px 28px rgba(80,80,140,.16)',
          animationDelay: '0.9s',
        }}
      >
        <div className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center" style={{ background: '#eef0ff' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6f73d6" strokeWidth="2">
            <path d="M6 9H4v11h2z"/><path d="M14 4h-4v16h4z"/><path d="M20 12h-2v8h2z"/>
          </svg>
        </div>
        <div>
          <div className="text-[15px] font-bold text-text-primary leading-none" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Rank #12</div>
          <div className="text-[9px] font-semibold text-text-muted mt-[3px]">National</div>
        </div>
      </div>
    </div>
  );
}
