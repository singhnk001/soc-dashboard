"use client";

import React, { useState, useEffect } from "react";
import { ShieldAlert, Search, Plus, RefreshCw, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function ThreatIntelPage() {
  const [feeds, setFeeds] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [form, setForm] = useState({
    name: '',
    url: '',
    type: 'API',
    category: 'Malware IPs'
  });

  const fetchFeeds = async () => {
    try {
      const res = await fetch('/api/threat-feeds');
      const data = await res.json();
      setFeeds(data.data || []);
     } catch (e) { console.error(e); } finally { setIsLoading(false); }
  };

  useEffect(() => { fetchFeeds(); }, []);

  const handleSync = async (id: string) => {
    await fetch(`/api/threat-feeds/${id}/sync`, { method: 'POST' });
    fetchFeeds();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/threat-feeds/${id}`, { method: 'DELETE' });
    fetchFeeds();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/threat-feeds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    setShowModal(false);
    setForm({ name: '', url: '', type: 'API', category: 'Malware IPs' });
    fetchFeeds();
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
          <p className="text-gray-400">Manage and sync external IoC feeds for detection</p>
        </div>
        
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors text-sm"
        >
          <Plus size={16} /> Add Threat Feed
        </button>
      </div>

      <div className="bg-[#1a1f2e] border border-gray-800 rounded-lg overflow-hidden flex flex-col h-[600px]">
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
                <th className="px-6 py-3 font-medium border-b border-gray-800">Feed Name</th>
                <th className="px-6 py-3 font-medium border-b border-gray-800">Type</th>
                <th className="px-6 py-3 font-medium border-b border-gray-800">Status</th>
                <th className="px-6 py-3 font-medium border-b border-gray-800">Indicators</th>
                <th className="px-6 py-3 font-medium border-b border-gray-800">Last Sync</th>
                <th className="px-6 py-3 font-medium border-b border-gray-800 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredFeeds.map((f: any) => (
                <tr key={f.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-6 py-3 font-medium text-white">{f.name} (({f.category}))</td>
                  <td className="px-6 py-3">{f.type}</td>
                  <td className="px-6 py-3">
                    <span className={"inline-flex items-center px-2 py-0.5 rounded-text-xs " + (
                      f.status === 'Active' ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                    )}>
                      {f.status}
                    </span>
                  </td>
                  <td className="px-6 py-3">{f.indicator_count.toLocaleString()}</td>
                  <td className="px-6 py-3">
                    {f.last_updated ? formatDistanceToNow(new Date(f.last_updated)) + ' ago' : 'Never'}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => handleSync(f.id)} className="text-blue-400 hover:text-blue-300" title="Sync Now">
                        <RefreshCw size={18} />
                      </button>
                      <button onClick={() => handleDelete(f.id)} className="text-red-400 hover:text-red-300" title="Delete">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#1a1f2e] p-6 rounded-lg w-full max-w-md border border-gray-800">
            <h2 className="text-xl font-bold text-white mb-4">Add Threat Intel Feed</h2>
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
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 hover:bg-gray-800 rounded text-gray-300">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white">Add Feed</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}



