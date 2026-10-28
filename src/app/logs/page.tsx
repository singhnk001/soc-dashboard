"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { logsService } from '@/services/logs.service';
import {
  Search, RefreshCw, Download, ChevronLeft, ChevronRight,
  X, ChevronDown, AlertTriangle, Info, AlertCircle,
  ShieldAlert, Activity, Terminal, Shield, Copy, Plus,
  ArrowUp, ArrowDown, ArrowUpDown, SlidersHorizontal, Check,
  ExternalLink, Play, Radio, Columns
} from 'lucide-react';

/* ─── severity ──────────────────────────────────────────────── */
const SEV_BADGE: Record<string, string> = {
  critical: 'text-red-400    bg-red-500/15    border-red-500/40',
  high:     'text-orange-300 bg-orange-500/20 border-orange-500/40',
  medium:   'text-yellow-300 bg-yellow-500/20 border-yellow-500/40',
  low:      'text-blue-400   bg-blue-500/10   border-blue-500/30',
  info:     'text-gray-400   bg-gray-500/10   border-gray-500/30',
};
const SEV_ICON: Record<string, React.ReactNode> = {
  critical: <ShieldAlert size={11} />, high: <AlertTriangle size={11} />,
  medium:   <AlertCircle size={11} />, low: <Info size={11} />, info: <Info size={11} />,
};
const SEV_BAR: Record<string, string> = {
  critical: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-yellow-500',
  low: 'bg-blue-500', info: 'bg-gray-500',
};

/* ─── time presets ──────────────────────────────────────────── */
const TIME_PRESETS = [
  { label: 'Last 15m', minutes: 15 },
  { label: 'Last 1h',  minutes: 60 },
  { label: 'Last 6h',  minutes: 360 },
  { label: 'Last 24h', minutes: 1440 },
  { label: 'Last 7d',  minutes: 10080 },
  { label: 'All Time', minutes: 0 },
];

/* ─── filter builder ────────────────────────────────────────── */
const FILTER_FIELDS = [
  { value: 'source_ip',    label: 'Source IP' },
  { value: 'dest_ip',      label: 'Dest IP' },
  { value: 'hostname',     label: 'Hostname' },
  { value: 'username',     label: 'Username' },
  { value: 'severity',     label: 'Severity' },
  { value: 'event_id',     label: 'Event ID' },
  { value: 'source',       label: 'Source' },
  { value: 'message',      label: 'Message' },
  { value: 'log_type',     label: 'Log Type' },
];
const FILTER_OPS = [
  { value: '=',             label: '= Equals' },
  { value: '!=',            label: '≠ Not Equals' },
  { value: 'contains',      label: '∋ Contains' },
  { value: 'not_contains',  label: '∌ Not Contains' },
  { value: 'starts_with',   label: '⊏ Starts With' },
  { value: 'ends_with',     label: '⊐ Ends With' },
  { value: 'in',            label: '∈ In (comma-sep)' },
  { value: '>',             label: '> Greater Than' },
  { value: '<',             label: '< Less Than' },
  { value: 'is_null',       label: '∅ Is Empty' },
  { value: 'is_not_null',   label: '◉ Is Not Empty' },
];

interface FilterRow { id: number; field: string; op: string; value: string; logic: 'AND' | 'OR'; }

/* ─── types ─────────────────────────────────────────────────── */
interface Log {
  id: string; timestamp: string | null; hostname: string | null;
  source: string | null; sourceIp: string | null; destinationIp: string | null;
  eventId: string | number | null; severity: string; message: string | null;
  username: string | null; logType: string | null; rawLog: any;
  mitreTactic: string | null; mitreTechnique: string | null;
}
interface HistBin { time: string; count: number; }
interface ApiResponse { data: Log[]; total: number; page: number; pages: number; histogram: HistBin[]; }
type SortField = 'timestamp' | 'severity' | 'hostname' | 'source' | 'eventId';
type SortDir   = 'asc' | 'desc';

/* ─── helpers ───────────────────────────────────────────────── */
function getEventName(log: Log): string {
  // Try to extract a meaningful event name from the message or rawLog
  if (log.message && log.message !== `EventID ${log.eventId}` && log.message.trim() !== '') {
    return log.message;
  }
  if (log.rawLog?.extracted_fields?.EventName) return log.rawLog.extracted_fields.EventName;
  if (log.rawLog?.extracted_fields?.Task) return log.rawLog.extracted_fields.Task;
  if (log.rawLog?.extracted_fields?.Description) return log.rawLog.extracted_fields.Description;
  return `EventID ${log.eventId ?? '—'}`;
}

