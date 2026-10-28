'use client';

import { useState, useEffect, useCallback } from 'react';
import { systemService } from '@/services/system.service';
import { DashboardStats } from '@/lib/types';

export function useDashboardStats(pollIntervalSecs: number = 30) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setError(null);
      const data = await systemService.getStats();
      setStats(data);
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    if (pollIntervalSecs <= 0) return;
    const interval = setInterval(fetchStats, pollIntervalSecs * 1000);
    return () => clearInterval(interval);
  }, [fetchStats, pollIntervalSecs]);

  return { stats, loading, error, lastUpdated, refetch: fetchStats };
}
