'use client';

import { useEffect, useState } from 'react';

// Sri Lanka A/L exam approximate date — update each year
const EXAM_DATE = new Date('2026-08-07T00:00:00+05:30');

function getTimeLeft() {
  const now = new Date();
  const diff = EXAM_DATE.getTime() - now.getTime();
  if (diff <= 0) return { years: 0, months: 0, days: 0 };

  const totalDays = Math.floor(diff / (1000 * 60 * 60 * 24));
  const years = Math.floor(totalDays / 365);
  const months = Math.floor((totalDays % 365) / 30);
  const days = totalDays % 30;
  return { years, months, days };
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className="w-[88px] h-[80px] rounded-[14px] flex items-center justify-center text-[2.4rem] font-bold text-text-primary bg-white border border-border-dim"
        style={{
          fontFamily: 'var(--font-space-grotesk)',
          boxShadow: '0 2px 16px rgba(139,144,240,0.10)',
        }}
      >
        {String(value).padStart(2, '0')}
      </div>
      <span className="mt-2 text-[11px] font-semibold text-text-muted tracking-[1.5px] uppercase">
        {label}
      </span>
    </div>
  );
}

export function CountdownTimer() {
  const [time, setTime] = useState(getTimeLeft);

  useEffect(() => {
    const id = setInterval(() => setTime(getTimeLeft()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="py-14 px-6 text-center">
      <div
        className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[2px] uppercase text-gold mb-3"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse-dot inline-block" />
        A/L Exam Countdown
      </div>
      <h2
        className="text-[clamp(1.3rem,2.5vw,1.7rem)] font-bold text-text-primary mb-8"
        style={{ fontFamily: 'var(--font-space-grotesk)' }}
      >
        A/L 2026 Starts In
      </h2>
      <div className="flex items-end justify-center gap-5">
        <Unit value={time.years} label="Years" />
        <div className="text-[2rem] font-bold text-border-dim mb-8">:</div>
        <Unit value={time.months} label="Months" />
        <div className="text-[2rem] font-bold text-border-dim mb-8">:</div>
        <Unit value={time.days} label="Days" />
      </div>
      <p className="mt-6 text-[12.5px] text-text-muted">
        Estimated date: August 7, 2026 · Sri Lanka Standard Time
      </p>
    </section>
  );
}
