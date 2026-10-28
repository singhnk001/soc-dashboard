"use client";

import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { sourcesService } from '@/services/sources.service';
import { Loader2, Server, Cloud, ShieldCheck, AlertCircle, Plus, X, Box, Shield, CheckCircle, Edit, Trash2, ChevronDown, ChevronRight, Activity, Network } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const fetcher = (url: string) => fetch(url).then(res => res.json()).catch(err => {
  if (err instanceof Event) throw new Error("Network Event Error");
  throw err;
});

export default function SourcesPage() {
  const [refreshInterval, setRefreshInterval] = useState(5000);
  useEffect(() => {
    const updateInterval = () => {
      const val = localStorage.getItem('soc_refresh_interval');
      if (val) setRefreshInterval(parseInt(val) * 1000);
    };
    updateInterval();
    window.addEventListener('refresh_interval_change', updateInterval);
    return () => window.removeEventListener('refresh_interval_change', updateInterval);
  }, []);

  const { data: sources, isLoading, mutate: mutateSources } = useSWR('/api/sources', fetcher, { refreshInterval });
  const { data: apiSourcesData, mutate: mutateApiSources } = useSWR('/api/api-sources', fetcher, { refreshInterval });
  
  const sourcesArray = Array.isArray(sources) ? sources : [];
  const apiSources = Array.isArray(apiSourcesData) ? apiSourcesData : [];
  
  const healthyCount = sourcesArray.filter((s: any) => s.status === 'healthy').length + apiSources.length;
  const inactiveCount = sourcesArray.filter((s: any) => s.status === 'inactive').length;

  const [activeTab, setActiveTab] = useState('agents');
  const [isAdding, setIsAdding] = useState(false);
  
  // Endpoint Edit Modal State
  const [editingAgent, setEditingAgent] = useState<any>(null);
  const [editFormData, setEditFormData] = useState({
    ip_address: '',
    os_version: '',
    protocol: '',
    agent_version: '',
    link_speed: ''
  });

  // Expandable rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Cloud API Integration State
  const [provider, setProvider] = useState('');
  const [configName, setConfigName] = useState('');
  const [awsKey, setAwsKey] = useState('');
  const [awsSecret, setAwsSecret] = useState('');
  const [awsRegion, setAwsRegion] = useState('us-east-1');
  const [awsLogGroup, setAwsLogGroup] = useState('');
  const [csClientId, setCsClientId] = useState('');
  const [csClientSecret, setCsClientSecret] = useState('');
  const [m365Tenant, setM365Tenant] = useState('');
  const [m365ClientId, setM365ClientId] = useState('');
  const [m365Secret, setM365Secret] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const toggleRow = (id: string) => {
    const newSet = new Set(expandedRows);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedRows(newSet);
  };

  const handleEditAgent = (agent: any) => {
    setEditingAgent(agent);
    setEditFormData({
      ip_address: agent.ip_address || '',
      os_version: agent.os_version || '',
      protocol: agent.protocol || '',
      agent_version: agent.agent_version || '',
      link_speed: agent.link_speed || ''
    });
  };

  const saveAgentEdit = async () => {
    if (!editingAgent) return;
    try {
      await fetch(`/api/sources/${editingAgent.hostname}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData)
      });
      setEditingAgent(null);
      mutateSources();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteAgent = async (hostname: string) => {
    if (!confirm(`Are you sure you want to completely delete the agent ${hostname} and purge its logs?`)) return;
    try {
      await sourcesService.deleteSource(hostname);
      mutateSources();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveIntegration = async () => {
    setIsSaving(true);
    let configObj = {};
    if (provider === 'aws') configObj = { awsKey, awsSecret, awsRegion, awsLogGroup };
    if (provider === 'crowdstrike') configObj = { clientId: csClientId, clientSecret: csClientSecret };
    if (provider === 'ms365') configObj = { tenantId: m365Tenant, clientId: m365ClientId, clientSecret: m365Secret };

    try {
      await fetch('/api/api-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: provider, name: configName, config: JSON.stringify(configObj) })
      });
      setIsAdding(false);
      resetForm();
      mutateApiSources();
    } catch (e) {
      console.error(e);
    }
    setIsSaving(false);
  };

  const resetForm = () => {
    setProvider(''); setConfigName('');
    setAwsKey(''); setAwsSecret(''); setAwsRegion('us-east-1'); setAwsLogGroup('');
    setCsClientId(''); setCsClientSecret('');
    setM365Tenant(''); setM365ClientId(''); setM365Secret('');
  };

  return (
    <div className="p-6 space-y-6 bg-[var(--bg-secondary)] min-h-screen text-[var(--text-primary)]">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Log Sources & Integrations</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">Manage endpoint agents and cloud API integrations</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-5 flex items-center gap-4">
          <div className="bg-blue-500/10 p-3 rounded-full text-blue-500"><Server size={24} /></div>
          <div>
            <div className="text-2xl font-bold">{sourcesArray.length + apiSources.length}</div>
            <div className="text-[var(--text-secondary)] text-sm">Total Sources</div>
          </div>
        </div>
        <div className="bg-[var(--bg-card)] border border-green-500/30 rounded-lg p-5 flex items-center gap-4">
          <div className="bg-green-500/10 p-3 rounded-full text-green-500"><ShieldCheck size={24} /></div>
          <div>
            <div className="text-2xl font-bold text-green-500">{healthyCount}</div>
            <div className="text-[var(--text-secondary)] text-sm">Healthy / Polling</div>
          </div>
        </div>
        <div className="bg-[var(--bg-card)] border border-red-500/30 rounded-lg p-5 flex items-center gap-4">
          <div className="bg-red-500/10 p-3 rounded-full text-red-500"><AlertCircle size={24} /></div>
          <div>
            <div className="text-2xl font-bold text-red-500">{inactiveCount}</div>
            <div className="text-[var(--text-secondary)] text-sm">Inactive Agents</div>
          </div>
        </div>
      </div>

      <div className="flex border-b border-[var(--border-color)] gap-6">
        <button onClick={() => setActiveTab('agents')} className={`pb-3 font-medium transition-colors ${activeTab === 'agents' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
          <div className="flex items-center gap-2"><Server size={16}/> Endpoint Agents</div>
        </button>
        <button onClick={() => setActiveTab('cloud')} className={`pb-3 font-medium transition-colors ${activeTab === 'cloud' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
          <div className="flex items-center gap-2"><Cloud size={16}/> Cloud Integrations</div>
        </button>
      </div>

      {activeTab === 'agents' && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg overflow-hidden animate-in fade-in">
          {isLoading ? (
            <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-blue-500" size={32} /></div>
          ) : (
            <table className="w-full text-left text-sm soc-table">
              <thead>
                <tr>
                  <th className="w-8"></th>
                  <th>Hostname</th>
                  <th>IP Address</th>
                  <th>Status</th>
                  <th>Events/Sec</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sourcesArray.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-[var(--text-secondary)]">No endpoint agents detected.</td></tr>
                )}
                {sourcesArray.map((source: any, idx: number) => (
                  <React.Fragment key={idx}>
                    <tr className="hover:bg-[var(--bg-hover)]/30 cursor-pointer" onClick={() => toggleRow(source.hostname)}>
                      <td className="px-3">{expandedRows.has(source.hostname) ? <ChevronDown size={16} className="text-gray-400"/> : <ChevronRight size={16} className="text-gray-400"/>}</td>
                      <td className="font-medium flex items-center gap-2 py-3"><Server size={16} className="text-blue-400" />{source.hostname}</td>
                      <td className="text-[var(--text-secondary)] font-mono text-xs">{source.ip_address || 'Unknown'}</td>
                      <td>
                        {source.status === 'healthy' ? (
                          <span className="flex items-center gap-1.5 text-green-500 text-xs font-medium"><div className="h-2 w-2 rounded-full bg-green-500" />Healthy</span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-red-500 text-xs font-medium"><div className="h-2 w-2 rounded-full bg-red-500" />Inactive</span>
                        )}
                      </td>
                      <td className="text-[var(--text-secondary)]">
                        <div className="flex items-center gap-2">
                          <Activity size={14} className="text-green-500" />
                          {source.eps != null ? `${source.eps} EPS` : '—'}
                        </div>
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-3" onClick={e => e.stopPropagation()}>
                          <button onClick={() => handleEditAgent(source)} className="text-blue-400 hover:text-blue-300 transition-colors"><Edit size={16} /></button>
                          <button onClick={() => handleDeleteAgent(source.hostname)} className="text-red-500 hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                    {expandedRows.has(source.hostname) && (
                      <tr className="bg-[var(--bg-secondary)]/50 border-b border-[var(--border-color)]">
                        <td colSpan={6} className="p-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-4 border border-[var(--border-color)] rounded-lg bg-[var(--bg-card)]">
                            <div>
                              <div className="text-xs text-[var(--text-secondary)] uppercase font-semibold mb-1">Operating System</div>
                              <div className="text-sm font-medium">{source.os_version || 'N/A'}</div>
                            </div>
                            <div>
                              <div className="text-xs text-[var(--text-secondary)] uppercase font-semibold mb-1">Log Source App</div>
                              <div className="text-sm font-mono text-xs bg-[var(--bg-secondary)] px-2 py-1 rounded inline-block">{source.source}</div>
                            </div>
                            <div>
                              <div className="text-xs text-[var(--text-secondary)] uppercase font-semibold mb-1">Ingestion Protocol</div>
                              <div className="text-sm flex items-center gap-1.5"><Network size={14} className="text-blue-400"/> {source.protocol || 'Unknown'}</div>
                            </div>
                            <div>
                              <div className="text-xs text-[var(--text-secondary)] uppercase font-semibold mb-1">Agent Version</div>
                              <div className="text-sm font-medium">{source.agent_version || 'Native'}</div>
                            </div>
                            <div>
                              <div className="text-xs text-[var(--text-secondary)] uppercase font-semibold mb-1">Link Speed</div>
                              <div className="text-sm text-green-400 font-medium">{source.link_speed || '1 Gbps'}</div>
                            </div>
                            <div>
                              <div className="text-xs text-[var(--text-secondary)] uppercase font-semibold mb-1">Total Events</div>
                              <div className="text-sm font-medium">{source.totalEvents.toLocaleString()}</div>
                            </div>
                            <div>
                              <div className="text-xs text-[var(--text-secondary)] uppercase font-semibold mb-1">Last Seen</div>
                              <div className="text-sm text-[var(--text-secondary)]">
                                {(() => { const d = source.lastSeen ? new Date(source.lastSeen) : null; return d && !isNaN(d.getTime()) ? formatDistanceToNow(d) + ' ago' : '—'; })()}
                              </div>
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
      )}

      {/* API INTEGRATIONS TAB */}
      {activeTab === 'cloud' && (
        <div className="animate-in fade-in">
          <div className="flex justify-end mb-4">
            <button onClick={() => setIsAdding(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors font-medium text-sm">
              <Plus size={16} /> Add Cloud Source
            </button>
          </div>
          
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg overflow-hidden">
            <table className="w-full text-left text-sm soc-table">
              <thead>
                <tr>
                  <th>Integration Name</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Added On</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {apiSources.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-[var(--text-secondary)]">No cloud integrations configured. Click "Add Cloud Source" to begin.</td></tr>
                )}
                {apiSources.map((src: any) => (
                  <tr key={src.id}>
                    <td className="font-medium">{src.name}</td>
                    <td className="uppercase text-xs font-bold tracking-wider text-[var(--text-secondary)]">
                      {src.type === 'aws' && <span className="flex items-center gap-1.5"><Box size={14} className="text-orange-500"/> AWS CloudWatch</span>}
                      {src.type === 'crowdstrike' && <span className="flex items-center gap-1.5"><Shield size={14} className="text-red-500"/> CrowdStrike Falcon</span>}
                      {src.type === 'ms365' && <span className="flex items-center gap-1.5"><Cloud size={14} className="text-blue-500"/> Microsoft 365</span>}
                    </td>
                    <td>
                      <span className="flex items-center gap-1.5 text-green-500 text-xs font-medium"><CheckCircle size={14}/> Polling Active</span>
                    </td>
                    <td className="text-[var(--text-secondary)]">{new Date(src.created_at).toLocaleDateString()}</td>
                    <td className="text-right">
                      <button onClick={async () => { if(confirm("Remove?")) { await sourcesService.deleteApiSource(src.id); mutateApiSources(); } }} className="text-red-500 hover:text-red-400 text-xs font-medium">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ENDPOINT EDIT MODAL */}
      {editingAgent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold">Edit Agent: <span className="text-blue-400">{editingAgent.hostname}</span></h3>
              <button onClick={() => setEditingAgent(null)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">IP Address</label>
                <input type="text" value={editFormData.ip_address} onChange={e => setEditFormData({...editFormData, ip_address: e.target.value})} className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] outline-none rounded p-2.5 text-[var(--text-primary)]" />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Operating System</label>
                <input type="text" value={editFormData.os_version} onChange={e => setEditFormData({...editFormData, os_version: e.target.value})} className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] outline-none rounded p-2.5 text-[var(--text-primary)]" />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Ingestion Protocol</label>
                <input type="text" value={editFormData.protocol} onChange={e => setEditFormData({...editFormData, protocol: e.target.value})} placeholder="e.g. Syslog TLS, WMI, HTTP API" className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] outline-none rounded p-2.5 text-[var(--text-primary)]" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1">Agent Version</label>
                  <input type="text" value={editFormData.agent_version} onChange={e => setEditFormData({...editFormData, agent_version: e.target.value})} className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] outline-none rounded p-2.5 text-[var(--text-primary)]" />
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1">Link Speed</label>
                  <input type="text" value={editFormData.link_speed} onChange={e => setEditFormData({...editFormData, link_speed: e.target.value})} className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] outline-none rounded p-2.5 text-[var(--text-primary)]" />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-[var(--border-color)]">
                <button onClick={() => setEditingAgent(null)} className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-white transition-colors">Cancel</button>
                <button onClick={saveAgentEdit} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">Save Details</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CLOUD INTEGRATION WIZARD MODAL */}
      {isAdding && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-[var(--text-primary)]">Configure Cloud Integration</h3>
              <button onClick={() => {setIsAdding(false); resetForm();}} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><X size={20} /></button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Provider Type</label>
                <select value={provider} onChange={e => setProvider(e.target.value)} className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] focus:border-blue-500 outline-none rounded p-2.5 text-[var(--text-primary)]">
                  <option value="" disabled>Select a provider...</option>
                  <option value="aws">AWS (CloudWatch/CloudTrail)</option>
                  <option value="crowdstrike">CrowdStrike Falcon</option>
                  <option value="ms365">Microsoft 365 (Activity API)</option>
                </select>
              </div>

              {provider && (
                <div className="animate-in fade-in slide-in-from-top-2">
                  <div className="mb-4">
                    <label className="block text-sm text-[var(--text-secondary)] mb-1">Integration Name</label>
                    <input type="text" value={configName} onChange={e => setConfigName(e.target.value)} placeholder="e.g. Prod AWS Account" className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] focus:border-blue-500 outline-none rounded p-2.5 text-[var(--text-primary)]" />
                  </div>

                  {provider === 'aws' && (
                    <div className="space-y-4 border-t border-[var(--border-color)] pt-4">
                      <p className="text-xs text-[var(--text-secondary)]">Provide an IAM user's credentials with <code className="text-[var(--text-primary)]">logs:FilterLogEvents</code> permissions.</p>
                      <div>
                        <label className="block text-sm text-[var(--text-secondary)] mb-1">Access Key ID</label>
                        <input type="text" value={awsKey} onChange={e => setAwsKey(e.target.value)} placeholder="AKIA..." className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] outline-none rounded p-2.5 text-[var(--text-primary)] font-mono text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm text-[var(--text-secondary)] mb-1">Secret Access Key</label>
                        <input type="password" value={awsSecret} onChange={e => setAwsSecret(e.target.value)} placeholder="••••••••••••••••" className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] outline-none rounded p-2.5 text-[var(--text-primary)] font-mono text-sm" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm text-[var(--text-secondary)] mb-1">Region</label>
                          <select value={awsRegion} onChange={e => setAwsRegion(e.target.value)} className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] outline-none rounded p-2.5 text-[var(--text-primary)]">
                            <option value="us-east-1">us-east-1</option>
                            <option value="us-west-2">us-west-2</option>
                            <option value="eu-west-1">eu-west-1</option>
                            <option value="eu-central-1">eu-central-1</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm text-[var(--text-secondary)] mb-1">Log Group Name</label>
                          <input type="text" value={awsLogGroup} onChange={e => setAwsLogGroup(e.target.value)} placeholder="/aws/cloudtrail" className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] outline-none rounded p-2.5 text-[var(--text-primary)]" />
                        </div>
                      </div>
                    </div>
                  )}

                  {provider === 'crowdstrike' && (
                    <div className="space-y-4 border-t border-[var(--border-color)] pt-4">
                      <p className="text-xs text-[var(--text-secondary)]">Create an API Client in Falcon Platform with Event Stream read access.</p>
                      <div>
                        <label className="block text-sm text-[var(--text-secondary)] mb-1">Client ID</label>
                        <input type="text" value={csClientId} onChange={e => setCsClientId(e.target.value)} className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] outline-none rounded p-2.5 text-[var(--text-primary)] font-mono text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm text-[var(--text-secondary)] mb-1">Client Secret</label>
                        <input type="password" value={csClientSecret} onChange={e => setCsClientSecret(e.target.value)} className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] outline-none rounded p-2.5 text-[var(--text-primary)] font-mono text-sm" />
                      </div>
                    </div>
                  )}

                  {provider === 'ms365' && (
                    <div className="space-y-4 border-t border-[var(--border-color)] pt-4">
                      <p className="text-xs text-[var(--text-secondary)]">Register an App in Entra ID (Azure AD) and grant <code className="text-[var(--text-primary)]">ActivityFeed.Read</code>.</p>
                      <div>
                        <label className="block text-sm text-[var(--text-secondary)] mb-1">Tenant ID</label>
                        <input type="text" value={m365Tenant} onChange={e => setM365Tenant(e.target.value)} className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] outline-none rounded p-2.5 text-[var(--text-primary)] font-mono text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm text-[var(--text-secondary)] mb-1">Client ID</label>
                        <input type="text" value={m365ClientId} onChange={e => setM365ClientId(e.target.value)} className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] outline-none rounded p-2.5 text-[var(--text-primary)] font-mono text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm text-[var(--text-secondary)] mb-1">Client Secret</label>
                        <input type="password" value={m365Secret} onChange={e => setM365Secret(e.target.value)} className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] outline-none rounded p-2.5 text-[var(--text-primary)] font-mono text-sm" />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-[var(--border-color)]">
                    <button onClick={() => {setIsAdding(false); resetForm();}} className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Cancel</button>
                    <button 
                      onClick={handleSaveIntegration} 
                      disabled={isSaving || !configName}
                      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      {isSaving && <Loader2 size={16} className="animate-spin" />}
                      Save & Connect
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
