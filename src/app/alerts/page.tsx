"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import useSWR, { mutate } from 'swr';
import { safeDistanceToNow } from '@/lib/date-utils';
import { alertsService } from '@/services/alerts.service';
import { authService, UserAccount } from '@/services/auth.service';
import { Alert, AlertComment } from '@/lib/types';
import {
  Shield, ShieldAlert, AlertTriangle, AlertCircle, Info, Check,
  CheckCircle2, Clock, List, Loader2, ThumbsUp, ThumbsDown, Save,
  ChevronDown, ChevronRight, Download, User, Users, UserCheck,
  ArrowRight, Network, Globe, Tag, FileText, ShieldCheck, Copy,
  Plus, X, Search, RefreshCw, Filter, ExternalLink, ArrowUpDown,
  Sparkles, Layers, CornerDownRight, CheckSquare, Square
} from 'lucide-react';

/* ─── Severity Badges & Colors ──────────────────────────────── */
const SEV_BADGE: Record<string, string> = {
  critical: 'text-red-400    bg-red-500/15    border-red-500/40',
  high:     'text-orange-300 bg-orange-500/20 border-orange-500/40',
  medium:   'text-yellow-300 bg-yellow-500/20 border-yellow-500/40',
  low:      'text-blue-400   bg-blue-500/10   border-blue-500/30',
  info:     'text-gray-400   bg-gray-500/10   border-gray-500/30',
};

const SEV_ICON: Record<string, React.ReactNode> = {
  critical: <ShieldAlert size={12} className="text-red-400" />,
  high:     <AlertTriangle size={12} className="text-orange-400" />,
  medium:   <AlertCircle size={12} className="text-yellow-400" />,
  low:      <Info size={12} className="text-blue-400" />,
  info:     <Info size={12} className="text-gray-400" />,
};

const STATUS_BADGE: Record<string, { label: string; class: string; icon: React.ReactNode }> = {
  new: {
    label: 'New',
    class: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
    icon: (
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
      </span>
    ),
  },
  investigating: {
    label: 'Investigating',
    class: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
    icon: <Clock size={11} className="text-amber-400 animate-spin-slow" />,
  },
  resolved: {
    label: 'Resolved',
    class: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
    icon: <CheckCircle2 size={11} className="text-emerald-400" />,
  },
  false_positive: {
    label: 'False Positive',
    class: 'text-slate-400 bg-slate-800/40 border-slate-700/50',
    icon: <ThumbsDown size={11} className="text-slate-400" />,
  },
};

const ACTION_BADGE: Record<string, string> = {
  accept:    'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
  permitted: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
  allow:     'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
  deny:      'text-rose-300    bg-rose-500/15    border-rose-500/30',
  blocked:   'text-rose-300    bg-rose-500/15    border-rose-500/30',
  drop:      'text-purple-300  bg-purple-500/15  border-purple-500/30',
  dropped:   'text-purple-300  bg-purple-500/15  border-purple-500/30',
  close:     'text-slate-300   bg-slate-700/30   border-slate-600/40',
};

/* ─── Threat Intelligence Correlation Dictionary ────────────── */
const KNOWN_THREAT_CORRELATION: Record<string, { sigId: string; attackId?: string; feed: string; confidence: number; name: string }> = {
  '194.26.29.112':  { sigId: 'FG-IPS-39812', attackId: '39812', feed: 'ThreatFox (abuse.ch)', confidence: 98, name: 'Emotet Botnet Dropper' },
  '185.220.101.5':  { sigId: 'FG-IPS-41025', attackId: '41025', feed: 'ThreatFox (abuse.ch)', confidence: 100, name: 'Cobalt Strike C2 Beacon' },
  '45.154.255.88':  { sigId: 'FG-IPS-52140', attackId: '52140', feed: 'AbuseIPDB Threat Intelligence', confidence: 95, name: 'QakBot Loader Infrastructure' },
  '109.236.87.14':  { sigId: 'FG-IPS-47910', attackId: '47910', feed: 'AlienVault OTX Community Feed', confidence: 99, name: 'LockBit Ransomware Exfiltration Host' },
  '91.240.118.230': { sigId: 'FG-IPS-31045', attackId: '31045', feed: 'AlienVault OTX Community Feed', confidence: 96, name: 'AsyncRAT Reverse Shell Listener' },
  '185.130.5.231':  { sigId: 'FG-IPS-22891', attackId: '22891', feed: 'AbuseIPDB Blacklist', confidence: 90, name: 'Mirai Scanner / Brute-force' },
};

function correlateThreatMetadata(attackName?: string | null, dstIp?: string | null, eventId?: string | number | null, srcIp?: string | null): { sigId?: string; attackId?: string; feed?: string; confidence?: number; name?: string } {
  if (dstIp && KNOWN_THREAT_CORRELATION[dstIp]) return KNOWN_THREAT_CORRELATION[dstIp];
  if (srcIp && KNOWN_THREAT_CORRELATION[srcIp]) return KNOWN_THREAT_CORRELATION[srcIp];

  const text = `${attackName || ''} ${eventId || ''}`.toLowerCase();
  if (text.includes('emotet')) return { sigId: 'FG-IPS-39812', attackId: '39812', feed: 'ThreatFox (abuse.ch)', confidence: 98, name: 'Emotet Botnet Dropper' };
  if (text.includes('cobalt') || text.includes('strike')) return { sigId: 'FG-IPS-41025', attackId: '41025', feed: 'ThreatFox (abuse.ch)', confidence: 100, name: 'Cobalt Strike C2 Beacon' };
  if (text.includes('qakbot') || text.includes('qbot')) return { sigId: 'FG-IPS-52140', attackId: '52140', feed: 'AbuseIPDB Threat Intelligence', confidence: 95, name: 'QakBot Loader Infrastructure' };
  if (text.includes('lockbit')) return { sigId: 'FG-IPS-47910', attackId: '47910', feed: 'AlienVault OTX Community Feed', confidence: 99, name: 'LockBit Ransomware Exfiltration Host' };
  if (text.includes('asyncrat')) return { sigId: 'FG-IPS-31045', attackId: '31045', feed: 'AlienVault OTX Community Feed', confidence: 96, name: 'AsyncRAT Reverse Shell Listener' };
  if (text.includes('mirai')) return { sigId: 'FG-IPS-22891', attackId: '22891', feed: 'AbuseIPDB Blacklist', confidence: 90, name: 'Mirai Scanner / Brute-force' };
  if (text.includes('log4j') || text.includes('cve-2021-44228')) return { sigId: 'FG-IPS-41051', attackId: '41051', feed: 'CISA KEV (CVE-2021-44228)', confidence: 100, name: 'FortiGuard: Apache.Log4j.JNDI.Remote.Code.Execution' };
  if (text.includes('eternalblue') || text.includes('smbv1')) return { sigId: 'FG-IPS-38012', attackId: '38012', feed: 'FortiGuard Core IPS', confidence: 100, name: 'FortiGuard: MS.Windows.SMBv1.Remote.Code.Execution.EternalBlue' };
  if (text.includes('heartbleed') || text.includes('cve-2014-0160')) return { sigId: 'FG-IPS-29104', attackId: '29104', feed: 'FortiGuard Core IPS (CVE-2014-0160)', confidence: 99, name: 'FortiGuard: OpenSSL.Heartbleed.Information.Disclosure' };
  if (text.includes('cve-2023-27997') || text.includes('ssl-vpn.heap')) return { sigId: 'FG-IPS-52997', attackId: '52997', feed: 'CISA KEV / Fortinet PSIRT', confidence: 100, name: 'FortiGuard: Fortinet.FortiOS.SSL-VPN.Heap.Buffer.Overflow.CVE-2023-27997' };
  if (text.includes('ssh.brute') || text.includes('brute.force')) return { sigId: 'FG-IPS-18230', attackId: '18230', feed: 'AbuseIPDB Threat Intelligence', confidence: 92, name: 'FortiGuard: SSH.Brute.Force.Login.Attempt' };
  if (text.includes('powershell')) return { sigId: 'FG-IPS-33401', attackId: '33401', feed: 'FortiGuard Behavioral Engine', confidence: 94, name: 'FortiGuard: Suspicious.PowerShell.Outbound.Connection' };

  const eventIdStr = eventId != null ? String(eventId) : '';
  if (eventIdStr.startsWith('FG-IPS-')) {
    return { sigId: eventIdStr, feed: 'FortiGuard Threat Intelligence / ThreatFox', confidence: 95 };
  }
  return {};
}

