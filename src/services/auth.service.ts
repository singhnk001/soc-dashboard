/**
 * src/services/auth.service.ts
 * Authentication, TOTP MFA, and User Management services.
 */

import { apiClient } from './api-client';

export interface UserAccount {
  id: string;
  username: string;
  role: string;
  status: 'Active' | 'Disabled';
  real_name: string;
  mfa_enabled?: boolean;
}

export const authService = {
  login: (credentials: { username: string; password: string }) =>
    apiClient.post<{ status: string; user?: UserAccount; user_id?: string }>('/api/auth/login', credentials),

  loginMfa: (payload: { user_id: string; token: string }) =>
    apiClient.post<{ status: string; user: UserAccount }>('/api/auth/login/mfa', payload),

  setupMfa: (userId: string) =>
    apiClient.post<{ status: string; secret: string; uri: string }>('/api/auth/mfa/setup', { user_id: userId }),

  verifyMfa: (payload: { user_id: string; secret: string; token: string }) =>
    apiClient.post<{ status: string }>('/api/auth/mfa/verify', payload),

  resetMfa: (userId: string) =>
    apiClient.post<{ status: string }>('/api/auth/mfa/reset', { user_id: userId }),

  getUsers: () =>
    apiClient.get<UserAccount[]>('/api/users'),

  createUser: (payload: { username: string; password: string; role?: string; real_name?: string }) =>
    apiClient.post<{ status: string; id: string }>('/api/users', payload),

  updateUser: (id: string, payload: { password?: string; role?: string; status?: string; real_name?: string }) =>
    apiClient.put<{ status: string }>(`/api/users/${id}`, payload),

  deleteUser: (id: string) =>
    apiClient.delete<{ status: string }>(`/api/users/${id}`),
};
