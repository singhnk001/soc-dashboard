'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity, ShieldAlert, Radio, Zap, Shield, AlertTriangle,
  RefreshCw, Settings2, GripVertical, Eye, EyeOff, Check, X,
} from 'lucide-react';
import StatsCard from '@/components/StatsCard';
import TimelineChart from '@/components/TimelineChart';
import SeverityChart from '@/components/SeverityChart';
import TopEventsChart from '@/components/TopEventsChart';
import TopSourcesChart from '@/components/TopSourcesChart';
import MitreActivityChart from '@/components/MitreActivityChart';
import AlertRateWidget from '@/components/AlertRateWidget';
import { formatDistanceToNow } from 'date-fns';

// ── Types ─────────────────────────────────────────────────────────────────────

interface StatsData {
  total_logs: number;
  critical_alerts: number;
  active_sources: number;
  eps: number;
  mitre_coverage: number;
  new_alerts: number;
  total_alerts: number;
  logs_by_hour: any[];
  severity_distribution: any[];
  top_sources: any[];
  top_event_ids: any[];
  detected_techniques: any[];
}

interface AlertRow {
  id: string;
  severity: string;
  title: string;
  source: string;
  status: string;
  timestamp: string;
}

// ── Widget registry ───────────────────────────────────────────────────────────

const ALL_WIDGETS = [
  { id: 'kpi',        label: 'KPI Cards',              defaultOn: true },
  { id: 'timeline',   label: 'Log Volume Timeline',    defaultOn: true },
  { id: 'severity',   label: 'Severity Breakdown',     defaultOn: true },
  { id: 'sources',    label: 'Top Sources',             defaultOn: true },
  { id: 'events',     label: 'Top Event IDs',          defaultOn: true },
  { id: 'mitre',      label: 'MITRE Activity',         defaultOn: true },
  { id: 'alert_rate', label: 'Alert Rate Sparkline',   defaultOn: true },
  { id: 'alerts',     label: 'Recent Alerts',          defaultOn: true },
] as const;

type WidgetId = typeof ALL_WIDGETS[number]['id'];

const STORAGE_KEY_WIDGETS  = 'soc_widget_order';
const STORAGE_KEY_INTERVAL = 'soc_refresh_interval';

const SEV_BADGE: Record<string, string> = {
  critical: 'bg-red-500 text-white',
  high:     'bg-orange-500 text-white',
  medium:   'bg-yellow-500 text-black',
  low:      'bg-green-500 text-white',
  info:     'bg-gray-500 text-white',
};

// ── Helper: read refresh interval (seconds) from localStorage ─────────────────
function getStoredInterval(): number {
  if (typeof window === 'undefined') return 30;
  const v = localStorage.getItem(STORAGE_KEY_INTERVAL);
  const n = v ? parseInt(v, 10) : 30;
  return isNaN(n) || n < 5 ? 30 : n;
}

// ── Helper: read widget config from localStorage ───────────────────────────────
function getStoredWidgets(): { id: WidgetId; visible: boolean }[] {
  if (typeof window === 'undefined')
    return ALL_WIDGETS.map(w => ({ id: w.id, visible: w.defaultOn }));
  try {
    const raw = localStorage.getItem(STORAGE_KEY_WIDGETS);
    if (raw) {
      const parsed: { id: WidgetId; visible: boolean }[] = JSON.parse(raw);
      // merge: add any new widget ids missing from stored config
      const stored = new Map(parsed.map(w => [w.id, w]));
      const all = ALL_WIDGETS.map(w => stored.get(w.id) ?? { id: w.id, visible: w.defaultOn });
      return all;
    }
  } catch {}
  return ALL_WIDGETS.map(w => ({ id: w.id, visible: w.defaultOn }));
}

