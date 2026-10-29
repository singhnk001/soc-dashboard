/**
 * src/services/alerts.service.ts
 * Alerts listing, triage updates, and investigation comments.
 */

import { apiClient } from './api-client';
import { Alert, AlertComment } from '@/lib/types';

export interface AlertsResponse {
  data: Alert[];
  total: number;
  page: number;
  limit: number;
}

export interface GetAlertsParams {
  status?: string;
  severity?: string;
  assigned_to?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface UpdateAlertPayload {
  status?: string;
  assigned_to?: string;
  resolution_type?: string;
  notes?: string;
}

export interface BulkUpdateAlertsPayload {
  alert_ids: string[];
  status?: string;
  assigned_to?: string;
  resolution_type?: string;
  notes?: string;
}

export const alertsService = {
  getAlerts: (params: GetAlertsParams = {}) =>
    apiClient.get<AlertsResponse>('/api/alerts', params),

  createAlert: (payload: { title: string; description: string; severity: string; source: string; event_id?: string; mitre_ref?: string }) =>
    apiClient.post<{ id: string; status: string }>('/api/alerts', payload),

  updateAlert: (id: string, payload: UpdateAlertPayload) =>
    apiClient.patch<{ success: boolean }>(`/api/alerts/${id}`, payload),

  bulkUpdateAlerts: (payload: BulkUpdateAlertsPayload) =>
    apiClient.post<{ updated_count: number }>('/api/alerts/bulk', payload),

  getComments: (alertId: string) =>
    apiClient.get<{ data: AlertComment[] }>(`/api/alerts/${alertId}/comments`),

  addComment: (alertId: string, payload: { user: string; comment: string }) =>
    apiClient.post<{ status: string; id: string }>(`/api/alerts/${alertId}/comments`, payload),
};