/* Flatten rawLog into [key, value] pairs for display */
function flattenRawLog(rawLog: any): [string, string][] {
  if (!rawLog || typeof rawLog !== 'object') return [];
  const out: [string, string][] = [];
  
  // Top-level scalars first
  for (const [k, v] of Object.entries(rawLog)) {
    if (k === 'extracted_fields') continue;
    if (typeof v === 'object' && v !== null) continue;
    out.push([k, String(v ?? '')]);
  }
  // extracted_fields
  const ef = rawLog.extracted_fields;
  if (ef && typeof ef === 'object') {
    for (const [k, v] of Object.entries(ef)) {
      if (typeof v !== 'object') out.push([k, String(v ?? '')]);
    }
  }
  return out;
}

/* ─── AttrRow ────────────────────────────────────────────────── */
function AttrRow({ label, value, onAddFilter }: { label: string; value: string; onAddFilter?: (v: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const isLong = value.length > 60;

  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };

  return (
    <tr className="border-b border-[var(--border-color)] last:border-0 group hover:bg-white/5">
      <td className="py-2 pr-4 text-xs font-medium text-[var(--text-secondary)] align-top w-44 whitespace-nowrap">{label}</td>
      <td className="py-2 text-xs text-[var(--text-primary)] font-mono align-top">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <span
              className={isLong && !expanded ? 'block truncate max-w-xs cursor-pointer' : 'break-all whitespace-pre-wrap'}
              onClick={() => isLong && setExpanded(v => !v)}
              title={isLong && !expanded ? value : undefined}
            >
              {value || '—'}
            </span>
            {isLong && (
              <button onClick={() => setExpanded(v => !v)} className="text-[10px] text-blue-400 hover:text-blue-300 mt-0.5 block">
                {expanded ? 'collapse ▲' : 'expand ▼'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
            <button onClick={copy} className="p-0.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]" title="Copy">
              {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
            </button>
            {onAddFilter && value && (
              <button onClick={() => onAddFilter(value)} className="p-0.5 rounded text-[var(--text-secondary)] hover:text-blue-400" title="Add to filter">
                <Plus size={11} />
              </button>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

/* ─── Event Detail Slide-Over ───────────────────────────────── */
function EventDetail({ log, onClose, onAddFilter }: {
  log: Log; onClose: () => void;
  onAddFilter: (field: string, value: string) => void;
}) {
  const [attrSearch, setAttrSearch] = useState('');
  const [rawCopied, setRawCopied] = useState(false);
  const sev = (log.severity || 'info').toLowerCase();

  const rawStr = log.rawLog
    ? (typeof log.rawLog === 'string' ? log.rawLog : JSON.stringify(log.rawLog, null, 2))
    : null;

  const allAttrs: [string, string][] = [
    ['Timestamp',  log.timestamp ? new Date(log.timestamp).toLocaleString('en-IN', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }) : '—'],
    ['Hostname',   log.hostname ?? '—'],
    ['Source',     log.source ?? '—'],
    ['Log Type',   log.logType ?? '—'],
    ['Severity',   sev],
    ['Event ID',   String(log.eventId ?? '—')],
    ['Event Name', getEventName(log)],
    ['Message',    log.message ?? '—'],
    ...(log.sourceIp      ? [['Source IP',  log.sourceIp] as [string,string]]      : []),
    ...(log.destinationIp ? [['Dest IP',    log.destinationIp] as [string,string]] : []),
    ...(log.username      ? [['Username',   log.username] as [string,string]]       : []),
    ...(log.mitreTactic   ? [['MITRE Tactic', log.mitreTactic] as [string,string]]  : []),
    ...(log.mitreTechnique? [['MITRE Technique', log.mitreTechnique] as [string,string]] : []),
    ...flattenRawLog(log.rawLog).map(([k, v]) => [k, v] as [string, string]),
  ];

  const filteredAttrs = attrSearch
    ? allAttrs.filter(([k, v]) =>
        k.toLowerCase().includes(attrSearch.toLowerCase()) ||
        v.toLowerCase().includes(attrSearch.toLowerCase())
      )
    : allAttrs;

  const copyRaw = () => {
    if (rawStr) navigator.clipboard.writeText(rawStr).then(() => { setRawCopied(true); setTimeout(() => setRawCopied(false), 1500); });
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[560px] max-w-full bg-[#0d0f14] border-l border-[var(--border-color)] shadow-2xl z-50 flex flex-col">
      {/* header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)] shrink-0">
        <div className="flex items-center gap-2.5">
          <Terminal size={14} className="text-blue-400" />
          <span className="text-sm font-semibold text-[var(--text-primary)]">Event Details</span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border ${SEV_BADGE[sev] || SEV_BADGE.info}`}>
            {sev.charAt(0).toUpperCase() + sev.slice(1)}
          </span>
        </div>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          <X size={16} />
        </button>
      </div>

      {/* body */}
      <div className="flex-1 overflow-y-auto">
        {/* raw message block */}
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-secondary)]">Raw Message</span>
            <button onClick={copyRaw} className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
              {rawCopied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
              {rawCopied ? 'Copied' : ''}
            </button>
          </div>
          <pre className="text-[11px] font-mono bg-[#080a0f] border border-[var(--border-color)] rounded p-3 max-h-48 overflow-y-auto text-green-400 whitespace-pre-wrap break-all leading-relaxed">
            {rawStr || '—'}
          </pre>
        </div>

        {/* attributes table */}
        <div className="px-5 pb-5">
          {/* search */}
          <div className="relative mb-3">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input
              type="text"
              value={attrSearch}
              onChange={e => setAttrSearch(e.target.value)}
              placeholder="Search attributes..."
              className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-xs outline-none focus:border-blue-500 text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
            />
          </div>

          <div className="text-[11px] text-[var(--text-secondary)] mb-2">{filteredAttrs.length} attributes</div>

          <div className="border border-[var(--border-color)] rounded overflow-hidden">
            {/* column headers */}
            <div className="flex bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
              <div className="px-3 py-2 text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider w-44">Attribute</div>
              <div className="px-3 py-2 text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider flex-1">Value</div>
            </div>
            <table className="w-full">
              <tbody className="divide-y divide-[var(--border-color)]">
                {filteredAttrs.length === 0 ? (
                  <tr><td colSpan={2} className="px-3 py-4 text-xs text-center text-[var(--text-secondary)]">No matching attributes</td></tr>
                ) : filteredAttrs.map(([k, v], i) => (
                  <AttrRow
                    key={`${k}-${i}`}
                    label={k}
                    value={v}
                    onAddFilter={v && v !== '—' ? () => {
                      const fieldMap: Record<string, string> = {
                        'Source IP': 'source_ip', 'Dest IP': 'dest_ip', 'Hostname': 'hostname',
                        'Username': 'username', 'Event ID': 'event_id', 'Source': 'source',
                        'Severity': 'severity',
                      };
                      onAddFilter(fieldMap[k] || k.toLowerCase().replace(/\s+/g, '_'), v);
                    } : undefined}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── sort icon ─────────────────────────────────────────────── */
function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ArrowUpDown size={10} className="opacity-40 ml-0.5" />;
  return sortDir === 'asc'
    ? <ArrowUp size={10} className="text-blue-400 ml-0.5" />
    : <ArrowDown size={10} className="text-blue-400 ml-0.5" />;
}

/* ─── Quick Summary (inline expand row) ────────────────────── */
function QuickSummary({ log, onOpenDetail, onAddFilter }: {
  log: Log;
  onOpenDetail: () => void;
  onAddFilter: (field: string, value: string) => void;
}) {
  return (
    <tr className="bg-[var(--bg-secondary)]/60 border-b border-[var(--border-color)]">
      <td colSpan={12} className="px-4 py-3">
        <div className="flex items-start justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Quick Summary</span>
          <button
            onClick={onOpenDetail}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            <ExternalLink size={11} /> Full Event Details
          </button>
        </div>
        <div className="grid grid-cols-4 gap-x-6 gap-y-2 text-xs">
          {[
            ['Hostname',    log.hostname],
            ['Username',    log.username],
            ['Source IP',   log.sourceIp],
            ['Dest IP',     log.destinationIp],
            ['Log Type',    log.logType],
            ['MITRE Tactic',log.mitreTactic],
            ['MITRE Technique', log.mitreTechnique],
            ['Event Name',  getEventName(log)],
          ].map(([label, value]) => (
            <div key={label as string}>
              <div className="text-[10px] text-[var(--text-secondary)] mb-0.5">{label}</div>
              <div className="font-mono text-[var(--text-primary)] truncate max-w-[180px]" title={value ?? undefined}>
                {value || <span className="text-[var(--text-secondary)]">–</span>}
              </div>
            </div>
          ))}
        </div>
        {/* raw message preview */}
        {log.rawLog && (
          <div className="mt-3">
            <div className="text-[10px] text-[var(--text-secondary)] mb-1">Raw Message</div>
            <pre className="text-[11px] font-mono bg-black/40 border border-[var(--border-color)] rounded p-2.5 text-green-400 max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
              {typeof log.rawLog === 'string' ? log.rawLog : JSON.stringify(log.rawLog, null, 2)}
            </pre>
          </div>
        )}
      </td>
    </tr>
  );
}

/* ─── main ──────────────────────────────────────────────────── */
let filterIdSeq = 0;
const PAGE_SIZES = [25, 50, 100];

export default function LogsPage() {
  const [data,    setData]    = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  /* basic filters */
  const [search,      setSearch]      = useState('');
  const [severity,    setSeverity]    = useState('all');
  const [timePreset,  setTimePreset]  = useState(0);
  const [page,        setPage]        = useState(1);
  const [limit,       setLimit]       = useState(50);

  /* advanced filters */
  const [showBuilder,  setShowBuilder]  = useState(false);
  const [filterRows,   setFilterRows]   = useState<FilterRow[]>([]);

  /* sort */
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDir,   setSortDir]   = useState<SortDir>('desc');

  /* inline expand + slide-over */
  const [expandedId,  setExpandedId]  = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<Log | null>(null);

  /* live */
  const [liveMode, setLiveMode] = useState(false);
  const liveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* build query URL */
  const buildUrl = useCallback(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('limit', String(limit));
    if (search)              p.set('search', search);
    if (severity !== 'all')  p.set('severity', severity);
    if (timePreset > 0) {
      const from = new Date(Date.now() - timePreset * 60 * 1000).toISOString().replace('Z', '+00:00');
      p.set('time_from', from);
    }
    if (filterRows.length > 0) {
      const advanced = filterRows
        .filter(r => r.value || r.op === 'is_null' || r.op === 'is_not_null')
        .map(r => ({ field: r.field, op: r.op, value: r.value, logic: r.logic }));
      if (advanced.length > 0) p.set('filters', JSON.stringify(advanced));
    }
    return `/api/logs?${p.toString()}`;
  }, [page, limit, search, severity, timePreset, filterRows]);

  const fetchLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const advanced = filterRows.length > 0
        ? JSON.stringify(
            filterRows
              .filter(r => r.value || r.op === 'is_null' || r.op === 'is_not_null')
              .map(r => ({ field: r.field, op: r.op, value: r.value, logic: r.logic }))
          )
        : undefined;
      const timeFrom = timePreset > 0
        ? new Date(Date.now() - timePreset * 60 * 1000).toISOString().replace('Z', '+00:00')
        : undefined;

      const json = await logsService.getLogs({
        page,
        limit,
        search: search || undefined,
        severity: severity !== 'all' ? severity : undefined,
        time_from: timeFrom,
        filters: advanced,
      });
      setData(json as any);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, severity, timePreset, filterRows]);

  useEffect(() => { setPage(1); }, [search, severity, timePreset, filterRows, limit]);
  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    if (liveMode) {
      liveRef.current = setInterval(() => fetchLogs(true), 5000);
    } else {
      if (liveRef.current) clearInterval(liveRef.current);
    }
    return () => { if (liveRef.current) clearInterval(liveRef.current); };
  }, [liveMode, fetchLogs]);

  /* sort (client-side on current page) */
  const sortedLogs = React.useMemo(() => {
    if (!data?.data) return [];
    return [...data.data].sort((a, b) => {
      let av: any = (a as any)[sortField] ?? '';
      let bv: any = (b as any)[sortField] ?? '';
      if (sortField === 'timestamp') { av = av ? new Date(av).getTime() : 0; bv = bv ? new Date(bv).getTime() : 0; }
      if (sortField === 'severity') {
        const order = ['critical','high','medium','low','info'];
        av = order.indexOf((av || '').toLowerCase()); bv = order.indexOf((bv || '').toLowerCase());
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data?.data, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  /* add filter from click */
  const addQuickFilter = useCallback((field: string, value: string) => {
    const mapped: Record<string, string> = {
      sourceIp: 'source_ip', destinationIp: 'dest_ip', hostname: 'hostname',
      username: 'username', eventId: 'event_id', source: 'source', logType: 'log_type',
      source_ip: 'source_ip', destination_ip: 'dest_ip',
    };
    const f = mapped[field] || field;
    setFilterRows(rows => [...rows, { id: ++filterIdSeq, field: f, op: '=', value, logic: 'AND' }]);
    setShowBuilder(true);
  }, []);

  const addFilterRow = () => setFilterRows(rows => [...rows, { id: ++filterIdSeq, field: 'source_ip', op: '=', value: '', logic: 'AND' }]);
  const removeFilterRow = (id: number) => setFilterRows(rows => rows.filter(r => r.id !== id));
  const updateFilterRow = (id: number, patch: Partial<FilterRow>) =>
    setFilterRows(rows => rows.map(r => r.id === id ? { ...r, ...patch } : r));

  const clearAll = () => { setSearch(''); setSeverity('all'); setTimePreset(0); setFilterRows([]); setShowBuilder(false); };
  const hasFilters = search || severity !== 'all' || timePreset > 0 || filterRows.length > 0;

  const exportCsv = () => {
    if (!sortedLogs.length) return;
    // Clean export — no rawLog column, human-readable headers
    const cols: { key: string; label: string }[] = [
      { key: 'timestamp',      label: 'Timestamp' },
      { key: 'severity',       label: 'Severity' },
      { key: 'eventId',        label: 'Event ID' },
      { key: 'message',        label: 'Event Name / Message' },
      { key: 'source',         label: 'Source' },
      { key: 'hostname',       label: 'Hostname' },
      { key: 'sourceIp',       label: 'Source IP' },
      { key: 'destinationIp',  label: 'Dest IP' },
      { key: 'username',       label: 'Username' },
      { key: 'logType',        label: 'Log Type' },
      { key: 'mitreTactic',    label: 'MITRE Tactic' },
      { key: 'mitreTechnique', label: 'MITRE Technique' },
    ];
    const headerRow = cols.map(c => `"${c.label}"`).join(',');
    const dataRows = sortedLogs.map(l =>
      cols.map(c => `"${String((l as any)[c.key] ?? '').replace(/"/g, '""')}"`).join(',')
    );
    const blob = new Blob([[headerRow, ...dataRows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `soc-logs-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const thClass = "px-3 py-3 text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider select-none cursor-pointer hover:text-[var(--text-primary)] transition-colors whitespace-nowrap";
  const thStatic = "px-3 py-3 text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider whitespace-nowrap";

  /* pagination display */
  const totalEvents = data?.total ?? 0;
  const totalPages  = data?.pages ?? 1;
  const startItem   = data ? (page - 1) * limit + 1 : 0;
  const endItem     = data ? Math.min(page * limit, totalEvents) : 0;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── main area ── */}
      <div className={`flex-1 flex flex-col overflow-hidden transition-all ${selectedLog ? 'mr-[560px]' : ''}`}>
        
        {/* ── top toolbar ── */}
        <div className="flex items-center px-4 py-2.5 border-b border-[var(--border-color)] bg-[var(--bg-card)] shrink-0 gap-2 flex-wrap">
          {/* search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchLogs()}
              placeholder="Search message, hostname, IP, event ID…"
              className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-xs outline-none focus:border-blue-500 text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
            />
          </div>

          {/* divider */}
          <div className="h-5 w-px bg-[var(--border-color)]" />

          {/* time presets */}
          <div className="flex items-center gap-0.5 bg-[var(--bg-secondary)] rounded border border-[var(--border-color)] p-0.5">
            {TIME_PRESETS.map(preset => (
              <button
                key={preset.label}
                onClick={() => setTimePreset(preset.minutes)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  timePreset === preset.minutes
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5'
                }`}
              >
                {preset.label.replace('Last ', '')}
              </button>
            ))}
          </div>

          {/* divider */}
          <div className="h-5 w-px bg-[var(--border-color)]" />

          {/* severity */}
          <div className="relative">
            <select
              value={severity}
              onChange={e => setSeverity(e.target.value)}
              className="appearance-none pl-3 pr-7 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-xs text-[var(--text-primary)] outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="info">Info</option>
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-secondary)]" />
          </div>

          {/* filter builder toggle */}
          <button
            onClick={() => setShowBuilder(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border transition-colors ${
              showBuilder || filterRows.length > 0
                ? 'bg-blue-500/10 border-blue-500/40 text-blue-400'
                : 'bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <SlidersHorizontal size={12} />
            Filters
            {filterRows.length > 0 && (
              <span className="bg-blue-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {filterRows.length}
              </span>
            )}
          </button>

          {/* run */}
          <button
            onClick={() => fetchLogs()}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold transition-colors"
          >
            <Play size={10} fill="currentColor" /> Run
          </button>

          {/* ── right-side actions ── */}
          <div className="ml-auto flex items-center gap-1.5">
            {/* live toggle — clearly labeled */}
            <button
              onClick={() => setLiveMode(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-all ${
                liveMode
                  ? 'bg-green-500/15 border-green-500/50 text-green-400'
                  : 'bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="Auto-refresh every 5 seconds"
            >
              <Radio size={12} className={liveMode ? 'animate-pulse' : ''} />
              Live {liveMode && <span className="text-[10px] opacity-70">5s</span>}
            </button>

            {/* refresh */}
            <button
              onClick={() => fetchLogs()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              title="Refresh"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>

            {/* export */}
            <button
              onClick={exportCsv}
              disabled={!sortedLogs.length}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40"
              title="Export to CSV"
            >
              <Download size={12} />
            </button>
          </div>
        </div>

        {/* ── filter builder (collapsible) ── */}
        {showBuilder && (
          <div className="px-4 py-2.5 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/50 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
                <SlidersHorizontal size={11} /> Advanced Filters
              </span>
              <button
                onClick={addFilterRow}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded border border-blue-500/30 hover:border-blue-400/50 transition-colors"
              >
                <Plus size={11} /> Add row
              </button>
            </div>
            {filterRows.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)] py-0.5">No filters active. Click <strong>Add row</strong> to filter by field.</p>
            ) : (
              <div className="space-y-1.5">
                {filterRows.map((row, idx) => (
                  <div key={row.id} className="flex items-center gap-2 flex-wrap">
                    {idx > 0 && (
                      <select
                        value={row.logic}
                        onChange={e => updateFilterRow(row.id, { logic: e.target.value as 'AND'|'OR' })}
                        className="w-14 px-1 py-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded text-xs outline-none text-[var(--text-primary)]"
                      >
                        <option>AND</option><option>OR</option>
                      </select>
                    )}
                    <select
                      value={row.field}
                      onChange={e => updateFilterRow(row.id, { field: e.target.value })}
                      className="px-2 py-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded text-xs outline-none text-[var(--text-primary)]"
                    >
                      {FILTER_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                    <select
                      value={row.op}
                      onChange={e => updateFilterRow(row.id, { op: e.target.value })}
                      className="px-2 py-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded text-xs outline-none text-[var(--text-primary)]"
                    >
                      {FILTER_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {row.op !== 'is_null' && row.op !== 'is_not_null' && (
                      <input
                        type="text"
                        value={row.value}
                        onChange={e => updateFilterRow(row.id, { value: e.target.value })}
                        onKeyDown={e => e.key === 'Enter' && fetchLogs()}
                        placeholder="value"
                        className="flex-1 min-w-[120px] px-2 py-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded text-xs outline-none focus:border-blue-500 text-[var(--text-primary)]"
                      />
                    )}
                    <button onClick={() => removeFilterRow(row.id)} className="p-0.5 text-[var(--text-secondary)] hover:text-red-400 transition-colors">
                      <X size={13} />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => fetchLogs()}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => setFilterRows([])}
                    className="px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── count bar ── */}
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-[var(--border-color)] bg-[var(--bg-card)] shrink-0 text-xs text-[var(--text-secondary)]">
          {loading && !data ? (
            <span className="flex items-center gap-1.5"><RefreshCw size={11} className="animate-spin text-blue-400" /> Loading…</span>
          ) : (
            <>
              <Activity size={11} className="text-blue-400 shrink-0" />
              <span>
                <strong className="text-[var(--text-primary)]">{totalEvents.toLocaleString()}</strong> total events
                {data && <>&nbsp;&nbsp;·&nbsp;&nbsp;Showing page <strong className="text-[var(--text-primary)]">{page}</strong> / {totalPages.toLocaleString()}</>}
              </span>
              {liveMode && (
                <span className="ml-1 flex items-center gap-1 text-green-400">
                  <Radio size={10} className="animate-pulse" /> Live
                </span>
              )}
              {hasFilters && (
                <button
                  onClick={clearAll}
                  className="ml-auto flex items-center gap-1 text-[var(--text-secondary)] hover:text-red-400 transition-colors"
                >
                  <X size={10} /> Clear all filters
                </button>
              )}
            </>
          )}
        </div>

        {/* ── table ── */}
        <div className="flex-1 overflow-auto">
          {error ? (
            <div className="py-20 flex flex-col items-center gap-3 text-red-400">
              <AlertCircle size={32} />
              <div className="font-medium text-sm">Failed to load logs</div>
              <div className="text-xs text-[var(--text-secondary)]">{error}</div>
              <button onClick={() => fetchLogs()} className="mt-1 px-4 py-1.5 bg-blue-600 text-white rounded text-sm">Retry</button>
            </div>
          ) : loading && !data ? (
            <div className="py-20 flex flex-col items-center gap-3 text-[var(--text-secondary)]">
              <RefreshCw size={28} className="animate-spin text-blue-500" />
              <div className="text-sm">Loading logs…</div>
            </div>
          ) : (
            <table className="w-full text-sm text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
                <tr>
                  <th className="w-5 px-1"></th>
                  <th className={thClass} onClick={() => toggleSort('timestamp')}>
                    <span className="flex items-center">Timestamp <SortIcon field="timestamp" sortField={sortField} sortDir={sortDir} /></span>
                  </th>
                  <th className={thClass} onClick={() => toggleSort('severity')}>
                    <span className="flex items-center">Severity <SortIcon field="severity" sortField={sortField} sortDir={sortDir} /></span>
                  </th>
                  <th className={thClass} onClick={() => toggleSort('eventId')}>
                    <span className="flex items-center">Event ID <SortIcon field="eventId" sortField={sortField} sortDir={sortDir} /></span>
                  </th>
                  <th className={thStatic}>Event Name</th>
                  <th className={thClass} onClick={() => toggleSort('source')}>
                    <span className="flex items-center">Source <SortIcon field="source" sortField={sortField} sortDir={sortDir} /></span>
                  </th>
                  <th className={thClass} onClick={() => toggleSort('hostname')}>
                    <span className="flex items-center">Hostname <SortIcon field="hostname" sortField={sortField} sortDir={sortDir} /></span>
                  </th>
                  <th className={thStatic}>Src IP</th>
                  <th className={thStatic}>Dest IP</th>
                  <th className={thStatic}>User</th>
                  <th className={thStatic}>Message</th>
                  <th className={thStatic}>MITRE</th>
                </tr>
              </thead>
              <tbody>
                {!sortedLogs.length ? (
                  <tr>
                    <td colSpan={12} className="px-6 py-16 text-center text-[var(--text-secondary)] text-sm">
                      No logs match the current filters.
                    </td>
                  </tr>
                ) : sortedLogs.map(log => {
                  const sev = (log.severity || 'info').toLowerCase();
                  const isExpanded = expandedId === log.id;
                  const ts = log.timestamp ? new Date(log.timestamp) : null;
                  const dateStr = ts && !isNaN(ts.getTime())
                    ? ts.toLocaleDateString('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit' })
                    : '';
                  const timeStr = ts && !isNaN(ts.getTime())
                    ? ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
                    : '—';
                  const eventName = getEventName(log);

                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        className={`border-b border-[var(--border-color)] hover:bg-white/5 cursor-pointer transition-colors ${isExpanded ? 'bg-white/[0.04]' : ''}`}
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      >
                        {/* expand chevron */}
                        <td className="pl-2 pr-0 py-2.5">
                          {isExpanded
                            ? <ChevronDown size={13} className="text-blue-400" />
                            : <ChevronDown size={13} className="text-[var(--text-secondary)] opacity-40 rotate-[-90deg]" />
                          }
                        </td>
                        {/* timestamp */}
                        <td className="px-3 py-2.5 whitespace-nowrap font-mono text-xs">
                          <span className="text-[var(--text-secondary)]">{dateStr} </span>
                          <span className="text-blue-400">{timeStr}</span>
                        </td>
                        {/* severity */}
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border ${SEV_BADGE[sev] || SEV_BADGE.info}`}>
                            {sev.charAt(0).toUpperCase() + sev.slice(1)}
                          </span>
                        </td>
                        {/* event id */}
                        <td className="px-3 py-2.5 font-mono text-xs text-[var(--text-secondary)]">{log.eventId ?? '—'}</td>
                        {/* event name */}
                        <td className="px-3 py-2.5 text-xs max-w-[200px]">
                          <span className="text-blue-400 hover:text-blue-300 cursor-pointer truncate block" onClick={e => { e.stopPropagation(); setSelectedLog(log); }}>
                            {eventName}
                          </span>
                        </td>
                        {/* source */}
                        <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)] max-w-[120px] truncate">{log.source || '—'}</td>
                        {/* hostname */}
                        <td className="px-3 py-2.5 font-mono text-xs max-w-[140px] truncate">{log.hostname || '—'}</td>
                        {/* src ip */}
                        <td className="px-3 py-2.5 font-mono text-xs">
                          {log.sourceIp ? (
                            <button
                              onClick={e => { e.stopPropagation(); addQuickFilter('source_ip', log.sourceIp!); }}
                              className="text-[var(--text-secondary)] hover:text-blue-400 hover:underline transition-colors"
                              title="Click to filter"
                            >{log.sourceIp}</button>
                          ) : <span className="text-[var(--text-secondary)]">–</span>}
                        </td>
                        {/* dest ip */}
                        <td className="px-3 py-2.5 font-mono text-xs">
                          {log.destinationIp ? (
                            <button
                              onClick={e => { e.stopPropagation(); addQuickFilter('dest_ip', log.destinationIp!); }}
                              className="text-[var(--text-secondary)] hover:text-blue-400 hover:underline transition-colors"
                              title="Click to filter"
                            >{log.destinationIp}</button>
                          ) : <span className="text-[var(--text-secondary)]">–</span>}
                        </td>
                        {/* user */}
                        <td className="px-3 py-2.5 font-mono text-xs max-w-[120px] truncate">
                          {log.username || <span className="text-[var(--text-secondary)]">–</span>}
                        </td>
                        {/* message */}
                        <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)] max-w-[240px] truncate">
                          {log.message || '—'}
                        </td>
                        {/* mitre */}
                        <td className="px-3 py-2.5 text-xs">
                          {(log.mitreTactic || log.mitreTechnique) ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-purple-500/30 bg-purple-500/10 text-purple-400 text-[10px] font-medium">
                              <Shield size={9} /> MITRE
                            </span>
                          ) : <span className="text-[var(--text-secondary)]">–</span>}
                        </td>
                      </tr>

                      {/* inline quick summary */}
                      {isExpanded && (
                        <QuickSummary
                          log={log}
                          onOpenDetail={() => { setSelectedLog(log); setExpandedId(null); }}
                          onAddFilter={addQuickFilter}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── footer / pagination ── */}
        {data && data.pages > 0 && (
          <div className="flex items-center justify-between px-5 py-2.5 border-t border-[var(--border-color)] bg-[var(--bg-card)] shrink-0 text-xs">
            {/* rows per page */}
            <div className="flex items-center gap-2 text-[var(--text-secondary)]">
              Rows per page:
              <select
                value={limit}
                onChange={e => setLimit(Number(e.target.value))}
                className="px-2 py-0.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded text-xs text-[var(--text-primary)] outline-none ml-1"
              >
                {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* page buttons */}
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(1)} disabled={page <= 1}
                className="p-1 rounded hover:bg-white/10 disabled:opacity-30 text-[var(--text-secondary)]" title="First">
                <ChevronLeft size={13} className="inline" /><ChevronLeft size={13} className="inline -ml-2" />
              </button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="p-1 rounded hover:bg-white/10 disabled:opacity-30 text-[var(--text-secondary)]">
                <ChevronLeft size={14} />
              </button>

              {(() => {
                const total = totalPages;
                let pages: number[];
                if (total <= 7) pages = Array.from({ length: total }, (_, i) => i + 1);
                else if (page <= 4) pages = [1, 2, 3, 4, 5, -1, total];
                else if (page >= total - 3) pages = [1, -1, total - 4, total - 3, total - 2, total - 1, total];
                else pages = [1, -1, page - 1, page, page + 1, -2, total];
                return pages.map((pg, i) => pg < 0
                  ? <span key={pg + '-' + i} className="px-1 text-[var(--text-secondary)]">…</span>
                  : <button key={pg} onClick={() => setPage(pg)}
                      className={`w-7 h-6 rounded text-xs font-medium transition-colors ${pg === page ? 'bg-blue-600 text-white' : 'text-[var(--text-secondary)] hover:bg-white/10'}`}>
                      {pg}
                    </button>
                );
              })()}

              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="p-1 rounded hover:bg-white/10 disabled:opacity-30 text-[var(--text-secondary)]">
                <ChevronRight size={14} />
              </button>
              <button onClick={() => setPage(totalPages)} disabled={page >= totalPages}
                className="p-1 rounded hover:bg-white/10 disabled:opacity-30 text-[var(--text-secondary)]" title="Last">
                <ChevronRight size={13} className="inline" /><ChevronRight size={13} className="inline -ml-2" />
              </button>
            </div>

            {/* range */}
            <div className="text-[var(--text-secondary)]">
              {startItem}–{endItem} of {totalEvents.toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {/* ── slide-over detail panel ── */}
      {selectedLog && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setSelectedLog(null)} />
          <EventDetail
            log={selectedLog}
            onClose={() => setSelectedLog(null)}
            onAddFilter={addQuickFilter}
          />
        </>
      )}
    </div>
  );
}
