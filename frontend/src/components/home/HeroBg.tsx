'use client';

import { useEffect, useRef } from 'react';

const FLOATING_BADGES = [
  { emoji: '⚗️', label: 'Chemistry',   top: '18%', left: '6%',   delay: '0s',   rot: '-6deg'  },
  { emoji: '🧬', label: 'Biology',     top: '12%', right: '9%',  delay: '0.8s', rot: '5deg'   },
  { emoji: '📐', label: 'Maths',       top: '65%', left: '4%',   delay: '1.4s', rot: '-3deg'  },
  { emoji: '📊', label: 'Commerce',    top: '72%', right: '6%',  delay: '0.4s', rot: '8deg'   },
  { emoji: '🎨', label: 'Arts',        top: '40%', right: '3%',  delay: '1.8s', rot: '-5deg'  },
  { emoji: '💻', label: 'Technology',  top: '35%', left: '2%',   delay: '1.1s', rot: '4deg'   },
];

export function HeroBg() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden>
      {/* Gradient blobs */}
      <div
        className="animate-blob absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full opacity-30"
        style={{ background: 'radial-gradient(circle, #8b90f0 0%, #6f73d6 50%, transparent 75%)', filter: 'blur(72px)' }}
      />
      <div
        className="animate-blob2 absolute -bottom-40 -right-20 w-[480px] h-[480px] rounded-full opacity-25"
        style={{ background: 'radial-gradient(circle, #6cd4da 0%, #4a9fa5 50%, transparent 75%)', filter: 'blur(80px)', animationDelay: '2s' }}
      />
      <div
        className="animate-blob absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full opacity-15"
        style={{ background: 'radial-gradient(ellipse, #a78bfa 0%, transparent 70%)', filter: 'blur(90px)', animationDelay: '4s' }}
      />

      {/* Subtle dot grid */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)',
          backgroundSize: '36px 36px',
        }}
      />

      {/* Floating subject badges */}
      {FLOATING_BADGES.map((b) => (
        <div
          key={b.label}
          className="animate-float-badge absolute hidden lg:flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-3 py-1.5"
          style={{
            top: b.top,
            left: 'left' in b ? b.left : undefined,
            right: 'right' in b ? (b as { right: string }).right : undefined,
            animationDelay: b.delay,
            ['--r' as string]: b.rot,
          }}
        >
          <span className="text-[18px] leading-none">{b.emoji}</span>
          <span className="text-white/80 text-[11px] font-medium">{b.label}</span>
        </div>
      ))}
    </div>
  );
}
