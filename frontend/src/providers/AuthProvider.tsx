'use client';

import React, { createContext, useCallback, useEffect, useMemo, useReducer } from 'react';
import type { User, Stream, Grade, AuthState } from '@/types';
import { authService } from '@/services/auth.service';

// ─── Actions ─────────────────────────────────────────────────────────────────

type AuthAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'LOGIN_SUCCESS'; payload: { user: User } }
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
        isLoading: false,
      };
    case 'LOGOUT':
      return { user: null, isLoggedIn: false, isLoading: false };
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
  login: (mobile: string, password: string) => Promise<User>;
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
}

export const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    user: null,
    isLoggedIn: false,
    isLoading: true,
  });

  useEffect(() => {
    async function checkSession() {
      try {
        const user = await authService.getMe();
        dispatch({ type: 'LOGIN_SUCCESS', payload: { user } });
      } catch {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    }
    checkSession();
  }, []);

  const login = useCallback(async (mobile: string, password: string): Promise<User> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const data = await authService.login({ mobile, password });
      dispatch({ type: 'LOGIN_SUCCESS', payload: { user: data.user } });
      return data.user;
    } catch (err) {
      dispatch({ type: 'SET_LOADING', payload: false });
      throw err;
    }
  }, []);

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
      await authService.register(data);
      return { needsOTP: true, mobile: data.mobile };
    },
    [],
  );

  const verifyOTP = useCallback(
    async (mobile: string, code: string, purpose: 'register' | 'login' | 'reset_password') => {
      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        const data = await authService.verifyOTP({ mobile, code, purpose });
        dispatch({ type: 'LOGIN_SUCCESS', payload: { user: data.user } });
      } catch (err) {
        dispatch({ type: 'SET_LOADING', payload: false });
        throw err;
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // Ignore logout errors
    }
    dispatch({ type: 'LOGOUT' });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      register,
      verifyOTP,
      logout,
    }),
    [state, login, register, verifyOTP, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
