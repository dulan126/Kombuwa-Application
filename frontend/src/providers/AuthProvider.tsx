'use client';

import React, { createContext, useCallback, useEffect, useMemo, useReducer } from 'react';
import type { User, Stream, Grade, AuthState } from '@/types';
import { authService } from '@/services/auth.service';
import { isNetworkError } from '@/services/api-client';
import { STREAMS } from '@/lib/constants';

// ─── Actions ─────────────────────────────────────────────────────────────────

type AuthAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'LOGIN_SUCCESS'; payload: { user: User; isDemoMode: boolean } }
  | { type: 'LOGOUT' }
  | { type: 'UPDATE_USER'; payload: Partial<User> };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'LOGIN_SUCCESS':
      return {
        user: action.payload.user,
        isLoggedIn: true,
        isDemoMode: action.payload.isDemoMode,
        isLoading: false,
      };
    case 'LOGOUT':
      return { user: null, isLoggedIn: false, isDemoMode: false, isLoading: false };
    case 'UPDATE_USER':
      return state.user
        ? { ...state, user: { ...state.user, ...action.payload } }
        : state;
    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface AuthContextValue extends AuthState {
  login: (mobile: string, password: string) => Promise<void>;
  register: (data: {
    mobile: string;
    name: string;
    password: string;
    stream: Stream;
    grade: Grade;
    district: string;
    school?: string;
    exam_year: number;
  }) => Promise<{ needsOTP: boolean; mobile: string }>;
  verifyOTP: (mobile: string, code: string, purpose: 'register' | 'login' | 'reset_password') => Promise<void>;
  logout: () => Promise<void>;
  demoLogin: (name: string, stream: Stream, grade: Grade, district: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    user: null,
    isLoggedIn: false,
    isDemoMode: false,
    isLoading: true,
  });

  // Auto-verify session on mount
  useEffect(() => {
    async function checkSession() {
      try {
        const user = await authService.getMe();
        dispatch({ type: 'LOGIN_SUCCESS', payload: { user, isDemoMode: false } });
      } catch {
        // Check for demo user in localStorage
        const demoUser = typeof window !== 'undefined'
          ? localStorage.getItem('kw_demo_user')
          : null;
        if (demoUser) {
          try {
            const user = JSON.parse(demoUser) as User;
            // Ensure httpOnly cookie is set via server route
            await fetch('/api/auth/demo-session', { method: 'POST' }).catch(() => {});
            dispatch({ type: 'LOGIN_SUCCESS', payload: { user, isDemoMode: true } });
          } catch {
            dispatch({ type: 'SET_LOADING', payload: false });
          }
        } else {
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      }
    }
    checkSession();
  }, []);

  const login = useCallback(async (mobile: string, password: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const data = await authService.login({ mobile, password });
      dispatch({ type: 'LOGIN_SUCCESS', payload: { user: data.user, isDemoMode: false } });
    } catch (err) {
      dispatch({ type: 'SET_LOADING', payload: false });
      throw err;
    }
  }, []);

  // deps: [] is correct — captures only dispatch (stable), authService singleton, and isNetworkError (pure)
  const register = useCallback(
    async (data: {
      mobile: string;
      name: string;
      password: string;
      stream: Stream;
      grade: Grade;
      district: string;
      school?: string;
      exam_year: number;
    }) => {
      try {
        await authService.register(data);
        return { needsOTP: true, mobile: data.mobile };
      } catch (err) {
        if (isNetworkError(err)) {
          // Fallback to demo mode
          const user: User = {
            id: `demo-${Date.now()}`,
            name: data.name,
            role: 'student',
            stream: data.stream,
            grade: data.grade,
            district: data.district,
          };
          if (typeof window !== 'undefined') {
            localStorage.setItem('kw_demo_user', JSON.stringify(user));
            await fetch('/api/auth/demo-session', { method: 'POST' }).catch(() => {});
          }
          dispatch({ type: 'LOGIN_SUCCESS', payload: { user, isDemoMode: true } });
          return { needsOTP: false, mobile: data.mobile };
        }
        throw err;
      }
    },
    [],
  );

  // deps: [] is correct — captures only dispatch (stable) and authService singleton
  const verifyOTP = useCallback(
    async (mobile: string, code: string, purpose: 'register' | 'login' | 'reset_password') => {
      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        const data = await authService.verifyOTP({ mobile, code, purpose });
        dispatch({ type: 'LOGIN_SUCCESS', payload: { user: data.user, isDemoMode: false } });
      } catch (err) {
        dispatch({ type: 'SET_LOADING', payload: false });
        throw err;
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      if (!state.isDemoMode) {
        await authService.logout();
      }
    } catch {
      // Ignore logout errors
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('kw_demo_user');
      await fetch('/api/auth/demo-session', { method: 'DELETE' }).catch(() => {});
    }
    dispatch({ type: 'LOGOUT' });
  }, [state.isDemoMode]);

  // deps: [] is correct — captures only dispatch (stable from useReducer) and fetch (global)
  const demoLogin = useCallback(async (name: string, stream: Stream, grade: Grade, district: string) => {
    const user: User = {
      id: `demo-${Date.now()}`,
      name,
      role: 'student',
      stream,
      grade,
      district,
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem('kw_demo_user', JSON.stringify(user));
      await fetch('/api/auth/demo-session', { method: 'POST' }).catch(() => {});
    }
    dispatch({ type: 'LOGIN_SUCCESS', payload: { user, isDemoMode: true } });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      register,
      verifyOTP,
      logout,
      demoLogin,
    }),
    [state, login, register, verifyOTP, logout, demoLogin],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
