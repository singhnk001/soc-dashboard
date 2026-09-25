"use client";

import React, { useState, useEffect } from "react";
import { ShieldAlert, Check, X, Search, Plus, RefreshCw, Trash2, Edit2, ChevronDown, ChevronRight, Download, Server, FileSearch, Globe, Code, Settings } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function ThreatIntelPage() {
  const [activeTab, setActiveTab] = useState<'feeds' | 'lookup'>('feeds');
  const [feeds, setFeeds] = useState<any[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [indicators, setIndicators] = useState<Record<string, any[]>>({});
  const [loadingIndicators, setLoadingIndicators] = useState<Set<string>>(new Set());

  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Settings State
  const [apiKeys, setApiKeys] = useState({
    VIRUSTOTAL_API_KEY: '',
    IBM_XFORCE_KEY: '',
    IBM_XFORCE_PASS: '',
    CISCO_TALOS_KEY: ''
  });

  // VT Lookup State
  const [vtInput, setVtInput] = useState("");
  const [vtType, setVtType] = useState("IP");
  const [vtProvider, setVtProvider] = useState("VirusTotal");
  const [vtResult, setVtResult] = useState<any>(null);
  const [vtLoading, setVtLoading] = useState(false);
  const [vtError, setVtError] = useState("");
  
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

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.status === 'success' && data.data) {
        setApiKeys(prev => ({...prev, ...data.data}));
      }
    } catch (e) {}
  };

  useEffect(() => { 
    fetchFeeds(); 
    fetchSettings();
  }, []);

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
  
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiKeys)
    });
    setShowSettings(false);
    fetchSettings(); // refresh masked versions
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vtInput) return;
    setVtLoading(true);
    setVtError("");
    setVtResult(null);
    try {
      const url = '/api/threat-intel/lookup?ioc=' + encodeURIComponent(vtInput.trim()) + '&ioc_type=' + vtType + '&provider=' + encodeURIComponent(vtProvider);
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === 'success') {
        setVtResult(data.data);
      } else {
        setVtError(data.message || 'Error occurred');
      }
    } catch(e: any) {
      setVtError(e.message);
    } finally {
      setVtLoading(false);
    }
  };

  const filteredFeeds = feeds.filter((f: any) => 
    f.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-end border-b border-gray-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
            <ShieldAlert className="text-blue-500" />
            Threat Intelligence Center
          </h1>
          <p className="text-gray-400">Manage external IoC feeds and perform deep VirusTotal investigations</p>
        </div>
        <div className="flex bg-[#11141e] rounded-lg p-1 border border-gray-800">
          <button 
            onClick={() => setActiveTab('feeds')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors text-sm font-medium ${activeTab === 'feeds' ? 'bg-[#1a1f2e] text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
          >
            <Server size={16} /> Threat Feeds
          </button>
          <button 
            onClick={() => setActiveTab('lookup')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors text-sm font-medium ${activeTab === 'lookup' ? 'bg-[#1a1f2e] text-blue-400 shadow' : 'text-gray-400 hover:text-gray-200'}`}
          >
            <FileSearch size={16} /> IoC Lookup
          </button>
        </div>
      </div>

      {activeTab === 'feeds' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex justify-between items-center">
            <div className="relative w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input 
                type="text"
                placeholder="Search threat feeds..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#11141e] border border-gray-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors shadow-inner"
              />
            </div>
            <button 
              onClick={openAddModal}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium shadow-lg shadow-blue-900/20"
            >
              <Plus size={18} /> Configure Feed
            </button>
          </div>

          <div className="bg-[#1a1f2e] border border-gray-800 rounded-xl overflow-hidden flex flex-col shadow-xl">
            <div className="overflow-auto custom-scrollbar" style={{maxHeight: '600px'}}>
              <table className="w-full text-left text-sm text-gray-300">
                <thead className="bg-[#11141e] text-gray-400 sticky top-0 z-10 shadow-sm border-b border-gray-800">
                  <tr>
                    <th className="px-6 py-4 font-semibold w-8"></th>
                    <th className="px-6 py-4 font-semibold">Feed Name</th>
                    <th className="px-6 py-4 font-semibold">Type</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold">Indicators</th>
                    <th className="px-6 py-4 font-semibold">Schedule</th>
                    <th className="px-6 py-4 font-semibold">Last Sync</th>
                    <th className="px-6 py-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {filteredFeeds.map((f: any) => (
                    <React.Fragment key={f.id}>
                      <tr className={"hover:bg-[#1f2537] transition-colors group " + (expandedRows.has(f.id) ? "bg-[#1f2537]" : "")}>
                        <td className="px-4 py-4 cursor-pointer text-gray-500 group-hover:text-blue-400" onClick={() => toggleRow(f.id)}>
                          {expandedRows.has(f.id) ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}
                        </td>
                        <td className="px-6 py-4 cursor-pointer" onClick={() => toggleRow(f.id)}>
                          <div className="font-medium text-white">{f.name}</div>
                          <div className="text-xs text-gray-500 mt-1">{f.category}</div>
                        </td>
                        <td className="px-6 py-4"><span className="text-gray-400 bg-gray-800/50 px-2 py-1 rounded text-xs">{f.type}</span></td>
                        <td className="px-6 py-4">
                          <div className={"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border " + (
                            f.status === 'Active' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                          )}>
                            <div className={`w-1.5 h-1.5 rounded-full ${f.status === 'Active' ? 'bg-emerald-400' : 'bg-rose-400'}`}></div>
                            {f.status}
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-gray-400">{(f.indicator_count || 0).toLocaleString()}</td>
                        <td className="px-6 py-4 text-gray-400">{f.schedule}</td>
                        <td className="px-6 py-4 text-gray-400">
                          {f.last_updated ? formatDistanceToNow(new Date(f.last_updated)) + ' ago' : 'Never'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleSync(f.id)} className="p-1.5 text-blue-400 hover:bg-blue-400/10 rounded" title="Sync Now">
                              <RefreshCw size={16} />
                            </button>
                            <button onClick={() => handleEdit(f)} className="p-1.5 text-gray-400 hover:bg-gray-700 rounded" title="Edit Feed">
                              <Edit2 size={16} />
                            </button>
                            <button onClick={() => handleDelete(f.id)} className="p-1.5 text-rose-400 hover:bg-rose-400/10 rounded" title="Delete">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedRows.has(f.id) && (
                        <tr className="bg-[#11141e]">
                          <td colSpan={8} className="p-0">
                            <div className="px-14 py-6 border-l-2 border-blue-500">
                              <div className="flex justify-between items-center mb-4">
                                <h4 className="text-gray-300 font-medium flex items-center gap-2">
                                  <ShieldAlert size={16} className="text-blue-500"/> Previewing Top Indicators
                                </h4>
                                {indicators[f.id] && indicators[f.id].length > 0 && (
                                  <button 
                                    onClick={() => window.open('/api/threat-feeds/' + f.id + '/export', '_self')}
                                    className="flex items-center gap-2 px-4 py-1.5 bg-[#1a1f2e] border border-gray-700 hover:bg-gray-800 text-gray-300 rounded-md text-sm transition-colors shadow-sm"
                                  >
                                    <Download size={14} /> Download Full CSV
                                  </button>
                                )}
                              </div>
                              {loadingIndicators.has(f.id) ? (
                                <div className="text-gray-500 animate-pulse py-8 text-center bg-[#1a1f2e] rounded-lg border border-gray-800 border-dashed">Extracting intelligence...</div>
                              ) : !indicators[f.id] || indicators[f.id].length === 0 ? (
                                <div className="text-gray-600 py-8 text-center bg-[#1a1f2e] rounded-lg border border-gray-800 border-dashed">No active indicators found. Sync the feed to pull data.</div>
                              ) : (
                                <div className="max-h-96 overflow-y-auto border border-gray-800 rounded-lg custom-scrollbar bg-[#1a1f2e] shadow-inner">
                                  <table className="w-full">
                                    <thead className="sticky top-0 bg-[#1a1f2e] shadow-sm z-10">
                                      <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                                        <th className="px-6 py-3 font-medium w-48 text-left">IoC Type</th>
                                        <th className="px-6 py-3 font-medium text-left">Raw Indicator</th>
                                        <th className="px-6 py-3 font-medium text-left">Context / Description</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800/50">
                                      {indicators[f.id].map((ioc: any, idx: number) => (
                                        <tr key={idx} className="hover:bg-[#23293b]">
                                          <td className="px-6 py-2.5">
                                            <span className="px-2 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-md text-xs font-medium">
                                              {ioc.type}
                                            </span>
                                          </td>
                                          <td className="px-6 py-2.5 text-gray-300 font-mono text-sm text-left">{ioc.indicator}</td>
                                          <td className="px-6 py-2.5 text-gray-500 text-sm text-left truncate max-w-xs" title={ioc.description}>{ioc.description || 'N/A'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'lookup' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Globe className="text-indigo-400" /> Deep Indicator Lookup
            </h2>
            <button onClick={() => setShowSettings(true)} className="flex items-center gap-2 px-3 py-2 bg-[#1a1f2e] hover:bg-gray-800 border border-gray-700 text-gray-300 rounded transition-colors text-sm">
              <Settings size={16} /> API Settings
            </button>
          </div>
          
          <div className="bg-[#1a1f2e] border border-gray-800 rounded-xl p-8 shadow-xl">
            <p className="text-gray-400 text-sm mb-6">Query external intelligence providers in real-time to analyze suspicious IPs, URLs, Domains, or File Hashes.</p>
            
            <form onSubmit={handleLookup} className="flex gap-4">
              <select 
                value={vtProvider} 
                onChange={e => setVtProvider(e.target.value)}
                className="w-48 bg-[#11141e] border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500 font-medium"
              >
                <option value="VirusTotal">VirusTotal</option>
                <option value="IBM X-Force">IBM X-Force</option>
                <option value="Cisco Talos">Cisco Talos</option>
              </select>
              <select 
                value={vtType} 
                onChange={e => setVtType(e.target.value)}
                className="w-40 bg-[#11141e] border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500 font-medium"
              >
                <option value="IP">IP Address</option>
                <option value="Hash">File Hash</option>
                <option value="Domain">Domain / URL</option>
              </select>
              <div className="relative flex-grow">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input 
                  required
                  type="text"
                  placeholder="e.g. 8.8.8.8 or a2b3c4..."
                  value={vtInput}
                  onChange={e => setVtInput(e.target.value)}
                  className="w-full bg-[#11141e] border border-gray-700 rounded-lg pl-10 pr-4 py-3 text-white focus:outline-none focus:border-indigo-500 font-mono shadow-inner"
                />
              </div>
              <button 
                type="submit"
                disabled={vtLoading}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {vtLoading ? <RefreshCw className="animate-spin" size={18}/> : <Search size={18}/>}
                Analyze IoC
              </button>
            </form>
          </div>

          {vtError && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-4 rounded-xl flex items-start gap-3">
              <ShieldAlert className="mt-0.5 flex-shrink-0" size={18} />
              <div>
                <h4 className="font-medium">Analysis Failed</h4>
                <p className="text-sm opacity-80 mt-1">{vtError}</p>
              </div>
            </div>
          )}

          {vtResult && (
            <div className="bg-[#1a1f2e] border border-gray-800 rounded-xl p-6 shadow-xl animate-in fade-in">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <div className="flex items-center gap-3 text-xl font-bold text-white mb-1">
                    {vtType === 'IP' ? <Server className="text-blue-400"/> : vtType === 'Domain' ? <Globe className="text-emerald-400"/> : <Code className="text-purple-400"/>}
                    {vtInput}
                  </div>
                  <div className="text-sm text-indigo-400 mb-2 font-medium">Provider: {vtProvider}</div>
                  <div className="flex gap-4 mt-2 text-sm text-gray-400">
                    {vtResult.owner && <span>Owner: <span className="text-gray-200">{vtResult.owner}</span></span>}
                    {vtResult.country && <span>Country: <span className="text-gray-200">{vtResult.country}</span></span>}
                    {vtResult.name && <span>Context/Name: <span className="text-gray-200">{vtResult.name}</span></span>}
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="text-sm text-gray-400 mb-1">Reputation Score</div>
                  <div className={`text-3xl font-bold ${
                    vtProvider === 'VirusTotal' ? (
                      (vtResult.reputation || 0) < 0 ? 'text-rose-500' : (vtResult.reputation || 0) > 0 ? 'text-emerald-500' : 'text-gray-300'
                    ) : (
                      (vtResult.reputation || 0) >= 7 ? 'text-rose-500' : (vtResult.reputation || 0) >= 4 ? 'text-amber-500' : 'text-emerald-500'
                    )
                  }`}>
                    {vtResult.reputation || 0}
                  </div>
                </div>
              </div>

              <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">Analysis Results</h4>
              
              <div className="grid grid-cols-4 gap-4 mb-2">
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-rose-500">{vtResult.stats?.malicious || 0}</div>
                  <div className="text-xs text-rose-400 uppercase tracking-wide mt-1">Malicious</div>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-amber-500">{vtResult.stats?.suspicious || 0}</div>
                  <div className="text-xs text-amber-400 uppercase tracking-wide mt-1">Suspicious</div>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-emerald-500">{vtResult.stats?.harmless || 0}</div>
                  <div className="text-xs text-emerald-400 uppercase tracking-wide mt-1">Harmless</div>
                </div>
                <div className="bg-gray-700/20 border border-gray-700/50 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-gray-400">{vtResult.stats?.undetected || 0}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">Undetected</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-[#1a1f2e] p-8 rounded-xl w-full max-w-lg border border-gray-700 shadow-2xl slide-in-from-bottom-4">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Settings className="text-indigo-400" /> API Settings
            </h2>
            <form onSubmit={handleSaveSettings} className="space-y-6">
              
              {/* VirusTotal */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">VirusTotal API Key</label>
                {apiKeys.VIRUSTOTAL_API_KEY && !apiKeys.VIRUSTOTAL_API_KEY.includes('***Edit') ? (
                  <div className="flex items-center justify-between bg-[#11141e] border border-emerald-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium overflow-hidden">
                      <Check size={16} className="flex-shrink-0" /> 
                      <span className="truncate">Configured ({apiKeys.VIRUSTOTAL_API_KEY})</span>
                    </div>
                    <button type="button" onClick={() => setApiKeys({...apiKeys, VIRUSTOTAL_API_KEY: ''})} className="text-gray-400 hover:text-white text-xs underline flex-shrink-0 ml-4">Edit</button>
                  </div>
                ) : (
                  <input type="text" placeholder="Enter API Key..." value={apiKeys.VIRUSTOTAL_API_KEY} onChange={e => setApiKeys({...apiKeys, VIRUSTOTAL_API_KEY: e.target.value})} className="w-full bg-[#0a0e1a] border border-gray-700 rounded-lg p-3 text-white focus:border-indigo-500 focus:outline-none transition-colors font-mono text-sm" />
                )}
              </div>
              
              {/* IBM X-Force */}
              <div className="pt-4 border-t border-gray-800">
                <label className="block text-sm font-medium text-gray-300 mb-2">IBM X-Force Credentials</label>
                {apiKeys.IBM_XFORCE_KEY && !apiKeys.IBM_XFORCE_KEY.includes('***Edit') ? (
                  <div className="flex items-center justify-between bg-[#11141e] border border-emerald-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium overflow-hidden">
                      <Check size={16} className="flex-shrink-0" /> 
                      <span className="truncate">Configured ({apiKeys.IBM_XFORCE_KEY})</span>
                    </div>
                    <button type="button" onClick={() => setApiKeys({...apiKeys, IBM_XFORCE_KEY: '', IBM_XFORCE_PASS: ''})} className="text-gray-400 hover:text-white text-xs underline flex-shrink-0 ml-4">Edit</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <input type="text" placeholder="API Key" value={apiKeys.IBM_XFORCE_KEY} onChange={e => setApiKeys({...apiKeys, IBM_XFORCE_KEY: e.target.value})} className="w-full bg-[#0a0e1a] border border-gray-700 rounded-lg p-3 text-white focus:border-indigo-500 focus:outline-none transition-colors font-mono text-sm" />
                    <input type="password" placeholder="API Password" value={apiKeys.IBM_XFORCE_PASS} onChange={e => setApiKeys({...apiKeys, IBM_XFORCE_PASS: e.target.value})} className="w-full bg-[#0a0e1a] border border-gray-700 rounded-lg p-3 text-white focus:border-indigo-500 focus:outline-none transition-colors font-mono text-sm" />
                  </div>
                )}
              </div>
              
              {/* Cisco Talos */}
              <div className="pt-4 border-t border-gray-800">
                <label className="block text-sm font-medium text-gray-300 mb-2">Cisco Talos API Key</label>
                {apiKeys.CISCO_TALOS_KEY && !apiKeys.CISCO_TALOS_KEY.includes('***Edit') ? (
                  <div className="flex items-center justify-between bg-[#11141e] border border-emerald-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium overflow-hidden">
                      <Check size={16} className="flex-shrink-0" /> 
                      <span className="truncate">Configured ({apiKeys.CISCO_TALOS_KEY})</span>
                    </div>
                    <button type="button" onClick={() => setApiKeys({...apiKeys, CISCO_TALOS_KEY: ''})} className="text-gray-400 hover:text-white text-xs underline flex-shrink-0 ml-4">Edit</button>
                  </div>
                ) : (
                  <input type="text" placeholder="Enter API Key..." value={apiKeys.CISCO_TALOS_KEY} onChange={e => setApiKeys({...apiKeys, CISCO_TALOS_KEY: e.target.value})} className="w-full bg-[#0a0e1a] border border-gray-700 rounded-lg p-3 text-white focus:border-indigo-500 focus:outline-none transition-colors font-mono text-sm" />
                )}
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-800">
                <button type="button" onClick={() => setShowSettings(false)} className="px-5 py-2.5 hover:bg-gray-800 rounded-lg text-gray-300 font-medium transition-colors">Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white font-medium shadow-lg shadow-indigo-900/20 transition-colors">Save Keys</button>
              </div>
            </form>
          </div>
        </div>
      )}


      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-[#1a1f2e] p-8 rounded-xl w-full max-w-md border border-gray-700 shadow-2xl slide-in-from-bottom-4">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Server className="text-blue-500" />
              {editingId ? 'Edit Threat Intel Feed' : 'Add Threat Intel Feed'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Feed Name</label>
                <input required type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-[#0a0e1a] border border-gray-700 rounded-lg p-2.5 text-white focus:border-blue-500 focus:outline-none transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">API URL</label>
                <input required type="url" value={form.url} onChange={e => setForm({...form, url: e.target.value})} className="w-full bg-[#0a0e1a] border border-gray-700 rounded-lg p-2.5 text-white focus:border-blue-500 focus:outline-none transition-colors" />
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Integration Type</label>
                  <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full bg-[#0a0e1a] border border-gray-700 rounded-lg p-2.5 text-white focus:border-blue-500 focus:outline-none transition-colors">
                    <option>API</option>
                    <option>MANUAL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Category</label>
                  <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full bg-[#0a0e1a] border border-gray-700 rounded-lg p-2.5 text-white focus:border-blue-500 focus:outline-none transition-colors">
                    <option>Malware IPs</option>
                    <option>Malware URLs</option>
                    <option>Malware Domains</option>
                    <option>Malware Hashes</option>
                    <option>Mixed</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Pulling Schedule</label>
                <div className="flex gap-2">
                  <select value={form.freq} onChange={e => setForm({...form, freq: e.target.value})} className="w-1/2 bg-[#0a0e1a] border border-gray-700 rounded-lg p-2.5 text-white focus:border-blue-500 focus:outline-none transition-colors">
                    <option>Daily</option>
                    <option>Hourly</option>
                    <option>Weekly</option>
                    <option>Monthly</option>
                  </select>
                  <div className="flex items-center justify-center text-gray-500 w-8">at</div>
                  <select value={form.time} onChange={e => setForm({...form, time: e.target.value})} className="w-1/2 bg-[#0a0e1a] border border-gray-700 rounded-lg p-2.5 text-white focus:border-blue-500 focus:outline-none transition-colors">
                    {Array.from({length: 24}).map((_, i) => {
                      const hour = i === 0 ? 12 : i > 12 ? i - 12 : i;
                      const ampm = i >= 12 ? 'PM' : 'AM';
                      const formatted = `${hour.toString().padStart(2, '0')}:00 ${ampm}`;
                      return <option key={i} value={formatted}>{formatted}</option>;
                    })}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-800">
                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 hover:bg-gray-800 rounded-lg text-gray-300 font-medium transition-colors">Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium shadow-lg shadow-blue-900/20 transition-colors">{editingId ? 'Save Changes' : 'Add Feed'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
