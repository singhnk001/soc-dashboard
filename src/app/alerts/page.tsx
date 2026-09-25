'use client';

import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ShieldAlert, Clock, CheckCircle2, List, Loader2, ThumbsUp, ThumbsDown, Save, ChevronDown, ChevronRight, Download } from 'lucide-react';
import useSWR, { mutate } from 'swr';

const fetcher = (url: string) => fetch(url).then(res => res.json());

const severityBadge: Record<string, string> = {
  critical: 'bg-red-500 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-black',
  low: 'bg-green-500 text-white',
  info: 'bg-gray-500 text-white',
};

const statusBadge: Record<string, string> = {
  new: 'text-red-400',
  investigating: 'text-yellow-400',
  resolved: 'text-green-400',
  false_positive: 'text-gray-400',
};

export default function AlertsPage() {
  const [filter, setFilter] = useState<'all' | 'new' | 'investigating' | 'resolved'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionType, setResolutionType] = useState('true_positive');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const statusParam = filter !== 'all' ? `&status=${filter}` : '';
  const { data, isLoading } = useSWR(
    `/api/alerts?limit=200${statusParam}`,
    fetcher, { refreshInterval: 5000 }
  );
  const { data: statsData } = useSWR('/api/stats', fetcher, { refreshInterval: 5000 });

  const alerts = data?.data || [];

  const updateStatus = async (alertId: string, newStatus: string, rType?: string, alertNotes?: string) => {
    setIsSubmitting(true);
    try {
      await fetch(`/api/alerts/${alertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, resolution_type: rType, notes: alertNotes })
      });
      mutate((key) => typeof key === 'string' && (key.includes('/api/alerts') || key.includes('/api/stats')), undefined, { revalidate: true });
    } catch (e) { console.error(e); }
    finally { setIsSubmitting(false); setResolvingId(null); setNotes(''); }
  };

  const [resolutionFilter, setResolutionFilter] = useState<'all' | 'true_positive' | 'false_positive'>('all');

  const filteredAlerts = resolutionFilter === 'all' 
    ? alerts 
    : alerts.filter((a: any) => a.resolution_type === resolutionFilter);

  const exportCSV = () => {
    if (filteredAlerts.length === 0) return;
    
    const headers = ['ID', 'Timestamp', 'Severity', 'Incident Title', 'Description', 'Source', 'Event ID', 'MITRE ATT&CK', 'Status', 'Resolution', 'Close Notes', 'Raw Log'];
    
    const escapeCSV = (val: string) => {
      if (!val) return '';
      const str = String(val).replace(/"/g, '""');
      return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
    };

    const rows = filteredAlerts.map((a: any) => [
      escapeCSV(a.id),
      escapeCSV(a.timestamp),
      escapeCSV(a.severity),
      escapeCSV(a.title),
      escapeCSV(a.description),
      escapeCSV(a.source),
      escapeCSV(a.eventId),
      escapeCSV(a.mitreRef),
      escapeCSV(a.status),
      escapeCSV(a.resolution_type === 'true_positive' ? 'True Positive' : a.resolution_type === 'false_positive' ? 'False Positive' : ''),
      escapeCSV(a.notes),
      escapeCSV(a.raw_log),
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filterLabel = filter === 'all' ? 'all' : filter;
    const resLabel = resolutionFilter !== 'all' ? `_${resolutionFilter}` : '';
    link.href = url;
    link.download = `soc_alerts_${filterLabel}${resLabel}_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6 bg-[#0f1219] min-h-screen text-white">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Security Alerts</h1>
          <p className="text-gray-400 text-sm mt-1">Manage and investigate potential security incidents</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={resolutionFilter} 
            onChange={e => setResolutionFilter(e.target.value as any)}
            className="bg-[#11141e] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
          >
            <option value="all">All Resolutions</option>
            <option value="true_positive">True Positive Only</option>
            <option value="false_positive">False Positive Only</option>
          </select>
          <button 
            onClick={exportCSV}
            disabled={filteredAlerts.length === 0}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm"
          >
            <Download size={16} /> Export CSV ({filteredAlerts.length})
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-800 pb-px">
        <button onClick={() => setFilter('all')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${filter === 'all' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`}>
          <List size={16} /><span>All Alerts ({statsData?.total_alerts || 0})</span>
        </button>
        <button onClick={() => setFilter('new')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${filter === 'new' ? 'border-red-500 text-red-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`}>
          <ShieldAlert size={16} /><span>New ({statsData?.new_alerts || 0})</span>
        </button>
        <button onClick={() => setFilter('investigating')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${filter === 'investigating' ? 'border-yellow-500 text-yellow-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`}>
          <Clock size={16} /><span>Investigating</span>
        </button>
        <button onClick={() => setFilter('resolved')}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${filter === 'resolved' ? 'border-green-500 text-green-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`}>
          <CheckCircle2 size={16} /><span>Resolved</span>
        </button>
      </div>

      {/* Table */}
      <div className="bg-[#1a1f2e] border border-gray-800 rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-blue-500" size={32} /></div>
        ) : filteredAlerts.length === 0 ? (
          <div className="py-12 text-center text-gray-500">No alerts found for the selected filter.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-[#11141e] border-b border-gray-800 text-gray-400 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 font-medium w-8"></th>
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">Incident Title</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Resolution</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredAlerts.map((alert: any) => (
                <React.Fragment key={alert.id}>
                  {/* Main Row */}
                  <tr 
                    className={`hover:bg-gray-800/30 transition-colors cursor-pointer ${expandedId === alert.id ? 'bg-gray-800/20' : ''}`}
                    onClick={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
                  >
                    <td className="px-4 py-3 text-gray-500">
                      {expandedId === alert.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase ${severityBadge[alert.severity] || severityBadge.info}`}>
                        {alert.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-400 text-xs">{alert.id.substring(0, 8)}</td>
                    <td className="px-4 py-3 text-white font-medium max-w-xs truncate">{alert.title}</td>
                    <td className="px-4 py-3">
                      <span className="bg-gray-800 text-gray-300 px-2 py-1 rounded text-xs font-mono">{alert.source || 'N/A'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {alert.resolution_type ? (
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${alert.resolution_type === 'true_positive' ? 'text-green-400' : 'text-gray-400'}`}>
                          {alert.resolution_type === 'true_positive' ? <ThumbsUp size={12} /> : <ThumbsDown size={12} />}
                          {alert.resolution_type === 'true_positive' ? 'True Positive' : 'False Positive'}
                        </span>
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium capitalize ${statusBadge[alert.status] || 'text-gray-400'}`}>
                        {alert.status === 'new' && (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                          </span>
                        )}
                        {alert.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {formatDistanceToNow(new Date(alert.timestamp))} ago
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1">
                        {alert.status === 'new' && (
                          <button 
                            onClick={() => updateStatus(alert.id, 'investigating')}
                            disabled={isSubmitting}
                            className="text-xs bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 px-2 py-1 rounded transition-colors disabled:opacity-50"
                          >Investigate</button>
                        )}
                        {(alert.status === 'new' || alert.status === 'investigating') && (
                          <button 
                            onClick={() => { setResolvingId(alert.id); setExpandedId(alert.id); }}
                            className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded transition-colors"
                          >Resolve</button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Detail Row */}
                  {expandedId === alert.id && (
                    <tr className="bg-[#11141e]">
                      <td colSpan={9} className="px-6 py-4">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {/* Left: Details */}
                          <div className="space-y-3">
                            <div>
                              <div className="text-xs text-gray-500 uppercase font-medium mb-1">Description</div>
                              <div className="text-sm text-gray-300">{alert.description || 'No description available.'}</div>
                            </div>
                            <div className="flex gap-4">
                              {alert.eventId && (
                                <div>
                                  <div className="text-xs text-gray-500 uppercase font-medium mb-1">Event ID</div>
                                  <span className="bg-gray-800 text-gray-300 px-2 py-1 rounded text-xs font-mono">{alert.eventId}</span>
                                </div>
                              )}
                              {alert.mitreRef && (
                                <div>
                                  <div className="text-xs text-gray-500 uppercase font-medium mb-1">MITRE ATT&CK</div>
                                  <span className="bg-blue-500/10 text-blue-400 px-2 py-1 rounded text-xs font-mono border border-blue-500/30">{alert.mitreRef}</span>
                                </div>
                              )}
                            </div>
                            {alert.notes && (
                              <div>
                                <div className="text-xs text-gray-500 uppercase font-medium mb-1">Close Notes</div>
                                <div className="text-sm text-gray-300 bg-gray-900/50 p-2 rounded border border-gray-800">{alert.notes}</div>
                              </div>
                            )}

                            {/* Resolution Form */}
                            {resolvingId === alert.id && (
                              <div className="p-3 border border-blue-500/30 bg-blue-500/5 rounded-lg">
                                <h5 className="text-sm font-medium text-blue-400 mb-2">Close Alert</h5>
                                <div className="flex gap-2 mb-3">
                                  <button onClick={() => setResolutionType('true_positive')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded text-sm border ${resolutionType === 'true_positive' ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                                    <ThumbsUp size={14} /> True Positive
                                  </button>
                                  <button onClick={() => setResolutionType('false_positive')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded text-sm border ${resolutionType === 'false_positive' ? 'bg-gray-600/50 border-gray-500/50 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                                    <ThumbsDown size={14} /> False Positive
                                  </button>
                                </div>
                                <textarea className="w-full bg-[#0f1219] border border-gray-700 rounded p-2 text-sm text-white mb-2 focus:outline-none focus:border-blue-500" placeholder="Investigation notes..." rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
                                <div className="flex gap-2 justify-end">
                                  <button onClick={() => setResolvingId(null)} className="text-xs text-gray-400 hover:text-white px-3 py-1.5">Cancel</button>
                                  <button onClick={() => updateStatus(alert.id, 'resolved', resolutionType, notes)}
                                    disabled={isSubmitting}
                                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded flex items-center gap-1 disabled:opacity-50">
                                    <Save size={14} /> Save & Close
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Right: Event Attributes & Raw Log */}
                          <div>
                            {(() => {
                              const attrs: {key: string, value: string}[] = [];
                              
                              // First try to use the backend-extracted fields from the parsers!
                              if (alert.extracted_fields) {
                                try {
                                  const parsed = JSON.parse(alert.extracted_fields);
                                  Object.entries(parsed).forEach(([k, v]) => {
                                    if (typeof v === 'string' || typeof v === 'number') {
                                      attrs.push({ key: k, value: String(v) });
                                    }
                                  });
                                } catch (e) {}
                              }
                              
                              if (alert.raw_log && attrs.length === 0) {
                                try {
                                  const parsed = JSON.parse(alert.raw_log);
                                  Object.entries(parsed).forEach(([k, v]) => {
                                    if (typeof v === 'string' || typeof v === 'number') {
                                      attrs.push({ key: k, value: String(v) });
                                    }
                                  });
                                } catch (e) {
                                  // XML Parsing
                                  const xmlRegex = /<[^>]*Data\s+Name="([^"]+)"[^>]*>([^<]+)<\//g;
                                  let match;
                                  while ((match = xmlRegex.exec(alert.raw_log)) !== null) {
                                    attrs.push({ key: match[1], value: match[2] });
                                  }
                                  // Syslog Parsing Fallback
                                  if (attrs.length === 0) {
                                    const syslogRegex = /<(\d+)>\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+([^\s]+)\s+([^\[:]+)(?:\[(\d+)\])?:(.+)/;
                                    const sysMatch = syslogRegex.exec(alert.raw_log);
                                    if (sysMatch) {
                                      attrs.push({ key: "PRI", value: sysMatch[1] });
                                      attrs.push({ key: "Hostname", value: sysMatch[2] });
                                      attrs.push({ key: "App", value: sysMatch[3] });
                                      if (sysMatch[4]) attrs.push({ key: "PID", value: sysMatch[4] });
                                      attrs.push({ key: "Message", value: sysMatch[5].trim() });
                                    }
                                  }

                                  // Fallback KV Parsing
                                  if (attrs.length === 0) {
                                    const kvRegex = /([a-zA-Z0-9_.-]+)=((?:"[^"]+")|(?:[^\s]+))/g;
                                    while ((match = kvRegex.exec(alert.raw_log)) !== null) {
                                      attrs.push({ key: match[1], value: match[2].replace(/"/g, '') });
                                    }
                                  }
                                }
                              }

                              return (
                                <>
                                  {attrs.length > 0 && (
                                    <div className="mb-4">
                                      <div className="text-xs text-gray-500 uppercase font-medium mb-1 flex items-center justify-between">
                                        <span>Event Attributes</span>
                                        <span className="text-gray-600 bg-gray-800/50 px-1.5 py-0.5 rounded text-[10px]">{attrs.length} extracted</span>
                                      </div>
                                      <div className="bg-[#0a0e1a] border border-gray-800 rounded overflow-hidden max-h-48 overflow-y-auto">
                                        <table className="w-full text-left text-xs">
                                          <thead className="bg-[#11141e] border-b border-gray-800 text-gray-400 sticky top-0">
                                            <tr>
                                              <th className="px-3 py-2 font-medium w-1/3">Item</th>
                                              <th className="px-3 py-2 font-medium">Value</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-gray-800/50">
                                            {attrs.map((attr, i) => (
                                              <tr key={i} className="hover:bg-gray-800/50 transition-colors">
                                                <td className="px-3 py-1.5 text-blue-400/80 font-mono align-top">{attr.key}</td>
                                                <td className="px-3 py-1.5 text-gray-300 font-mono break-all">{attr.value}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  )}
                                  
                                  <div>
                                    <div className="text-xs text-gray-500 uppercase font-medium mb-1">Raw Message</div>
                                    <div className="p-3 bg-[#0a0e1a] border border-gray-800 rounded text-xs font-mono text-green-400/80 overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto shadow-inner">
                                      {alert.raw_log ? (() => {
                                        try { return JSON.stringify(JSON.parse(alert.raw_log), null, 2); }
                                        catch { return alert.raw_log; }
                                      })() : 'No raw log data available.'}
                                    </div>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

