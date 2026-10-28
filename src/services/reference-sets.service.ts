/**
 * src/services/reference-sets.service.ts
 * Reference sets (watchlists) service.
 */

import { apiClient } from './api-client';
import { ReferenceSet, ReferenceSetItem } from '@/lib/types';

export const referenceSetsService = {
  getSets: () =>
    apiClient.get<{ data: ReferenceSet[] }>('/api/reference-sets'),

  createSet: (payload: { name: string; type: string; description?: string; ttl_days?: number }) =>
    apiClient.post<{ status: string; id: string }>('/api/reference-sets', payload),

  deleteSet: (id: string) =>
    apiClient.delete<{ status: string }>(`/api/reference-sets/${id}`),

  getItems: (setId: string) =>
    apiClient.get<{ data: ReferenceSetItem[] }>(`/api/reference-sets/${setId}/items`),

  addItem: (setId: string, payload: { value: string; added_by?: string }) =>
    apiClient.post<{ status: string; id: string }>(`/api/reference-sets/${setId}/items`, payload),

  addBulkItems: (setId: string, payload: { values: string[]; added_by?: string }) =>
    apiClient.post<{ status: string; count: number }>(`/api/reference-sets/${setId}/bulk-items`, payload),

  deleteItem: (setId: string, itemId: string) =>
    apiClient.delete<{ status: string }>(`/api/reference-sets/${setId}/items/${itemId}`),
};
