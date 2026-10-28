'use client';

import React, { useState } from 'react';
import useSWR, { mutate } from 'swr';
import {
  Zap, Plus, Trash2, Play, ToggleLeft, ToggleRight,
  ChevronDown, ChevronUp, CheckCircle, XCircle, Clock,
  AlertTriangle, Bell, Shield, Server, Mail, Wifi
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface PlaybookAction {
  type: string;
  name: string;
  webhook_url?: string;
  domain?: string;
  username?: string;
  pfsense_url?: string;
  api_key?: string;
  api_token?: string;
  alias_name?: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_pass?: string;
  to?: string;
}

interface Playbook {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger_severity: string;
  trigger_keyword: string;
  actions: PlaybookAction[];
  created_at: string;
  updated_at: string;
}

interface Execution {
  id: string;
  playbook_id: string;
  playbook_name: string;
  alert_id: string | null;
  triggered_at: string;
  status: 'success' | 'partial' | 'failed' | 'running';
  results: Array<{ action: string; action_name: string; status: string; error?: string; output?: string }>;
  error: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ACTION_TYPES = [
  { value: 'slack',            label: 'Slack Webhook',            icon: Bell,        fields: ['webhook_url'] },
  { value: 'teams',            label: 'Microsoft Teams Webhook',  icon: Bell,        fields: ['webhook_url'] },
  { value: 'webhook',          label: 'Generic HTTP Webhook',     icon: Wifi,        fields: ['webhook_url'] },
  { value: 'disable_ad_user',  label: 'Disable AD User',         icon: Shield,      fields: ['domain'] },
  { value: 'block_ip_windows', label: 'Block IP (Windows FW)',    icon: Server,      fields: [] },
  { value: 'block_ip_pfsense', label: 'Block IP (pfSense)',       icon: Server,      fields: ['pfsense_url', 'api_key', 'api_token', 'alias_name'] },
  { value: 'email',            label: 'Send Email (SMTP)',        icon: Mail,        fields: ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'to'] },
];

const SEV_LEVELS = ['low', 'medium', 'high', 'critical'];

const SEV_COLOR: Record<string, string> = {
  low:      'text-[var(--accent-green)] bg-green-900/30',
  medium:   'text-yellow-400 bg-yellow-900/30',
  high:     'text-orange-400 bg-orange-900/30',
  critical: 'text-red-400 bg-red-900/30',
};

const EXEC_COLOR: Record<string, string> = {
  success: 'text-[var(--accent-green)]',
  partial: 'text-yellow-400',
  failed:  'text-red-400',
  running: 'text-blue-400',
};

// ── Fetcher ───────────────────────────────────────────────────────────────────

const fetcher = (url: string) =>
  fetch(url).then(r => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  }).catch(() => null);

// ── Empty action template ─────────────────────────────────────────────────────

function emptyAction(): PlaybookAction {
  return { type: 'slack', name: '', webhook_url: '' };
}

// ── Action Config Fields ──────────────────────────────────────────────────────

function ActionFields({ action, onChange }: { action: PlaybookAction; onChange: (a: PlaybookAction) => void }) {
  const def = ACTION_TYPES.find(t => t.value === action.type);
  if (!def) return null;
  const fields = def.fields;

  return (
    <div className="grid grid-cols-1 gap-2 mt-2">
      {fields.includes('webhook_url') && (
        <input
          className="input-field text-xs"
          placeholder="Webhook URL (https://hooks.slack.com/...)"
          value={action.webhook_url || ''}
          onChange={e => onChange({ ...action, webhook_url: e.target.value })}
        />
      )}
      {fields.includes('domain') && (
        <input
          className="input-field text-xs"
          placeholder="AD Domain (e.g. corp.local) — leave blank to use username only"
          value={action.domain || ''}
          onChange={e => onChange({ ...action, domain: e.target.value })}
        />
      )}
      {fields.includes('pfsense_url') && (
        <input
          className="input-field text-xs"
          placeholder="pfSense URL (e.g. https://192.168.1.1)"
          value={action.pfsense_url || ''}
          onChange={e => onChange({ ...action, pfsense_url: e.target.value })}
        />
      )}
      {fields.includes('api_key') && (
        <input
          className="input-field text-xs"
          placeholder="pfSense API Key / Client-ID"
          value={action.api_key || ''}
          onChange={e => onChange({ ...action, api_key: e.target.value })}
        />
      )}
      {fields.includes('api_token') && (
        <input
          className="input-field text-xs"
          placeholder="pfSense API Token"
          value={action.api_token || ''}
          onChange={e => onChange({ ...action, api_token: e.target.value })}
        />
      )}
      {fields.includes('alias_name') && (
        <input
          className="input-field text-xs"
          placeholder="pfSense Alias Name (default: SOC_Blocked_IPs)"
          value={action.alias_name || 'SOC_Blocked_IPs'}
          onChange={e => onChange({ ...action, alias_name: e.target.value })}
        />
      )}
      {fields.includes('smtp_host') && (
        <div className="grid grid-cols-3 gap-2">
          <input className="input-field text-xs col-span-2" placeholder="SMTP Host" value={action.smtp_host || ''} onChange={e => onChange({ ...action, smtp_host: e.target.value })} />
          <input className="input-field text-xs" placeholder="Port" type="number" value={action.smtp_port || 587} onChange={e => onChange({ ...action, smtp_port: parseInt(e.target.value) })} />
        </div>
      )}
      {fields.includes('smtp_user') && (
        <div className="grid grid-cols-2 gap-2">
          <input className="input-field text-xs" placeholder="SMTP Username" value={action.smtp_user || ''} onChange={e => onChange({ ...action, smtp_user: e.target.value })} />
          <input className="input-field text-xs" placeholder="SMTP Password" type="password" value={action.smtp_pass || ''} onChange={e => onChange({ ...action, smtp_pass: e.target.value })} />
        </div>
      )}
      {fields.includes('to') && (
        <input className="input-field text-xs" placeholder="To address (email@example.com)" value={action.to || ''} onChange={e => onChange({ ...action, to: e.target.value })} />
      )}
    </div>
  );
}

