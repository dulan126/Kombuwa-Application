import React from 'react';
import { cn } from '@/lib/utils';

// ─── Card Component ──────────────────────────────────────────────────────────

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  isSRP?: boolean;
  isHoverable?: boolean;
  isDone?: boolean;
}

export function Card({
  isSRP = false,
  isHoverable = false,
  isDone = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'bg-surface border border-border-dim rounded-[var(--radius-base)]',
        isSRP && 'border-t-[3px] border-t-gold',
        isHoverable && 'transition-all duration-200 hover:border-gold-border hover:translate-y-[-2px] hover:shadow-[0_10px_24px_rgba(0,0,0,0.28)] cursor-pointer',
        isDone && 'opacity-[0.72]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
