// ─── Barrel Exports ──────────────────────────────────────────────────────────

export * from './auth';
export * from './paper';
export * from './forum';
export * from './ranking';
export * from './past-paper';

// ─── Common Types ────────────────────────────────────────────────────────────

export interface ApiError {
  status: number;
  message: string;
  data?: Record<string, unknown>;
}