// ── Playbook Form ─────────────────────────────────────────────────────────────

function PlaybookForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [triggerSev, setTriggerSev] = useState('critical');
  const [keyword, setKeyword] = useState('');
  const [actions, setActions] = useState<PlaybookAction[]>([emptyAction()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateAction = (i: number, a: PlaybookAction) => {
    const next = [...actions];
    next[i] = a;
    setActions(next);
  };

  const removeAction = (i: number) => setActions(actions.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (actions.length === 0) { setError('Add at least one action'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/playbooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: desc, trigger_severity: triggerSev, trigger_keyword: keyword, actions }),
      });
      if (!res.ok) throw new Error(await res.text());
      mutate('/api/playbooks');
      onSave();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 space-y-4">
      <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
        <Zap size={16} className="text-[var(--accent-blue)]" /> New Playbook
      </h3>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[var(--text-secondary)] mb-1 block">Name *</label>
          <input className="input-field" placeholder="e.g. Brute Force Auto-Response" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-[var(--text-secondary)] mb-1 block">Trigger when severity ≥</label>
          <select className="input-field" value={triggerSev} onChange={e => setTriggerSev(e.target.value)}>
            {SEV_LEVELS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1 block">Description</label>
        <input className="input-field" placeholder="What does this playbook do?" value={desc} onChange={e => setDesc(e.target.value)} />
      </div>

      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
          Keyword filter <span className="text-gray-500">(optional — only fire when alert title/desc contains this)</span>
        </label>
        <input className="input-field" placeholder="e.g. brute force, TI Match, lateral movement" value={keyword} onChange={e => setKeyword(e.target.value)} />
      </div>

      {/* Actions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-[var(--text-secondary)] font-medium">Actions (executed in order)</label>
          <button onClick={() => setActions([...actions, emptyAction()])} className="text-xs text-[var(--accent-blue)] hover:underline flex items-center gap-1">
            <Plus size={12} /> Add action
          </button>
        </div>
        <div className="space-y-3">
          {actions.map((action, i) => (
            <div key={i} className="bg-[var(--bg-secondary)] rounded p-3 border border-[var(--border-color)]">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-secondary)] w-4">{i + 1}.</span>
                <input
                  className="input-field text-xs flex-1"
                  placeholder="Action label (e.g. Notify SOC Team)"
                  value={action.name}
                  onChange={e => updateAction(i, { ...action, name: e.target.value })}
                />
                <select
                  className="input-field text-xs w-48"
                  value={action.type}
                  onChange={e => updateAction(i, { ...emptyAction(), name: action.name, type: e.target.value })}
                >
                  {ACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <button onClick={() => removeAction(i)} className="text-red-400 hover:text-red-300 p-1">
                  <Trash2 size={14} />
                </button>
              </div>
              <ActionFields action={action} onChange={a => updateAction(i, a)} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-[var(--accent-blue)] text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Create Playbook'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-primary)]">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Execution Row ─────────────────────────────────────────────────────────────

function ExecutionRow({ exec }: { exec: Execution }) {
  const [open, setOpen] = useState(false);
  const ts = exec.triggered_at ? new Date(exec.triggered_at) : null;

  const StatusIcon = exec.status === 'success' ? CheckCircle :
    exec.status === 'failed' ? XCircle :
    exec.status === 'running' ? Clock : AlertTriangle;

  return (
    <div className="border border-[var(--border-color)] rounded">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors"
      >
        <StatusIcon size={14} className={EXEC_COLOR[exec.status]} />
        <span className="text-xs text-[var(--text-primary)] flex-1 truncate">{exec.playbook_name || exec.playbook_id}</span>
        <span className="text-xs text-[var(--text-secondary)] hidden sm:block">
          {ts ? ts.toLocaleString() : '—'}
        </span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${EXEC_COLOR[exec.status]}`}>
          {exec.status}
        </span>
        {open ? <ChevronUp size={14} className="text-[var(--text-secondary)]" /> : <ChevronDown size={14} className="text-[var(--text-secondary)]" />}
      </button>

      {open && (
        <div className="border-t border-[var(--border-color)] px-4 py-3 space-y-2 bg-[var(--bg-secondary)]">
          {exec.alert_id && (
            <p className="text-xs text-[var(--text-secondary)]">Alert ID: <span className="font-mono text-[var(--text-primary)]">{exec.alert_id}</span></p>
          )}
          {exec.results.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              {r.status === 'success'
                ? <CheckCircle size={12} className="text-[var(--accent-green)] mt-0.5 shrink-0" />
                : r.status === 'skipped'
                ? <AlertTriangle size={12} className="text-yellow-400 mt-0.5 shrink-0" />
                : <XCircle size={12} className="text-red-400 mt-0.5 shrink-0" />}
              <div className="flex-1">
                <span className="text-[var(--text-primary)] font-medium">{r.action_name || r.action}</span>
                {r.output && <p className="text-[var(--text-secondary)] mt-0.5 font-mono">{r.output}</p>}
                {r.error && <p className="text-red-400 mt-0.5">{r.error}</p>}
              </div>
            </div>
          ))}
          {exec.error && <p className="text-red-400 text-xs">{exec.error}</p>}
        </div>
      )}
    </div>
  );
}

// ── Playbook Card ─────────────────────────────────────────────────────────────

function PlaybookCard({ pb, onDeleted, onTested }: { pb: Playbook; onDeleted: () => void; onTested: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const toggle = async () => {
    await fetch(`/api/playbooks/${pb.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !pb.enabled }),
    });
    mutate('/api/playbooks');
  };

  const del = async () => {
    if (!confirm(`Delete playbook "${pb.name}"?`)) return;
    await fetch(`/api/playbooks/${pb.id}`, { method: 'DELETE' });
    onDeleted();
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/playbooks/${pb.id}/test`, { method: 'POST' });
      const data = await res.json();
      const passed = data.results?.filter((r: {status:string}) => r.status === 'success').length ?? 0;
      const total  = data.results?.length ?? 0;
      setTestResult(`${data.status} — ${passed}/${total} actions passed`);
      onTested();
    } catch {
      setTestResult('Test failed — check API');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className={`bg-[var(--bg-card)] border rounded-lg transition-colors ${pb.enabled ? 'border-[var(--border-color)]' : 'border-gray-700 opacity-60'}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Zap size={16} className={pb.enabled ? 'text-[var(--accent-blue)]' : 'text-gray-600'} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-medium text-[var(--text-primary)] truncate">{pb.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEV_COLOR[pb.trigger_severity] || 'text-gray-400 bg-gray-900/30'}`}>
              ≥ {pb.trigger_severity}
            </span>
            {pb.trigger_keyword && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-300">
                keyword: {pb.trigger_keyword}
              </span>
            )}
          </div>
          {pb.description && <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">{pb.description}</p>}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={test}
            disabled={testing}
            title="Test run"
            className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--accent-green)] disabled:opacity-40"
          >
            <Play size={14} />
          </button>
          <button
            onClick={toggle}
            title={pb.enabled ? 'Disable' : 'Enable'}
            className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
          >
            {pb.enabled
              ? <ToggleRight size={20} className="text-[var(--accent-blue)]" />
              : <ToggleLeft size={20} />}
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            title="Expand"
            className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            onClick={del}
            title="Delete"
            className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-red-400"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Test result banner */}
      {testResult && (
        <div className="mx-4 mb-2 px-3 py-1.5 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs text-[var(--text-secondary)]">
          Test result: <span className="text-[var(--text-primary)] font-medium">{testResult}</span>
        </div>
      )}

      {/* Expanded: actions list */}
      {expanded && (
        <div className="border-t border-[var(--border-color)] px-4 py-3 space-y-2">
          <p className="text-xs text-[var(--text-secondary)] font-medium mb-1">Actions ({pb.actions.length})</p>
          {pb.actions.length === 0 && <p className="text-xs text-gray-500">No actions configured.</p>}
          {pb.actions.map((a, i) => {
            const def = ACTION_TYPES.find(t => t.value === a.type);
            const Icon = def?.icon || Zap;
            return (
              <div key={i} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <span className="text-gray-600 w-4">{i + 1}.</span>
                <Icon size={12} className="shrink-0" />
                <span className="text-[var(--text-primary)]">{a.name || def?.label || a.type}</span>
                <span className="text-gray-600">— {def?.label || a.type}</span>
                {a.webhook_url && <span className="text-blue-400 truncate max-w-[200px]">{a.webhook_url}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PlaybooksPage() {
  const { data: playbooks, mutate: mutatePB } = useSWR<Playbook[]>('/api/playbooks', fetcher, { refreshInterval: 10000 });
  const { data: executions, mutate: mutateExec } = useSWR<Execution[]>('/api/playbooks/executions?limit=30', fetcher, { refreshInterval: 5000 });
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<'playbooks' | 'history'>('playbooks');

  const pbs = playbooks || [];
  const execs = executions || [];
  const enabledCount = pbs.filter(p => p.enabled).length;
  const recentSuccess = execs.filter(e => e.status === 'success').length;
  const recentFailed  = execs.filter(e => e.status === 'failed').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Zap className="text-[var(--accent-blue)]" size={22} />
            SOAR Playbooks
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Automated response playbooks — fire on alerts, block IPs, disable accounts, notify teams.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setTab('playbooks'); }}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-blue)] text-white rounded-lg text-sm font-medium hover:opacity-90"
        >
          <Plus size={16} /> New Playbook
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Playbooks', value: pbs.length, color: 'text-[var(--accent-blue)]' },
          { label: 'Active',          value: enabledCount, color: 'text-[var(--accent-green)]' },
          { label: 'Successful Runs', value: recentSuccess, color: 'text-[var(--accent-green)]' },
          { label: 'Failed Runs',     value: recentFailed,  color: 'text-red-400' },
        ].map(s => (
          <div key={s.label} className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg px-4 py-3">
            <p className="text-xs text-[var(--text-secondary)]">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* New playbook form */}
      {showForm && (
        <PlaybookForm
          onSave={() => { setShowForm(false); mutatePB(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border-color)]">
        {(['playbooks', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize transition-colors border-b-2 ${
              tab === t
                ? 'border-[var(--accent-blue)] text-[var(--accent-blue)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t === 'history' ? 'Execution History' : 'Playbooks'}
            {t === 'history' && execs.length > 0 && (
              <span className="ml-1.5 text-xs bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded-full">{execs.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Playbooks tab */}
      {tab === 'playbooks' && (
        <div className="space-y-3">
          {pbs.length === 0 && !showForm && (
            <div className="text-center py-16 text-[var(--text-secondary)]">
              <Zap size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No playbooks yet.</p>
              <p className="text-xs mt-1">Create one to automate responses to critical alerts.</p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-4 px-4 py-2 border border-[var(--border-color)] rounded text-sm hover:bg-[var(--bg-hover)]"
              >
                <Plus size={14} className="inline mr-1" /> Create first playbook
              </button>
            </div>
          )}
          {pbs.map(pb => (
            <PlaybookCard
              key={pb.id}
              pb={pb}
              onDeleted={() => mutatePB()}
              onTested={() => mutateExec()}
            />
          ))}
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div className="space-y-2">
          {execs.length === 0 && (
            <div className="text-center py-12 text-[var(--text-secondary)]">
              <Clock size={36} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No executions yet.</p>
              <p className="text-xs mt-1">Playbooks fire automatically when matching alerts are created, or manually via Test.</p>
            </div>
          )}
          {execs.map(e => <ExecutionRow key={e.id} exec={e} />)}
        </div>
      )}

      {/* How it works */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4">
        <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">How Playbooks Work</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-[var(--text-secondary)]">
          <div className="flex gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-900/40 text-[var(--accent-blue)] flex items-center justify-center text-xs font-bold shrink-0">1</span>
            <div>
              <p className="text-[var(--text-primary)] font-medium">Alert is created</p>
              <p>Any alert from log ingestion, use case match, or TI IOC detection triggers the engine.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-900/40 text-[var(--accent-blue)] flex items-center justify-center text-xs font-bold shrink-0">2</span>
            <div>
              <p className="text-[var(--text-primary)] font-medium">Playbook matches</p>
              <p>Engine checks severity ≥ trigger level and optional keyword in the alert title/description.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-900/40 text-[var(--accent-blue)] flex items-center justify-center text-xs font-bold shrink-0">3</span>
            <div>
              <p className="text-[var(--text-primary)] font-medium">Actions execute</p>
              <p>Slack/Teams notify, Windows Firewall blocks the src IP, AD account is disabled — all logged here.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
