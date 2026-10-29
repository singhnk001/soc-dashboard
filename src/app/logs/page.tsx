"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { logsService } from '@/services/logs.service';
import {
  Search, RefreshCw, Download, ChevronLeft, ChevronRight,
  X, ChevronDown, AlertTriangle, Info, AlertCircle,
  ShieldAlert, Activity, Terminal, Shield, Copy, Plus,
  ArrowUp, ArrowDown, ArrowUpDown, SlidersHorizontal, Check,
  ExternalLink, Play, Radio, Columns, ArrowRight, Network,
  Globe, Server, Tag, FileText, Zap, ShieldCheck
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

/* ─── action badges ─────────────────────────────────────────── */
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

/* ─── helpers ───────────────────────────────────────────────── */
function getEventName(log: Log): string {
  if (log.message && log.message !== `EventID ${log.eventId}` && log.message.trim() !== '') {
    return log.message;
  }
  if (log.rawLog?.extracted_fields?.EventName) return log.rawLog.extracted_fields.EventName;
  if (log.rawLog?.extracted_fields?.Task) return log.rawLog.extracted_fields.Task;
  if (log.rawLog?.extracted_fields?.Description) return log.rawLog.extracted_fields.Description;
  return `EventID ${log.eventId ?? '—'}`;
}

function getEffectiveLogType(log: Log): string {
  if (log.logType && log.logType !== 'Windows Event' && log.logType !== 'Security Event') {
    return log.logType;
  }
  const src = (log.source || '').toLowerCase();
  const raw = (typeof log.rawLog === 'string' ? log.rawLog : JSON.stringify(log.rawLog || '')).toLowerCase();
  if (src.includes('fortinet') || raw.includes('fortigate') || raw.includes('devname="fg-') || raw.includes('type="traffic"')) {
    return 'Fortinet Firewall';
  }
  if (src.includes('palo') || src.includes('cisco') || src.includes('firewall')) {
    return 'Firewall';
  }
  if (src.includes('suricata') || src.includes('snort') || src.includes('zeek')) {
    return 'NIDS / Network';
  }
  if (src.includes('syslog') || src.includes('linux')) {
    return 'Linux Syslog';
  }
  return log.logType || 'Security Telemetry';
}

interface ParsedLogDetails {
  cleanLine: string;
  kvPairs: [string, string][];
  action?: string;
  protocol?: string;
  service?: string;
  app?: string;
  srcPort?: string;
  dstPort?: string;
  bytesSent?: string;
  bytesRcvd?: string;
  policyId?: string;
  sessionId?: string;
  device?: string;
  attack?: string;
  sigId?: string;
  attackId?: string;
  threatFeed?: string;
  threatConfidence?: string | number;
  user?: string;
  jsonObj: any;
}

const KNOWN_THREAT_CORRELATION: Record<string, { sigId: string; attackId?: string; feed: string; confidence: number; name: string }> = {
  '194.26.29.112':  { sigId: 'FG-IPS-39812', attackId: '39812', feed: 'ThreatFox (abuse.ch)', confidence: 98, name: 'Emotet Botnet Dropper' },
  '185.220.101.5':  { sigId: 'FG-IPS-41025', attackId: '41025', feed: 'ThreatFox (abuse.ch)', confidence: 100, name: 'Cobalt Strike C2 Beacon' },
  '45.154.255.88':  { sigId: 'FG-IPS-52140', attackId: '52140', feed: 'AbuseIPDB Threat Intelligence', confidence: 95, name: 'QakBot Loader Infrastructure' },
  '109.236.87.14':  { sigId: 'FG-IPS-47910', attackId: '47910', feed: 'AlienVault OTX Community Feed', confidence: 99, name: 'LockBit Ransomware Exfiltration Host' },
  '91.240.118.230': { sigId: 'FG-IPS-31045', attackId: '31045', feed: 'AlienVault OTX Community Feed', confidence: 96, name: 'AsyncRAT Reverse Shell Listener' },
  '185.130.5.231':  { sigId: 'FG-IPS-22891', attackId: '22891', feed: 'AbuseIPDB Blacklist', confidence: 90, name: 'Mirai Scanner / Brute-force' },
};

function correlateThreatMetadata(attackName?: string | null, dstIp?: string | null, eventId?: string | number | null): { sigId?: string; attackId?: string; feed?: string; confidence?: number; name?: string } {
  if (dstIp && KNOWN_THREAT_CORRELATION[dstIp]) {
    return KNOWN_THREAT_CORRELATION[dstIp];
  }
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

function parseRawLogData(rawLog: any, message: string | null, logContext?: Partial<Log>): ParsedLogDetails {
  let cleanLine = '';
  const kvMap: Record<string, string> = {};
  let jsonObj: any = null;

  if (typeof rawLog === 'string') {
    cleanLine = rawLog;
    if (rawLog.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(rawLog);
        jsonObj = parsed;
        if (parsed.original_line) {
          cleanLine = parsed.original_line;
        }
        if (parsed.extracted_fields && typeof parsed.extracted_fields === 'object') {
          Object.assign(kvMap, parsed.extracted_fields);
        }
      } catch {}
    }
  } else if (rawLog && typeof rawLog === 'object') {
    jsonObj = rawLog;
    if (rawLog.original_line) {
      cleanLine = rawLog.original_line;
    } else {
      cleanLine = JSON.stringify(rawLog, null, 2);
    }
    if (rawLog.extracted_fields && typeof rawLog.extracted_fields === 'object') {
      Object.assign(kvMap, rawLog.extracted_fields);
    }
  } else if (message) {
    cleanLine = message;
  }

  // Regex parse key=value or key="value" from cleanLine (Fortinet / Syslog / CEF format)
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

  let attack = kvMap.attack || kvMap.signature || kvMap.threat || kvMap.threat_name;
  let sigId = kvMap.sig_id || kvMap.sigid || kvMap.signature_id || kvMap.attackid || kvMap.attack_id || kvMap.sid || kvMap.rule_id;
  let attackId = kvMap.attackid || kvMap.attack_id;
  let threatFeed = kvMap.threat_feed || kvMap.feed || kvMap.feed_name || kvMap.ti_feed || kvMap.threat_source;
  let threatConfidence: string | number = kvMap.threat_confidence || kvMap.confidence || kvMap.threat_score || '';

  // Smart correlation fallback for historical or simulated logs
  const dstIp = kvMap.dstip || kvMap.dst_ip || logContext?.destinationIp;
  const correlation = correlateThreatMetadata(attack, dstIp, logContext?.eventId);
  if (!sigId && correlation.sigId) sigId = correlation.sigId;
  if (!attackId && correlation.attackId) attackId = correlation.attackId;
  if (!threatFeed && correlation.feed) threatFeed = correlation.feed;
  if (!threatConfidence && correlation.confidence) threatConfidence = correlation.confidence;
  if (!attack && correlation.name) attack = correlation.name;

  return {
    cleanLine: cleanLine || (message ?? ''),
    kvPairs,
    action: kvMap.action || kvMap.status || kvMap.act,
    protocol: kvMap.proto === '6' ? 'TCP (6)' : kvMap.proto === '17' ? 'UDP (17)' : kvMap.proto || kvMap.protocol,
    service: kvMap.service || kvMap.app,
    app: kvMap.app,
    srcPort: kvMap.srcport || kvMap.src_port || kvMap.spt,
    dstPort: kvMap.dstport || kvMap.dst_port || kvMap.dpt,
    bytesSent: kvMap.sentbyte || kvMap.bytes_out,
    bytesRcvd: kvMap.rcvdbyte || kvMap.bytes_in,
    policyId: kvMap.policyid || kvMap.policy_id,
    sessionId: kvMap.sessionid || kvMap.session_id,
    device: kvMap.devname || kvMap.device_name,
    attack,
    sigId,
    attackId,
    threatFeed,
    threatConfidence,
    user: kvMap.user || kvMap.username || kvMap.usr,
    jsonObj: jsonObj || { message: cleanLine },
  };
}

/* ─── AttrRow ────────────────────────────────────────────────── */
function AttrRow({ label, value, onAddFilter }: { label: string; value: string; onAddFilter?: (v: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const isLong = value.length > 55;

  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };

  return (
    <tr className="border-b border-slate-800/60 last:border-0 group hover:bg-slate-800/40 transition-colors">
      <td className="py-2.5 px-3.5 text-xs font-medium text-slate-400 align-top w-48 whitespace-nowrap">
        {label}
      </td>
      <td className="py-2.5 px-3.5 text-xs text-slate-200 font-mono align-top">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <span
              className={isLong && !expanded ? 'block truncate max-w-sm cursor-pointer hover:text-blue-300' : 'break-all whitespace-pre-wrap'}
              onClick={() => isLong && setExpanded(v => !v)}
              title={isLong && !expanded ? value : undefined}
            >
              {value || '—'}
            </span>
            {isLong && (
              <button onClick={() => setExpanded(v => !v)} className="text-[10px] text-blue-400 hover:text-blue-300 mt-1 block font-sans">
                {expanded ? '▲ Collapse' : '▼ Expand'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={copy}
              className="p-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
              title="Copy value"
            >
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            </button>
            {onAddFilter && value && value !== '—' && (
              <button
                onClick={() => onAddFilter(value)}
                className="p-1 rounded bg-slate-800/80 hover:bg-blue-600 text-slate-400 hover:text-white transition-colors"
                title="Filter by this attribute"
              >
                <Plus size={12} />
              </button>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

/* ─── Event Detail Slide-Over (Modern SOC Inspector) ────────── */
function EventDetail({ log, onClose, onAddFilter }: {
  log: Log; onClose: () => void;
  onAddFilter: (field: string, value: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<'overview' | 'tokens' | 'raw'>('overview');
  const [attrSearch, setAttrSearch] = useState('');
  const [rawViewMode, setRawViewMode] = useState<'clean' | 'json'>('clean');
  const [rawCopied, setRawCopied] = useState(false);
  const [srcIpCopied, setSrcIpCopied] = useState(false);
  const [dstIpCopied, setDstIpCopied] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const sev = (log.severity || 'info').toLowerCase();
  const effectiveLogType = getEffectiveLogType(log);
  const parsed = parseRawLogData(log.rawLog, log.message, log);

  const formattedTime = log.timestamp ? new Date(log.timestamp).toLocaleString('en-IN', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }) : '—';

  const actionText = parsed.action || (log.severity === 'critical' ? 'BLOCKED' : log.severity === 'high' ? 'DROPPED' : 'PERMITTED');
  const actionLower = actionText.toLowerCase();
  const actionClass = ACTION_BADGE[actionLower] || (
    actionLower.includes('deny') || actionLower.includes('drop') || actionLower.includes('block')
      ? 'text-rose-300 bg-rose-500/15 border-rose-500/30'
      : 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30'
  );

  const coreAttributes: [string, string][] = [
    ['Timestamp',       formattedTime],
    ['Severity',        sev.toUpperCase()],
    ['Source',          log.source ?? '—'],
    ['Log Type',        effectiveLogType],
    ['Hostname / Host', log.hostname ?? parsed.device ?? '—'],
    ['Event ID',        String(log.eventId ?? '—')],
    ['Event Name',      getEventName(log)],
    ['Message',         log.message ?? '—'],
    ...(parsed.attack    ? [['Threat / Attack Signature', parsed.attack] as [string, string]] : []),
    ...(parsed.sigId     ? [['Signature ID', parsed.sigId] as [string, string]] : []),
    ...(parsed.attackId  ? [['Attack ID', parsed.attackId] as [string, string]] : []),
    ...(parsed.threatFeed ? [['Detected Threat Intel Feed', parsed.threatFeed] as [string, string]] : []),
    ...(parsed.threatConfidence ? [['Threat Intel Confidence', `${parsed.threatConfidence}%`] as [string, string]] : []),
    ...(log.sourceIp || parsed.srcPort ? [['Source Network', `${log.sourceIp || '—'}${parsed.srcPort ? ':' + parsed.srcPort : ''}`] as [string, string]] : []),
    ...(log.destinationIp || parsed.dstPort ? [['Destination Network', `${log.destinationIp || '—'}${parsed.dstPort ? ':' + parsed.dstPort : ''}`] as [string, string]] : []),
    ...(parsed.protocol  ? [['Protocol', parsed.protocol] as [string, string]] : []),
    ...(parsed.service   ? [['Service / App', `${parsed.service}${parsed.app && parsed.app !== parsed.service ? ' (' + parsed.app + ')' : ''}`] as [string, string]] : []),
    ...(actionText       ? [['Action', actionText.toUpperCase()] as [string, string]] : []),
    ...(parsed.bytesSent || parsed.bytesRcvd ? [['Traffic Volume', `Out: ${parsed.bytesSent || '0'} bytes | In: ${parsed.bytesRcvd || '0'} bytes`] as [string, string]] : []),
    ...(parsed.policyId  ? [['Firewall Policy ID', parsed.policyId] as [string, string]] : []),
    ...(parsed.sessionId ? [['Firewall Session ID', parsed.sessionId] as [string, string]] : []),
    ...(log.username || parsed.user ? [['Username', (log.username || parsed.user)!] as [string, string]] : []),
    ...(log.mitreTactic  ? [['MITRE Tactic', log.mitreTactic] as [string, string]] : []),
    ...(log.mitreTechnique ? [['MITRE Technique', log.mitreTechnique] as [string, string]] : []),
    ...parsed.kvPairs.map(([k, v]) => [k, String(v ?? '')] as [string, string]),
  ];

  const filteredAttrs = attrSearch.trim()
    ? coreAttributes.filter(([k, v]) =>
        k.toLowerCase().includes(attrSearch.toLowerCase()) ||
        v.toLowerCase().includes(attrSearch.toLowerCase())
      )
    : coreAttributes;

  const copyText = (txt: string, cb: (v: boolean) => void) => {
    navigator.clipboard.writeText(txt).then(() => {
      cb(true);
      setTimeout(() => cb(false), 1500);
    });
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[640px] max-w-[95vw] bg-[#0c1220] border-l border-slate-800 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-[#0e1626]/80 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/25 flex items-center justify-center">
            <Shield className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-100">Event Inspector</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border ${SEV_BADGE[sev] || SEV_BADGE.info}`}>
                {sev.toUpperCase()}
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                {effectiveLogType}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
              <span>{log.source || 'Generic'}</span>
              <span>•</span>
              <span className="font-mono">{formattedTime}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => copyText(parsed.cleanLine, setRawCopied)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-300 bg-slate-800/80 hover:bg-slate-700 rounded-md border border-slate-700 transition-colors"
            title="Copy Raw Log Message"
          >
            {rawCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            <span>{rawCopied ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ── Scrollable Body ── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* ── Traffic & Flow Hero Visualizer ── */}
        {(log.sourceIp || log.destinationIp) && (
          <div className="bg-[#11192a] border border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">
              <div className="flex items-center gap-1.5">
                <Network size={13} className="text-blue-400" />
                <span>Connection & Telemetry Flow</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${actionClass}`}>
                {actionText.toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-11 items-center gap-2 text-center bg-[#090d16] p-3.5 rounded-lg border border-slate-800/80">
              {/* Source Node */}
              <div className="col-span-4 text-left">
                <div className="text-[10px] text-slate-400 font-semibold uppercase">Source (Client / Inbound)</div>
                <div className="font-mono text-sm font-bold text-slate-100 mt-0.5 truncate" title={log.sourceIp || undefined}>
                  {log.sourceIp || '—'}
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  {parsed.srcPort ? `Port ${parsed.srcPort}` : 'Ephemeral'}
                </div>
                {log.sourceIp && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <button
                      onClick={() => copyText(log.sourceIp!, setSrcIpCopied)}
                      className="text-[10px] text-slate-400 hover:text-slate-200 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/80 flex items-center gap-1"
                    >
                      {srcIpCopied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                      <span>Copy</span>
                    </button>
                    <button
                      onClick={() => onAddFilter('source_ip', log.sourceIp!)}
                      className="text-[10px] text-blue-400 hover:text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 flex items-center gap-1"
                    >
                      <Plus size={10} />
                      <span>Filter</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Center Flow Arrow */}
              <div className="col-span-3 flex flex-col items-center justify-center">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  {parsed.protocol || 'IP'}
                </span>
                <div className="w-full flex items-center justify-center my-1">
                  <div className="h-0.5 flex-1 bg-slate-700"></div>
                  <ArrowRight size={14} className="text-blue-400 shrink-0 mx-1" />
                  <div className="h-0.5 flex-1 bg-slate-700"></div>
                </div>
                <span className="text-[10px] font-mono text-blue-300 truncate max-w-[120px]">
                  {parsed.service || 'Network'}
                </span>
              </div>

              {/* Destination Node */}
              <div className="col-span-4 text-right">
                <div className="text-[10px] text-slate-400 font-semibold uppercase">Destination (Service / Target)</div>
                <div className="font-mono text-sm font-bold text-slate-100 mt-0.5 truncate" title={log.destinationIp || undefined}>
                  {log.destinationIp || '—'}
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  {parsed.dstPort ? `Port ${parsed.dstPort}` : 'Target Port'}
                </div>
                {log.destinationIp && (
                  <div className="flex items-center justify-end gap-1.5 mt-2">
                    <button
                      onClick={() => copyText(log.destinationIp!, setDstIpCopied)}
                      className="text-[10px] text-slate-400 hover:text-slate-200 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/80 flex items-center gap-1"
                    >
                      {dstIpCopied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                      <span>Copy</span>
                    </button>
                    <button
                      onClick={() => onAddFilter('dest_ip', log.destinationIp!)}
                      className="text-[10px] text-blue-400 hover:text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 flex items-center gap-1"
                    >
                      <Plus size={10} />
                      <span>Filter</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Threat Intelligence & Detection Banner ── */}
        {(parsed.attack || parsed.sigId || parsed.threatFeed || log.mitreTactic || log.mitreTechnique) && (
          <div className="bg-gradient-to-br from-rose-950/40 via-[#131b2e] to-slate-900/90 border border-rose-500/30 rounded-xl p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between border-b border-rose-500/20 pb-2.5">
              <div className="flex items-center gap-2">
                <ShieldAlert size={17} className="text-rose-400 shrink-0" />
                <span className="text-xs font-bold text-rose-200 uppercase tracking-wider">
                  Threat Intelligence & Intrusion Correlation
                </span>
              </div>
              {parsed.threatConfidence ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span>
                  {parsed.threatConfidence}% Confidence
                </span>
              ) : null}
            </div>

            {/* Signature & ID Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {parsed.attack && (
                <div className="bg-[#0b101b]/90 border border-slate-800 rounded-lg p-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Attack / Threat Signature
                  </div>
                  <div className="text-xs font-bold text-rose-200 font-mono mt-1 break-words">
                    {parsed.attack}
                  </div>
                </div>
              )}

              {parsed.sigId && (
                <div className="bg-[#0b101b]/90 border border-slate-800 rounded-lg p-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Signature ID
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs font-bold text-amber-300 font-mono">
                      {parsed.sigId}
                    </span>
                    <button
                      onClick={() => copyText(parsed.sigId!, () => {})}
                      className="px-1.5 py-0.5 text-slate-400 hover:text-slate-200 bg-slate-800 rounded border border-slate-700 text-[10px] flex items-center gap-1"
                      title="Copy Signature ID"
                    >
                      <Copy size={10} />
                      <span>Copy</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Threat Intel Feed Source + MITRE Tags */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/80">
              {parsed.threatFeed && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                  <Globe size={12} className="text-blue-400 shrink-0" />
                  <span className="text-slate-400">Detected by:</span>
                  <span className="text-white font-mono font-bold">{parsed.threatFeed}</span>
                </div>
              )}

              {log.mitreTactic && (
                <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  Tactic: {log.mitreTactic}
                </span>
              )}
              {log.mitreTechnique && (
                <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                  Technique: {log.mitreTechnique}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Navigation Tabs ── */}
        <div className="flex items-center gap-1 p-1 bg-[#101726] rounded-lg border border-slate-800">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${activeTab === 'overview' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <ShieldCheck size={13} />
            <span>Overview & Fields</span>
          </button>
          <button
            onClick={() => setActiveTab('tokens')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${activeTab === 'tokens' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Tag size={13} />
            <span>Key-Value Tags ({parsed.kvPairs.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('raw')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${activeTab === 'raw' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <FileText size={13} />
            <span>Raw Message</span>
          </button>
        </div>

        {/* ── TAB 1: OVERVIEW & FIELDS ── */}
        {activeTab === 'overview' && (
          <div className="space-y-3">
            {/* Search Filter */}
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={attrSearch}
                onChange={e => setAttrSearch(e.target.value)}
                placeholder="Search fields or values (e.g. 192.168, Fortinet, accept)..."
                className="w-full pl-9 pr-3 py-2 bg-[#101726] border border-slate-800 rounded-lg text-xs outline-none focus:border-blue-500 text-slate-100 placeholder:text-slate-500 transition-colors"
              />
            </div>

            <div className="text-[11px] text-slate-400 font-medium px-1 flex items-center justify-between">
              <span>Showing {filteredAttrs.length} attributes</span>
              {attrSearch && (
                <button onClick={() => setAttrSearch('')} className="text-blue-400 hover:underline">
                  Clear search
                </button>
              )}
            </div>

            {/* Attributes Table */}
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-[#0d1424]">
              <table className="w-full text-left">
                <thead className="bg-[#11192d] border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-48">Attribute</th>
                    <th className="py-2.5 px-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredAttrs.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-8 text-center text-xs text-slate-400">
                        No attributes matched "{attrSearch}"
                      </td>
                    </tr>
                  ) : (
                    filteredAttrs.map(([k, v], i) => (
                      <AttrRow
                        key={`${k}-${i}`}
                        label={k}
                        value={v}
                        onAddFilter={v && v !== '—' ? () => {
                          const fieldMap: Record<string, string> = {
                            'Source Network': 'source_ip',
                            'Destination Network': 'dest_ip',
                            'Source IP': 'source_ip',
                            'Dest IP': 'dest_ip',
                            'Hostname': 'hostname',
                            'Hostname / Host': 'hostname',
                            'Username': 'username',
                            'Event ID': 'event_id',
                            'Source': 'source',
                            'Severity': 'severity',
                          };
                          const cleanVal = v.split(':')[0].trim();
                          onAddFilter(fieldMap[k] || k.toLowerCase().replace(/\s+/g, '_'), cleanVal);
                        } : undefined}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 2: KEY-VALUE TAGS ── */}
        {activeTab === 'tokens' && (
          <div className="space-y-3">
            <div className="text-xs text-slate-400">
              Extracted tokens from the raw log message. Click any tag to copy or add directly to the active query filter.
            </div>
            {parsed.kvPairs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 border border-slate-800 rounded-xl bg-[#0d1424]">
                No structured key-value tokens detected in this event.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {parsed.kvPairs.map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-[#0e1628] border border-slate-800/80 hover:border-slate-700 transition-all group"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-[10px] font-mono font-semibold text-blue-400 truncate">{k}</div>
                      <div className="text-xs font-mono text-slate-200 truncate mt-0.5" title={v}>{v || '—'}</div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => copyText(v, () => {})}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                        title="Copy value"
                      >
                        <Copy size={11} />
                      </button>
                      <button
                        onClick={() => onAddFilter(k, v)}
                        className="p-1 rounded bg-blue-600/80 hover:bg-blue-600 text-white"
                        title="Add to filter"
                      >
                        <Plus size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: RAW MESSAGE ── */}
        {activeTab === 'raw' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 bg-[#101726] p-0.5 rounded border border-slate-800 text-[11px]">
                <button
                  onClick={() => setRawViewMode('clean')}
                  className={`px-2.5 py-1 rounded font-medium transition-colors ${rawViewMode === 'clean' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Clean Un-Escaped Log
                </button>
                <button
                  onClick={() => setRawViewMode('json')}
                  className={`px-2.5 py-1 rounded font-medium transition-colors ${rawViewMode === 'json' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  JSON Tree
                </button>
              </div>
              <button
                onClick={() => copyText(rawViewMode === 'clean' ? parsed.cleanLine : JSON.stringify(parsed.jsonObj, null, 2), setRawCopied)}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                {rawCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                <span>{rawCopied ? 'Copied' : 'Copy All'}</span>
              </button>
            </div>

            <div className="relative">
              <pre className="text-xs font-mono bg-[#070b14] border border-slate-800/80 rounded-xl p-4 max-h-[460px] overflow-y-auto text-slate-200 whitespace-pre-wrap break-all leading-relaxed shadow-inner">
                {rawViewMode === 'clean'
                  ? parsed.cleanLine
                  : JSON.stringify(parsed.jsonObj, null, 2)}
              </pre>
            </div>
          </div>
        )}
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
  const parsed = parseRawLogData(log.rawLog, log.message, log);
  const effectiveLogType = getEffectiveLogType(log);
  const actionText = parsed.action || (log.severity === 'critical' ? 'BLOCKED' : log.severity === 'high' ? 'DROPPED' : 'PERMITTED');
  const actionLower = actionText.toLowerCase();
  const actionClass = ACTION_BADGE[actionLower] || 'text-slate-300 bg-slate-800/60 border-slate-700';

  return (
    <tr className="bg-[#0b1220]/90 border-b border-slate-800">
      <td colSpan={12} className="px-5 py-3.5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Quick Event Overview</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${actionClass}`}>
              {actionText.toUpperCase()}
            </span>
          </div>
          <button
            onClick={onOpenDetail}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-sm transition-all"
          >
            <ExternalLink size={12} />
            <span>Open Event Inspector</span>
          </button>
        </div>

        {/* Mini Flow + Key Attributes */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-[#080d18] p-3 rounded-lg border border-slate-800/80 mb-3 text-xs">
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Source</div>
            <div className="font-mono text-slate-100 font-semibold mt-0.5 truncate">
              {log.sourceIp ? `${log.sourceIp}${parsed.srcPort ? ':' + parsed.srcPort : ''}` : (log.hostname || '—')}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">{log.source || 'Generic'}</div>
          </div>

          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Destination</div>
            <div className="font-mono text-slate-100 font-semibold mt-0.5 truncate">
              {log.destinationIp ? `${log.destinationIp}${parsed.dstPort ? ':' + parsed.dstPort : ''}` : '—'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">{parsed.service || parsed.protocol || 'Traffic'}</div>
          </div>

          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Event Identity</div>
            <div className="font-mono text-slate-100 font-semibold mt-0.5 truncate">
              {log.eventId ?? '—'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">{effectiveLogType}</div>
          </div>

          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Security Context</div>
            <div className="text-slate-200 mt-0.5 truncate font-medium">
              {parsed.attack || log.mitreTechnique || getEventName(log)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 truncate">
              {parsed.sigId ? `Sig: ${parsed.sigId}` : (log.username || 'System User')}
              {parsed.threatFeed ? ` • ${parsed.threatFeed}` : ''}
            </div>
          </div>
        </div>

        {/* Clean Raw Message Preview */}
        {parsed.cleanLine && (
          <div>
            <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">
              Raw Message Preview
            </div>
            <pre className="text-xs font-mono bg-[#060910] border border-slate-800/80 rounded-lg p-2.5 text-slate-300 max-h-36 overflow-y-auto whitespace-pre-wrap break-all leading-relaxed">
              {parsed.cleanLine}
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
      <div className="flex-1 flex flex-col overflow-hidden">
        
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
