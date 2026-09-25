'use client';

import React, { useState, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { Loader2, Shield, Activity, Target, Zap, Plus, Trash2, Save } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function UseCasesPage() {
  const { data: useCases, isLoading } = useSWR('/api/usecases', fetcher);
  const [isCreating, setIsCreating] = useState(false);
  const [role, setRole] = useState<string>('admin');

  useEffect(() => {
    const getCookie = (name: string) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(';').shift();
      return 'admin';
    };
    setRole(getCookie('soc_session') || 'admin');
  }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '', description: '', type: 'match',
    event_id: '', mitre_technique: '', threshold_count: 3, severity: 'high'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await fetch('/api/usecases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...formData,
          event_id: formData.event_id || null,
          mitre_technique: formData.mitre_technique || null,
          rule_logic: (formData as any).rule_logic_arr && (formData as any).rule_logic_arr.length > 0 
                      ? JSON.stringify((formData as any).rule_logic_arr) : null,
          active: true 
        })
      });
      mutate('/api/usecases');
      setIsCreating(false);
      setFormData({ title: '', description: '', type: 'match', event_id: '', mitre_technique: '', threshold_count: 3, severity: 'high' });
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/usecases/${id}`, { method: 'DELETE' });
      mutate('/api/usecases');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="p-6 space-y-6 bg-[#0f1219] min-h-screen text-white">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Detection Engine Rules</h1>
          <p className="text-gray-400 text-sm mt-1">Active rules and threshold configurations running on the SOC engine</p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus size={18} /> New Rule
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleSubmit} className="bg-[#1a1f2e] border border-gray-800 rounded-lg p-5 mb-6">
          <h3 className="text-lg font-bold mb-4">Create Custom Detection Rule</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-400 mb-1">Rule Title</label>
              <input required type="text" className="w-full bg-[#11141e] border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-400 mb-1">Description</label>
              <input type="text" className="w-full bg-[#11141e] border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Rule Type</label>
              <select className="w-full bg-[#11141e] border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                <option value="match">Exact Match</option>
                <option value="threshold">Threshold (Multiple occurrences)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Severity</label>
              <select className="w-full bg-[#11141e] border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none" value={formData.severity} onChange={e => setFormData({...formData, severity: e.target.value})}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Target Event ID (Optional)</label>
              <input type="text" placeholder="e.g. 4625" className="w-full bg-[#11141e] border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none" value={formData.event_id} onChange={e => setFormData({...formData, event_id: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">MITRE Technique (Optional)</label>
              <input type="text" placeholder="e.g. T1110" className="w-full bg-[#11141e] border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none" value={formData.mitre_technique} onChange={e => setFormData({...formData, mitre_technique: e.target.value})} />
            </div>
            {formData.type === 'threshold' && (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Threshold Count</label>
                <input required type="number" min="2" className="w-full bg-[#11141e] border border-gray-700 rounded p-2 text-white focus:border-blue-500 outline-none" value={formData.threshold_count} onChange={e => setFormData({...formData, threshold_count: parseInt(e.target.value)})} />
              </div>
            )}
            <div className="md:col-span-2 mt-4 pt-4 border-t border-gray-800">
              <label className="block text-sm font-medium text-gray-400 mb-2">Advanced Parser Rules (Key-Value Matching)</label>
              <div className="space-y-2">
                {(formData as any).rule_logic_arr?.map((rule: any, i: number) => (
                  <div key={i} className="flex gap-2 items-center bg-[#11141e] p-2 rounded border border-gray-700">
                    <input type="text" placeholder="Attribute (e.g. srcip)" className="flex-1 bg-transparent border-none outline-none text-sm text-white" value={rule.attribute} 
                      onChange={e => {
                        const newArr = [...((formData as any).rule_logic_arr || [])];
                        newArr[i].attribute = e.target.value;
                        setFormData({...formData, rule_logic_arr: newArr} as any);
                      }} />
                    <select className="w-32 bg-[#0f1219] border border-gray-600 rounded text-sm text-white outline-none" value={rule.operator}
                      onChange={e => {
                        const newArr = [...((formData as any).rule_logic_arr || [])];
                        newArr[i].operator = e.target.value;
                        setFormData({...formData, rule_logic_arr: newArr} as any);
                      }}>
                      <option value="=">=</option>
                      <option value="!=">!=</option>
                      <option value="IN">IN</option>
                      <option value="CONTAINS">CONTAINS</option>
                      <option value="NOT CONTAINS">NOT CONTAINS</option>
                    </select>
                    <input type="text" placeholder="Value" className="flex-1 bg-transparent border-none outline-none text-sm text-white" value={rule.value} 
                      onChange={e => {
                        const newArr = [...((formData as any).rule_logic_arr || [])];
                        newArr[i].value = e.target.value;
                        setFormData({...formData, rule_logic_arr: newArr} as any);
                      }} />
                    <button type="button" className="text-gray-500 hover:text-red-500" onClick={() => {
                      const newArr = [...((formData as any).rule_logic_arr || [])];
                      newArr.splice(i, 1);
                      setFormData({...formData, rule_logic_arr: newArr} as any);
                    }}><Trash2 size={16} /></button>
                  </div>
                ))}
                <button type="button" onClick={() => {
                  setFormData({...formData, rule_logic_arr: [...((formData as any).rule_logic_arr || []), {attribute: '', operator: '=', value: ''}]} as any)
                }} className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-2">
                  <Plus size={14} /> Add Condition
                </button>
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-4 mt-4 border-t border-gray-800">
            <button type="button" onClick={() => setIsCreating(false)} className="px-4 py-2 text-gray-400 hover:text-white transition-colors">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded flex items-center gap-2 transition-colors disabled:opacity-50">
              <Save size={16} /> Deploy Rule
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="py-12 flex justify-center bg-[#1a1f2e] border border-gray-800 rounded-lg">
          <Loader2 className="animate-spin text-blue-500" size={32} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {useCases?.map((uc: any) => (
            <div key={uc.id} className="bg-[#1a1f2e] border border-gray-800 rounded-lg p-5 hover:border-blue-500/50 transition-colors flex flex-col group">
              <div className="flex justify-between items-start mb-4">
                <div className="bg-blue-500/10 p-2 rounded-lg text-blue-400">
                  <Shield size={20} />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono bg-gray-800 px-2 py-1 rounded text-gray-300">{uc.id}</span>
                  {role !== 'readonly' && role !== 'l1' && (
                    <button onClick={() => handleDelete(uc.id)} className="text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={16}/></button>
                  )}
                </div>
              </div>
              
              <h3 className="text-lg font-bold mb-2">{uc.title}</h3>
              <p className="text-gray-400 text-sm mb-4 flex-grow">{uc.description}</p>
              
              <div className="space-y-3 mt-auto pt-4 border-t border-gray-800">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 flex items-center gap-2"><Activity size={14} /> Type</span>
                  <span className="text-white capitalize">{uc.type} Rule</span>
                </div>
                {uc.type === 'threshold' && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 flex items-center gap-2"><Zap size={14} /> Threshold Count</span>
                    <span className="text-yellow-400 font-bold">{uc.threshold_count} matches</span>
                  </div>
                )}
                {uc.mitre_technique && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 flex items-center gap-2"><Target size={14} /> MITRE ATT&CK</span>
                    <span className="text-blue-400">{uc.mitre_technique}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 flex items-center gap-2"><Shield size={14} /> Severity Action</span>
                  <span className={`capitalize ${
                    uc.severity === 'critical' ? 'text-red-500' :
                    uc.severity === 'high' ? 'text-orange-500' : 'text-yellow-500'
                  }`}>
                    {uc.severity}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

