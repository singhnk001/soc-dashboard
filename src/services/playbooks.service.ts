/**
 * src/services/playbooks.service.ts
 * SOAR Playbooks CRUD, test execution, and execution history services.
 */

import { apiClient } from './api-client';
import { Playbook, PlaybookExecution } from '@/lib/types';

export const playbooksService = {
  getPlaybooks: () =>
    apiClient.get<Playbook[]>('/api/playbooks'),

  createPlaybook: (payload: Partial<Playbook>) =>
    apiClient.post<{ status: string; id: string }>('/api/playbooks', payload),

  updatePlaybook: (id: string, payload: Partial<Playbook>) =>
    apiClient.patch<{ status: string }>(`/api/playbooks/${id}`, payload),

  deletePlaybook: (id: string) =>
    apiClient.delete<{ status: string }>(`/api/playbooks/${id}`),

  testPlaybook: (id: string, alertId?: string) =>
    apiClient.post<{ execution_id: string; status: string; results: any[] }>(
      `/api/playbooks/${id}/test${alertId ? `?alert_id=${alertId}` : ''}`
    ),

  getExecutions: (limit: number = 50) =>
    apiClient.get<PlaybookExecution[]>(`/api/playbooks/executions?limit=${limit}`),
};
