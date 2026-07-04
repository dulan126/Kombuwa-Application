'use client';

import { useState, useEffect, useCallback } from 'react';
import { papersService } from '@/services/papers.service';
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

  const loadPapers = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await papersService.getPapers({ grade });
      setPapers(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [user, grade]);

  useEffect(() => {
    loadPapers();
  }, [loadPapers]);

  return { papers, loading, error, refetch: loadPapers };
}
