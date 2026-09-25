'use client';

import React, { useState } from 'react';
import { LogEntry } from '@/lib/types';
import { ChevronDown, ChevronRight, Search, Filter } from 'lucide-react';
import { format } from 'date-fns';

interface LogTableProps {
  logs: LogEntry[];
}

const severityColors: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-500 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  low: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  info: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
};

export default function LogTable({ logs }: LogTableProps) {
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [timeFrame, setTimeFrame] = useState('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: keyof LogEntry | null; direction: 'asc' | 'desc' }>({ key: 'timestamp', direction: 'desc' });
  const itemsPerPage = 20;

  const uniqueSources = Array.from(new Set(logs.map(log => log.source))).filter(Boolean).sort();

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedRows(newExpanded);
  };

  const filteredLogs = logs.filter(log => {
    const searchLower = search.toLowerCase().trim();
    let matchesSearch = true;

    if (searchLower) {
        // Support key:value search (e.g., ip:192.168.1.1 or action:deny)
        if (searchLower.includes(':')) {
          const [key, val] = searchLower.split(':', 2).map(s => s.trim());
          const stringifiedLog = JSON.stringify(log).toLowerCase();
          
          let hasCustomMatch = false;
          // Try to parse extracted fields to do an exact key match
          if ((log as any).extracted_fields) {
            try {
              const parsed = JSON.parse((log as any).extracted_fields);
              // Find any key that matches our search key (case insensitive)
              const matchedKey = Object.keys(parsed).find(k => k.toLowerCase() === key);
              if (matchedKey && String(parsed[matchedKey]).toLowerCase().includes(val)) {
                hasCustomMatch = true;
              }
            } catch (e) {}
          }
          
          // Fallback if not found in extracted_fields
          if (!hasCustomMatch) {
            // Very naive check in raw text for "key": "value" or key=value patterns
            matchesSearch = stringifiedLog.includes(`"${key}":"${val}"`) || 
                            stringifiedLog.includes(`"${key}": "${val}"`) ||
                            stringifiedLog.includes(`${key}=${val}`) ||
                            stringifiedLog.includes(`${key}="${val}"`);
          } else {
            matchesSearch = true;
          }
        } else {
          // Generic search across all fields including nested rawLog JSON
          matchesSearch = JSON.stringify(log).toLowerCase().includes(searchLower);
        }
    }

    // Severity is normalized by API to lowercase medium/high, so matching lowercase dropdown values works.
    const matchesSeverity = severityFilter === 'all' || log.severity === severityFilter;
    
    // Source filter
    const matchesSource = sourceFilter === 'all' || log.source === sourceFilter;
    
    let matchesTime = true;
    if (timeFrame !== 'all') {
      const logTime = new Date(log.timestamp).getTime();
      const now = new Date().getTime();
      const diffMinutes = (now - logTime) / (1000 * 60);
      
      if (timeFrame === 'realtime') matchesTime = diffMinutes <= 1; // Last 1 min
      else if (timeFrame === '15m') matchesTime = diffMinutes <= 15;
      else if (timeFrame === '1h') matchesTime = diffMinutes <= 60;
      else if (timeFrame === '24h') matchesTime = diffMinutes <= 60 * 24;
      else if (timeFrame === '7d') matchesTime = diffMinutes <= 60 * 24 * 7;
    }

    return matchesSearch && matchesSeverity && matchesSource && matchesTime;
  });

  const sortedLogs = [...filteredLogs].sort((a, b) => {
    if (!sortConfig.key) return 0;
    
    let aVal: any = a[sortConfig.key];
    let bVal: any = b[sortConfig.key];
    
    // Convert string timestamps to actual numbers for correct sorting
    if (sortConfig.key === 'timestamp') {
      aVal = new Date(aVal || 0).getTime();
      bVal = new Date(bVal || 0).getTime();
    } else {
      aVal = aVal?.toString().toLowerCase() || '';
      bVal = bVal?.toString().toLowerCase() || '';
    }
    
    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(sortedLogs.length / itemsPerPage);
  const paginatedLogs = sortedLogs.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const requestSort = (key: keyof LogEntry) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  return (
    <div className="bg-[#1a1f2e] border border-gray-800 rounded-lg overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-gray-800 flex flex-col sm:flex-row gap-4 justify-between items-center bg-[#1e2436]">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input 
            type="text" 
            placeholder="Search logs..." 
            className="w-full bg-[#11141e] border border-gray-700 text-white text-sm rounded-md pl-9 pr-3 py-2 focus:outline-none focus:border-blue-500"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter size={16} className="text-gray-400" />
          <select 
            className="bg-[#11141e] border border-gray-700 text-white text-sm rounded-md px-3 py-2 focus:outline-none focus:border-blue-500"
            value={timeFrame}
            onChange={(e) => { setTimeFrame(e.target.value); setPage(1); }}
          >
            <option value="all">All Time</option>
            <option value="realtime">Real-Time (Live)</option>
            <option value="15m">Last 15 Minutes</option>
            <option value="1h">Last 1 Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
          </select>
          <select 
            className="bg-[#11141e] border border-gray-700 text-white text-sm rounded-md px-3 py-2 focus:outline-none focus:border-blue-500"
            value={sourceFilter}
            onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
          >
            <option value="all">All Sources</option>
            {uniqueSources.map(source => (
              <option key={source} value={source}>{source as string}</option>
            ))}
          </select>
          <select 
            className="bg-[#11141e] border border-gray-700 text-white text-sm rounded-md px-3 py-2 focus:outline-none focus:border-blue-500"
            value={severityFilter}
            onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="info">Info</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto flex-grow">
        <table className="w-full text-left text-sm text-gray-300">
          <thead className="bg-[#151a27] text-gray-400 sticky top-0 z-10 shadow-sm shadow-[#0a0e1a]">
            <tr>
              <th className="px-4 py-3 font-medium w-8"></th>
              <th className="px-4 py-3 font-medium cursor-pointer hover:text-white select-none transition-colors" onClick={() => requestSort('timestamp')}>
                Time {sortConfig.key === 'timestamp' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th className="px-4 py-3 font-medium cursor-pointer hover:text-white select-none transition-colors" onClick={() => requestSort('severity')}>
                Severity {sortConfig.key === 'severity' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th className="px-4 py-3 font-medium cursor-pointer hover:text-white select-none transition-colors" onClick={() => requestSort('eventId')}>
                Event ID {sortConfig.key === 'eventId' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th className="px-4 py-3 font-medium cursor-pointer hover:text-white select-none transition-colors" onClick={() => requestSort('source')}>
                Source {sortConfig.key === 'source' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th className="px-4 py-3 font-medium">Message</th>
              <th className="px-4 py-3 font-medium">MITRE</th>
            </tr>
          </thead>
          <tbody>
            {paginatedLogs.map((log, i) => (
              <React.Fragment key={log.id}>
                <tr 
                  className={`border-b border-gray-800 hover:bg-[#202636] cursor-pointer transition-colors ${i % 2 === 0 ? 'bg-[#1a1f2e]' : 'bg-[#171c2a]'}`}
                  onClick={() => toggleRow(log.id)}
                >
                  <td className="px-4 py-3 text-gray-500">
                    {expandedRows.has(log.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss')}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs border capitalize ${severityColors[log.severity]}`}>
                      {log.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono">{log.eventId}</td>
                  <td className="px-4 py-3">{log.source}</td>
                  <td className="px-4 py-3 truncate max-w-[200px]">{log.message}</td>
                  <td className="px-4 py-3">
                    {log.mitreTechnique ? (
                      <span className="bg-gray-800 border border-gray-700 px-2 py-1 rounded text-xs cursor-pointer hover:bg-gray-700">
                        {log.mitreTechnique}
                      </span>
                    ) : (
                      <span className="text-gray-600">-</span>
                    )}
                  </td>
                </tr>
                {expandedRows.has(log.id) && (
                  <tr className="bg-[#11141e] border-b border-gray-800">
                    <td colSpan={7} className="px-4 py-4">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div>
                          {(() => {
                            const attrs: {key: string, value: string}[] = [];
                            const raw = (log as any).raw_log || log.rawLog || '';
                            const extracted = (log as any).extracted_fields;
                            
                            // 1. Try backend parsed fields
                            if (extracted) {
                              try {
                                const parsed = JSON.parse(extracted);
                                Object.entries(parsed).forEach(([k, v]) => {
                                  if (typeof v === 'string' || typeof v === 'number') {
                                    attrs.push({ key: k, value: String(v) });
                                  }
                                });
                              } catch (e) {}
                            }
                            
                            if (raw && attrs.length === 0) {
                              try {
                                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                                Object.entries(parsed).forEach(([k, v]) => {
                                  if (typeof v === 'string' || typeof v === 'number') attrs.push({ key: k, value: String(v) });
                                });
                              } catch (e) {
                                // XML Parsing
                                const xmlRegex = /<[^>]*Data\s+Name="([^"]+)"[^>]*>([^<]+)<\//g;
                                let match;
                                while ((match = xmlRegex.exec(raw)) !== null) attrs.push({ key: match[1], value: match[2] });
                                
                                // Syslog Parsing Fallback
                                if (attrs.length === 0) {
                                  const syslogRegex = /<(\d+)>\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+([^\s]+)\s+([^\[:]+)(?:\[(\d+)\])?:(.+)/;
                                  const sysMatch = syslogRegex.exec(raw);
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
                                  while ((match = kvRegex.exec(raw)) !== null) {
                                    attrs.push({ key: match[1], value: match[2].replace(/"/g, '') });
                                  }
                                }
                              }
                            }

                            if (attrs.length > 0) {
                              return (
                                <div className="mb-4 lg:mb-0">
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
                              );
                            }
                            return <div className="text-gray-500 text-sm italic">No attributes could be extracted.</div>;
                          })()}
                        </div>
                        <div>
                          <div className="text-gray-400 mb-1 font-medium text-xs uppercase">Raw Log</div>
                          <pre className="bg-[#0a0e1a] p-3 rounded text-xs text-green-400/80 overflow-x-auto whitespace-pre-wrap font-mono border border-gray-800 max-h-48 overflow-y-auto shadow-inner">
                            {(() => {
                              const raw = (log as any).raw_log || log.rawLog;
                              try { return JSON.stringify(JSON.parse(raw), null, 2); }
                              catch { return raw || 'N/A'; }
                            })()}
                          </pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {paginatedLogs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No logs found matching your criteria.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t border-gray-800 flex justify-between items-center bg-[#1e2436] text-sm text-gray-400">
        <div>Showing {(page - 1) * itemsPerPage + 1} to {Math.min(page * itemsPerPage, filteredLogs.length)} of {filteredLogs.length} entries</div>
        <div className="flex gap-2">
          <button 
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="px-3 py-1 bg-gray-800 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <button 
            disabled={page === totalPages || totalPages === 0}
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 bg-gray-800 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
