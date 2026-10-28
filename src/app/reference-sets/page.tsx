"use client";

import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { referenceSetsService } from '@/services/reference-sets.service';
import { Database, Plus, Trash2, Search, X, Loader2, List, FileJson, Clock, User as UserIcon, Upload } from 'lucide-react';
import { useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { DEMO_REFERENCE_SETS, DEMO_REFERENCE_ITEMS } from '@/lib/demo-data';

const fetcher = (url: string) => fetch(url).then(res => res.json()).catch(err => {
  if (err instanceof Event) throw new Error("Network Event Error");
  throw err;
});

export default function ReferenceSetsPage() {
  const [refreshInterval, setRefreshInterval] = useState(5000);
  useEffect(() => {
    const updateInterval = () => {
      const val = sessionStorage.getItem('soc_refresh_interval');
      if (val) setRefreshInterval(parseInt(val) * 1000);
    };
    updateInterval();
    window.addEventListener('refresh_interval_change', updateInterval);
    return () => window.removeEventListener('refresh_interval_change', updateInterval);
  }, []);

  const { data: setsData, mutate: mutateSets } = useSWR('/api/reference-sets', fetcher, { refreshInterval, fallbackData: { data: DEMO_REFERENCE_SETS } });
  const sets = setsData?.data || [];
  
  const [activeSetId, setActiveSetId] = useState<string | null>('ref-01');
  const { data: itemsData, mutate: mutateItems, isLoading: itemsLoading } = useSWR(
    activeSetId ? `/api/reference-sets/${activeSetId}/items` : null, 
    fetcher
  );
  const items = itemsData?.data || [];

  const [showAddSetModal, setShowAddSetModal] = useState(false);
  const [newSetForm, setNewSetForm] = useState({ name: '', type: 'Alphanumeric', description: '', ttl_days: 0 });
  const [initialFile, setInitialFile] = useState<File | null>(null);

  const [newItemValue, setNewItemValue] = useState('');
  const [searchItem, setSearchItem] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeSetId) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;

      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length === 0) return;

      let itemsToAdd: string[] = [];
      const header = lines[0].toLowerCase();
      
      if (header.includes(',') && (header.includes('indicator') || header.includes('value'))) {
        const headers = header.split(',');
        let targetIdx = headers.findIndex(h => h.includes('indicator'));
        if (targetIdx === -1) targetIdx = headers.findIndex(h => h.includes('value'));
        if (targetIdx === -1) targetIdx = 0;

        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(',');
          if (parts.length > targetIdx && parts[targetIdx].trim()) {
            itemsToAdd.push(parts[targetIdx].trim());
          }
        }
      } else {
        for (let i = 0; i < lines.length; i++) {
          const parts = lines[i].split(',');
          if (parts[0].trim() && lines[i].toLowerCase() !== 'indicator' && lines[i].toLowerCase() !== 'value') {
            itemsToAdd.push(parts[0].trim());
          }
        }
      }

      if (itemsToAdd.length === 0) {
        alert("No valid items found in CSV.");
        return;
      }

      await fetch(`/api/reference-sets/${activeSetId}/bulk-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          items: itemsToAdd,
          added_by: sessionStorage.getItem('soc_user') || 'Administrator' 
        })
      });
      
      mutateItems();
      mutateSets();
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleCreateSet = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/reference-sets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSetForm)
    });
    const data = await res.json();
    const newSetId = data.id;

    if (initialFile && newSetId) {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const text = evt.target?.result as string;
        if (text) {
          const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          let itemsToAdd: string[] = [];
          if (lines.length > 0) {
            const header = lines[0].toLowerCase();
            if (header.includes(',') && (header.includes('indicator') || header.includes('value'))) {
              const headers = header.split(',');
              let targetIdx = headers.findIndex(h => h.includes('indicator'));
              if (targetIdx === -1) targetIdx = headers.findIndex(h => h.includes('value'));
              if (targetIdx === -1) targetIdx = 0;
              for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].split(',');
                if (parts.length > targetIdx && parts[targetIdx].trim()) itemsToAdd.push(parts[targetIdx].trim());
              }
            } else {
              for (let i = 0; i < lines.length; i++) {
                const parts = lines[i].split(',');
                if (parts[0].trim() && lines[i].toLowerCase() !== 'indicator' && lines[i].toLowerCase() !== 'value') itemsToAdd.push(parts[0].trim());
              }
            }
          }
          
          if (itemsToAdd.length > 0) {
            await fetch(`/api/reference-sets/${newSetId}/bulk-items`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                items: itemsToAdd,
                added_by: sessionStorage.getItem('soc_user') || 'Administrator' 
              })
            });
            mutateSets();
          }
        }
      };
      reader.readAsText(initialFile);
    }

    setShowAddSetModal(false);
    setNewSetForm({ name: '', type: 'Alphanumeric', description: '', ttl_days: 0 });
    setInitialFile(null);
    mutateSets();
  };

  const handleDeleteSet = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the reference set "${name}" and all its contents?`)) return;
    await referenceSetsService.deleteSet(id);
    if (activeSetId === id) setActiveSetId(null);
    mutateSets();
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemValue.trim() || !activeSetId) return;
    
    await fetch(`/api/reference-sets/${activeSetId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        value: newItemValue.trim(), 
        added_by: sessionStorage.getItem('soc_user') || 'Administrator' 
      })
    });
    setNewItemValue('');
    mutateItems();
    mutateSets(); // To update the count
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!activeSetId) return;
    await referenceSetsService.deleteItem(activeSetId, itemId);
    mutateItems();
    mutateSets();
  };

  const activeSet = sets.find((s: any) => s.id === activeSetId);
  const filteredItems = items.filter((i: any) => i.value.toLowerCase().includes(searchItem.toLowerCase()));

  return (
    <div className="p-6 bg-[var(--bg-secondary)] min-h-screen text-[var(--text-primary)] h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Database className="text-indigo-400" /> Reference Sets</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">Manage custom lists, static IoCs, exclusions, and lookup data</p>
        </div>
        <button onClick={() => setShowAddSetModal(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors shadow-lg shadow-blue-900/20">
          <Plus size={16} /> New Reference Set
        </button>
      </div>

      <div className="flex gap-6 h-full min-h-0 overflow-hidden">
        {/* Left Panel: Reference Sets List */}
        <div className="w-1/3 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/30 font-semibold text-sm">
            Available Sets ({sets.length})
          </div>
          <div className="overflow-y-auto flex-1 p-2 space-y-1">
            {sets.length === 0 && (
              <div className="p-4 text-center text-[var(--text-secondary)] text-sm mt-8">
                No reference sets found.<br/>Create one to get started.
              </div>
            )}
            {sets.map((s: any) => (
              <div 
                key={s.id} 
                onClick={() => setActiveSetId(s.id)}
                className={`p-3 rounded-lg cursor-pointer border transition-colors group ${activeSetId === s.id ? 'bg-blue-500/10 border-blue-500/30' : 'border-transparent hover:bg-[var(--bg-hover)]'}`}
              >
                <div className="flex justify-between items-start">
                  <div className="font-medium text-[var(--text-primary)] truncate pr-4">{s.name}</div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteSet(s.id, s.name); }} 
                    className={`text-red-400/50 hover:text-red-400 p-1 rounded-md hover:bg-red-500/10 transition-colors ${activeSetId === s.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex justify-between items-center mt-2 text-xs">
                  <span className="text-[var(--text-secondary)] flex items-center gap-1"><FileJson size={12}/> {s.type}</span>
                  <span className="bg-[var(--bg-secondary)] border border-[var(--border-color)] px-2 py-0.5 rounded-full text-[var(--text-secondary)] font-mono">
                    {s.count.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel: Active Set Items */}
        <div className="w-2/3 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl flex flex-col overflow-hidden relative">
          {!activeSetId ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)]">
              <Database size={48} className="mb-4 opacity-20" />
              <p>Select a Reference Set to view or manage items</p>
            </div>
          ) : (
            <>
              <div className="p-5 border-b border-[var(--border-color)] flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold text-[var(--text-primary)]">{activeSet?.name}</h2>
                  <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-xl">{activeSet?.description || 'No description provided.'}</p>
                </div>
                <div className="flex gap-2">
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] px-3 py-1 rounded text-xs font-mono text-[var(--text-secondary)]">
                    Type: {activeSet?.type}
                  </div>
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] px-3 py-1 rounded text-xs font-mono text-[var(--text-secondary)]">
                    TTL: {activeSet?.ttl_days > 0 ? `${activeSet.ttl_days} Days` : 'Permanent'}
                  </div>
                </div>
              </div>

              <div className="p-4 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/30 flex gap-4">
                <form onSubmit={handleAddItem} className="flex-1 flex gap-2">
                  <input 
                    type="text" 
                    value={newItemValue}
                    onChange={e => setNewItemValue(e.target.value)}
                    placeholder={`Add new ${activeSet?.type.toLowerCase()} value...`}
                    className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                  />
                  <button type="submit" disabled={!newItemValue.trim()} className="bg-[var(--bg-hover)] border border-[var(--border-color)] hover:border-blue-500 hover:text-blue-400 disabled:opacity-50 px-4 py-2 rounded-md text-sm font-medium transition-colors">
                    Add
                  </button>
                  <input type="file" accept=".csv,.txt" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:border-blue-500 hover:text-blue-400 px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2" title="Upload CSV">
                    <Upload size={16} /> CSV
                  </button>
                </form>
                <div className="relative w-64 shrink-0">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                  <input 
                    type="text" 
                    value={searchItem}
                    onChange={e => setSearchItem(e.target.value)}
                    placeholder="Search entries..."
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md pl-9 pr-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {itemsLoading ? (
                  <div className="flex justify-center items-center h-32"><Loader2 className="animate-spin text-blue-500" /></div>
                ) : filteredItems.length === 0 ? (
                  <div className="text-center py-12 text-[var(--text-secondary)] text-sm">
                    {searchItem ? 'No items match your search.' : 'This reference set is empty.'}
                  </div>
                ) : (
                  <table className="w-full text-left text-sm soc-table">
                    <thead className="bg-[var(--bg-secondary)] sticky top-0 border-b border-[var(--border-color)] shadow-sm">
                      <tr>
                        <th className="px-5 py-3">Value</th>
                        <th className="px-5 py-3 w-48">Added By</th>
                        <th className="px-5 py-3 w-48">Date Added</th>
                        <th className="px-5 py-3 w-16 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-color)]">
                      {filteredItems.map((item: any) => (
                        <tr key={item.id} className="hover:bg-[var(--bg-hover)]/30 group">
                          <td className="px-5 py-3 font-mono text-[var(--text-primary)]">{item.value}</td>
                          <td className="px-5 py-3 text-[var(--text-secondary)]">
                            <div className="flex items-center gap-1.5"><UserIcon size={12}/> {item.added_by}</div>
                          </td>
                          <td className="px-5 py-3 text-[var(--text-secondary)]">
                            <div className="flex items-center gap-1.5">
                              <Clock size={12}/> 
                              {item.added_at ? formatDistanceToNow(new Date(item.added_at.replace(' ', 'T') + 'Z')) + ' ago' : 'Unknown'}
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button onClick={() => handleDeleteItem(item.id)} className="text-red-400/50 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showAddSetModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold">New Reference Set</h3>
              <button onClick={() => setShowAddSetModal(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateSet} className="space-y-4">
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Set Name</label>
                <input required type="text" value={newSetForm.name} onChange={e => setNewSetForm({...newSetForm, name: e.target.value})} placeholder="e.g. Authorized Admin Users" className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] outline-none rounded p-2.5 text-[var(--text-primary)]" />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Data Type</label>
                <select value={newSetForm.type} onChange={e => setNewSetForm({...newSetForm, type: e.target.value})} className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] outline-none rounded p-2.5 text-[var(--text-primary)]">
                  <option>Alphanumeric</option>
                  <option>IP Address (IPv4)</option>
                  <option>Username</option>
                  <option>Domain / URL</option>
                  <option>Port Number</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Description (Optional)</label>
                <textarea rows={3} value={newSetForm.description} onChange={e => setNewSetForm({...newSetForm, description: e.target.value})} placeholder="What is this list used for?" className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] outline-none rounded p-2.5 text-[var(--text-primary)] resize-none" />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Retention Policy (Time To Live)</label>
                <select value={newSetForm.ttl_days} onChange={e => setNewSetForm({...newSetForm, ttl_days: parseInt(e.target.value)})} className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] outline-none rounded p-2.5 text-[var(--text-primary)]">
                  <option value={0}>Never (Permanent)</option>
                  <option value={1}>24 Hours</option>
                  <option value={7}>7 Days</option>
                  <option value={30}>30 Days</option>
                  <option value={90}>90 Days</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Bulk Upload CSV (Optional)</label>
                <input type="file" accept=".csv,.txt" onChange={e => setInitialFile(e.target.files?.[0] || null)} className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] outline-none rounded p-1.5 text-[var(--text-primary)] text-sm file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-500/10 file:text-blue-400 hover:file:bg-blue-500/20" />
              </div>
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-[var(--border-color)]">
                <button type="button" onClick={() => setShowAddSetModal(false)} className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-white transition-colors">Cancel</button>
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">Create Set</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
