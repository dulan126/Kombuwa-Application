// ─── Barrel Exports ──────────────────────────────────────────────────────────

export * from './auth';
export * from './paper';
export * from './forum';
export * from './ranking';

// ─── Common Types ────────────────────────────────────────────────────────────

export interface ApiError {
  status: number;
  message: string;
  data?: Record<string, unknown>;
}