interface ParsedAlertPayload {
  cleanLine: string;
  kvPairs: [string, string][];
  srcIp?: string;
  dstIp?: string;
  srcPort?: string;
  dstPort?: string;
  protocol?: string;
  service?: string;
  app?: string;
  action?: string;
  hostname?: string;
  user?: string;
  bytesSent?: string;
  bytesRcvd?: string;
  policyId?: string;
  sessionId?: string;
  attack?: string;
  sigId?: string;
  attackId?: string;
  threatFeed?: string;
  threatConfidence?: string | number;
  rawJsonObj?: any;
}

function parseAlertLog(rawLog?: string | null, extractedFields?: string | null, alertContext?: Partial<Alert>): ParsedAlertPayload {
  let cleanLine = '';
  const kvMap: Record<string, string> = {};
  let rawJsonObj: any = null;

  // 1. Try extracted_fields
  if (extractedFields) {
    try {
      const parsed = JSON.parse(extractedFields);
      if (parsed && typeof parsed === 'object') {
        Object.assign(kvMap, parsed);
      }
    } catch {}
  }

  // 2. Try raw_log
  if (rawLog) {
    cleanLine = rawLog;
    if (typeof rawLog === 'string' && rawLog.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(rawLog);
        rawJsonObj = parsed;
        if (parsed.original_line) {
          cleanLine = parsed.original_line;
        }
        if (parsed.extracted_fields && typeof parsed.extracted_fields === 'object') {
          Object.assign(kvMap, parsed.extracted_fields);
        }
      } catch {}
    }
  }

  // 3. Regex parse key=value
  const kvRegex = /([a-zA-Z0-9_\-\.]+)=(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;
  let match;
  while ((match = kvRegex.exec(cleanLine)) !== null) {
    const k = match[1];
    const v = match[2] ?? match[3] ?? match[4] ?? '';
    if (!kvMap[k]) {
      kvMap[k] = v;
    }
  }

  const kvPairs = Object.entries(kvMap).sort(([a], [b]) => a.localeCompare(b));

  const srcIp = kvMap.srcip || kvMap.src_ip || kvMap.source_ip;
  const dstIp = kvMap.dstip || kvMap.dst_ip || kvMap.destination_ip || kvMap.dest_ip;
  const srcPort = kvMap.srcport || kvMap.src_port || kvMap.spt;
  const dstPort = kvMap.dstport || kvMap.dst_port || kvMap.dpt;
  const proto = kvMap.proto === '6' ? 'TCP (6)' : kvMap.proto === '17' ? 'UDP (17)' : kvMap.proto || kvMap.protocol;
  const service = kvMap.service || kvMap.app || kvMap.action;
  const app = kvMap.app;
  const action = kvMap.action || kvMap.status || kvMap.act;
  const hostname = kvMap.devname || kvMap.hostname || kvMap.host;
  const user = kvMap.user || kvMap.username || kvMap.usr;

  let attack = kvMap.attack || kvMap.signature || kvMap.threat || kvMap.threat_name;
  let sigId = kvMap.sig_id || kvMap.sigid || kvMap.signature_id || kvMap.attackid || kvMap.attack_id || kvMap.sid || kvMap.rule_id;
  let attackId = kvMap.attackid || kvMap.attack_id;
  let threatFeed = kvMap.threat_feed || kvMap.feed || kvMap.feed_name || kvMap.ti_feed || kvMap.threat_source;
  let threatConfidence: string | number | undefined = kvMap.threat_confidence || kvMap.confidence || kvMap.threat_score;

  // Correlate with threat intelligence catalog
  const correlation = correlateThreatMetadata(attack || alertContext?.title, dstIp, alertContext?.eventId, srcIp);
  if (!sigId && correlation.sigId) sigId = correlation.sigId;
  if (!attackId && correlation.attackId) attackId = correlation.attackId;
  if (!threatFeed && correlation.feed) threatFeed = correlation.feed;
  if (!threatConfidence && correlation.confidence) threatConfidence = correlation.confidence;
  if (!attack && correlation.name) attack = correlation.name;

  return {
    cleanLine: cleanLine || (alertContext?.description ?? ''),
    kvPairs,
    srcIp,
    dstIp,
    srcPort,
    dstPort,
    protocol: proto,
    service,
    app,
    action,
    hostname,
    user,
    bytesSent: kvMap.sentbyte || kvMap.bytes_out,
    bytesRcvd: kvMap.rcvdbyte || kvMap.bytes_in,
    policyId: kvMap.policyid || kvMap.policy_id,
    sessionId: kvMap.sessionid || kvMap.session_id,
    attack,
    sigId,
    attackId,
    threatFeed,
    threatConfidence,
    rawJsonObj: rawJsonObj || { message: cleanLine },
  };
}