// ── DashboardPage ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats, setStats]         = useState<StatsData | null>(null);
  const [alerts, setAlerts]       = useState<AlertRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // interval in seconds
  const [intervalSecs, setIntervalSecs] = useState<number>(30);

  // widget config
  const [widgets, setWidgets] = useState<{ id: WidgetId; visible: boolean }[]>([]);
  const [showCustomize, setShowCustomize] = useState(false);
  const [dragIdx, setDragIdx]   = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  // Interval picker state (inline on dashboard header)
  const [showIntervalPicker, setShowIntervalPicker] = useState(false);

  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const intervalRef  = useRef(intervalSecs);

  // ── Init from localStorage ──────────────────────────────────────────────────
  useEffect(() => {
    const secs = getStoredInterval();
    setIntervalSecs(secs);
    intervalRef.current = secs;
    setWidgets(getStoredWidgets());
  }, []);

  // ── Fetch data ──────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [s, a] = await Promise.all([
        fetch('/api/stats').then(r => r.json()),
        fetch('/api/alerts?limit=6').then(r => r.json()),
      ]);
      setStats(s);
      setAlerts(a?.data || []);
      setLastFetch(new Date());
    } catch (e) {
      // keep stale data, don't blank the UI
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  // ── Countdown ticker ────────────────────────────────────────────────────────
  const startCountdown = useCallback((secs: number) => {
    if (countRef.current) clearInterval(countRef.current);
    setCountdown(secs);
    countRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) return secs; // reset immediately (fetch fires separately)
        return prev - 1;
      });
    }, 1000);
  }, []);

  // ── Auto-refresh loop ───────────────────────────────────────────────────────
  const scheduleNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const secs = intervalRef.current;
    timerRef.current = setTimeout(async () => {
      await fetchData();
      scheduleNext();
    }, secs * 1000);
  }, [fetchData]);

  useEffect(() => {
    fetchData();
    scheduleNext();
    startCountdown(intervalRef.current);

    // Listen for settings page changes
    const onIntervalChange = () => {
      const secs = getStoredInterval();
      setIntervalSecs(secs);
      intervalRef.current = secs;
      if (timerRef.current) clearTimeout(timerRef.current);
      scheduleNext();
      startCountdown(secs);
    };
    window.addEventListener('refresh_interval_change', onIntervalChange);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (countRef.current) clearInterval(countRef.current);
      window.removeEventListener('refresh_interval_change', onIntervalChange);
    };
  }, [fetchData, scheduleNext, startCountdown]);

  // Sync countdown when intervalSecs changes
  useEffect(() => {
    intervalRef.current = intervalSecs;
  }, [intervalSecs]);

  // ── Manual refresh ──────────────────────────────────────────────────────────
  const handleManualRefresh = async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await fetchData();
    scheduleNext();
    startCountdown(intervalRef.current);
  };

  // ── Interval picker ──────────────────────────────────────────────────────────
  const setInterval_ = (secs: number) => {
    localStorage.setItem(STORAGE_KEY_INTERVAL, String(secs));
    setIntervalSecs(secs);
    intervalRef.current = secs;
    if (timerRef.current) clearTimeout(timerRef.current);
    scheduleNext();
    startCountdown(secs);
    setShowIntervalPicker(false);
  };

  // ── Widget customization ─────────────────────────────────────────────────────
  const toggleWidget = (id: WidgetId) => {
    setWidgets(prev => {
      const next = prev.map(w => w.id === id ? { ...w, visible: !w.visible } : w);
      localStorage.setItem(STORAGE_KEY_WIDGETS, JSON.stringify(next));
      return next;
    });
  };

  const onDragStart = (i: number) => setDragIdx(i);
  const onDragEnter = (i: number) => setDragOver(i);
  const onDragEnd   = () => {
    if (dragIdx !== null && dragOver !== null && dragIdx !== dragOver) {
      setWidgets(prev => {
        const next = [...prev];
        const [moved] = next.splice(dragIdx, 1);
        next.splice(dragOver, 0, moved);
        localStorage.setItem(STORAGE_KEY_WIDGETS, JSON.stringify(next));
        return next;
      });
    }
    setDragIdx(null);
    setDragOver(null);
  };

  const resetWidgets = () => {
    const def = ALL_WIDGETS.map(w => ({ id: w.id, visible: w.defaultOn }));
    setWidgets(def);
    localStorage.setItem(STORAGE_KEY_WIDGETS, JSON.stringify(def));
  };

  const isVisible = (id: WidgetId) => widgets.find(w => w.id === id)?.visible ?? true;

  // ── Interval label ───────────────────────────────────────────────────────────
  const intervalLabel = intervalSecs < 60 ? `${intervalSecs}s` : `${intervalSecs / 60}m`;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 bg-[var(--bg-secondary)] min-h-screen text-[var(--text-primary)]">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Security Operations Center</h1>

        <div className="flex items-center gap-2">
          {/* Last fetch */}
          {lastFetch && (
            <span className="text-xs text-[var(--text-secondary)] hidden sm:block">
              Updated {formatDistanceToNow(lastFetch)} ago
            </span>
          )}

          {/* Countdown badge */}
          <div className="relative">
            <button
              onClick={() => setShowIntervalPicker(p => !p)}
              className="flex items-center gap-1.5 text-xs bg-[var(--bg-card)] border border-[var(--border-color)] px-3 py-1.5 rounded-full hover:border-blue-500 transition-colors"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${refreshing ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'}`} />
              Refresh in {countdown}s · {intervalLabel}
            </button>

            {showIntervalPicker && (
              <div className="absolute right-0 top-9 z-50 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg shadow-xl p-3 w-44">
                <div className="text-xs text-[var(--text-secondary)] mb-2 font-medium uppercase tracking-wide">Auto-refresh</div>
                {[
                  { label: '10 seconds', v: 10 },
                  { label: '30 seconds', v: 30 },
                  { label: '1 minute',   v: 60 },
                  { label: '5 minutes',  v: 300 },
                  { label: 'Off',        v: 0 },
                ].map(opt => (
                  <button
                    key={opt.v}
                    onClick={() => setInterval_(opt.v === 0 ? 86400 : opt.v)}
                    className={`w-full text-left px-3 py-2 rounded text-sm hover:bg-[var(--bg-secondary)] transition-colors flex items-center justify-between ${intervalSecs === opt.v ? 'text-blue-400' : 'text-[var(--text-primary)]'}`}
                  >
                    {opt.label}
                    {intervalSecs === (opt.v === 0 ? 86400 : opt.v) && <Check size={14} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Manual refresh */}
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs bg-[var(--bg-card)] border border-[var(--border-color)] px-3 py-1.5 rounded-full hover:border-blue-500 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>

          {/* Customize layout */}
          <button
            onClick={() => setShowCustomize(p => !p)}
            className={`flex items-center gap-1.5 text-xs border px-3 py-1.5 rounded-full transition-colors ${
              showCustomize
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-[var(--bg-card)] border-[var(--border-color)] hover:border-blue-500'
            }`}
          >
            <Settings2 size={12} />
            Customize
          </button>
        </div>
      </div>

      {/* ── Widget Customizer Panel ─────────────────────────────────────────── */}
      {showCustomize && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold">Dashboard Layout</h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">Toggle widgets on/off · Drag to reorder</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={resetWidgets} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-2">
                Reset to default
              </button>
              <button onClick={() => setShowCustomize(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {widgets.map((w, i) => {
              const label = ALL_WIDGETS.find(a => a.id === w.id)?.label ?? w.id;
              return (
                <div
                  key={w.id}
                  draggable
                  onDragStart={() => onDragStart(i)}
                  onDragEnter={() => onDragEnter(i)}
                  onDragEnd={onDragEnd}
                  onDragOver={e => e.preventDefault()}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-grab select-none transition-all ${
                    dragOver === i ? 'border-blue-500 bg-blue-500/10' : 'border-[var(--border-color)] bg-[var(--bg-secondary)]'
                  } ${dragIdx === i ? 'opacity-40' : 'opacity-100'}`}
                >
                  <GripVertical size={14} className="text-[var(--text-secondary)]" />
                  <button
                    onClick={() => toggleWidget(w.id)}
                    className={`flex items-center gap-1.5 text-sm transition-colors ${w.visible ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] line-through'}`}
                  >
                    {w.visible
                      ? <Eye size={14} className="text-blue-400" />
                      : <EyeOff size={14} />
                    }
                    {label}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── KPI Row ─────────────────────────────────────────────────────────── */}
      {isVisible('kpi') && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="lg:col-span-1">
            <StatsCard
              title="Total Logs"
              value={loading ? '—' : (stats?.total_logs?.toLocaleString() || '0')}
              change={0} trend="up" color="blue" icon={Activity}
            />
          </div>
          <div className="lg:col-span-1">
            <StatsCard
              title="Critical Alerts"
              value={loading ? '—' : (stats?.critical_alerts || 0)}
              change={0} trend="down" color="red" icon={ShieldAlert}
            />
          </div>
          <div className="lg:col-span-1">
            <StatsCard
              title="Active Sources"
              value={loading ? '—' : (stats?.active_sources || 0)}
              change={0} trend="up" color="green" icon={Radio}
            />
          </div>
          <div className="lg:col-span-1">
            <StatsCard
              title="Current EPS"
              value={loading ? '—' : `${stats?.eps || 0}`}
              change={0} trend="up" color="yellow" icon={Zap}
            />
          </div>
          <div className="lg:col-span-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4 flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-2">
              <Shield size={16} className="text-purple-400" />
              <span className="text-xs text-[var(--text-secondary)] uppercase font-medium">MITRE Coverage</span>
            </div>
            <div className="text-2xl font-bold text-purple-400">
              {loading ? '—' : `${stats?.mitre_coverage || 0}%`}
            </div>
            <div className="mt-2 w-full bg-[var(--bg-secondary)] rounded-full h-1.5">
              <div
                className="bg-purple-400 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(stats?.mitre_coverage || 0, 100)}%` }}
              />
            </div>
          </div>
          <div className="lg:col-span-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4 flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={16} className="text-orange-400" />
              <span className="text-xs text-[var(--text-secondary)] uppercase font-medium">Open Alerts</span>
            </div>
            <div className="text-2xl font-bold text-orange-400">
              {loading ? '—' : (stats?.new_alerts?.toLocaleString() || 0)}
            </div>
            <div className="text-xs text-[var(--text-secondary)] mt-1">
              of {loading ? '—' : stats?.total_alerts?.toLocaleString() || 0} total
            </div>
          </div>
        </div>
      )}

      {/* ── Log Volume Timeline ──────────────────────────────────────────────── */}
      {isVisible('timeline') && (
        <TimelineChart data={stats?.logs_by_hour || []} />
      )}

      {/* ── Severity + Top Sources ───────────────────────────────────────────── */}
      {(isVisible('severity') || isVisible('sources')) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {isVisible('severity') && <SeverityChart data={stats?.severity_distribution || []} />}
          {isVisible('sources')  && <TopSourcesChart data={stats?.top_sources || []} />}
        </div>
      )}

      {/* ── Top Events + MITRE Activity ──────────────────────────────────────── */}
      {(isVisible('events') || isVisible('mitre')) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {isVisible('events') && <TopEventsChart data={stats?.top_event_ids || []} />}
          {isVisible('mitre')  && <MitreActivityChart data={stats?.detected_techniques || []} />}
        </div>
      )}

      {/* ── Alert Rate Sparkline ─────────────────────────────────────────────── */}
      {isVisible('alert_rate') && <AlertRateWidget />}

      {/* ── Recent Alerts ────────────────────────────────────────────────────── */}
      {isVisible('alerts') && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Recent Alerts</h2>
            <a href="/alerts" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
              View All →
            </a>
          </div>
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg overflow-hidden">
            {loading ? (
              <div className="py-8 text-center text-[var(--text-secondary)] text-sm">Loading alerts…</div>
            ) : alerts.length === 0 ? (
              <div className="py-8 text-center text-[var(--text-secondary)] text-sm">No recent alerts.</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[var(--text-secondary)] uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 font-medium">Severity</th>
                    <th className="px-4 py-3 font-medium">Incident Title</th>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]">
                  {alerts.map((alert) => (
                    <tr key={alert.id} className="hover:bg-[var(--bg-hover)]/30 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase ${SEV_BADGE[alert.severity] || SEV_BADGE.info}`}>
                          {alert.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium max-w-xs truncate">{alert.title}</td>
                      <td className="px-4 py-3">
                        <span className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] px-2 py-1 rounded text-xs font-mono">
                          {alert.source || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium capitalize ${
                          alert.status === 'new'           ? 'text-red-400' :
                          alert.status === 'investigating' ? 'text-yellow-400' : 'text-green-400'
                        }`}>
                          {alert.status === 'new' && (
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                            </span>
                          )}
                          {alert.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)] text-xs whitespace-nowrap">
                        {(() => {
                          try { return formatDistanceToNow(new Date(alert.timestamp)) + ' ago'; }
                          catch { return alert.timestamp || '—'; }
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* click-outside to close interval picker */}
      {showIntervalPicker && (
        <div className="fixed inset-0 z-40" onClick={() => setShowIntervalPicker(false)} />
      )}
    </div>
  );
}
