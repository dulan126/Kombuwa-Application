import React from 'react';
import { cn } from '@/lib/utils';

// ─── Badge Component ─────────────────────────────────────────────────────────

type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'srp';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-success/15 text-success border-success/25',
  danger: 'bg-danger/[0.12] text-danger border-danger/[0.22]',
  warning: 'bg-warning/[0.12] text-warning border-warning/[0.2]',
  info: 'bg-accent/[0.12] text-accent border-accent/[0.22]',
  srp: 'bg-gradient-to-br from-gold/20 to-gold/[0.06] text-gold border-gold',
};

export function Badge({ variant = 'info', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap border',
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
