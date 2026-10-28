/**
 * src/services/system.service.ts
 * Health monitoring, Windows service control, and system configuration services.
 */

import { apiClient } from './api-client';
import { ManagedService, SystemHealth, DashboardStats } from '@/lib/types';

export const systemService = {
  getStats: () =>
    apiClient.get<DashboardStats>('/api/stats'),

  getHealth: () =>
    apiClient.get<SystemHealth>('/api/system/health'),

  getServices: () =>
    apiClient.get<{ data: ManagedService[] }>('/api/system/services'),

  serviceAction: (serviceId: string, action: 'start' | 'stop' | 'restart') =>
    apiClient.post<{ status: string; message: string }>(`/api/system/services/${serviceId}/action`, { action }),

  getSettings: () =>
    apiClient.get<{ status: string; data: Record<string, string> }>('/api/settings'),

  saveSettings: (payload: Record<string, string>) =>
    apiClient.post<{ status: string }>('/api/settings', payload),
};
