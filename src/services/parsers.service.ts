/**
 * src/services/parsers.service.ts
 * Regex Log Parsers management service.
 */

import { apiClient } from './api-client';
import { LogParser } from '@/lib/types';

export const parsersService = {
  getParsers: () =>
    apiClient.get<LogParser[]>('/api/parsers'),

  createParser: (payload: { name: string; regex: string; description?: string; active?: boolean; log_source?: string }) =>
    apiClient.post<{ id: string; status: string }>('/api/parsers', payload),

  deleteParser: (id: string) =>
    apiClient.delete<{ status: string }>(`/api/parsers/${id}`),
};
