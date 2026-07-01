import React from 'react';
import { cn } from '@/lib/utils';

// ─── Button Component ────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'gradient-gold text-white hover:opacity-90',
  outline: 'bg-transparent border border-border-dim text-text-primary hover:border-gold hover:text-gold hover:bg-gold-bg',
  ghost: 'bg-transparent text-text-muted hover:text-text-primary hover:bg-gold-bg',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-[11px] rounded-[var(--radius-sm)]',
  md: 'px-[17px] py-2 text-xs rounded-[var(--radius-sm)]',
  lg: 'px-7 py-3 text-sm rounded-[10px]',
};

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 font-semibold cursor-pointer border-none transition-all duration-150 whitespace-nowrap font-[inherit]',
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        (disabled || isLoading) && 'opacity-60 cursor-not-allowed',
        className,
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}
