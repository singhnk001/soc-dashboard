'use client';

import React, { useState, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { Save, Bell, Shield, Database, Globe, Clock, Monitor, ToggleLeft, ToggleRight, Lock, Users, UserPlus, Trash2 } from 'lucide-react';

interface SettingToggleProps {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

function SettingToggle({ label, description, enabled, onToggle, disabled }: SettingToggleProps) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-gray-800">
      <div>
        <h4 className={`text-sm font-medium ${disabled ? 'text-gray-500' : 'text-white'}`}>{label}</h4>
        <p className="text-gray-500 text-xs mt-0.5">{description}</p>
      </div>
      <button onClick={onToggle} disabled={disabled} className={`text-2xl ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
        {enabled ? (
          <ToggleRight className={disabled ? 'text-gray-600' : 'text-blue-500'} size={28} />
        ) : (
          <ToggleLeft className="text-gray-600" size={28} />
        )}
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const fetcher = (url: string) => fetch(url).then(res => res.json());
  const { data: users, isLoading: usersLoading } = useSWR('/api/users', fetcher);
  
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
  
  const canEdit = role === 'admin' || role === 'l3';

  const [settings, setSettings] = useState({
    realTimeAlerts: true,
    emailNotifications: false,
    slackIntegration: true,
    autoCorrelation: true,
    darkMode: true,
    logRetention: '30',
    apiUrl: '/api',
    refreshInterval: '30',
    maxLogEntries: '10000',
    severityThreshold: 'medium',
  });

  const [editingUser, setEditingUser] = useState<any>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'l1', real_name: '' });
  
  const handleDeleteUser = async (id: string) => {
    if (!window.confirm('Delete user?')) return;
    await fetch(`/api/users/${id}`, { method: 'DELETE' });
    mutate('/api/users');
  };

  
  const saveNewUser = async () => {
    if (!newUser.username || !newUser.password) return alert('Username and password required');
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser)
    });
    if (!res.ok) return alert('Failed to create user (username might exist)');
    setIsAddingUser(false);
    setNewUser({ username: '', password: '', role: 'l1', real_name: '' });
    mutate('/api/users');
  };

  const saveUserEdit = async () => {
    await fetch(`/api/users/${editingUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: editingUser.role, status: editingUser.status, real_name: editingUser.real_name })
    });
    setEditingUser(null);
    mutate('/api/users');
  };

  const toggle = (key: keyof typeof settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="p-6 space-y-6 bg-[#0f1219] min-h-screen text-white relative">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-gray-400 text-sm mt-1">Configure your SOC Dashboard preferences</p>
      </div>

      {/* Notifications */}
      <div className="bg-[#1a1f2e] border border-gray-800 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell size={20} className="text-blue-500" />
          <h3 className="text-lg font-semibold">Notifications</h3>
        </div>
        <SettingToggle
          label="Real-time Alert Notifications"
          description="Show browser notifications for new critical and high severity alerts"
          enabled={settings.realTimeAlerts as boolean}
          onToggle={() => toggle('realTimeAlerts')}
          disabled={!canEdit}
        />
        <SettingToggle
          label="Email Notifications"
          description="Send email digests for unresolved critical alerts"
          enabled={settings.emailNotifications as boolean}
          onToggle={() => toggle('emailNotifications')}
          disabled={!canEdit}
        />
        <SettingToggle
          label="Slack Integration"
          description="Post alerts to configured Slack channels"
          enabled={settings.slackIntegration as boolean}
          onToggle={() => toggle('slackIntegration')}
          disabled={!canEdit}
        />
      </div>

      {/* Detection Engine */}
      <div className="bg-[#1a1f2e] border border-gray-800 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={20} className="text-red-500" />
          <h3 className="text-lg font-semibold">Detection Engine</h3>
        </div>
        <SettingToggle
          label="Auto-Correlation"
          description="Automatically correlate events across multiple log sources using MITRE ATT&CK mapping"
          enabled={settings.autoCorrelation as boolean}
          onToggle={() => toggle('autoCorrelation')}
          disabled={!canEdit}
        />
        <div className="py-4 border-b border-gray-800">
          <label className="block text-sm font-medium text-white mb-1">Minimum Severity Threshold</label>
          <p className="text-gray-500 text-xs mb-2">Only generate alerts at or above this severity level</p>
          <select
            disabled={!canEdit}
            value={settings.severityThreshold}
            onChange={e => setSettings(prev => ({ ...prev, severityThreshold: e.target.value }))}
            className="bg-[#0f1219] border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 w-48"
          >
            <option value="info">Info</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>

      {/* Data Sources */}
      <div className="bg-[#1a1f2e] border border-gray-800 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Database size={20} className="text-green-500" />
          <h3 className="text-lg font-semibold">Data Sources</h3>
        </div>
        <div className="py-4 border-b border-gray-800">
          <label className="block text-sm font-medium text-white mb-1">API Endpoint URL</label>
          <p className="text-gray-500 text-xs mb-2">Backend API URL for log ingestion and retrieval</p>
          <input
            disabled={!canEdit}
            type="text"
            value={settings.apiUrl}
            onChange={e => setSettings(prev => ({ ...prev, apiUrl: e.target.value }))}
            className="bg-[#0f1219] border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 w-full max-w-md font-mono"
          />
        </div>
        <div className="py-4 border-b border-gray-800">
          <label className="block text-sm font-medium text-white mb-1">Log Retention Period (days)</label>
          <p className="text-gray-500 text-xs mb-2">How long to retain log data before automatic cleanup</p>
          <input
            disabled={!canEdit}
            type="number"
            value={settings.logRetention}
            onChange={e => setSettings(prev => ({ ...prev, logRetention: e.target.value }))}
            className="bg-[#0f1219] border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 w-32"
          />
        </div>
        <div className="py-4 border-b border-gray-800">
          <label className="block text-sm font-medium text-white mb-1">Max Log Entries</label>
          <p className="text-gray-500 text-xs mb-2">Maximum number of log entries to display in the viewer</p>
          <input
            disabled={!canEdit}
            type="number"
            value={settings.maxLogEntries}
            onChange={e => setSettings(prev => ({ ...prev, maxLogEntries: e.target.value }))}
            className="bg-[#0f1219] border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 w-32"
          />
        </div>
      </div>

      {/* Display */}
      <div className="bg-[#1a1f2e] border border-gray-800 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Monitor size={20} className="text-yellow-500" />
          <h3 className="text-lg font-semibold">Display</h3>
        </div>
        <SettingToggle
          label="Dark Mode"
          description="Use dark theme (recommended for SOC environments)"
          enabled={settings.darkMode as boolean}
          onToggle={() => toggle('darkMode')}
          disabled={!canEdit}
        />
        <div className="py-4 border-b border-gray-800">
          <label className="block text-sm font-medium text-white mb-1">Auto-Refresh Interval (seconds)</label>
          <p className="text-gray-500 text-xs mb-2">How often to refresh dashboard data</p>
          <select
            disabled={!canEdit}
            value={settings.refreshInterval}
            onChange={e => setSettings(prev => ({ ...prev, refreshInterval: e.target.value }))}
            className="bg-[#0f1219] border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 w-48"
          >
            <option value="10">10 seconds</option>
            <option value="30">30 seconds</option>
            <option value="60">1 minute</option>
            <option value="300">5 minutes</option>
          </select>
        </div>
      </div>

      {/* User Management */}
      {canEdit && (
        <div className="bg-[#1a1f2e] border border-gray-800 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users size={20} className="text-purple-500" />
            <h3 className="text-lg font-semibold">User Management & RBAC</h3>
          </div>
          <p className="text-gray-400 text-sm mb-4">Manage portal access, user credentials, and assign role-based privileges.</p>
          
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0f1219] text-gray-400">
                <tr>
                  <th className="p-3 font-medium rounded-tl-lg">User ID</th>
                  <th className="p-3 font-medium">Full Name</th>
                  <th className="p-3 font-medium">Role</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium rounded-tr-lg">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {users?.map((u: any) => (
                  <tr key={u.id}>
                    <td className="p-3 text-white font-medium">{u.username}</td>
                    <td className="p-3 text-gray-300">{u.real_name || '-'}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs ${u.role === 'admin' ? 'bg-red-500/10 text-red-400' : u.role === 'l1' ? 'bg-blue-500/10 text-blue-400' : 'bg-gray-500/10 text-gray-400'}`}>
                        {u.role.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={u.status === 'Active' ? 'text-green-400 text-xs' : 'text-red-400 text-xs'}>{u.status}</span>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-3">
                        <button className="text-gray-500 hover:text-white transition-colors" onClick={() => setEditingUser(u)}>Edit</button>
                        {u.username !== 'admin' && (
                          <button onClick={() => handleDeleteUser(u.id)} className="text-gray-500 hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <button onClick={() => setIsAddingUser(true)} className="flex items-center gap-2 bg-[#0f1219] hover:bg-gray-800 border border-gray-700 text-white px-4 py-2 rounded-md transition-colors text-sm">
            <UserPlus size={16} /> Add New User
          </button>
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-between items-center bg-[#1a1f2e] border border-gray-800 p-4 rounded-lg">
        <div className="text-sm text-gray-400 flex items-center gap-2">
          {!canEdit && <><Lock size={16} className="text-red-400" /> Settings are locked. Only Admin and L3 users can modify system configuration.</>}
        </div>
        <button 
          disabled={!canEdit}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-md transition-colors font-medium text-sm ${canEdit ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}
        >
          <Save size={16} />
          Save Settings
        </button>
      </div>

      
      {isAddingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#1a1f2e] border border-gray-800 rounded-lg p-6 w-96 relative">
            <h3 className="text-lg font-bold mb-4">Add New User</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Username</label>
                <input type="text" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} className="w-full bg-[#0f1219] border border-gray-700 rounded p-2 text-white" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Password</label>
                <input type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} className="w-full bg-[#0f1219] border border-gray-700 rounded p-2 text-white" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Full Name</label>
                <input type="text" value={newUser.real_name} onChange={e => setNewUser({...newUser, real_name: e.target.value})} className="w-full bg-[#0f1219] border border-gray-700 rounded p-2 text-white" />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Role</label>
                <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})} className="w-full bg-[#0f1219] border border-gray-700 rounded p-2 text-white">
                  <option value="admin">Admin</option>
                  <option value="l3">L3 Analyst</option>
                  <option value="l2">L2 Analyst</option>
                  <option value="l1">L1 Analyst</option>
                  <option value="readonly">Read-Only</option>
                </select>
              </div>
              <div className="flex gap-2 justify-end mt-6">
                <button onClick={() => setIsAddingUser(false)} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                <button onClick={saveNewUser} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded">Create User</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#1a1f2e] border border-gray-800 rounded-lg p-6 w-96 relative">
            <h3 className="text-lg font-bold mb-4">Edit User: {editingUser.username}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Full Name</label>
                <input type="text" value={editingUser.real_name || ''} onChange={e => setEditingUser({...editingUser, real_name: e.target.value})} className="w-full bg-[#0f1219] border border-gray-700 rounded p-2 text-white" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Role</label>
                <select value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value})} className="w-full bg-[#0f1219] border border-gray-700 rounded p-2 text-white">
                  <option value="admin">Admin</option>
                  <option value="l3">L3 Analyst</option>
                  <option value="l2">L2 Analyst</option>
                  <option value="l1">L1 Analyst</option>
                  <option value="readonly">Read-Only</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Status</label>
                <select value={editingUser.status} onChange={e => setEditingUser({...editingUser, status: e.target.value})} className="w-full bg-[#0f1219] border border-gray-700 rounded p-2 text-white">
                  <option value="Active">Active</option>
                  <option value="Disabled">Disabled</option>
                </select>
              </div>
              <div className="flex gap-2 justify-end mt-6">
                <button onClick={() => setEditingUser(null)} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                <button onClick={saveUserEdit} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
