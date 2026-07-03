'use client';

import { useState, useEffect, useCallback } from 'react';
import { papersService } from '@/services/papers.service';
import { generateDemoPapers } from '@/lib/demo-data';
import { isNetworkError } from '@/services/api-client';
import type { Paper, User } from '@/types';
import type { Grade } from '@/types/auth';

interface UsePapersOptions {
  user: User | null;
  grade: Grade;
}

export function usePapers({ user, grade }: UsePapersOptions) {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const loadPapers = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await papersService.getPapers({ grade });
      setPapers(data);
      setIsDemoMode(false);
    } catch (err: unknown) {
      // Demo fallback only when the API is completely unreachable
      if (isNetworkError(err)) {
        try {
          const demoPapers = generateDemoPapers();
          const userPapers = demoPapers[user.stream]?.[parseInt(grade)] || {};
          const allPapers: Paper[] = [];
          Object.values(userPapers).forEach((bucket) => {
            [...bucket.srp, ...bucket.daily].forEach((p) => {
              const { _qs, ...paper } = p;
              allPapers.push(paper);
            });
          });
          setPapers(allPapers);
          setIsDemoMode(true);
        } catch {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } else {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      setLoading(false);
    }
  }, [user, grade]);

  useEffect(() => {
    loadPapers();
  }, [loadPapers]);

  return { papers, loading, error, isDemoMode, refetch: loadPapers };
}
