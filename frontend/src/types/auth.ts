// ─── Auth Types ──────────────────────────────────────────────────────────────

export type Stream = 'phy' | 'bio' | 'com' | 'art' | 'tec';
export type Grade = '12' | '13';
export type UserRole = 'student' | 'teacher' | 'admin' | 'editor';

export interface User {
  id: string;
  name: string;
  mobile?: string;
  role: UserRole;
  stream: Stream;
  grade: Grade;
  district: string;
  school?: string;
  exam_year?: number;
  is_verified?: boolean;
  created_at?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

export interface LoginRequest {
  mobile: string;
  password: string;
}

export interface RegisterRequest {
  mobile: string;
  name: string;
  password: string;
  stream: Stream;
  grade: Grade;
  district: string;
  school?: string;
  exam_year: number;
}

export interface VerifyOTPRequest {
  mobile: string;
  code: string;
  purpose: 'register' | 'login' | 'reset_password';
}

export interface ForgotPasswordRequest {
  mobile: string;
}

export interface ResetPasswordRequest {
  mobile: string;
  code: string;
  newPassword: string;
}

export interface UpdateProfileRequest {
  name?: string;
  school?: string;
  district?: string;
  exam_year?: number;
}

export interface AuthState {
  user: User | null;
  isLoggedIn: boolean;
  isDemoMode: boolean;
  isLoading: boolean;
}
