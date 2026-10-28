"use client";

import React, { useState, useEffect, useRef } from "react";
import { ShieldAlert, Check, X, Search, Plus, RefreshCw, Trash2, Edit2, ChevronDown, ChevronRight, Download, Upload, Server, FileSearch, Globe, Code, Settings } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { threatIntelService, systemService } from "@/services";
import { DEMO_THREAT_FEEDS, getDemoIndicatorsForFeed } from "@/lib/demo-data";

export default function ThreatIntelPage() {
  const [activeTab, setActiveTab] = useState<'feeds' | 'lookup'>('feeds');
  const [feeds, setFeeds] = useState<any[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [indicators, setIndicators] = useState<Record<string, any[]>>({});
  const [loadingIndicators, setLoadingIndicators] = useState<Set<string>>(new Set());
  const [csvDownloading, setCsvDownloading] = useState<Set<string>>(new Set());

  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  useEffect(() => {
    try {
      const userStr = sessionStorage.getItem("user");
      if (userStr) setCurrentUser(JSON.parse(userStr));
    } catch(e) {}
  }, []);
  
  const canEdit = currentUser && currentUser.role !== "readonly";
  
  // Settings State
  const [apiKeys, setApiKeys] = useState({
    OTX_API_KEY: '',
    VIRUSTOTAL_API_KEY: '',
    IBM_XFORCE_KEY: '',
    IBM_XFORCE_PASS: '',
    CISCO_TALOS_KEY: '',
    ABUSEIPDB_API_KEY: ''
  });

  // Community Feeds State
  const [communityStatus, setCommunityStatus] = useState<Record<string, any>>({});
  const [communityLoading, setCommunityLoading] = useState<Record<string, boolean>>({});
  const [showCommunityPanel, setShowCommunityPanel] = useState(false);

  // OTX Browse State
  const [showOtxBrowser, setShowOtxBrowser] = useState(false);
  const [otxStatus, setOtxStatus] = useState<{configured: boolean; username?: string} | null>(null);
  const [otxPulses, setOtxPulses] = useState<any[]>([]);
  const [otxSearch, setOtxSearch] = useState('');
  const [otxLoading, setOtxLoading] = useState(false);
  const [otxLoadingMsg, setOtxLoadingMsg] = useState('');
  const [otxError, setOtxError] = useState('');
  const [otxImporting, setOtxImporting] = useState<Set<string>>(new Set());
  const [otxImported, setOtxImported] = useState<Set<string>>(new Set());

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
      const data = await threatIntelService.getFeeds();
      const feedList = (data && data.data && data.data.length > 0) ? data.data : (DEMO_THREAT_FEEDS as any[]);
      setFeeds(feedList);
      const initialIndicators: Record<string, any[]> = {};
      feedList.forEach((f: any) => {
        initialIndicators[f.id] = getDemoIndicatorsForFeed(f.id);
      });
      setIndicators(prev => ({ ...initialIndicators, ...prev }));
    } catch (e) {
      console.error(e);
      setFeeds(DEMO_THREAT_FEEDS as any[]);
      const initialIndicators: Record<string, any[]> = {};
      DEMO_THREAT_FEEDS.forEach(f => {
        initialIndicators[f.id] = getDemoIndicatorsForFeed(f.id);
      });
      setIndicators(prev => ({ ...initialIndicators, ...prev }));
    } finally {
      setIsLoading(false);
    }
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
    checkOtxStatus();
    fetchCommunityStatus();
  }, []);

  const fetchCommunityStatus = async () => {
    try {
      const data = await threatIntelService.getCommunityStatus();
      if (data.status === 'success') setCommunityStatus(data.data || {});
    } catch (e) {}
  };

  const handleCommunitySyncOne = async (slug: string) => {
    setCommunityLoading(prev => ({ ...prev, [slug]: true }));
    try {
      const res = await fetch(`/api/community-feeds/${slug}/sync`, { method: 'POST' });
      const data = await res.json();
      if (data.status === 'success') {
        await fetchCommunityStatus();
        fetchFeeds();
      } else {
        alert(data.message || 'Sync failed');
      }
    } catch (e: any) {
      alert(e.message || 'Sync failed');
    }
    setCommunityLoading(prev => ({ ...prev, [slug]: false }));
  };

  const toggleRow = async (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
      setExpandedRows(newExpanded);
    } else {
      newExpanded.add(id);
      setExpandedRows(newExpanded);
      if (!indicators[id] || indicators[id].length === 0) {
        setLoadingIndicators(prev => new Set(prev).add(id));
        try {
          const res = await fetch('/api/threat-feeds/' + id + '/indicators');
          const data = await res.json();
          const items = (data && data.data && data.data.length > 0) ? data.data : getDemoIndicatorsForFeed(id);
          setIndicators(prev => ({ ...prev, [id]: items }));
        } catch (e) {
          console.error(e);
          setIndicators(prev => ({ ...prev, [id]: getDemoIndicatorsForFeed(id) }));
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

  const importInputRef = useRef<Record<string, HTMLInputElement | null>>({});

  const handleDeleteIndicator = async (feedId: string, indicatorId: string) => {
    await fetch('/api/threat-feeds/' + feedId + '/indicators/' + indicatorId, { method: 'DELETE' });
    setIndicators(prev => ({
      ...prev,
      [feedId]: (prev[feedId] || []).filter((ioc: any) => ioc.id !== indicatorId)
    }));
    fetchFeeds();
  };

  const handleDownloadCSV = async (feedId: string, feedName: string) => {
    // Always fetch ALL indicators fresh for export — do not use cached 100-row preview
    let data: any[] | null = null;
    setCsvDownloading(prev => new Set(prev).add(feedId));
    try {
      const res = await fetch('/api/threat-feeds/' + feedId + '/indicators?all=true');
      if (res.ok) {
        const json = await res.json();
        data = json.data;
      }
    } catch (e) {
      alert('Failed to fetch indicators for export');
      return;
    } finally {
      setCsvDownloading(prev => { const s = new Set(prev); s.delete(feedId); return s; });
    }
    if (!data || data.length === 0) return;
    // Build CSV with only IoC Type and Indicator — no Description
    const rows = ['"IoC Type","Indicator"'];
    for (const ioc of data) {
      rows.push('"' + String(ioc.type).replace(/"/g, '""') + '","' + String(ioc.indicator).replace(/"/g, '""') + '"');
    }
    const csv = rows.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = feedName.replace(/\s+/g, '_') + '_indicators.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportCSV = async (feedId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/threat-feeds/' + feedId + '/import', { method: 'POST', body: formData });
    const data = await res.json();
    fetchFeeds();
    // Refresh indicators for this feed
    const res2 = await fetch('/api/threat-feeds/' + feedId + '/indicators');
    const data2 = await res2.json();
    setIndicators(prev => (Object.assign({}, prev, { [feedId]: data2.data })));
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
    // Re-check OTX status after saving
    checkOtxStatus();
  };

  const checkOtxStatus = async () => {
    try {
      const res = await fetch('/api/otx/status');
      const data = await res.json();
      setOtxStatus(data);
    } catch (e) {}
  };

  const openOtxBrowser = async () => {
    setShowOtxBrowser(true);
    setOtxError('');
    // Don't auto-load subscribed pulses on open — the /pulses/subscribed endpoint
    // is slow (20-30s+) and times out. User can search instead; results are cached below.
    await checkOtxStatus();
    // If we already have cached results from a prior search, keep them visible
    // Otherwise show the empty state prompting the user to search
  };

  const [otxPage, setOtxPage] = useState(1);

  const handleOtxSearch = async (e: React.FormEvent, page = 1) => {
    e.preventDefault();
    setOtxLoading(true);
    setOtxError('');
    setOtxPage(page);
    const isUrl = otxSearch.trim().includes('otx.alienvault.com/pulse/');
    const isBlank = !otxSearch.trim();
    setOtxLoadingMsg(
      isUrl ? 'Fetching pulse by URL...' :
      isBlank ? `Loading your subscribed pulses (page ${page})...` :
      'Searching OTX pulses...'
    );
    try {
      const params = new URLSearchParams({ limit: '20', page: String(page) });
      if (otxSearch.trim()) params.set('search', otxSearch.trim());
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 120000);
      const res = await fetch(`/api/otx/pulses?${params}`, { signal: ctrl.signal });
      clearTimeout(tid);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'OTX API error');
      setOtxPulses(data.data || []);
      if ((data.data || []).length === 0) {
        setOtxError(isBlank
          ? 'No subscribed pulses found on this page.'
          : 'No pulses found. Try a different keyword or paste a full OTX pulse URL.');
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setOtxError('Timed out. AlienVault servers are slow — try a keyword search instead, or paste a direct pulse URL.');
      } else {
        setOtxError(e.message || 'Search failed');
      }
    }
    setOtxLoading(false);
    setOtxLoadingMsg('');
  };

  const handleOtxImport = async (pulseId: string) => {
    setOtxImporting(prev => new Set(prev).add(pulseId));
    try {
      const res = await fetch('/api/otx/import/' + pulseId, { method: 'POST' });
      const data = await res.json();
      if (data.status === 'success' || data.status === 'exists' || data.status === 'importing') {
        setOtxImported(prev => new Set(prev).add(pulseId));
        fetchFeeds();
        // If background import is in progress, poll until it finishes
        if (data.status === 'importing' && data.feed_id) {
          const pollId = data.feed_id;
          let attempts = 0;
          const poll = setInterval(async () => {
            attempts++;
            try {
              const pr = await fetch('/api/threat-feeds/' + pollId);
              const pd = await pr.json();
              const feed = pd.data;
              if (feed && (feed.status === 'Active' || feed.status === 'Error')) {
                clearInterval(poll);
                fetchFeeds();
              }
            } catch {}
            if (attempts > 30) clearInterval(poll); // max 60s polling
          }, 2000);
        }
      }
    } catch (e) {}
    setOtxImporting(prev => { const s = new Set(prev); s.delete(pulseId); return s; });
  };

  // Smart sync: OTX feeds use the API-key-based sync endpoint
  const handleSync = async (id: string, feedUrl?: string) => {
    // Always use the unified sync endpoint — it handles both OTX and CSV feeds
    await fetch('/api/threat-feeds/' + id + '/sync', { method: 'POST' });
    fetchFeeds();
    if (expandedRows.has(id)) {
      const res = await fetch('/api/threat-feeds/' + id + '/indicators');
      const data = await res.json();
      setIndicators(prev => (Object.assign({}, prev, { [id]: data.data })));
    }
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
    <div className="p-4 md:p-6 w-full space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-4 border-b border-[var(--border-color)] pb-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
            <ShieldAlert className="text-blue-500" />
            Threat Intelligence Center
          </h1>
          <p className="text-[var(--text-secondary)]">Manage external IoC feeds and perform deep VirusTotal investigations</p>
        </div>
        <div className="flex bg-[var(--bg-secondary)] rounded-lg p-1 border border-[var(--border-color)]">
          <button 
            onClick={() => setActiveTab('feeds')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors text-sm font-medium ${activeTab === 'feeds' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow' : 'text-[var(--text-secondary)] hover:text-gray-200'}`}
          >
            <Server size={16} /> Threat Feeds
          </button>
          <button 
            onClick={() => setActiveTab('lookup')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors text-sm font-medium ${activeTab === 'lookup' ? 'bg-[var(--bg-card)] text-blue-400 shadow' : 'text-[var(--text-secondary)] hover:text-gray-200'}`}
          >
            <FileSearch size={16} /> IoC Lookup
          </button>
        </div>
      </div>

      {activeTab === 'feeds' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div className="relative w-full sm:w-80 md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input 
                type="text"
                placeholder="Search threat feeds..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg pl-10 pr-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-blue-500 transition-colors shadow-inner"
              />
            </div>
            {canEdit && <div className="flex flex-wrap items-center gap-2">
              <button 
                onClick={() => setShowCommunityPanel(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-400 rounded-lg transition-colors text-sm font-medium"
                title="Import free community threat intelligence feeds"
              >
                <ShieldAlert size={18} />
                Community Feeds
                {Object.values(communityStatus).some((s: any) => s.imported) && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                )}
              </button>
              <button 
                onClick={openOtxBrowser}
                className="flex items-center gap-2 px-4 py-2.5 bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/40 text-orange-400 rounded-lg transition-colors text-sm font-medium"
                title={otxStatus?.configured ? `OTX: ${otxStatus.username}` : 'OTX API key not set'}
              >
                <Globe size={18} />
                AlienVault OTX
                {otxStatus?.configured && <span className="w-2 h-2 rounded-full bg-green-400" />}
              </button>
              <button 
                onClick={openAddModal}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-[var(--text-primary)] rounded-lg transition-colors text-sm font-medium shadow-lg shadow-blue-900/20"
              >
                <Plus size={18} /> Configure Feed
              </button>
            </div>}
          </div>

          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden flex flex-col shadow-xl">
            <div className="overflow-x-auto overflow-y-auto custom-scrollbar" style={{maxHeight: '600px'}}>
              <table className="w-full text-left text-sm text-[var(--text-secondary)]">
                <thead className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] sticky top-0 z-10 shadow-sm border-b border-[var(--border-color)]">
                  <tr>
                    <th className="px-4 py-4 font-semibold w-8"></th>
                    <th className="px-4 py-4 font-semibold min-w-[200px]">Feed Name</th>
                    <th className="px-4 py-4 font-semibold min-w-[100px]">Type</th>
                    <th className="px-4 py-4 font-semibold min-w-[100px]">Status</th>
                    <th className="px-4 py-4 font-semibold min-w-[100px]">Indicators</th>
                    <th className="px-4 py-4 font-semibold min-w-[140px]">Schedule</th>
                    <th className="px-4 py-4 font-semibold min-w-[130px]">Last Sync</th>
                    <th className="px-4 py-4 font-semibold text-right min-w-[100px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {filteredFeeds.map((f: any) => (
                    <React.Fragment key={f.id}>
                      <tr className={"hover:bg-[#1f2537] transition-colors group " + (expandedRows.has(f.id) ? "bg-[#1f2537]" : "")}>
                        <td className="px-4 py-4 cursor-pointer text-gray-500 group-hover:text-blue-400" onClick={() => toggleRow(f.id)}>
                          {expandedRows.has(f.id) ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}
                        </td>
                        <td className="px-4 py-4 cursor-pointer" onClick={() => toggleRow(f.id)}>
                          <div className="font-medium text-[var(--text-primary)]">{f.name}</div>
                          <div className="text-xs text-gray-500 mt-1">{f.category}</div>
                        </td>
                        <td className="px-4 py-4"><span className="text-[var(--text-secondary)] bg-[var(--bg-hover)]/50 px-2 py-1 rounded text-xs">{f.type}</span></td>
                        <td className="px-4 py-4">
                          <div className={"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border " + (
                            f.status === 'Active' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                          )}>
                            <div className={`w-1.5 h-1.5 rounded-full ${f.status === 'Active' ? 'bg-emerald-400' : 'bg-rose-400'}`}></div>
                            {f.status}
                          </div>
                        </td>
                        <td className="px-4 py-4 font-mono text-[var(--text-secondary)]">{(f.indicator_count || 0).toLocaleString()}</td>
                        <td className="px-4 py-4 text-[var(--text-secondary)]">{f.schedule}</td>
                        <td className="px-4 py-4 text-[var(--text-secondary)]">
                          {f.last_updated ? formatDistanceToNow(new Date(f.last_updated)) + ' ago' : 'Never'}
                        </td>
                        <td className="px-4 py-4 text-right">
                          {canEdit && (
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => handleSync(f.id, f.url)} className="p-1.5 text-blue-400 hover:bg-blue-400/10 rounded" title="Sync Now">
                                <RefreshCw size={16} />
                              </button>
                              <button onClick={() => handleEdit(f)} className="p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] rounded" title="Edit Feed">
                                <Edit2 size={16} />
                              </button>
                              <button onClick={() => handleDelete(f.id)} className="p-1.5 text-rose-400 hover:bg-rose-400/10 rounded" title="Delete">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {expandedRows.has(f.id) && (
                        <tr className="bg-[var(--bg-secondary)]">
                          <td colSpan={8} className="p-0">
                            <div className="px-6 py-5 border-l-2 border-blue-500">
                              <div className="flex justify-between items-center mb-4">
                                <h4 className="text-[var(--text-secondary)] font-medium flex items-center gap-2">
                                  <ShieldAlert size={16} className="text-blue-500"/> Previewing Top Indicators
                                </h4>
                                {indicators[f.id] && indicators[f.id].length > 0 && (
                                  <div className="flex items-center gap-2">
                                    <button 
                                      onClick={() => handleDownloadCSV(f.id, f.name)}
                                      disabled={csvDownloading.has(f.id)}
                                      className="flex items-center gap-2 px-4 py-1.5 bg-[var(--bg-card)] border border-[var(--border-color)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] rounded-md text-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-wait"
                                    >
                                      {csvDownloading.has(f.id) ? (
                                        <><RefreshCw size={14} className="animate-spin" /> Fetching all...</>
                                      ) : (
                                        <><Download size={14} /> Download Full CSV</>
                                      )}
                                    </button>
                                    <input
                                      type="file"
                                      accept=".csv"
                                      className="hidden"
                                      ref={el => { importInputRef.current[f.id] = el; }}
                                      onChange={async e => {
                                        const file = e.target.files?.[0];
                                        if (file) await handleImportCSV(f.id, file);
                                        e.target.value = '';
                                      }}
                                    />
                                    <button
                                      onClick={() => importInputRef.current[f.id]?.click()}
                                      className="flex items-center gap-2 px-4 py-1.5 bg-[var(--bg-card)] border border-[var(--border-color)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] rounded-md text-sm transition-colors shadow-sm"
                                    >
                                      <Upload size={14} /> Import CSV
                                    </button>
                                  </div>
                                )}
                              </div>
                              {loadingIndicators.has(f.id) ? (
                                <div className="text-gray-500 animate-pulse py-8 text-center bg-[var(--bg-card)] rounded-lg border border-[var(--border-color)] border-dashed">Extracting intelligence...</div>
                              ) : !indicators[f.id] || indicators[f.id].length === 0 ? (
                                <div className="text-gray-600 py-8 text-center bg-[var(--bg-card)] rounded-lg border border-[var(--border-color)] border-dashed">
                                  <p className="mb-3">No active indicators found. Sync the feed to pull data.</p>
                                  <div>
                                    <input
                                      type="file"
                                      accept=".csv"
                                      className="hidden"
                                      ref={el => { importInputRef.current[f.id] = el; }}
                                      onChange={async e => {
                                        const file = e.target.files?.[0];
                                        if (file) await handleImportCSV(f.id, file);
                                        e.target.value = '';
                                      }}
                                    />
                                    <button
                                      onClick={() => importInputRef.current[f.id]?.click()}
                                      className="flex items-center gap-2 px-4 py-1.5 mx-auto bg-[var(--bg-card)] border border-[var(--border-color)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] rounded-md text-sm transition-colors shadow-sm"
                                    >
                                      <Upload size={14} /> Import CSV
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="max-h-96 overflow-y-auto border border-[var(--border-color)] rounded-lg custom-scrollbar bg-[var(--bg-card)] shadow-inner">
                                  <table className="w-full">
                                    <thead className="sticky top-0 bg-[var(--bg-card)] shadow-sm z-10">
                                      <tr className="border-b border-[var(--border-color)] text-[var(--text-secondary)] text-xs uppercase tracking-wider">
                                        <th className="px-6 py-3 font-medium w-48 text-left">IoC Type</th>
                                        <th className="px-6 py-3 font-medium text-left">Raw Indicator</th>
                                        <th className="px-6 py-3 font-medium w-16 text-right"></th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800/50">
                                      {indicators[f.id].map((ioc: any, idx: number) => (
                                        <tr key={ioc.id || idx} className="hover:bg-[#23293b] group">
                                          <td className="px-6 py-2.5">
                                            <span className="px-2 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-md text-xs font-medium">
                                              {ioc.type}
                                            </span>
                                          </td>
                                          <td className="px-6 py-2.5 text-[var(--text-secondary)] font-mono text-sm text-left">{ioc.indicator}</td>
                                          <td className="px-6 py-2.5 text-right">
                                            {canEdit && (
                                              <button
                                                onClick={() => handleDeleteIndicator(f.id, ioc.id)}
                                                className="p-1.5 text-rose-400 hover:bg-rose-400/10 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="Delete indicator"
                                              >
                                                <Trash2 size={14} />
                                              </button>
                                            )}
                                          </td>
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
            <h2 className="text-xl font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Globe className="text-indigo-400" /> Deep Indicator Lookup
            </h2>
            {canEdit && <button onClick={() => setShowSettings(true)} className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-[var(--text-secondary)] rounded transition-colors text-sm">
              <Settings size={16} /> API Settings
            </button>}
          </div>
          
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-8 shadow-xl">
            <p className="text-[var(--text-secondary)] text-sm mb-6">Query external intelligence providers in real-time to analyze suspicious IPs, URLs, Domains, or File Hashes.</p>
            
            <form onSubmit={handleLookup} className="flex gap-4">
              <select 
                value={vtProvider} 
                onChange={e => { setVtProvider(e.target.value); setVtResult(null); setVtError(''); }}
                className="w-48 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-indigo-500 font-medium"
              >
                <optgroup label="Commercial">
                  <option value="VirusTotal">VirusTotal</option>
                  <option value="IBM X-Force">IBM X-Force</option>
                  <option value="Cisco Talos">Cisco Talos</option>
                </optgroup>
                <optgroup label="Community (Free)">
                  <option value="AbuseIPDB">AbuseIPDB</option>
                  <option value="ThreatFox">ThreatFox (abuse.ch)</option>
                  <option value="URLhaus">URLhaus (abuse.ch)</option>
                </optgroup>
              </select>
              <select 
                value={vtType} 
                onChange={e => setVtType(e.target.value)}
                className="w-40 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-indigo-500 font-medium"
              >
                {vtProvider === 'AbuseIPDB' ? (
                  <option value="IP">IP Address</option>
                ) : vtProvider === 'URLhaus' ? (
                  <>
                    <option value="Domain">Domain</option>
                    <option value="URL">URL</option>
                    <option value="IP">IP Address</option>
                  </>
                ) : vtProvider === 'ThreatFox' ? (
                  <>
                    <option value="IP">IP Address</option>
                    <option value="Domain">Domain</option>
                    <option value="Hash">File Hash</option>
                    <option value="URL">URL</option>
                  </>
                ) : (
                  <>
                    <option value="IP">IP Address</option>
                    <option value="Hash">File Hash</option>
                    <option value="Domain">Domain / URL</option>
                  </>
                )}
              </select>
              <div className="relative flex-grow">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input 
                  required
                  type="text"
                  placeholder="e.g. 8.8.8.8 or a2b3c4..."
                  value={vtInput}
                  onChange={e => setVtInput(e.target.value)}
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg pl-10 pr-4 py-3 text-[var(--text-primary)] focus:outline-none focus:border-indigo-500 font-mono shadow-inner"
                />
              </div>
              <button 
                type="submit"
                disabled={vtLoading}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-[var(--text-primary)] font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
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
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-6 shadow-xl animate-in fade-in">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <div className="flex items-center gap-3 text-xl font-bold text-[var(--text-primary)] mb-1">
                    {vtType === 'IP' ? <Server className="text-blue-400"/> : vtType === 'Domain' ? <Globe className="text-emerald-400"/> : <Code className="text-purple-400"/>}
                    {vtInput}
                  </div>
                  <div className="text-sm text-indigo-400 mb-2 font-medium">Provider: {vtProvider}</div>
                  <div className="flex gap-4 mt-2 text-sm text-[var(--text-secondary)]">
                    {vtResult.owner && <span>Owner: <span className="text-gray-200">{vtResult.owner}</span></span>}
                    {vtResult.country && <span>Country: <span className="text-gray-200">{vtResult.country}</span></span>}
                    {vtResult.name && <span>Context/Name: <span className="text-gray-200">{vtResult.name}</span></span>}
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="text-sm text-[var(--text-secondary)] mb-1">Reputation Score</div>
                  <div className={`text-3xl font-bold ${
                    vtProvider === 'VirusTotal' ? (
                      (vtResult.reputation || 0) < 0 ? 'text-rose-500' : (vtResult.reputation || 0) > 0 ? 'text-emerald-500' : 'text-[var(--text-secondary)]'
                    ) : (
                      (vtResult.reputation || 0) >= 7 ? 'text-rose-500' : (vtResult.reputation || 0) >= 4 ? 'text-amber-500' : 'text-emerald-500'
                    )
                  }`}>
                    {vtResult.reputation || 0}
                  </div>
                </div>
              </div>

              <h4 className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-4 border-b border-[var(--border-color)] pb-2">Analysis Results</h4>
              
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
                <div className="bg-gray-700/20 border border-[var(--border-color)]/50 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-[var(--text-secondary)]">{vtResult.stats?.undetected || 0}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">Undetected</div>
                </div>
              </div>

              {/* Extra details for community providers */}
              {vtResult.extra && Object.keys(vtResult.extra).length > 0 && (
                <div className="mt-4 border-t border-[var(--border-color)] pt-4">
                  <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Additional Intel</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(vtResult.extra).map(([k, v]: [string, any]) => (
                      <div key={k} className="bg-[var(--bg-secondary)] rounded-lg px-3 py-2">
                        <div className="text-xs text-[var(--text-secondary)] capitalize">{k.replace(/_/g, ' ')}</div>
                        <div className="text-sm text-[var(--text-primary)] font-mono mt-0.5 break-all">
                          {typeof v === 'boolean' ? (v ? '✓ Yes' : '✗ No') : String(v) || '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      
      {showCommunityPanel && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-[var(--bg-card)] rounded-2xl w-full max-w-2xl border border-[var(--border-color)] shadow-2xl flex flex-col" style={{maxHeight: '88vh'}}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-color)]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <ShieldAlert className="text-emerald-400" size={18} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[var(--text-primary)]">Community Threat Intelligence Feeds</h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">Free, open-source — no vendor lock-in</p>
                </div>
              </div>
              <button onClick={() => setShowCommunityPanel(false)} className="w-8 h-8 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Feed cards */}
            <div className="overflow-y-auto custom-scrollbar px-6 py-5 space-y-3">

              {/* ThreatFox */}
              {(() => {
                const s = communityStatus['threatfox'] || {};
                const isActive = s.status === 'Active';
                return (
                  <div className="relative overflow-hidden bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-4 hover:border-purple-500/30 transition-all group">
                    <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-purple-500/60" />
                    <div className="flex items-center gap-4 pl-3">
                      {/* Icon */}
                      <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-purple-400 font-bold text-xs">TF</span>
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-sm font-semibold text-[var(--text-primary)]">ThreatFox</span>
                          <span className="text-xs bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-full px-2 py-0.5">abuse.ch</span>
                          <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-2 py-0.5">No key needed</span>
                          {s.imported && <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>{s.status}</span>}
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">Malware IOCs — IPs, domains, URLs, hashes tagged by family (Emotet, TrickBot, Cobalt Strike)</p>
                        {s.imported && (
                          <div className="flex items-center gap-3 mt-1.5 text-xs">
                            <span className="text-purple-400 font-semibold">{s.indicator_count?.toLocaleString()} indicators</span>
                            <span className="text-[var(--text-secondary)]">Last sync: {s.last_updated ? new Date(s.last_updated).toLocaleString() : '—'}</span>
                          </div>
                        )}
                      </div>
                      {/* Action */}
                      <button
                        onClick={() => handleCommunitySyncOne('threatfox')}
                        disabled={communityLoading['threatfox']}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/40 text-purple-300 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 flex-shrink-0"
                      >
                        {communityLoading['threatfox'] ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        {s.imported ? 'Re-Sync' : 'Import'}
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* URLhaus */}
              {(() => {
                const s = communityStatus['urlhaus'] || {};
                const isActive = s.status === 'Active';
                return (
                  <div className="relative overflow-hidden bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-4 hover:border-orange-500/30 transition-all group">
                    <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-orange-500/60" />
                    <div className="flex items-center gap-4 pl-3">
                      <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-orange-400 font-bold text-xs">URL</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-sm font-semibold text-[var(--text-primary)]">URLhaus</span>
                          <span className="text-xs bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-full px-2 py-0.5">abuse.ch</span>
                          <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-2 py-0.5">No key needed</span>
                          {s.imported && <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>{s.status}</span>}
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">Malicious URLs — active malware download sites, phishing pages, and C2 endpoints</p>
                        {s.imported && (
                          <div className="flex items-center gap-3 mt-1.5 text-xs">
                            <span className="text-orange-400 font-semibold">{s.indicator_count?.toLocaleString()} indicators</span>
                            <span className="text-[var(--text-secondary)]">Last sync: {s.last_updated ? new Date(s.last_updated).toLocaleString() : '—'}</span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleCommunitySyncOne('urlhaus')}
                        disabled={communityLoading['urlhaus']}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600/20 hover:bg-orange-600/40 border border-orange-500/40 text-orange-300 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 flex-shrink-0"
                      >
                        {communityLoading['urlhaus'] ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        {s.imported ? 'Re-Sync' : 'Import'}
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* CISA KEV */}
              {(() => {
                const s = communityStatus['cisa-kev'] || {};
                const isActive = s.status === 'Active';
                return (
                  <div className="relative overflow-hidden bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-4 hover:border-red-500/30 transition-all group">
                    <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-red-500/60" />
                    <div className="flex items-center gap-4 pl-3">
                      <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-red-400 font-bold text-xs">KEV</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-sm font-semibold text-[var(--text-primary)]">CISA KEV</span>
                          <span className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 rounded-full px-2 py-0.5">US Gov</span>
                          <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-2 py-0.5">No key needed</span>
                          {s.imported && <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>{s.status}</span>}
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">Known Exploited Vulnerabilities — authoritative CVE list with mandatory federal remediation deadlines</p>
                        {s.imported && (
                          <div className="flex items-center gap-3 mt-1.5 text-xs">
                            <span className="text-red-400 font-semibold">{s.indicator_count?.toLocaleString()} CVEs</span>
                            <span className="text-[var(--text-secondary)]">Last sync: {s.last_updated ? new Date(s.last_updated).toLocaleString() : '—'}</span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleCommunitySyncOne('cisa-kev')}
                        disabled={communityLoading['cisa-kev']}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-300 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 flex-shrink-0"
                      >
                        {communityLoading['cisa-kev'] ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        {s.imported ? 'Re-Sync' : 'Import'}
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* AbuseIPDB */}
              {(() => {
                const s = communityStatus['abuseipdb'] || {};
                const keyOk = s.key_configured;
                const isActive = s.status === 'Active';
                return (
                  <div className={`relative overflow-hidden bg-[var(--bg-secondary)] border rounded-xl p-4 transition-all ${keyOk ? 'border-[var(--border-color)] hover:border-blue-500/30' : 'border-amber-500/20 bg-amber-500/3'}`}>
                    <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-blue-500/60" />
                    <div className="flex items-center gap-4 pl-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-blue-400 font-bold text-xs">IP</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-sm font-semibold text-[var(--text-primary)]">AbuseIPDB</span>
                          <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full px-2 py-0.5">Community</span>
                          {keyOk
                            ? <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-2 py-0.5">Key configured ✓</span>
                            : <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full px-2 py-0.5">API key required</span>
                          }
                          {s.imported && <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>{s.status}</span>}
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                          Top 10,000 IPs ≥90% confidence — scanners, brute-force sources, spambots, DDoS nodes
                        </p>
                        {!keyOk
                          ? <p className="text-xs text-amber-400 mt-1">Add key in <button onClick={() => { setShowCommunityPanel(false); setShowSettings(true); }} className="underline hover:text-amber-300">Settings → API Settings</button> (free at abuseipdb.com)</p>
                          : s.imported && (
                            <div className="flex items-center gap-3 mt-1.5 text-xs">
                              <span className="text-blue-400 font-semibold">{s.indicator_count?.toLocaleString()} IPs</span>
                              <span className="text-[var(--text-secondary)]">Last sync: {s.last_updated ? new Date(s.last_updated).toLocaleString() : '—'}</span>
                            </div>
                          )
                        }
                      </div>
                      <button
                        onClick={() => keyOk ? handleCommunitySyncOne('abuseipdb') : (setShowCommunityPanel(false), setShowSettings(true))}
                        disabled={communityLoading['abuseipdb']}
                        className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors disabled:opacity-50 flex-shrink-0 ${keyOk ? 'bg-blue-600/20 hover:bg-blue-600/40 border-blue-500/40 text-blue-300' : 'bg-amber-600/20 hover:bg-amber-600/40 border-amber-500/40 text-amber-300'}`}
                      >
                        {communityLoading['abuseipdb'] ? <RefreshCw size={12} className="animate-spin" /> : keyOk ? <RefreshCw size={12} /> : <Settings size={12} />}
                        {keyOk ? (s.imported ? 'Re-Sync' : 'Import') : 'Add Key'}
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Info footer */}
              <div className="flex items-center gap-2 px-1 pt-1">
                <div className="flex-1 h-px bg-[var(--border-color)]" />
                <p className="text-xs text-[var(--text-secondary)] whitespace-nowrap">ThreatFox · URLhaus · CISA KEV are free with no registration</p>
                <div className="flex-1 h-px bg-[var(--border-color)]" />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--border-color)] flex justify-between items-center">
              <button
                onClick={() => {
                  ['threatfox','urlhaus','cisa-kev'].forEach(s => handleCommunitySyncOne(s));
                  if (communityStatus['abuseipdb']?.key_configured) handleCommunitySyncOne('abuseipdb');
                }}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-400 rounded-lg text-sm font-medium transition-colors"
              >
                <RefreshCw size={14} /> Sync All Available
              </button>
              <button onClick={() => setShowCommunityPanel(false)} className="px-5 py-2 bg-[var(--bg-hover)] hover:bg-[var(--bg-secondary)] rounded-lg text-sm text-[var(--text-secondary)] transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-[var(--bg-card)] p-8 rounded-xl w-full max-w-lg border border-[var(--border-color)] shadow-2xl slide-in-from-bottom-4">
            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-6 flex items-center gap-2">
              <Settings className="text-indigo-400" /> API Settings
            </h2>
            <form onSubmit={handleSaveSettings} className="space-y-6">
              
              {/* AlienVault OTX */}
              <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Globe size={16} className="text-orange-400" />
                  <label className="text-sm font-semibold text-orange-300">AlienVault OTX API Key</label>
                  {otxStatus?.configured && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-green-400">
                      <span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> Connected as {otxStatus.username}
                    </span>
                  )}
                </div>
                <div>
                    <input 
                      type="password" 
                      placeholder={otxStatus?.configured ? "Key saved — paste a new key to replace it" : "Paste your OTX API key from otx.alienvault.com/api"} 
                      value={apiKeys.OTX_API_KEY.includes('*') ? '' : apiKeys.OTX_API_KEY}
                      onChange={e => setApiKeys({...apiKeys, OTX_API_KEY: e.target.value})} 
                      className={`w-full bg-[var(--bg-primary)] border rounded-lg p-3 text-[var(--text-primary)] focus:outline-none transition-colors font-mono text-sm ${otxStatus?.configured ? 'border-emerald-500/40 focus:border-emerald-500' : 'border-orange-500/30 focus:border-orange-500'}`}
                    />
                    <p className="text-xs text-gray-500 mt-1.5">
                      {otxStatus?.configured 
                        ? <span className="text-emerald-400">✓ Connected as {otxStatus.username} — leave blank to keep existing key, paste to replace</span>
                        : <>Get your key at <span className="text-orange-400">otx.alienvault.com → API Integration → Copy API Key</span>. Stored encrypted in DB, never in code.</>
                      }
                    </p>
                  </div>
              </div>
              
              {/* VirusTotal */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">VirusTotal API Key</label>
                {apiKeys.VIRUSTOTAL_API_KEY && !apiKeys.VIRUSTOTAL_API_KEY.includes('***Edit') ? (
                  <div className="flex items-center justify-between bg-[var(--bg-secondary)] border border-emerald-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium overflow-hidden">
                      <Check size={16} className="flex-shrink-0" /> 
                      <span className="truncate">Configured ({apiKeys.VIRUSTOTAL_API_KEY})</span>
                    </div>
                    <button type="button" onClick={() => setApiKeys({...apiKeys, VIRUSTOTAL_API_KEY: ''})} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs underline flex-shrink-0 ml-4">Edit</button>
                  </div>
                ) : (
                  <input type="text" placeholder="Enter API Key..." value={apiKeys.VIRUSTOTAL_API_KEY} onChange={e => setApiKeys({...apiKeys, VIRUSTOTAL_API_KEY: e.target.value})} className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-3 text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none transition-colors font-mono text-sm" />
                )}
              </div>
              
              {/* IBM X-Force */}
              <div className="pt-4 border-t border-[var(--border-color)]">
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">IBM X-Force Credentials</label>
                {apiKeys.IBM_XFORCE_KEY && !apiKeys.IBM_XFORCE_KEY.includes('***Edit') ? (
                  <div className="flex items-center justify-between bg-[var(--bg-secondary)] border border-emerald-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium overflow-hidden">
                      <Check size={16} className="flex-shrink-0" /> 
                      <span className="truncate">Configured ({apiKeys.IBM_XFORCE_KEY})</span>
                    </div>
                    <button type="button" onClick={() => setApiKeys({...apiKeys, IBM_XFORCE_KEY: '', IBM_XFORCE_PASS: ''})} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs underline flex-shrink-0 ml-4">Edit</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <input type="text" placeholder="API Key" value={apiKeys.IBM_XFORCE_KEY} onChange={e => setApiKeys({...apiKeys, IBM_XFORCE_KEY: e.target.value})} className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-3 text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none transition-colors font-mono text-sm" />
                    <input type="password" placeholder="API Password" value={apiKeys.IBM_XFORCE_PASS} onChange={e => setApiKeys({...apiKeys, IBM_XFORCE_PASS: e.target.value})} className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-3 text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none transition-colors font-mono text-sm" />
                  </div>
                )}
              </div>
              
              {/* Cisco Talos */}
              <div className="pt-4 border-t border-[var(--border-color)]">
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Cisco Talos API Key</label>
                {apiKeys.CISCO_TALOS_KEY && !apiKeys.CISCO_TALOS_KEY.includes('***Edit') ? (
                  <div className="flex items-center justify-between bg-[var(--bg-secondary)] border border-emerald-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium overflow-hidden">
                      <Check size={16} className="flex-shrink-0" /> 
                      <span className="truncate">Configured ({apiKeys.CISCO_TALOS_KEY})</span>
                    </div>
                    <button type="button" onClick={() => setApiKeys({...apiKeys, CISCO_TALOS_KEY: ''})} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs underline flex-shrink-0 ml-4">Edit</button>
                  </div>
                ) : (
                  <input type="text" placeholder="Enter API Key..." value={apiKeys.CISCO_TALOS_KEY} onChange={e => setApiKeys({...apiKeys, CISCO_TALOS_KEY: e.target.value})} className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-3 text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none transition-colors font-mono text-sm" />
                )}
              </div>

              {/* AbuseIPDB */}
              <div className="pt-4 border-t border-[var(--border-color)]">
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-sm font-medium text-[var(--text-secondary)]">AbuseIPDB API Key</label>
                  <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded px-1.5 py-0.5">Free</span>
                </div>
                {apiKeys.ABUSEIPDB_API_KEY && !apiKeys.ABUSEIPDB_API_KEY.includes('*') ? (
                  <div className="flex items-center justify-between bg-[var(--bg-secondary)] border border-emerald-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium overflow-hidden">
                      <Check size={16} className="flex-shrink-0" />
                      <span className="truncate">Configured ({apiKeys.ABUSEIPDB_API_KEY})</span>
                    </div>
                    <button type="button" onClick={() => setApiKeys({...apiKeys, ABUSEIPDB_API_KEY: ''})} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs underline flex-shrink-0 ml-4">Edit</button>
                  </div>
                ) : (
                  <div>
                    <input
                      type="password"
                      placeholder={apiKeys.ABUSEIPDB_API_KEY.includes('*') ? "Key saved — paste new to replace" : "Paste your AbuseIPDB API key"}
                      value={apiKeys.ABUSEIPDB_API_KEY.includes('*') ? '' : apiKeys.ABUSEIPDB_API_KEY}
                      onChange={e => setApiKeys({...apiKeys, ABUSEIPDB_API_KEY: e.target.value})}
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-3 text-[var(--text-primary)] focus:border-emerald-500 focus:outline-none transition-colors font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Required for AbuseIPDB blocklist sync + IP lookup. Free at{' '}
                      <span className="text-emerald-400">abuseipdb.com → Account → API</span>
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-[var(--border-color)]">
                <button type="button" onClick={() => setShowSettings(false)} className="px-5 py-2.5 hover:bg-[var(--bg-hover)] rounded-lg text-[var(--text-secondary)] font-medium transition-colors">Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-[var(--text-primary)] font-medium shadow-lg shadow-indigo-900/20 transition-colors">Save Keys</button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* ── OTX Pulse Browser ── */}
      {showOtxBrowser && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-[var(--bg-card)] rounded-2xl w-full max-w-3xl border border-[var(--border-color)] shadow-2xl flex flex-col" style={{maxHeight: '85vh'}}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                  <Globe className="text-orange-400" size={17} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[var(--text-primary)]">AlienVault OTX Pulse Browser</h2>
                  {otxStatus?.configured
                    ? <p className="text-xs text-emerald-400 mt-0.5">● Connected as <span className="font-mono">{otxStatus.username}</span></p>
                    : <p className="text-xs text-amber-400 mt-0.5">⚠ API key not set — add in Settings</p>
                  }
                </div>
              </div>
              <button onClick={() => setShowOtxBrowser(false)} className="w-8 h-8 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Search bar */}
            <div className="px-5 py-3 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
              <form onSubmit={(e) => handleOtxSearch(e, 1)} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                  <input
                    type="text"
                    placeholder="Search by keyword, or paste an OTX pulse URL..."
                    value={otxSearch}
                    onChange={e => setOtxSearch(e.target.value)}
                    className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg pl-8 pr-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-gray-600 focus:outline-none focus:border-orange-500/60 transition-colors"
                  />
                </div>
                <button type="submit" className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5">
                  <Search size={13} /> Search
                </button>
                <button
                  type="button"
                  onClick={(e) => { setOtxSearch(''); handleOtxSearch(e as any, 1); }}
                  className="px-3 py-2 bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-orange-500/40 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
                >My Subscriptions</button>
              </form>
              <p className="text-xs text-gray-600 mt-1.5">Keyword filters subscribed pulses · Paste a pulse URL to import directly · "My Subscriptions" loads your full list</p>
            </div>

            {/* Pulse list */}
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {otxLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <RefreshCw className="animate-spin text-orange-400" size={24} />
                  <p className="text-sm text-[var(--text-secondary)]">{otxLoadingMsg || 'Loading...'}</p>
                  <p className="text-xs text-gray-600">OTX API can take 20–30 seconds</p>
                </div>
              ) : otxError ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
                  <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                    <X size={16} className="text-rose-400" />
                  </div>
                  <p className="text-sm text-rose-400">{otxError}</p>
                  <button onClick={() => { setOtxError(''); handleOtxSearch(new Event('submit') as any); }} className="text-xs text-orange-400 underline hover:text-orange-300">Retry</button>
                </div>
              ) : !otxStatus?.configured ? (
                <div className="text-center py-12 text-[var(--text-secondary)]">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-3">
                    <Globe size={22} className="text-amber-400" />
                  </div>
                  <p className="font-semibold text-[var(--text-primary)] mb-1">OTX API key required</p>
                  <p className="text-sm text-gray-500">Close → gear icon → add your OTX API key → save</p>
                </div>
              ) : otxPulses.length === 0 ? (
                <div className="text-center py-10 text-[var(--text-secondary)] px-6">
                  <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-3">
                    <Globe size={22} className="text-orange-400" />
                  </div>
                  <p className="font-semibold text-[var(--text-primary)] mb-2">Search for OTX pulses</p>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Type a keyword like <span className="text-orange-400 font-mono">malware</span>, <span className="text-orange-400 font-mono">ssh brute</span>, <span className="text-orange-400 font-mono">ransomware</span><br />
                    or click <strong className="text-[var(--text-primary)]">My Subscriptions</strong> to load your followed pulses
                  </p>
                  <p className="text-xs text-gray-600 mt-3 font-mono">otx.alienvault.com/pulse/60ece...</p>
                </div>
              ) : otxPulses.map((pulse: any) => (
                <div key={pulse.id} className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-3.5 hover:border-orange-500/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold text-[var(--text-primary)] text-sm">{pulse.name}</h3>
                        <span className="text-xs bg-orange-500/10 text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded-full">{pulse.tlp?.toUpperCase() || 'WHITE'}</span>
                      </div>
                      {pulse.description && <p className="text-xs text-gray-500 line-clamp-1 mb-1.5">{pulse.description}</p>}
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1">👤 {pulse.author}</span>
                        <span className="flex items-center gap-1">📌 {pulse.indicator_count > 0 ? `${pulse.indicator_count.toLocaleString()} indicators` : 'loaded on import'}</span>
                        {pulse.tags?.slice(0, 2).map((t: string) => (
                          <span key={t} className="bg-[var(--bg-primary)] border border-[var(--border-color)] px-1.5 py-0.5 rounded text-gray-500">{t}</span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => handleOtxImport(pulse.id)}
                      disabled={otxImporting.has(pulse.id) || otxImported.has(pulse.id)}
                      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        otxImported.has(pulse.id)
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 cursor-default'
                          : otxImporting.has(pulse.id)
                          ? 'bg-orange-500/10 text-orange-300 border border-orange-500/20 cursor-wait'
                          : 'bg-orange-600 hover:bg-orange-700 text-white'
                      }`}
                    >
                      {otxImported.has(pulse.id) ? (
                        <><Check size={14} /> Imported</>
                      ) : otxImporting.has(pulse.id) ? (
                        <><RefreshCw size={14} className="animate-spin" /> Importing…</>
                      ) : (
                        <><Plus size={14} /> Import</>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-[var(--border-color)] flex items-center justify-between text-xs text-gray-500">
              <span>Imported feeds sync daily using your API key — no expiring tokens</span>
              <div className="flex items-center gap-2">
                {otxPulses.length > 0 && (
                  <>
                    {otxPage > 1 && (
                      <button
                        onClick={(e) => handleOtxSearch(e as any, otxPage - 1)}
                        className="px-3 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:border-orange-500/50 rounded-lg text-[var(--text-secondary)] transition-colors"
                      >← Prev</button>
                    )}
                    <span className="text-gray-500">Page {otxPage}</span>
                    {otxPulses.length === 20 && (
                      <button
                        onClick={(e) => handleOtxSearch(e as any, otxPage + 1)}
                        className="px-3 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:border-orange-500/50 rounded-lg text-[var(--text-secondary)] transition-colors"
                      >Next →</button>
                    )}
                  </>
                )}
                <button onClick={() => setShowOtxBrowser(false)} className="px-4 py-1.5 hover:bg-[var(--bg-hover)] rounded-lg text-[var(--text-secondary)] transition-colors">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-[var(--bg-card)] p-8 rounded-xl w-full max-w-md border border-[var(--border-color)] shadow-2xl slide-in-from-bottom-4">
            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-6 flex items-center gap-2">
              <Server className="text-blue-500" />
              {editingId ? 'Edit Threat Intel Feed' : 'Add Threat Intel Feed'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Feed Name</label>
                <input required type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-2.5 text-[var(--text-primary)] focus:border-blue-500 focus:outline-none transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">API URL</label>
                <input required type="url" value={form.url} onChange={e => setForm({...form, url: e.target.value})} className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-2.5 text-[var(--text-primary)] focus:border-blue-500 focus:outline-none transition-colors" />
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Integration Type</label>
                  <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-2.5 text-[var(--text-primary)] focus:border-blue-500 focus:outline-none transition-colors">
                    <option>API</option>
                    <option>MANUAL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Category</label>
                  <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-2.5 text-[var(--text-primary)] focus:border-blue-500 focus:outline-none transition-colors">
                    <option>Malware IPs</option>
                    <option>Malware URLs</option>
                    <option>Malware Domains</option>
                    <option>Malware Hashes</option>
                    <option>Mixed</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Pulling Schedule</label>
                <div className="flex gap-2 items-center">
                  <select
                    value={form.freq}
                    onChange={e => setForm({...form, freq: e.target.value})}
                    className="w-1/2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-2.5 text-[var(--text-primary)] focus:border-blue-500 focus:outline-none transition-colors"
                  >
                    <option>Daily</option>
                    <option>Hourly</option>
                    <option>Weekly</option>
                    <option>Monthly</option>
                  </select>
                  <div className="flex items-center justify-center text-gray-500 w-8">at</div>
                  <input
                    type="time"
                    value={(() => {
                      // Convert stored "HH:MM AM/PM" to 24h for the input
                      if (!form.time) return '10:00';
                      const m = form.time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
                      if (!m) return '10:00';
                      let h = parseInt(m[1]);
                      const min = m[2];
                      const ap = m[3].toUpperCase();
                      if (ap === 'AM' && h === 12) h = 0;
                      if (ap === 'PM' && h !== 12) h += 12;
                      return String(h).padStart(2,'0') + ':' + min;
                    })()}
                    onChange={e => {
                      // Convert 24h "HH:MM" back to "HH:MM AM/PM"
                      const [hStr, mStr] = e.target.value.split(':');
                      let h = parseInt(hStr);
                      const ap = h >= 12 ? 'PM' : 'AM';
                      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
                      setForm({...form, time: String(h12).padStart(2,'0') + ':' + mStr + ' ' + ap});
                    }}
                    className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-2.5 text-[var(--text-primary)] focus:border-blue-500 focus:outline-none transition-colors"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1.5">Set any time — hours and minutes are both supported (e.g. 10:30 AM)</p>
              </div>
              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-[var(--border-color)]">
                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 hover:bg-[var(--bg-hover)] rounded-lg text-[var(--text-secondary)] font-medium transition-colors">Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-[var(--text-primary)] font-medium shadow-lg shadow-blue-900/20 transition-colors">{editingId ? 'Save Changes' : 'Add Feed'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
