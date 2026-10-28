/**
 * src/services/usecases.service.ts
 * Correlation detection rules and baseline use cases service.
 */

import { apiClient } from './api-client';
import { DetectionUseCase } from '@/lib/types';

export const useCasesService = {
  getUseCases: () =>
    apiClient.get<DetectionUseCase[]>('/api/usecases'),

  createUseCase: (payload: {
    title: string;
    description: string;
    type: 'threshold' | 'match' | 'sequence';
    event_id?: string;
    mitre_technique?: string;
    threshold_count?: number;
    severity?: string;
    active?: boolean;
    rule_logic?: string;
  }) =>
    apiClient.post<{ id: string; status: string }>('/api/usecases', payload),

  deleteUseCase: (id: string) =>
    apiClient.delete<{ status: string }>(`/api/usecases/${id}`),
};
