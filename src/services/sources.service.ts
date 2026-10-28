/**
 * src/services/sources.service.ts
 * Connected log sources, endpoint agents, and criticality management.
 */

import { apiClient } from './api-client';
import { ConnectedSource, VectorAgent } from '@/lib/types';

export const sourcesService = {
  getSources: () =>
    apiClient.get<ConnectedSource[]>('/api/sources'),

  deleteSource: (hostname: string) =>
    apiClient.delete<{ status: string }>(`/api/sources/${hostname}`),

  getVectorAgents: () =>
    apiClient.get<{ data: VectorAgent[] }>('/api/system/vector/agents'),

  setCriticality: (hostname: string, criticality: 'low' | 'medium' | 'high' | 'critical') =>
    apiClient.patch<{ status: string; hostname: string; criticality: string }>(
      `/api/system/vector/agents/${hostname}/criticality`,
      { criticality }
    ),

  getApiSources: () =>
    apiClient.get<{ data: any[] }>('/api/api-sources'),

  createApiSource: (payload: { type: string; name: string; config: string }) =>
    apiClient.post<{ status: string; id: string }>('/api/api-sources', payload),

  deleteApiSource: (sourceId: string) =>
    apiClient.delete<{ status: string }>(`/api/api-sources/${sourceId}`),
};
