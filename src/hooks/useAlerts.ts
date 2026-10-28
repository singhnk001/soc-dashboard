'use client';

import { useState, useEffect, useCallback } from 'react';
import { alertsService, GetAlertsParams, UpdateAlertPayload } from '@/services/alerts.service';
import { Alert } from '@/lib/types';

export function useAlerts(initialParams: GetAlertsParams = {}) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<GetAlertsParams>(initialParams);

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await alertsService.getAlerts(params);
      setAlerts(res.data);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch alerts');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const updateAlert = async (id: string, payload: UpdateAlertPayload) => {
    await alertsService.updateAlert(id, payload);
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...payload } as Alert : a))
    );
  };

  return { alerts, total, loading, error, params, setParams, refetch: fetchAlerts, updateAlert };
}
