"use client";

import React, { useState } from 'react';
import useSWR from 'swr';
import { systemService, sourcesService } from '@/services';
import { DEMO_SERVICES, DEMO_SYSTEM_HEALTH, DEMO_AGENTS } from '@/lib/demo-data';
import {
  Activity, Play, Square, RotateCw, Server, AlertCircle, Loader2,
  Cpu, HardDrive, Clock, Radio, Wifi, WifiOff, RefreshCw, Monitor,
  Shield, AlertTriangle, ChevronDown, ChevronUp
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const fetcher = (url: string) =>
  fetch(url).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }).catch(err => { console.error('fetch', url, err); return null; });

/* ── helpers ─────────────────────────────────────────────────── */
function SyncBadge({ status }: { status: string }) {
  if (status === 'live')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/30"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />Live</span>;
  if (status === 'recent')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />Recent</span>;
  if (status === 'stale')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/30"><span className="w-1.5 h-1.5 rounded-full bg-red-400" />Stale</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/15 text-gray-400 border border-gray-500/30">Unknown</span>;
}

const CRITICALITY_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  low:      { label: 'Low',      bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/30'   },
  medium:   { label: 'Medium',   bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  high:     { label: 'High',     bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
  critical: { label: 'Critical', bg: 'bg-red-500/10',    text: 'text-red-400',    border: 'border-red-500/30'    },
};

function CriticalitySelector({ hostname, value, onSave }: { hostname: string; value: string; onSave: (h: string, v: string) => void }) {
  const cfg = CRITICALITY_CONFIG[value] || CRITICALITY_CONFIG.low;
  return (
    <select
      value={value}
      onChange={e => onSave(hostname, e.target.value)}
      className={`text-xs px-2 py-1 rounded border font-medium cursor-pointer ${cfg.bg} ${cfg.text} ${cfg.border} bg-transparent focus:outline-none`}
    >
      <option value="low">Low</option>
      <option value="medium">Medium</option>
      <option value="high">High</option>
      <option value="critical">Critical</option>
    </select>
  );
}

function ServiceStatusBadge({ status }: { status: string }) {
  const isRunning = status === 'running';
  const isNotInstalled = status === 'not_installed';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
      isRunning        ? 'bg-green-500/10 text-green-400 border-green-500/30' :
      isNotInstalled   ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' :
                         'bg-gray-500/10 text-gray-400 border-gray-500/30'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-green-400 animate-pulse' : isNotInstalled ? 'bg-orange-400' : 'bg-gray-400'}`} />
      {isNotInstalled ? 'Not Installed' : status}
    </span>
  );
}

export default function TroubleshootingPage() {
  const { data: svcData, mutate: mutateSvc, isLoading: svcLoading } = useSWR(
    '/api/system/services', fetcher, { refreshInterval: 3000, fallbackData: { data: DEMO_SERVICES } }
  );
  const { data: healthData } = useSWR('/api/system/health', fetcher, { refreshInterval: 3000, fallbackData: DEMO_SYSTEM_HEALTH });
  const { data: agentsData, mutate: mutateAgents } = useSWR(
    '/api/system/vector/agents', fetcher, { refreshInterval: 10000, fallbackData: { data: DEMO_AGENTS } }
  );

  const services: any[] = svcData?.data || [];
  const agents: any[] = agentsData?.data || [];
  const health = healthData || null;
  const [actingService, setActingService] = useState<string | null>(null);
  const [agentsExpanded, setAgentsExpanded] = useState(false);
  const COLLAPSED_ROWS = 5;

  const totalServiceMemory = services.reduce((a: number, s: any) => a + (s.memory_mb || 0), 0);
  const vectorService = services.find((s: any) => s.id === 'vector-agent');

  const visibleAgents = agentsExpanded ? agents : agents.slice(0, COLLAPSED_ROWS);

  const setCriticality = async (hostname: string, criticality: string) => {
    await fetch(`/api/system/vector/agents/${encodeURIComponent(hostname)}/criticality`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ criticality }),
    });
    mutateAgents();
  };

  const handleAction = async (serviceId: string, action: 'start' | 'stop' | 'restart') => {
    if (!confirm(`${action === 'stop' ? '⚠️ Stop' : '▶ Start'} ${serviceId === 'vector-agent' ? 'VectorAgent Windows Service' : serviceId}?`)) return;
    setActingService(serviceId);
    try {
      await systemService.serviceAction(serviceId, action);
      setTimeout(() => { mutateSvc(); mutateAgents(); }, 1500);
    } catch {
      alert(`Failed to ${action} ${serviceId}`);
    } finally {
      setTimeout(() => setActingService(null), 1500);
    }
  };

  return (
    <div className="p-6 bg-[var(--bg-secondary)] min-h-full text-[var(--text-primary)]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="text-indigo-400" /> System &amp; Services
        </h1>
        <p className="text-[var(--text-secondary)] text-sm mt-1">
          Monitor and control core services, the Vector log agent, and connected hosts.
        </p>
      </div>

      {/* System metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-[var(--bg-card)] p-4 rounded-xl border border-[var(--border-color)]">
          <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-2">
            <Cpu size={15} /><span className="text-xs font-medium uppercase tracking-wide">CPU</span>
          </div>
          <div className="text-2xl font-semibold">{health?.cpu_percent != null ? `${health.cpu_percent}%` : '--'}</div>
        </div>
        <div className="bg-[var(--bg-card)] p-4 rounded-xl border border-[var(--border-color)]">
          <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-2">
            <HardDrive size={15} /><span className="text-xs font-medium uppercase tracking-wide">RAM</span>
          </div>
          <div className="text-2xl font-semibold">{health?.ram?.percent != null ? `${health.ram.percent}%` : '--'}</div>
          <div className="text-xs text-[var(--text-secondary)] mt-1">
            {health?.ram ? `${health.ram.used_gb} / ${health.ram.total_gb} GB` : ''}
            <span className="text-blue-400 ml-2">SOC: {totalServiceMemory.toFixed(0)} MB</span>
          </div>
        </div>
        <div className="bg-[var(--bg-card)] p-4 rounded-xl border border-[var(--border-color)]">
          <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-2">
            <Clock size={15} /><span className="text-xs font-medium uppercase tracking-wide">Uptime</span>
          </div>
          <div className="text-2xl font-semibold">
            {health?.boot_time
              ? formatDistanceToNow(new Date(health.boot_time * 1000)).replace('about ', '')
              : '--'}
          </div>
        </div>
      </div>

      {/* ── Core Services table ───────────────────────────────────── */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/40 flex items-center gap-2 font-semibold text-sm">
          <Server size={16} className="text-indigo-400" /> Core Services
        </div>
        {svcLoading ? (
          <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-500" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
                <tr>
                  <th className="px-5 py-3 font-medium whitespace-nowrap">Service</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">PID</th>
                  <th className="px-5 py-3 font-medium">Uptime</th>
                  <th className="px-5 py-3 font-medium">Memory</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {services.map((s: any) => (
                  <tr key={s.id} className="hover:bg-[var(--bg-hover)]/30">
                    <td className="px-5 py-3.5 font-medium">
                      <div className="flex items-center gap-2">
                        {s.id === 'vector-agent'
                          ? <Radio size={14} className="text-purple-400 shrink-0" />
                          : <Server size={14} className="text-indigo-400 shrink-0" />}
                        <span>{s.name}</span>
                      </div>
                      {s.description && (
                        <div className="text-xs text-[var(--text-secondary)] mt-0.5 pl-5">{s.description}</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-[var(--text-secondary)] capitalize text-xs">{s.type}</td>
                    <td className="px-5 py-3.5"><ServiceStatusBadge status={s.status} /></td>
                    <td className="px-5 py-3.5 font-mono text-xs text-[var(--text-secondary)]">{s.pid || '—'}</td>
                    <td className="px-5 py-3.5 text-xs text-[var(--text-secondary)]">
                      {s.started_at
                        ? formatDistanceToNow(new Date(s.started_at * 1000), { addSuffix: true })
                        : '—'}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-[var(--text-secondary)]">
                      {s.memory_mb ? `${s.memory_mb} MB` : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-2">
                        {actingService === s.id ? (
                          <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] px-3 py-1.5">
                            <Loader2 size={13} className="animate-spin" /> Processing…
                          </span>
                        ) : s.status === 'not_installed' ? (
                          <span className="text-xs text-orange-400 px-3 py-1.5">Not installed</span>
                        ) : s.status === 'stopped' ? (
                          <button onClick={() => handleAction(s.id, 'start')}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/30 rounded text-xs font-medium transition-colors">
                            <Play size={13} /> Start
                          </button>
                        ) : (
                          <>
                            <button onClick={() => handleAction(s.id, 'restart')}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded text-xs font-medium transition-colors">
                              <RotateCw size={13} /> Restart
                            </button>
                            <button onClick={() => handleAction(s.id, 'stop')}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded text-xs font-medium transition-colors">
                              <Square size={13} fill="currentColor" /> Stop
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Vector Agent — Connected Hosts ────────────────────────── */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/40 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Radio size={16} className="text-purple-400" />
            Vector Agent — Connected Hosts
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-purple-500/15 text-purple-400 border border-purple-500/30">
              {agents.length} host{agents.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {vectorService && (
              <div className="flex items-center gap-2 text-xs">
                {vectorService.status === 'running'
                  ? <><Wifi size={13} className="text-green-400" /><span className="text-green-400">Service running</span></>
                  : <><WifiOff size={13} className="text-red-400" /><span className="text-red-400">Service {vectorService.status}</span></>
                }
              </div>
            )}
            <button onClick={() => mutateAgents()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] rounded text-xs transition-colors">
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
        </div>

        {agents.length === 0 ? (
          <div className="p-10 text-center">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto mb-3">
              <Radio size={22} className="text-purple-400" />
            </div>
            <p className="text-[var(--text-secondary)] text-sm">No hosts have sent logs yet.</p>
            <p className="text-[var(--text-secondary)] text-xs mt-1">
              Start the VectorAgent service above, or deploy the agent to another Windows host.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
                  <tr>
                    <th className="px-5 py-3 font-medium whitespace-nowrap">Hostname</th>
                    <th className="px-5 py-3 font-medium">Sync Status</th>
                    <th className="px-5 py-3 font-medium">Last Log</th>
                    <th className="px-5 py-3 font-medium">First Seen</th>
                    <th className="px-5 py-3 font-medium">Total Logs</th>
                    <th className="px-5 py-3 font-medium">Criticality</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]">
                  {visibleAgents.map((agent: any) => (
                    <tr key={agent.hostname} className="hover:bg-[var(--bg-hover)]/30">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <Monitor size={14} className="text-indigo-400 shrink-0" />
                          <span className="font-medium font-mono text-sm">{agent.hostname}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <SyncBadge status={agent.sync_status} />
                      </td>
                      <td className="px-5 py-3.5 text-xs text-[var(--text-secondary)]">
                        {(() => {
                          const d = agent.last_seen ? new Date(agent.last_seen) : null;
                          if (!d || isNaN(d.getTime())) return '—';
                          return (
                            <span title={d.toLocaleString()} className="cursor-default">
                              {formatDistanceToNow(d, { addSuffix: true })}
                              <span className="block text-[10px] opacity-60">
                                {d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-[var(--text-secondary)]">
                        {(() => {
                          const d = agent.first_seen ? new Date(agent.first_seen) : null;
                          if (!d || isNaN(d.getTime())) return '—';
                          return (
                            <span title={d.toLocaleString()} className="cursor-default">
                              {d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
                              <span className="block text-[10px] text-[var(--text-secondary)] opacity-70">
                                {d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-sm font-medium">
                          {agent.log_count?.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <CriticalitySelector
                          hostname={agent.hostname}
                          value={agent.criticality || 'low'}
                          onSave={setCriticality}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Expand / Collapse button */}
            {agents.length > COLLAPSED_ROWS && (
              <div className="border-t border-[var(--border-color)]">
                <button
                  onClick={() => setAgentsExpanded(p => !p)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]/30 transition-colors"
                >
                  {agentsExpanded ? (
                    <><ChevronUp size={14} /> Show fewer hosts</>
                  ) : (
                    <><ChevronDown size={14} /> Show all {agents.length} hosts ({agents.length - COLLAPSED_ROWS} more)</>
                  )}
                </button>
              </div>
            )}
          </>
        )}

        {/* Sync status legend */}
        <div className="px-5 py-2.5 border-t border-[var(--border-color)] bg-[var(--bg-secondary)]/20 flex items-center gap-4 text-xs text-[var(--text-secondary)]">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400" />Live = log within 5 min</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400" />Recent = within 30 min</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400" />Stale = over 30 min ago</span>
          <span className="ml-auto text-[var(--text-secondary)]/60">Criticality = user-assigned device importance</span>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-3">
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 flex gap-3 text-sm text-blue-400">
          <AlertCircle className="shrink-0 mt-0.5" size={16} />
          <div>
            <strong>Core API Server:</strong> Restarting it briefly disconnects the dashboard UI until the backend recovers. The API will auto-restart via the detached process.
          </div>
        </div>
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4 flex gap-3 text-sm text-purple-300">
          <Shield className="shrink-0 mt-0.5" size={16} />
          <div>
            <strong>Vector Log Agent:</strong> Runs as a Windows Service (<code className="font-mono text-xs">VectorAgent</code>). Start/Stop here controls that service directly via <code className="font-mono text-xs">sc.exe</code>. The service auto-starts on every reboot. Stopping it pauses log collection from this host — connected hosts in the table above will turn <span className="text-red-400">Stale</span>.
          </div>
        </div>
      </div>
    </div>
  );
}
