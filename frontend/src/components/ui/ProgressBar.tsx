import React from 'react';
import { cn } from '@/lib/utils';

// ─── ProgressBar Component ───────────────────────────────────────────────────

interface ProgressBarProps {
  value: number; // 0-100
  className?: string;
}

export function ProgressBar({ value, className }: ProgressBarProps) {
  return (
    <div className={cn('h-[3px] bg-white/[0.07] rounded-sm overflow-hidden', className)}>
      <div
        className="h-full bg-gradient-to-r from-accent to-accent-2 rounded-sm transition-[width] duration-300"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

// ─── Avatar Component ────────────────────────────────────────────────────────

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  className?: string;
}

const sizeMap = {
  sm: 'w-[26px] h-[26px] text-[10px]',
  md: 'w-8 h-8 text-[10px]',
  lg: 'w-[46px] h-[46px] text-sm',
};

export function Avatar({
  name,
  size = 'sm',
  color = 'rgba(79,127,232,0.15)',
  className,
}: AvatarProps) {
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-bold shrink-0',
        sizeMap[size],
        className,
      )}
      style={{ background: color, color: '#4F7FE8' }}
    >
      {(name || '??').substring(0, 2)}
    </div>
  );
}

// ─── Skeleton Component ──────────────────────────────────────────────────────

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'bg-surface animate-pulse rounded-[var(--radius-sm)]',
        className,
      )}
    />
  );
}

// ─── Loading Spinner ─────────────────────────────────────────────────────────

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const spinnerSizes = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
};

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <div
      className={cn(
        'border-2 border-gold/30 border-t-gold rounded-full animate-spin',
        spinnerSizes[size],
        className,
      )}
    />
  );
}
