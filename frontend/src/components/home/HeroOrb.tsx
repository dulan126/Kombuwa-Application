'use client';

// Bubble positions are pre-computed as integers at module level to guarantee
// identical values on the server (Node.js) and client (browser).
// Dynamic Math.trig at render time can produce slightly different floating-point
// string representations between environments, causing React hydration mismatches.
const ORBIT1_BUBBLES = [
  { icon: '⚗️', label: 'Chemistry', x: 110, y: 0 },   // deg=0
  { icon: '📐', label: 'Maths',     x: -110, y: 0 },   // deg=180
] as const;

const ORBIT2_BUBBLES = [
  { icon: '🧬', label: 'Biology',  x: 73,  y: 126 },  // deg=60
  { icon: '📊', label: 'Commerce', x: -73, y: -126 }, // deg=240
] as const;

const SPARKLES = [
  { top: '10%', left: '18%',   size: 10, delay: '0s'   },
  { top: '20%', right: '15%',  size: 7,  delay: '0.7s' },
  { top: '70%', left: '10%',   size: 8,  delay: '1.2s' },
  { top: '80%', right: '20%',  size: 6,  delay: '0.4s' },
  { top: '45%', left: '5%',    size: 5,  delay: '1.8s' },
  { top: '35%', right: '8%',   size: 9,  delay: '1s'   },
] as const;

const HALF_BUBBLE = 22; // w-11 = 44px

function OrbitBubble({ icon, label, x, y }: { icon: string; label: string; x: number; y: number }) {
  return (
    <div
      className="absolute w-11 h-11 rounded-full bg-white border border-border-dim shadow-sm flex items-center justify-center text-xl"
      style={{
        left: `calc(50% + ${x}px - ${HALF_BUBBLE}px)`,
        top:  `calc(50% + ${y}px - ${HALF_BUBBLE}px)`,
      }}
      title={label}
    >
      {icon}
    </div>
  );
}

export function HeroOrb() {
  return (
    <div className="relative" style={{ width: 340, height: 340 }}>

      {/* Glow — uses box-shadow animation; safe to combine with translate */}
      <div
        className="absolute rounded-full animate-pulse-glow"
        style={{
          width: 220,
          height: 220,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle, rgba(139,144,240,0.22) 0%, rgba(108,212,218,0.08) 60%, transparent 80%)',
        }}
      />

      {/* Orbit ring 1 — CW.
          Centering wrapper holds the translate; inner div runs the CSS rotate animation.
          Separating them prevents the CSS @keyframes transform from clobbering the translate. */}
      <div
        className="absolute"
        style={{ width: 220, height: 220, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
      >
        <div className="w-full h-full relative rounded-full border border-dashed border-gold/30 animate-spin-slow">
          {ORBIT1_BUBBLES.map((b) => (
            <OrbitBubble key={b.label} icon={b.icon} label={b.label} x={b.x} y={b.y} />
          ))}
        </div>
      </div>

      {/* Orbit ring 2 — CCW, outer */}
      <div
        className="absolute"
        style={{ width: 292, height: 292, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
      >
        <div className="w-full h-full relative rounded-full border border-dashed border-accent/25 animate-spin-rev">
          {ORBIT2_BUBBLES.map((b) => (
            <OrbitBubble key={b.label} icon={b.icon} label={b.label} x={b.x} y={b.y} />
          ))}
        </div>
      </div>

      {/* Core orb — centering wrapper + floaty animation on inner div */}
      <div
        className="absolute z-10"
        style={{ width: 140, height: 140, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
      >
        <div
          className="w-full h-full rounded-full flex items-center justify-center animate-floaty"
          style={{
            background: 'linear-gradient(135deg, #8b90f0 0%, #6f73d6 60%, #6cd4da 100%)',
            boxShadow: '0 8px 40px rgba(139,144,240,0.4), 0 2px 12px rgba(108,212,218,0.3)',
          }}
        >
          <span style={{ fontSize: 52 }}>🎓</span>
        </div>
      </div>

      {/* Sparkles */}
      {SPARKLES.map((s, i) => (
        <div
          key={i}
          className="absolute animate-twinkle text-gold font-bold select-none pointer-events-none"
          style={{
            top: s.top,
            left: 'left' in s ? s.left : undefined,
            right: 'right' in s ? (s as { right: string }).right : undefined,
            fontSize: s.size,
            animationDelay: s.delay,
          }}
        >
          ✦
        </div>
      ))}
    </div>
  );
}
