import React from 'react';
import { cn } from '@/lib/utils';

// ─── Input Component ─────────────────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className, id, ...props }: InputProps) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="block text-[10.5px] text-text-muted mb-1">
          {label}
        </label>
      )}
      <input
        id={id}
        className={cn(
          'w-full bg-surface border border-border-dim rounded-[var(--radius-sm)] px-3 py-2 text-[12.5px] text-text-primary font-[inherit] outline-none transition-colors',
          'focus:border-gold',
          'placeholder:text-text-muted/50',
          className,
        )}
        {...props}
      />
    </div>
  );
}

// ─── Select Component ────────────────────────────────────────────────────────

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, options, className, id, ...props }: SelectProps) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="block text-[10.5px] text-text-muted mb-1">
          {label}
        </label>
      )}
      <select
        id={id}
        className={cn(
          'w-full bg-surface border border-border-dim rounded-[var(--radius-sm)] px-3 py-1.5 text-[11.5px] text-text-primary font-[inherit] outline-none transition-colors cursor-pointer',
          'focus:border-gold',
          '[&_option]:bg-dark-2',
          className,
        )}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Textarea Component ──────────────────────────────────────────────────────

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function Textarea({ label, className, id, ...props }: TextareaProps) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="block text-[10.5px] text-text-muted mb-1">
          {label}
        </label>
      )}
      <textarea
        id={id}
        className={cn(
          'w-full bg-surface border border-border-dim rounded-[var(--radius-sm)] px-3 py-2.5 text-[13px] text-text-primary font-[inherit] outline-none resize-y transition-colors',
          'focus:border-gold',
          'placeholder:text-text-muted/50',
          className,
        )}
        {...props}
      />
    </div>
  );
}
