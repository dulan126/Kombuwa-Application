import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with conflict resolution.
 * Combines clsx (conditional classes) with tailwind-merge (deduplication).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Returns a human-readable relative time string (e.g., "2h", "3d").
 */
export function timeAgo(iso: string | undefined | null): string {
  if (!iso) return '—';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

/**
 * Maps Sinhala district name to English slug.
 */
export function districtMap(si: string): string {
  const m: Record<string, string> = {
    'කොළඹ': 'colombo',
    'ගම්පහ': 'gampaha',
    'කළුතර': 'kalutara',
    'මහනුවර': 'kandy',
    'ගාල්ල': 'galle',
    'මාතර': 'matara',
    'රත්නපුර': 'ratnapura',
    'කුරුණෑගල': 'kurunegala',
    'ජාෆ්නා': 'jaffna',
    'හම්බන්': 'hambantota',
  };
  return m[si] || 'colombo';
}

/**
 * Format seconds as MM:SS.
 */
export function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Format score as "X/Y (Z%)".
 */
export function formatScore(score: number, total: number): string {
  const pct = Math.round((score / total) * 100);
  return `${score}/${total} (${pct}%)`;
}

/**
 * Get performance label based on percentage.
 */
export function getPerformanceLabel(percentage: number): { label: string; emoji: string } {
  if (percentage >= 80) return { label: 'විශිෂ්ට', emoji: '🌟' };
  if (percentage >= 60) return { label: 'හොඳ', emoji: '👍' };
  if (percentage >= 40) return { label: 'සාමාන්‍ය', emoji: '📖' };
  return { label: 'වැඩිදියුණු', emoji: '💪' };
}

/**
 * Generate initials from a name (first 2 characters).
 */
export function getInitials(name: string): string {
  return (name || '??').substring(0, 2);
}

