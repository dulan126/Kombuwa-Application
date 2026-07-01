'use client';

import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ─── Toast Types ─────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType) => void;
  dismissToast: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto-dismiss after 3.5 seconds; timer is tracked so manual dismiss can cancel it
    const timerId = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timersRef.current.delete(id);
    }, 3500);
    timersRef.current.set(id, timerId);
  }, []);

  const dismissToast = useCallback((id: string) => {
    const timerId = timersRef.current.get(id);
    if (timerId !== undefined) {
      clearTimeout(timerId);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Clear all pending timers on unmount
  useEffect(() => () => { timersRef.current.forEach(clearTimeout); }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, showToast, dismissToast }),
    [toasts, showToast, dismissToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast Container */}
      <div className="fixed bottom-5 right-5 z-[999] flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`
              animate-slide-in rounded-lg border px-4 py-2.5 text-sm font-semibold shadow-lg backdrop-blur-sm
              ${toast.type === 'success' ? 'border-emerald-500/25 bg-emerald-500/15 text-emerald-400' : ''}
              ${toast.type === 'error' ? 'border-red-500/25 bg-red-500/15 text-red-400' : ''}
              ${toast.type === 'warning' ? 'border-amber-500/25 bg-amber-500/15 text-amber-400' : ''}
              ${toast.type === 'info' ? 'border-gold/25 bg-gold/15 text-gold' : ''}
            `}
            onClick={() => dismissToast(toast.id)}
            role="alert"
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
