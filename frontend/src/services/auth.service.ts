import { apiClient } from './api-client';
import type {
  User,
  LoginRequest,
  RegisterRequest,
  VerifyOTPRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  UpdateProfileRequest,
  AuthTokens,
} from '@/types';

// ─── Auth Service ────────────────────────────────────────────────────────────

interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken?: string;
}

interface RegisterResponse {
  message: string;
  expiresAt: string;
}

interface VerifyOTPResponse {
  message: string;
  user: User;
  accessToken: string;
  refreshToken?: string;
}

export const authService = {
  /**
   * Register a new user. Sends OTP to their mobile.
   */
  async register(data: RegisterRequest): Promise<RegisterResponse> {
    return apiClient.post<RegisterResponse>('/auth/register', data);
  },

  /**
   * Verify OTP code after registration or password reset.
   */
  async verifyOTP(data: VerifyOTPRequest): Promise<VerifyOTPResponse> {
    return apiClient.post<VerifyOTPResponse>('/auth/verify-otp', data);
  },

  /**
   * Login with mobile and password.
   */
  async login(data: LoginRequest): Promise<LoginResponse> {
    return apiClient.post<LoginResponse>('/auth/login', data);
  },

  /**
   * Logout current session.
   */
  async logout(): Promise<void> {
    await apiClient.post('/auth/logout');
  },

  /**
   * Get current authenticated user.
   */
  async getMe(): Promise<User> {
    return apiClient.get<User>('/auth/me');
  },

  /**
   * Update user profile.
   */
  async updateProfile(data: UpdateProfileRequest): Promise<User> {
    return apiClient.patch<User>('/auth/me', data);
  },

  /**
   * Request password reset OTP.
   */
  async forgotPassword(data: ForgotPasswordRequest): Promise<{ message: string }> {
    return apiClient.post('/auth/forgot-password', data);
  },

  /**
   * Reset password with OTP verification.
   */
  async resetPassword(data: ResetPasswordRequest): Promise<{ message: string }> {
    return apiClient.post('/auth/reset-password', data);
  },
};
