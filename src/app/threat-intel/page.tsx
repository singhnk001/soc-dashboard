"use client";

import React, { useState, useEffect } from "react";
import { ShieldAlert, Search, Plus, RefreshCw, Trash2, Edit2, ChevronDown, ChevronRight, Download } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function ThreatIntelPage() {
  const [feeds, setFeeds] = useState<any[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [indicators, setIndicators] = useState<Record<string, any[]>>({});
  const [loadingIndicators, setLoadingIndicators] = useState<Set<string>>(new Set());

  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [form, setForm] = useState({
    name: '',
    url: '',
    type: 'API',
    category: 'Malware IPs',
    freq: 'Daily',
    time: '00:00 AM'
  });

  const fetchFeeds = async () => {
    try {
      const res = await fetch('/api/threat-feeds');
      const data = await res.json();
      setFeeds(data.data || []);
    } catch (e) { console.error(e); } finally { setIsLoading(false); }
  };

  useEffect(() => { fetchFeeds(); }, []);

  const toggleRow = async (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
      setExpandedRows(newExpanded);
    } else {
      newExpanded.add(id);
      setExpandedRows(newExpanded);
      if (!indicators[id]) {
        setLoadingIndicators(prev => new Set(prev).add(id));
        try {
          const res = await fetch('/api/threat-feeds/' + id + '/indicators');
          const data = await res.json();
          setIndicators(prev => (Object.assign({}, prev, { [id]: data.data })));
        } catch (e) {
          console.error(e);
        } finally {
          setLoadingIndicators(prev => {
            const newSet = new Set(prev);
            newSet.delete(id);
            return newSet;
          });
        }
      }
    }
  };

  const handleSync = async (id: string) => {
    await fetch('/api/threat-feeds/' + id + '/sync', { method: 'POST' });
    fetchFeeds();
    if (expandedRows.has(id)) {
      const res = await fetch('/api/threat-feeds/' + id + '/indicators');
      const data = await res.json();
      setIndicators(prev => (Object.assign({}, prev, { [id]: data.data })));
    }
  };

  const handleDelete = async (id: string) => {
    await fetch('/api/threat-feeds/' + id, { method: 'DELETE' });
    fetchFeeds();
  };

  const handleEdit = (feed: any) => {
    setEditingId(feed.id);
    let freq = 'Daily';
    let time = '00:00 AM';
    if (feed.schedule) {
      if (feed.schedule.includes(' at ')) {
        const parts = feed.schedule.split(' at ');
        freq = parts[0];
        time = parts[1];
      } else {
        freq = feed.schedule;
      }
    }
    setForm({
      name: feed.name,
      url: feed.url,
      type: feed.type,
      category: feed.category,
      freq,
      time
    });
    setShowModal(true);
  };

  const openAddModal = () => {
    setEditingId(null);
    setForm({ name: '', url: '', type: 'API', category: 'Malware IPs', freq: 'Daily', time: '00:00 AM' });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalSchedule = form.freq + ' at ' + form.time;
    const payload = { ...form, schedule: finalSchedule };
    
    if (editingId) {
      await fetch('/api/threat-feeds/' + editingId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      await fetch('/api/threat-feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    
    setShowModal(false);
    fetchFeeds();
  };

  const downloadCSV = (feedName: string, iocs: any[]) => {
    if (!iocs || iocs.length === 0) return;
    
    const headers = ['IoC Type', 'Indicator', 'Description'];
    const csvRows = [headers.join(',')];
    
    for (const ioc of iocs) {
      const type = `"${(ioc.type || '').replace(/"/g, '""')}"`;
      const indicator = `"${(ioc.indicator || '').replace(/"/g, '""')}"`;
      const desc = `"${(ioc.description || '').replace(/"/g, '""')}"`;
      csvRows.push([type, indicator, desc].join(','));
    }
    
    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", feedName.replace(/\s+/g, '_') + "_indicators.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredFeeds = feeds.filter((f: any) => 
    f.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
            <ShieldAlert className="text-red-500" />
            Threat Intelligence Feeds
          </h1>
          <p className="text-gray-400">Manage, sync, and inspect external IoC feeds for detection</p>
        </div>
        
        <button 
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors text-sm"
        >
          <Plus size={16} /> Add Threat Feed
        </button>
      </div>

      <div className="bg-[#1a1f2e] border border-gray-800 rounded-lg overflow-hidden flex flex-col h-[700px]">
        <div className="p-4 border-b border-gray-800 flex gap-4 bg-[#11141e]">
          <div className="relative flex-grow max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input 
              type="text"
              placeholder="Search feeds..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#0a0e1a] border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex-grow overflow-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-[#11141e] text-gray-400 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 font-medium border-b border-gray-800 w-8"></th>
                <th className="px-6 py-3 font-medium border-b border-gray-800">Feed Name</th>
                <th className="px-6 py-3 font-medium border-b border-gray-800">Type</th>
                <th className="px-6 py-3 font-medium border-b border-gray-800">Status</th>
                <th className="px-6 py-3 font-medium border-b border-gray-800">Indicators</th>
                <th className="px-6 py-3 font-medium border-b border-gray-800">Pulling Schedule</th>
                <th className="px-6 py-3 font-medium border-b border-gray-800">Last Sync</th>
                <th className="px-6 py-3 font-medium border-b border-gray-800 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredFeeds.map((f: any) => (
                <React.Fragment key={f.id}>
                  <tr className={"hover:bg-gray-800/50 transition-colors " + (expandedRows.has(f.id) ? "bg-gray-800/30" : "")}>
                    <td className="px-4 py-3 cursor-pointer" onClick={() => toggleRow(f.id)}>
                      {expandedRows.has(f.id) ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                    </td>
                    <td className="px-6 py-3 font-medium text-white cursor-pointer" onClick={() => toggleRow(f.id)}>{f.name} (({f.category}))</td>
                    <td className="px-6 py-3">{f.type}</td>
                    <td className="px-6 py-3">
                      <span className={"inline-flex items-center px-2 py-0.5 rounded text-xs " + (
                        f.status === 'Active' ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                      )}>
                        {f.status}
                      </span>
                    </td>
                    <td className="px-6 py-3">{(f.indicator_count || 0).toLocaleString()}</td>
                    <td className="px-6 py-3">{f.schedule}</td>
                    <td className="px-6 py-3">
                      {f.last_updated ? formatDistanceToNow(new Date(f.last_updated)) + ' ago' : 'Never'}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button onClick={() => handleSync(f.id)} className="text-blue-400 hover:text-blue-300" title="Sync Now">
                          <RefreshCw size={18} />
                        </button>
                        <button onClick={() => handleEdit(f)} className="text-gray-400 hover:text-gray-300" title="Edit Feed">
                          <Edit2 size={18} />
                        </button>
                        <button onClick={() => handleDelete(f.id)} className="text-red-400 hover:text-red-300" title="Delete">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedRows.has(f.id) && (
                    <tr className="bg-[#0a0e1a]">
                      <td colSpan={8} className="p-6">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-white font-medium">Top Indicators Extracted</h4>
                          {indicators[f.id] && indicators[f.id].length > 0 && (
                            <button 
                              onClick={() => downloadCSV(f.name, indicators[f.id])}
                              className="flex items-center gap-2 px-3 py-1 bg-[#11141e] border border-gray-700 hover:bg-gray-800 text-gray-300 rounded text-sm transition-colors"
                            >
                              <Download size={14} /> Export CSV
                            </button>
                          )}
                        </div>
                        {loadingIndicators.has(f.id) ? (
                          <div className="text-gray-400 animate-pulse">Loading indicators...</div>
                        ) : !indicators[f.id] || indicators[f.id].length === 0 ? (
                          <div className="text-gray-500">No indicators found.</div>
                        ) : (
                          <div className="max-h-96 overflow-y-auto border border-gray-800 rounded-sm custom-scrollbar">
                            <table className="w-full bg-[#11141e]">
                              <thead className="sticky top-0 bg-[#11141e] shadow-sm z-10">
                                <tr className="border-b border-gray-800 text-gray-400">
                                  <th className="px-4 py-2 font-medium w-48 text-left">IoC Type</th>
                                  <th className="px-4 py-2 font-medium text-left">Indicator</th>
                                  <th className="px-4 py-2 font-medium text-left">Description</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-800">
                                {indicators[f.id].map((ioc: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-gray-800/30">
                                    <td className="px-4 py-2">
                                      <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs">
                                        {ioc.type}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2 text-white font-mono text-sm text-left">{ioc.indicator}</td>
                                    <td className="px-4 py-2 text-gray-400 text-left truncate max-w-xs" title={ioc.description}>{ioc.description}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#1a1f2e] p-6 rounded-lg w-full max-w-md border border-gray-800">
            <h2 className="text-xl font-bold text-white mb-4">{editingId ? 'Edit Threat Intel Feed' : 'Add Threat Intel Feed'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Feed Name</label>
                <input required type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-[#0a0e1a] border border-gray-700 rounded p-2 text-white" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">API URL</label>
                <input required type="url" value={form.url} onChange={e => setForm({...form, url: e.target.value})} className="w-full bg-[#0a0e1a] border border-gray-700 rounded p-2 text-white" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Integration Type</label>
                  <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full bg-[#0a0e1a] border border-gray-700 rounded p-2 text-white">
                    <option>API</option>
                    <option>MANUAL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Category</label>
                  <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full bg-[#0a0e1a] border border-gray-700 rounded p-2 text-white">
                    <option>Malware IPs</option>
                    <option>Malware URLs</option>
                    <option>Malware Domains</option>
                    <option>Malware Hashes</option>
                    <option>Mixed</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Pulling Schedule</label>
                <div className="flex gap-2">
                  <select value={form.freq} onChange={e => setForm({...form, freq: e.target.value})} className="w-1/2 bg-[#0a0e1a] border border-gray-700 rounded p-2 text-white">
                    <option>Daily</option>
                    <option>Hourly</option>
                    <option>Weekly</option>
                    <option>Monthly</option>
                  </select>
                  <div className="flex items-center text-gray-400">at</div>
                  <select value={form.time} onChange={e => setForm({...form, time: e.target.value})} className="w-1/2 bg-[#0a0e1a] border border-gray-700 rounded p-2 text-white">
                    {Array.from({length: 24}).map((_, i) => {
                      const hour = i === 0 ? 12 : i > 12 ? i - 12 : i;
                      const ampm = i >= 12 ? 'PM' : 'AM';
                      const formatted = `${hour.toString().padStart(2, '0')}:00 ${ampm}`;
                      return <option key={i} value={formatted}>{formatted}</option>;
                    })}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 hover:bg-gray-800 rounded text-gray-300">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white">{editingId ? 'Save Changes' : 'Add Feed'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
