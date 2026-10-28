/**
 * src/services/threat-intel.service.ts
 * Threat Intelligence feeds, community synchronizations, and IOC queries.
 */

import { apiClient } from './api-client';
import { ThreatFeed, ThreatIndicator } from '@/lib/types';

export const threatIntelService = {
  getFeeds: () =>
    apiClient.get<{ data: ThreatFeed[] }>('/api/threat-feeds'),

  createFeed: (payload: { name: string; url: string; type: string; category: string; schedule?: string }) =>
    apiClient.post<{ status: string; id: string }>('/api/threat-feeds', payload),

  updateFeed: (id: string, payload: { name: string; url: string; type: string; category: string; schedule?: string }) =>
    apiClient.put<{ status: string }>(`/api/threat-feeds/${id}`, payload),

  deleteFeed: (id: string) =>
    apiClient.delete<{ status: string }>(`/api/threat-feeds/${id}`),

  getIndicators: (feedId: string, all: boolean = false) =>
    apiClient.get<{ data: ThreatIndicator[] }>(`/api/threat-feeds/${feedId}/indicators`, { all }),

  deleteIndicator: (feedId: string, indicatorId: string) =>
    apiClient.delete<{ status: string }>(`/api/threat-feeds/${feedId}/indicators/${indicatorId}`),

  syncFeed: (feedId: string) =>
    apiClient.post<{ status: string; count?: number; last_updated?: string }>(`/api/threat-feeds/${feedId}/sync`),

  syncCommunityFeed: (slug: string) =>
    apiClient.post<{ status: string; count?: number; feed_id?: string }>(`/api/community-feeds/${slug}/sync`),

  getCommunityStatus: () =>
    apiClient.get<{ status: string; data: Record<string, { last_updated: string; indicator_count: number; status: string }> }>('/api/community-feeds/status'),

  lookupIoc: (ioc: string, iocType: string, provider: string = 'VirusTotal') =>
    apiClient.get<{ status: string; provider?: string; data?: any; message?: string }>('/api/threat-intel/lookup', {
      ioc,
      ioc_type: iocType,
      provider,
    }),

  getOtxStatus: () =>
    apiClient.get<{ configured: boolean; username?: string; message?: string }>('/api/otx/status'),

  getOtxPulses: (page: number = 1, limit: number = 20, search: string = '') =>
    apiClient.get<{ results: any[]; count: number }>('/api/otx/pulses', { page, limit, search }),

  getOtxPulse: (pulseId: string) =>
    apiClient.get<any>(`/api/otx/pulse/${pulseId}`),
};
