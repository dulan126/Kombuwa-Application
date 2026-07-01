import type { ApiError } from '@/types';

// ─── API Client Configuration ────────────────────────────────────────────────

/**
 * Centralized API client implementing the Facade pattern.
 * All API calls go through this client, which handles:
 * - Base URL resolution
 * - Error normalization
 * - Cookie-based auth (via Next.js BFF route handlers)
 * - Demo mode detection
 */

function getBaseUrl(): string {
  // In browser, use relative path to hit Next.js API routes (BFF)
  if (typeof window !== 'undefined') {
    return '/api';
  }
  // On server, use the backend URL directly
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    throw new Error('NEXT_PUBLIC_API_URL environment variable is not set');
  }
  return apiUrl;
}

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = getBaseUrl();
  }

  /**
   * Generic fetch wrapper with error handling and auth.
   */
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: {
      isFormData?: boolean;
      signal?: AbortSignal;
    },
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {};

    if (body && !options?.isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
      credentials: 'include', // Send HTTP-only cookies
      signal: options?.signal,
    };

    if (body) {
      fetchOptions.body = options?.isFormData
        ? (body as FormData)
        : JSON.stringify(body);
    }

    try {
      const res = await fetch(url, fetchOptions);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const error: ApiError = {
          status: res.status,
          message: (data as Record<string, string>)?.error || res.statusText,
          data: data as Record<string, unknown>,
        };
        throw error;
      }

      return data as T;
    } catch (err) {
      // Rethrow ApiError as-is
      if ((err as ApiError).status) {
        throw err;
      }
      // Network error
      const apiError: ApiError = {
        status: 0,
        message: (err as Error).message || 'Network error',
      };
      throw apiError;
    }
  }

  // ─── Convenience Methods ────────────────────────────────────────────

  get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>('GET', path, undefined, { signal });
  }

  post<T>(path: string, body?: unknown, isFormData = false): Promise<T> {
    return this.request<T>('POST', path, body, { isFormData });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}

// Singleton instance
export const apiClient = new ApiClient();

/**
 * Check if an error is an API error (vs network/unknown error).
 */
export function isApiError(err: unknown): err is ApiError {
  return typeof err === 'object' && err !== null && 'status' in err && 'message' in err;
}

/**
 * Check if the API is unreachable (demo mode should activate).
 */
export function isNetworkError(err: unknown): boolean {
  return isApiError(err) && err.status === 0;
}
