'use client';

import { useEffect } from 'react';

/**
 * Warns before leaving an in-progress exam. Covers:
 *   - tab close / refresh / external navigation via `beforeunload`
 *   - browser Back button and in-app `router.back()` via a `popstate` trap
 *
 * This is a UX safety net only. It is intentionally bypassable — the single
 * attempt is enforced server-side (the attempt is already in_progress and the
 * clock keeps running regardless of what the client does).
 */
export function useExamGuard(active: boolean, message: string) {
  useEffect(() => {
    if (!active) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    // Push a sentinel history entry so the first Back lands on the same URL,
    // letting us intercept it and confirm before actually leaving.
    window.history.pushState(null, '', window.location.href);
    const onPopState = () => {
      if (window.confirm(message)) {
        window.removeEventListener('popstate', onPopState);
        window.history.back();
      } else {
        window.history.pushState(null, '', window.location.href);
      }
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
    };
  }, [active, message]);
}
