/**
 * src/services/logs.service.ts
 * Log search, pagination, histograms, and purging services.
 */

import { apiClient } from './api-client';
import { LogEntry } from '@/lib/types';

export interface LogsResponse {
  data: LogEntry[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  histogram: { time: string; count: number }[];
}

export interface GetLogsParams {
  page?: number;
  limit?: number;
  severity?: string;
  search?: string;
  hostname?: string;
  source_ip?: string;
  dest_ip?: string;
  event_id?: string;
  source?: string;
  username?: string;
  time_from?: string;
  time_to?: string;
  filters?: string;
}

export const logsService = {
  getLogs: (params: GetLogsParams = {}) =>
    apiClient.get<LogsResponse>('/api/logs', params),

  purgeLogs: (days: number = 30) =>
    apiClient.delete<{ status: string; deleted: number; retention_days: number }>(
      `/api/logs/purge?days=${days}`
    ),
};