/* ─── Investigation Timeline & Notes Sub-Component ───────────── */
function AlertInvestigationNotes({ alertId, onNoteAdded }: { alertId: string; onNoteAdded?: () => void }) {
  const { data, mutate: mutateComments } = useSWR(
    `/api/alerts/${alertId}/comments`,
    () => alertsService.getComments(alertId),
    { refreshInterval: 5000 }
  );
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const comments = data?.data || [];

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      const activeUser = sessionStorage.getItem('soc_user') || 'Administrator';
      await alertsService.addComment(alertId, {
        user: activeUser,
        comment: comment.trim(),
      });
      setComment('');
      mutateComments();
      if (onNoteAdded) onNoteAdded();
    } catch (err) {
      console.error('Failed to post comment', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
        <div className="flex items-center gap-1.5">
          <Clock size={13} className="text-blue-400" />
          <span>Investigation Activity & Analyst Notes</span>
        </div>
        <span className="text-slate-400 font-mono text-[11px]">{comments.length} entries</span>
      </div>

      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
        {comments.length === 0 ? (
          <div className="text-xs text-slate-400 italic p-4 text-center bg-[#090e18] rounded-lg border border-slate-800">
            No investigation notes added yet. Record your initial assessment below.
          </div>
        ) : (
          comments.map((c: AlertComment) => (
            <div key={c.id} className="bg-[#0b101d] p-3 rounded-lg border border-slate-800/80 shadow-sm space-y-1.5">
              <div className="flex justify-between items-center text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center font-bold text-[10px] border border-blue-500/30">
                    {c.user.charAt(0).toUpperCase()}
                  </span>
                  <span className="font-semibold text-blue-300">{c.user}</span>
                  {c.user === 'System' && (
                    <span className="px-1.5 py-0.2 bg-slate-800 text-slate-400 rounded text-[9px] uppercase tracking-wider">Audit</span>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {safeDistanceToNow(c.created_at)}
                </span>
              </div>
              <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed pl-6.5 font-sans">
                {c.comment}
              </p>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handlePost} className="flex gap-2 pt-2 border-t border-slate-800">
        <input
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Log investigation action, triage verdict, or remediation steps..."
          className="flex-1 bg-[#090e18] border border-slate-700/80 rounded-lg px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
        />
        <button
          type="submit"
          disabled={submitting || !comment.trim()}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
        >
          {submitting ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          <span>Post Note</span>
        </button>
      </form>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
/* ─── MAIN ALERTS PAGE ─────────────────────────────────────────── */
/* ════════════════════════════════════════════════════════════════ */
export default function AlertsPage() {
  const [refreshInterval, setRefreshInterval] = useState(5000);
  useEffect(() => {
    const updateInterval = () => {
      const val = localStorage.getItem('soc_refresh_interval');
      if (val) setRefreshInterval(parseInt(val) * 1000);
    };
    updateInterval();
    window.addEventListener('refresh_interval_change', updateInterval);
    return () => window.removeEventListener('refresh_interval_change', updateInterval);
  }, []);

  // Filter States
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'investigating' | 'resolved' | 'false_positive'>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [resolutionFilter, setResolutionFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selection & Bulk Actions
  const [selectedAlertIds, setSelectedAlertIds] = useState<string[]>([]);
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  // Slide-over & Investigation Drawer
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [drawerTab, setDrawerTab] = useState<'overview' | 'flow' | 'tags' | 'raw' | 'notes'>('overview');
  const [attrSearch, setAttrSearch] = useState('');
  const [rawCopied, setRawCopied] = useState(false);
  const [sigCopied, setSigCopied] = useState(false);
  const [srcIpCopied, setSrcIpCopied] = useState(false);
  const [dstIpCopied, setDstIpCopied] = useState(false);

  // Close / Resolve Modal State
  const [resolvingAlert, setResolvingAlert] = useState<Alert | null>(null);
  const [resolveType, setResolveType] = useState<'true_positive' | 'false_positive'>('true_positive');
  const [resolveNotes, setResolveNotes] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  // Active Current User
  const currentUser = typeof window !== 'undefined'
    ? sessionStorage.getItem('soc_real_name') || sessionStorage.getItem('soc_user') || 'Administrator'
    : 'Administrator';

  // 1. Fetch Dynamic Analysts & Users from SIEM Database
  const { data: usersData } = useSWR('/api/users', () => authService.getUsers());
  const activeUsers: UserAccount[] = useMemo(() => {
    if (!usersData || !Array.isArray(usersData)) return [];
    return usersData.filter(u => u.status === 'Active');
  }, [usersData]);

  // 2. Fetch Alerts via SWR with auto-refresh
  const statusParam = statusFilter !== 'all' ? `&status=${statusFilter}` : '';
  const severityParam = severityFilter !== 'all' ? `&severity=${severityFilter}` : '';
  const queryUrl = `/api/alerts?limit=200${statusParam}${severityParam}`;

  const { data: alertsRes, isLoading: alertsLoading, mutate: mutateAlerts } = useSWR(
    queryUrl,
    () => alertsService.getAlerts({
      limit: 200,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      severity: severityFilter !== 'all' ? severityFilter : undefined,
    }),
    { refreshInterval }
  );

  const { data: statsData } = useSWR('/api/stats', () => fetch('/api/stats').then(r => r.json()), { refreshInterval });

  const rawAlerts: Alert[] = alertsRes?.data || [];

  // Client-side Filtering for Instant Response
  const filteredAlerts = useMemo(() => {
    return rawAlerts.filter(a => {
      // Assignee Filter
      if (assigneeFilter === 'me') {
        const myUser = sessionStorage.getItem('soc_user') || 'admin';
        const myName = sessionStorage.getItem('soc_real_name') || 'Administrator';
        const assigned = a.assigned_to || a.assignedTo || '';
        if (assigned !== myUser && assigned !== myName) return false;
      } else if (assigneeFilter === 'unassigned') {
        if (a.assigned_to || a.assignedTo) return false;
      } else if (assigneeFilter !== 'all') {
        const assigned = a.assigned_to || a.assignedTo || '';
        if (assigned !== assigneeFilter) return false;
      }

      // Resolution Filter
      if (resolutionFilter !== 'all') {
        if (a.resolution_type !== resolutionFilter) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = (a.title || '').toLowerCase().includes(q);
        const descMatch = (a.description || '').toLowerCase().includes(q);
        const srcMatch = (a.source || '').toLowerCase().includes(q);
        const rawMatch = (a.raw_log || '').toLowerCase().includes(q);
        const assignedMatch = (a.assigned_to || a.assignedTo || '').toLowerCase().includes(q);
        if (!titleMatch && !descMatch && !srcMatch && !rawMatch && !assignedMatch) return false;
      }

      return true;
    });
  }, [rawAlerts, assigneeFilter, resolutionFilter, searchQuery]);

  // Keep selectedAlert in sync if alerts refresh
  useEffect(() => {
    if (selectedAlert) {
      const updated = rawAlerts.find(a => a.id === selectedAlert.id);
      if (updated) setSelectedAlert(updated);
    }
  }, [rawAlerts]);

  // Keyboard shortcut: Escape closes drawer and modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (resolvingAlert) setResolvingAlert(null);
        else if (selectedAlert) setSelectedAlert(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAlert, resolvingAlert]);

  // Single Alert Update Action
  const handleUpdateAlert = async (
    alertId: string,
    payload: { status?: string; assigned_to?: string; resolution_type?: string; notes?: string }
  ) => {
    try {
      await alertsService.updateAlert(alertId, payload);
      mutateAlerts();
      mutate('/api/stats');
    } catch (err) {
      console.error('Failed to update alert', err);
    }
  };

  // Bulk Actions
  const handleBulkAssign = async () => {
    if (!bulkAssignee || selectedAlertIds.length === 0) return;
    setIsBulkSubmitting(true);
    try {
      await alertsService.bulkUpdateAlerts({
        alert_ids: selectedAlertIds,
        assigned_to: bulkAssignee,
        notes: `Bulk assigned to ${bulkAssignee}`,
      });
      setSelectedAlertIds([]);
      setBulkAssignee('');
      mutateAlerts();
      mutate('/api/stats');
    } catch (err) {
      console.error('Bulk assignment failed', err);
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const handleBulkStatus = async (status: string) => {
    if (selectedAlertIds.length === 0) return;
    setIsBulkSubmitting(true);
    try {
      await alertsService.bulkUpdateAlerts({
        alert_ids: selectedAlertIds,
        status,
        notes: `Status bulk changed to ${status}`,
      });
      setSelectedAlertIds([]);
      mutateAlerts();
      mutate('/api/stats');
    } catch (err) {
      console.error('Bulk status update failed', err);
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedAlertIds.length === filteredAlerts.length) {
      setSelectedAlertIds([]);
    } else {
      setSelectedAlertIds(filteredAlerts.map(a => a.id));
    }
  };

  const toggleSelectAlert = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedAlertIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Submit Resolution Modal
  const submitResolution = async () => {
    if (!resolvingAlert) return;
    setIsResolving(true);
    try {
      await alertsService.updateAlert(resolvingAlert.id, {
        status: 'resolved',
        resolution_type: resolveType,
        notes: resolveNotes.trim() || (resolveType === 'true_positive' ? 'Confirmed True Positive - Mitigated' : 'Investigated - False Positive Rule Exception'),
      });
      setResolvingAlert(null);
      setResolveNotes('');
      mutateAlerts();
      mutate('/api/stats');
    } catch (err) {
      console.error('Failed to resolve alert', err);
    } finally {
      setIsResolving(false);
    }
  };

  // CSV Export
  const exportCSV = () => {
    if (filteredAlerts.length === 0) return;
    const headers = [
      'Alert ID', 'Timestamp', 'Severity', 'Title', 'Source', 'Event ID',
      'Status', 'Assigned To', 'Resolution Type', 'MITRE ATT&CK', 'Description', 'Raw Log'
    ];
    const escapeCSV = (val?: string | number | null) => {
      if (val == null) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };
    const rows = filteredAlerts.map(a => [
      escapeCSV(a.id),
      escapeCSV(a.timestamp),
      escapeCSV(a.severity),
      escapeCSV(a.title),
      escapeCSV(a.source),
      escapeCSV(a.eventId),
      escapeCSV(a.status),
      escapeCSV(a.assigned_to || a.assignedTo || 'Unassigned'),
      escapeCSV(a.resolution_type || 'Unresolved'),
      escapeCSV(a.mitreRef),
      escapeCSV(a.description),
      escapeCSV(a.raw_log),
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `soc_alerts_triage_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyText = (txt: string, cb: (v: boolean) => void) => {
    navigator.clipboard.writeText(txt).then(() => {
      cb(true);
      setTimeout(() => cb(false), 1500);
    });
  };

  // Parsed details for the slide-over
  const parsedInspector = useMemo(() => {
    if (!selectedAlert) return null;
    return parseAlertLog(selectedAlert.raw_log, selectedAlert.extracted_fields, selectedAlert);
  }, [selectedAlert]);

  return (
    <div className="p-6 space-y-5 bg-[#0a0f1d] min-h-screen text-slate-100 font-sans">
      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shadow-inner">
              <ShieldAlert className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                <span>Security Incident Alerts</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30 font-mono">
                  {rawAlerts.length} Active
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Enterprise SOC triage workspace, real-time threat correlation, and analyst case assignment
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => mutateAlerts()}
            className="p-2 rounded-lg bg-[#111827] border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
            title="Refresh Alerts"
          >
            <RefreshCw size={14} className={alertsLoading ? 'animate-spin text-blue-400' : ''} />
          </button>

          <button
            onClick={exportCSV}
            disabled={filteredAlerts.length === 0}
            className="px-3.5 py-1.5 rounded-lg bg-[#111827] border border-slate-800 hover:border-slate-700 text-xs font-medium text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 disabled:opacity-40"
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* ── Metrics Summary Bar ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-[#0f172a]/90 border border-slate-800/80 rounded-xl p-3.5 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Alerts</div>
            <div className="text-xl font-bold text-white mt-0.5">{statsData?.total_alerts || rawAlerts.length}</div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <List size={16} className="text-blue-400" />
          </div>
        </div>

        <div className="bg-[#0f172a]/90 border border-slate-800/80 rounded-xl p-3.5 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">Critical / High</div>
            <div className="text-xl font-bold text-rose-300 mt-0.5">
              {rawAlerts.filter(a => a.severity === 'critical' || a.severity === 'high').length}
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
            <ShieldAlert size={16} className="text-rose-400" />
          </div>
        </div>

        <div className="bg-[#0f172a]/90 border border-slate-800/80 rounded-xl p-3.5 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">Investigating</div>
            <div className="text-xl font-bold text-amber-300 mt-0.5">
              {rawAlerts.filter(a => a.status === 'investigating').length}
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Clock size={16} className="text-amber-400" />
          </div>
        </div>

        <div className="bg-[#0f172a]/90 border border-slate-800/80 rounded-xl p-3.5 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider">Unassigned Queue</div>
            <div className="text-xl font-bold text-blue-300 mt-0.5">
              {rawAlerts.filter(a => !a.assigned_to && !a.assignedTo && a.status === 'new').length}
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <UserCheck size={16} className="text-blue-400" />
          </div>
        </div>

        <div className="bg-[#0f172a]/90 border border-slate-800/80 rounded-xl p-3.5 flex items-center justify-between shadow-sm col-span-2 sm:col-span-1">
          <div>
            <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Resolved</div>
            <div className="text-xl font-bold text-emerald-300 mt-0.5">
              {rawAlerts.filter(a => a.status === 'resolved' || a.status === 'false_positive').length}
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <CheckCircle2 size={16} className="text-emerald-400" />
          </div>
        </div>
      </div>

      {/* ── Search, Tabs, & Multi-Filter Control Bar ── */}
      <div className="bg-[#0e1626] border border-slate-800 rounded-xl p-3.5 space-y-3 shadow-md">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0">
            {[
              { id: 'all', label: 'All Alerts', count: rawAlerts.length, icon: Layers },
              { id: 'new', label: 'New / Unhandled', count: rawAlerts.filter(a => a.status === 'new').length, icon: ShieldAlert },
              { id: 'investigating', label: 'Investigating', count: rawAlerts.filter(a => a.status === 'investigating').length, icon: Clock },
              { id: 'resolved', label: 'Resolved', count: rawAlerts.filter(a => a.status === 'resolved').length, icon: CheckCircle2 },
              { id: 'false_positive', label: 'False Positives', count: rawAlerts.filter(a => a.status === 'false_positive').length, icon: ThumbsDown },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon size={13} />
                  <span>{tab.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${isActive ? 'bg-blue-700 text-blue-100' : 'bg-slate-800 text-slate-400'}`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, IP, signature, analyst..."
              className="w-full bg-[#0a0f1d] border border-slate-700/80 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Second Row: Deep Filters */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-800/80 text-xs">
          {/* Severity Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-[11px] font-medium">Severity:</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="bg-[#0a0f1d] border border-slate-700/80 rounded-md px-2 py-1 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="info">Info</option>
            </select>
          </div>

          {/* Analyst Assignee Filter (Dynamic from DB) */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-[11px] font-medium">Assignee:</span>
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="bg-[#0a0f1d] border border-slate-700/80 rounded-md px-2 py-1 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All Analysts</option>
              <option value="me">Assigned to Me ({currentUser})</option>
              <option value="unassigned">Unassigned Only</option>
              {activeUsers.map(u => (
                <option key={u.id} value={u.real_name || u.username}>
                  {u.real_name || u.username} ({u.role})
                </option>
              ))}
            </select>
          </div>

          {/* Resolution Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-[11px] font-medium">Resolution:</span>
            <select
              value={resolutionFilter}
              onChange={(e) => setResolutionFilter(e.target.value)}
              className="bg-[#0a0f1d] border border-slate-700/80 rounded-md px-2 py-1 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All Verdicts</option>
              <option value="true_positive">True Positive</option>
              <option value="false_positive">False Positive</option>
            </select>
          </div>

          {(statusFilter !== 'all' || severityFilter !== 'all' || assigneeFilter !== 'all' || resolutionFilter !== 'all' || searchQuery) && (
            <button
              onClick={() => {
                setStatusFilter('all');
                setSeverityFilter('all');
                setAssigneeFilter('all');
                setResolutionFilter('all');
                setSearchQuery('');
              }}
              className="ml-auto text-[11px] text-blue-400 hover:text-blue-300 underline font-medium"
            >
              Reset all filters
            </button>
          )}
        </div>
      </div>

      {/* ── Bulk Actions Bar (Appears when alerts are selected) ── */}
      {selectedAlertIds.length > 0 && (
        <div className="bg-[#111c33] border border-blue-500/40 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-lg animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <CheckSquare size={16} className="text-blue-400" />
            <span className="text-xs font-bold text-white">
              {selectedAlertIds.length} {selectedAlertIds.length === 1 ? 'alert' : 'alerts'} selected
            </span>
            <button
              onClick={() => setSelectedAlertIds([])}
              className="text-[11px] text-slate-400 hover:text-white underline ml-2"
            >
              Deselect All
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Bulk Assign Dropdown */}
            <div className="flex items-center gap-1.5">
              <select
                value={bulkAssignee}
                onChange={(e) => setBulkAssignee(e.target.value)}
                className="bg-[#0a0f1d] border border-slate-700 rounded-md px-2.5 py-1 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
              >
                <option value="">Assign to Analyst...</option>
                <option value={currentUser}>{currentUser} (Me)</option>
                {activeUsers.map(u => (
                  <option key={u.id} value={u.real_name || u.username}>
                    {u.real_name || u.username} ({u.role})
                  </option>
                ))}
              </select>
              <button
                onClick={handleBulkAssign}
                disabled={!bulkAssignee || isBulkSubmitting}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1 rounded-md transition-colors disabled:opacity-40"
              >
                Apply
              </button>
            </div>

            {/* Quick Status Batch */}
            <button
              onClick={() => handleBulkStatus('investigating')}
              disabled={isBulkSubmitting}
              className="bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 border border-amber-500/40 text-xs font-medium px-3 py-1 rounded-md transition-colors"
            >
              Mark Investigating
            </button>

            <button
              onClick={() => handleBulkStatus('resolved')}
              disabled={isBulkSubmitting}
              className="bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-500/40 text-xs font-medium px-3 py-1 rounded-md transition-colors"
            >
              Resolve Batch
            </button>
          </div>
        </div>
      )}

      {/* ── Enterprise SOC Alerts Data Table ── */}
      <div className="bg-[#0c1220] border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        {alertsLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2 className="animate-spin text-blue-500" size={32} />
            <span className="text-xs text-slate-400">Loading security alerts & threat correlation...</span>
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="py-20 text-center space-y-2">
            <ShieldCheck className="mx-auto text-slate-600" size={40} />
            <div className="text-sm font-semibold text-slate-300">No alerts matching active filters</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No incidents found in this view. Try adjusting your severity, assignee, or search criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#090e18] border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider sticky top-0">
                <tr>
                  <th className="px-3.5 py-3 w-8 text-center">
                    <button onClick={toggleSelectAll} className="text-slate-400 hover:text-white">
                      {selectedAlertIds.length === filteredAlerts.length ? (
                        <CheckSquare size={14} className="text-blue-400" />
                      ) : (
                        <Square size={14} />
                      )}
                    </button>
                  </th>
                  <th className="px-3 py-3 font-semibold">Severity</th>
                  <th className="px-3 py-3 font-semibold">Incident / Threat Signature</th>
                  <th className="px-3 py-3 font-semibold">Telemetry Flow (Source ➔ Target)</th>
                  <th className="px-3 py-3 font-semibold">Source</th>
                  <th className="px-3 py-3 font-semibold">Assigned Analyst</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Detected</th>
                  <th className="px-3 py-3 font-semibold text-right pr-4">Triage Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredAlerts.map(alert => {
                  const sev = (alert.severity || 'medium').toLowerCase();
                  const parsed = parseAlertLog(alert.raw_log, alert.extracted_fields, alert);
                  const statusInfo = STATUS_BADGE[alert.status] || STATUS_BADGE.new;
                  const isSelected = selectedAlertIds.includes(alert.id);
                  const isDrawerOpen = selectedAlert?.id === alert.id;
                  const assignedName = alert.assigned_to || alert.assignedTo;

                  return (
                    <tr
                      key={alert.id}
                      onClick={() => setSelectedAlert(alert)}
                      className={`hover:bg-slate-800/40 transition-colors cursor-pointer group ${
                        isDrawerOpen ? 'bg-blue-950/20 border-l-2 border-l-blue-500' : ''
                      } ${isSelected ? 'bg-blue-900/10' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="px-3.5 py-3 text-center" onClick={(e) => toggleSelectAlert(alert.id, e)}>
                        {isSelected ? (
                          <CheckSquare size={14} className="text-blue-400" />
                        ) : (
                          <Square size={14} className="text-slate-600 group-hover:text-slate-400" />
                        )}
                      </td>

                      {/* Severity Badge */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold border ${SEV_BADGE[sev] || SEV_BADGE.info}`}>
                          {SEV_ICON[sev]}
                          <span>{sev.toUpperCase()}</span>
                        </span>
                      </td>

                      {/* Title & Signature Correlation */}
                      <td className="px-3 py-3 max-w-sm">
                        <div className="font-semibold text-slate-100 group-hover:text-blue-300 transition-colors truncate">
                          {alert.title}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 flex-wrap">
                          {parsed.sigId && (
                            <span className="px-1.5 py-0.2 rounded font-mono text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/30">
                              {parsed.sigId}
                            </span>
                          )}
                          {parsed.threatFeed && (
                            <span className="text-[10px] text-blue-400 font-mono flex items-center gap-1">
                              <Globe size={10} />
                              {parsed.threatFeed}
                            </span>
                          )}
                          {alert.mitreRef && (
                            <span className="text-[10px] text-rose-300 bg-rose-500/10 px-1 rounded border border-rose-500/20 font-mono">
                              {alert.mitreRef}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Telemetry Flow Preview */}
                      <td className="px-3 py-3 font-mono text-xs whitespace-nowrap">
                        {parsed.srcIp || parsed.dstIp ? (
                          <div className="flex items-center gap-1.5 text-slate-300">
                            <span className="text-slate-200 font-medium" title={parsed.srcIp}>
                              {parsed.srcIp || '—'}{parsed.srcPort ? `:${parsed.srcPort}` : ''}
                            </span>
                            <ArrowRight size={11} className="text-blue-400 shrink-0" />
                            <span className="text-slate-200 font-medium" title={parsed.dstIp}>
                              {parsed.dstIp || '—'}{parsed.dstPort ? `:${parsed.dstPort}` : ''}
                            </span>
                            {parsed.action && (
                              <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase border ml-1 ${ACTION_BADGE[parsed.action.toLowerCase()] || 'text-slate-400 border-slate-700'}`}>
                                {parsed.action}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 text-xs italic">Internal System Event</span>
                        )}
                      </td>

                      {/* Source */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] border border-slate-700 font-mono">
                          {alert.source || 'Fortinet-FortiGate'}
                        </span>
                      </td>

                      {/* Assigned Analyst */}
                      <td className="px-3 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {assignedName ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-300 border border-blue-500/25">
                            <User size={11} />
                            <span>{assignedName}</span>
                          </div>
                        ) : (
                          <select
                            value=""
                            onChange={(e) => handleUpdateAlert(alert.id, { assigned_to: e.target.value, status: 'investigating' })}
                            className="bg-[#090e18] hover:bg-slate-800 border border-dashed border-slate-700 hover:border-blue-500 rounded-md px-2 py-1 text-[11px] text-slate-400 hover:text-blue-300 focus:outline-none transition-colors cursor-pointer"
                          >
                            <option value="" disabled>+ Assign Analyst</option>
                            <option value={currentUser}>{currentUser} (Me)</option>
                            {activeUsers.map(u => (
                              <option key={u.id} value={u.real_name || u.username}>
                                {u.real_name || u.username} ({u.role})
                              </option>
                            ))}
                          </select>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusInfo.class}`}>
                          {statusInfo.icon}
                          <span>{statusInfo.label}</span>
                        </span>
                      </td>

                      {/* Timestamp */}
                      <td className="px-3 py-3 whitespace-nowrap text-slate-400 font-mono text-[11px]" title={alert.timestamp}>
                        {safeDistanceToNow(alert.timestamp)}
                      </td>

                      {/* Quick Triage Actions */}
                      <td className="px-3 py-3 whitespace-nowrap text-right pr-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedAlert(alert)}
                            className="px-2.5 py-1 rounded-md bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 text-xs font-semibold flex items-center gap-1 transition-colors"
                          >
                            <ExternalLink size={11} />
                            <span>Investigate</span>
                          </button>

                          {(alert.status === 'new' || alert.status === 'investigating') && (
                            <button
                              onClick={() => {
                                setResolvingAlert(alert);
                                setResolveType('true_positive');
                                setResolveNotes('');
                              }}
                              className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium transition-colors"
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* ── SLIDE-OVER INVESTIGATION INSPECTOR (Logs Style) ───────── */}
      {/* ════════════════════════════════════════════════════════════ */}
      {selectedAlert && parsedInspector && (
        <div className="fixed inset-y-0 right-0 w-[680px] max-w-[95vw] bg-[#0c1220] border-l border-slate-800 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-[#0e1626]/90 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/25 flex items-center justify-center">
                <ShieldAlert className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-100">Incident Investigation</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border ${SEV_BADGE[(selectedAlert.severity || 'medium').toLowerCase()] || SEV_BADGE.info}`}>
                    {selectedAlert.severity?.toUpperCase()}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                    {selectedAlert.source || 'Fortinet-FortiGate'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                  <span className="font-mono text-slate-300">ID: {selectedAlert.id.substring(0, 8)}</span>
                  <span>•</span>
                  <span className="font-mono">{safeDistanceToNow(selectedAlert.timestamp)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => copyText(parsedInspector.cleanLine, setRawCopied)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-300 bg-slate-800/80 hover:bg-slate-700 rounded-md border border-slate-700 transition-colors"
                title="Copy Raw Log"
              >
                {rawCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                <span>{rawCopied ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                onClick={() => setSelectedAlert(null)}
                className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
                title="Close (Esc)"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* ── Analyst Triage & Assignment Bar ── */}
            <div className="bg-[#11192a] border border-slate-800 rounded-xl p-3.5 shadow-sm space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                <div className="flex items-center gap-1.5">
                  <UserCheck size={13} className="text-blue-400" />
                  <span>Analyst Assignment & Incident Status</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${STATUS_BADGE[selectedAlert.status]?.class || STATUS_BADGE.new.class}`}>
                  {STATUS_BADGE[selectedAlert.status]?.label || selectedAlert.status}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                {/* Dynamic Assignee Dropdown */}
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                    Assigned Analyst
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedAlert.assigned_to || selectedAlert.assignedTo || ''}
                      onChange={(e) => handleUpdateAlert(selectedAlert.id, { assigned_to: e.target.value })}
                      className="flex-1 bg-[#090e18] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">Unassigned</option>
                      <option value={currentUser}>{currentUser} (Me)</option>
                      {activeUsers.map(u => (
                        <option key={u.id} value={u.real_name || u.username}>
                          {u.real_name || u.username} ({u.role})
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => handleUpdateAlert(selectedAlert.id, { assigned_to: currentUser, status: 'investigating' })}
                      className="px-2.5 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
                      title="Assign this incident to yourself"
                    >
                      Assign to Me
                    </button>
                  </div>
                </div>

                {/* Status Triage Controls */}
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                    Lifecycle Workflow
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleUpdateAlert(selectedAlert.id, { status: 'investigating' })}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                        selectedAlert.status === 'investigating'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                          : 'bg-[#090e18] text-slate-400 hover:text-slate-200 border-slate-700'
                      }`}
                    >
                      Investigating
                    </button>

                    <button
                      onClick={() => {
                        setResolvingAlert(selectedAlert);
                        setResolveType('true_positive');
                        setResolveNotes('');
                      }}
                      className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30 transition-all shadow-sm"
                    >
                      Close / Resolve
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Connection & Telemetry Flow Hero Visualizer ── */}
            {(parsedInspector.srcIp || parsedInspector.dstIp) && (
              <div className="bg-[#11192a] border border-slate-800 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  <div className="flex items-center gap-1.5">
                    <Network size={13} className="text-blue-400" />
                    <span>Connection & Telemetry Flow</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${ACTION_BADGE[parsedInspector.action?.toLowerCase() || 'deny'] || 'text-rose-300 bg-rose-500/15 border-rose-500/30'}`}>
                    {(parsedInspector.action || 'BLOCKED').toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-11 items-center gap-2 text-center bg-[#090d16] p-3.5 rounded-lg border border-slate-800/80">
                  {/* Source Node */}
                  <div className="col-span-4 text-left">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase">Source (Client / Inbound)</div>
                    <div className="font-mono text-sm font-bold text-slate-100 mt-0.5 truncate" title={parsedInspector.srcIp}>
                      {parsedInspector.srcIp || '—'}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {parsedInspector.srcPort ? `Port ${parsedInspector.srcPort}` : 'Ephemeral'}
                    </div>
                    {parsedInspector.srcIp && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <button
                          onClick={() => copyText(parsedInspector.srcIp!, setSrcIpCopied)}
                          className="text-[10px] text-slate-400 hover:text-slate-200 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/80 flex items-center gap-1"
                        >
                          {srcIpCopied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                          <span>Copy</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Center Flow Arrow */}
                  <div className="col-span-3 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      {parsedInspector.protocol || 'IP'}
                    </span>
                    <div className="w-full flex items-center justify-center my-1">
                      <div className="h-0.5 flex-1 bg-slate-700"></div>
                      <ArrowRight size={14} className="text-blue-400 shrink-0 mx-1" />
                      <div className="h-0.5 flex-1 bg-slate-700"></div>
                    </div>
                    <span className="text-[10px] font-mono text-blue-300 truncate max-w-[120px]">
                      {parsedInspector.service || 'Firewall'}
                    </span>
                  </div>

                  {/* Destination Node */}
                  <div className="col-span-4 text-right">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase">Destination (Service / Target)</div>
                    <div className="font-mono text-sm font-bold text-slate-100 mt-0.5 truncate" title={parsedInspector.dstIp}>
                      {parsedInspector.dstIp || '—'}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {parsedInspector.dstPort ? `Port ${parsedInspector.dstPort}` : 'Target Port'}
                    </div>
                    {parsedInspector.dstIp && (
                      <div className="flex items-center justify-end gap-1.5 mt-2">
                        <button
                          onClick={() => copyText(parsedInspector.dstIp!, setDstIpCopied)}
                          className="text-[10px] text-slate-400 hover:text-slate-200 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/80 flex items-center gap-1"
                        >
                          {dstIpCopied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                          <span>Copy</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Threat Intelligence & Intrusion Correlation Banner ── */}
            <div className="bg-gradient-to-br from-rose-950/40 via-[#131b2e] to-slate-900/90 border border-rose-500/30 rounded-xl p-4 shadow-lg space-y-3">
              <div className="flex items-center justify-between border-b border-rose-500/20 pb-2.5">
                <div className="flex items-center gap-2">
                  <ShieldAlert size={17} className="text-rose-400 shrink-0" />
                  <span className="text-xs font-bold text-rose-200 uppercase tracking-wider">
                    Threat Intelligence & Intrusion Correlation
                  </span>
                </div>
                {parsedInspector.threatConfidence ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span>
                    {parsedInspector.threatConfidence}% Confidence
                  </span>
                ) : null}
              </div>

              {/* Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="bg-[#0b101b]/90 border border-slate-800 rounded-lg p-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Attack / Threat Signature
                  </div>
                  <div className="text-xs font-bold text-rose-200 font-mono mt-1 break-words">
                    {parsedInspector.attack || selectedAlert.title}
                  </div>
                </div>

                {parsedInspector.sigId && (
                  <div className="bg-[#0b101b]/90 border border-slate-800 rounded-lg p-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Signature ID
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs font-bold text-amber-300 font-mono">
                        {parsedInspector.sigId}
                      </span>
                      <button
                        onClick={() => copyText(parsedInspector.sigId!, setSigCopied)}
                        className="px-1.5 py-0.5 text-slate-400 hover:text-slate-200 bg-slate-800 rounded border border-slate-700 text-[10px] flex items-center gap-1"
                        title="Copy Signature ID"
                      >
                        {sigCopied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                        <span>Copy</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Badges Row */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/80">
                {parsedInspector.threatFeed && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                    <Globe size={12} className="text-blue-400 shrink-0" />
                    <span className="text-slate-400">Detected by:</span>
                    <span className="text-white font-mono font-bold">{parsedInspector.threatFeed}</span>
                  </div>
                )}

                {selectedAlert.mitreRef && (
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono">
                    MITRE ATT&CK: {selectedAlert.mitreRef}
                  </span>
                )}
              </div>
            </div>

            {/* ── Inspector Tabs ── */}
            <div className="flex items-center gap-1 p-1 bg-[#101726] rounded-lg border border-slate-800">
              <button
                onClick={() => setDrawerTab('overview')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${
                  drawerTab === 'overview' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ShieldCheck size={13} />
                <span>Overview & Fields</span>
              </button>
              <button
                onClick={() => setDrawerTab('tags')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${
                  drawerTab === 'tags' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Tag size={13} />
                <span>Tags ({parsedInspector.kvPairs.length})</span>
              </button>
              <button
                onClick={() => setDrawerTab('raw')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${
                  drawerTab === 'raw' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText size={13} />
                <span>Raw Log</span>
              </button>
              <button
                onClick={() => setDrawerTab('notes')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${
                  drawerTab === 'notes' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Clock size={13} />
                <span>Timeline & Notes</span>
              </button>
            </div>

            {/* ── TAB 1: OVERVIEW & EXTRACTED FIELDS ── */}
            {drawerTab === 'overview' && (
              <div className="space-y-3">
                {/* Search in attributes */}
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={attrSearch}
                    onChange={(e) => setAttrSearch(e.target.value)}
                    placeholder="Search attributes (e.g. sign, ip, feed, port)..."
                    className="w-full bg-[#0a0e18] border border-slate-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  {attrSearch && (
                    <button onClick={() => setAttrSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Attribute Table */}
                <div className="bg-[#090d16] border border-slate-800 rounded-xl overflow-hidden shadow-inner">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#0c1220] border-b border-slate-800 text-slate-400 text-[10px] uppercase font-semibold">
                      <tr>
                        <th className="px-3.5 py-2.5 w-44">Attribute</th>
                        <th className="px-3.5 py-2.5">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {[
                        ['Incident Title', selectedAlert.title],
                        ['Severity', selectedAlert.severity?.toUpperCase()],
                        ['Incident Status', selectedAlert.status],
                        ['Assigned Analyst', selectedAlert.assigned_to || selectedAlert.assignedTo || 'Unassigned'],
                        ['Timestamp', selectedAlert.timestamp],
                        ['Source / Sensor', selectedAlert.source || 'Fortinet-FortiGate'],
                        ['Hostname / Device', parsedInspector.hostname || 'FG-100F-HQ-CORE'],
                        ['Event ID', String(selectedAlert.eventId || '—')],
                        ...(parsedInspector.attack ? [['Threat / Attack Signature', parsedInspector.attack]] : []),
                        ...(parsedInspector.sigId ? [['Signature ID', parsedInspector.sigId]] : []),
                        ...(parsedInspector.attackId ? [['Attack ID', parsedInspector.attackId]] : []),
                        ...(parsedInspector.threatFeed ? [['Detected Threat Intel Feed', parsedInspector.threatFeed]] : []),
                        ...(parsedInspector.threatConfidence ? [['Threat Intel Confidence', `${parsedInspector.threatConfidence}%`]] : []),
                        ['Source Network', `${parsedInspector.srcIp || '—'}${parsedInspector.srcPort ? ':' + parsedInspector.srcPort : ''}`],
                        ['Destination Network', `${parsedInspector.dstIp || '—'}${parsedInspector.dstPort ? ':' + parsedInspector.dstPort : ''}`],
                        ...(parsedInspector.protocol ? [['Protocol', parsedInspector.protocol]] : []),
                        ...(parsedInspector.service ? [['Service / Application', parsedInspector.service]] : []),
                        ...(parsedInspector.action ? [['Action Taken', parsedInspector.action.toUpperCase()]] : []),
                        ...(parsedInspector.bytesSent || parsedInspector.bytesRcvd ? [['Traffic Volume', `Sent: ${parsedInspector.bytesSent || 0}B | Rcvd: ${parsedInspector.bytesRcvd || 0}B`]] : []),
                        ...(parsedInspector.policyId ? [['Firewall Policy ID', parsedInspector.policyId]] : []),
                        ...(parsedInspector.sessionId ? [['Firewall Session ID', parsedInspector.sessionId]] : []),
                        ...(selectedAlert.mitreRef ? [['MITRE ATT&CK', selectedAlert.mitreRef]] : []),
                        ...(selectedAlert.resolution_type ? [['Resolution Verdict', selectedAlert.resolution_type === 'true_positive' ? 'True Positive' : 'False Positive']] : []),
                        ...(selectedAlert.notes ? [['Close Notes', selectedAlert.notes]] : []),
                        ...parsedInspector.kvPairs,
                      ]
                        .filter(([k, v]) => {
                          if (!v) return false;
                          if (!attrSearch.trim()) return true;
                          const q = attrSearch.toLowerCase();
                          return k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q);
                        })
                        .map(([k, v], i) => (
                          <tr key={i} className="hover:bg-slate-800/40 transition-colors">
                            <td className="px-3.5 py-2 text-slate-400 font-sans font-medium">{k}</td>
                            <td className="px-3.5 py-2 text-slate-200 break-all select-all">{String(v)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB 2: KEY-VALUE TAGS ── */}
            {drawerTab === 'tags' && (
              <div className="space-y-3">
                <div className="text-xs text-slate-400">
                  All extracted key-value attributes parsed from telemetry:
                </div>
                <div className="flex flex-wrap gap-2">
                  {parsedInspector.kvPairs.map(([k, v], i) => (
                    <div
                      key={i}
                      className="px-2.5 py-1 rounded-md bg-[#090d16] border border-slate-800 text-xs flex items-center gap-1.5 hover:border-slate-700 transition-colors"
                    >
                      <span className="text-blue-400 font-mono font-medium">{k}:</span>
                      <span className="text-slate-200 font-mono select-all">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── TAB 3: RAW MESSAGE ── */}
            {drawerTab === 'raw' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Raw Syslog / Ingest Payload</span>
                  <button
                    onClick={() => copyText(parsedInspector.cleanLine, setRawCopied)}
                    className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    <Copy size={11} />
                    <span>{rawCopied ? 'Copied' : 'Copy Payload'}</span>
                  </button>
                </div>
                <div className="p-4 bg-[#080c16] border border-slate-800 rounded-xl font-mono text-xs text-slate-300 leading-relaxed overflow-x-auto whitespace-pre-wrap select-all">
                  {parsedInspector.cleanLine}
                </div>
              </div>
            )}

            {/* ── TAB 4: TIMELINE & NOTES ── */}
            {drawerTab === 'notes' && (
              <AlertInvestigationNotes
                alertId={selectedAlert.id}
                onNoteAdded={() => mutateAlerts()}
              />
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* ── CLOSE / RESOLUTION MODAL ──────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════ */}
      {resolvingAlert && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#0c1220] border border-slate-800 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Resolve & Close Security Incident</h3>
              </div>
              <button onClick={() => setResolvingAlert(null)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="text-xs text-slate-300 font-medium">
              Incident: <span className="text-white font-semibold">{resolvingAlert.title}</span>
            </div>

            {/* Verdict Selector */}
            <div>
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Investigation Verdict
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setResolveType('true_positive')}
                  className={`p-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                    resolveType === 'true_positive'
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-sm'
                      : 'bg-[#090e18] border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ThumbsUp size={14} />
                  <span>True Positive (Threat Mitigated)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setResolveType('false_positive')}
                  className={`p-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                    resolveType === 'false_positive'
                      ? 'bg-slate-700/60 border-slate-500 text-white shadow-sm'
                      : 'bg-[#090e18] border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ThumbsDown size={14} />
                  <span>False Positive (Benign / Expected)</span>
                </button>
              </div>
            </div>

            {/* Close Notes */}
            <div>
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                Resolution & Remediation Notes
              </label>
              <textarea
                rows={3}
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                placeholder="Document your findings, root cause, firewall blocking status, or tuning justification..."
                className="w-full bg-[#090e18] border border-slate-700 rounded-lg p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setResolvingAlert(null)}
                className="px-3.5 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitResolution}
                disabled={isResolving}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5"
              >
                {isResolving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                <span>Confirm & Close Incident</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
