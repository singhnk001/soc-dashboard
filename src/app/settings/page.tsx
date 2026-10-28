"use client";

import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { Save, Shield, Monitor, ToggleLeft, ToggleRight, Users, UserPlus, Trash2, Key, CheckCircle, AlertCircle, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface SettingToggleProps {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

function SettingToggle({ label, description, enabled, onToggle, disabled }: SettingToggleProps) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-[var(--border-color)]">
      <div>
        <h4 className={`text-sm font-medium ${disabled ? 'text-gray-500' : 'text-[var(--text-primary)]'}`}>{label}</h4>
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
  const fetcher = (url: string) => fetch(url).then(res => res.json()).catch(err => {
  if (err instanceof Event) throw new Error("Network Event Error");
  throw err;
});
  const { data: usersData, mutate } = useSWR('/api/users', fetcher);
  const users = usersData?.data || usersData || [];
  
  const [activeTab, setActiveTab] = useState('security');
  const [currentUser, setCurrentUser] = useState<any>(null);

  const canEdit = currentUser && currentUser.role !== "readonly";

  // MFA State
  const [mfaSetup, setMfaSetup] = useState<any>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [mfaSuccess, setMfaSuccess] = useState(false);

  // User Management State
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'l1', real_name: '', status: 'Active' });
  const [userError, setUserError] = useState('');

  // System Prefs State
  const [darkMode, setDarkMode] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [ipStrict, setIpStrict] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState('30');
  const [retention, setRetention] = useState('90');
  const [idleTimeout, setIdleTimeout] = useState('30');

  
  useEffect(() => {
    try {
      const userStr = sessionStorage.getItem('user');
      if (userStr) setCurrentUser(JSON.parse(userStr));
      
      const storedDark = localStorage.getItem('soc_dark_mode');
      if (storedDark !== null) setDarkMode(storedDark === 'true');
      
      if (localStorage.getItem('soc_audio_enabled') !== null) setAudioEnabled(localStorage.getItem('soc_audio_enabled') === 'true');
      if (localStorage.getItem('soc_email_enabled') !== null) setEmailEnabled(localStorage.getItem('soc_email_enabled') === 'true');
      if (localStorage.getItem('soc_ip_strict') !== null) setIpStrict(localStorage.getItem('soc_ip_strict') === 'true');
      if (localStorage.getItem('soc_refresh_interval') !== null) setAutoRefresh(localStorage.getItem('soc_refresh_interval')!);
      if (localStorage.getItem('soc_retention') !== null) setRetention(localStorage.getItem('soc_retention')!);
      if (localStorage.getItem('soc_idle_timeout') !== null) setIdleTimeout(localStorage.getItem('soc_idle_timeout')!);
    } catch(e) {}
  }, []);

  // Update light mode hack on body
  useEffect(() => {
    if (darkMode) {
      document.body.classList.remove('light-theme');
    } else {
      document.body.classList.add('light-theme');
    }
  }, [darkMode]);

  const handleToggleDarkMode = () => {
    const newVal = !darkMode;
    setDarkMode(newVal);
    localStorage.setItem('soc_dark_mode', newVal.toString());
  };
  
  const handleEnableMFA = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/auth/mfa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setMfaSetup(data);
        setMfaError('');
        setMfaSuccess(false);
      }
    } catch(e) {
      console.error(e);
    }
  };

  const handleVerifyMFA = async () => {
    if (!mfaCode || mfaCode.length < 6) return;
    try {
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, secret: mfaSetup.secret, code: mfaCode })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setMfaSuccess(true);
        setMfaError('');
        const updatedUser = { ...currentUser, mfa_enabled: true };
        setCurrentUser(updatedUser);
        sessionStorage.setItem('user', JSON.stringify(updatedUser));
      } else {
        setMfaError(data.detail || 'Verification failed. Try again.');
      }
    } catch(e) {
      setMfaError('Error verifying code.');
    }
  };

    const handleResetMFA = async () => {
    if (!confirm("Are you sure you want to remove 2FA from your account? This decreases security.")) return;
    try {
      const res = await fetch('/api/auth/mfa/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id })
      });
      if (res.ok) {
        setMfaSuccess(false);
        setMfaSetup(null);
        const updatedUser = { ...currentUser, mfa_enabled: false };
        setCurrentUser(updatedUser);
        sessionStorage.setItem('user', JSON.stringify(updatedUser));
      }
    } catch(e) {
      console.error(e);
    }
  };

  const handleCreateUser = async () => {
    if (!newUser.username || !newUser.password) {
      setUserError("Username and password required");
      return;
    }
    setUserError("");
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });
      if (res.ok) {
        setIsAddingUser(false);
        setNewUser({ username: '', password: '', role: 'l1', real_name: '', status: 'Active' });
        mutate();
      } else {
        const data = await res.json();
        setUserError(data.detail || 'Failed to create user');
      }
    } catch (err) {
      setUserError('Network error');
    }
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;
    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: editingUser.role,
          real_name: editingUser.real_name,
          status: editingUser.status
        })
      });
      if (res.ok) {
        setEditingUser(null);
        mutate();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      await fetch(`/api/users/${id}`, { method: 'DELETE' });
      mutate();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Platform Settings</h1>
          <p className="text-[var(--text-secondary)]">Manage security, users, and system preferences</p>
        </div>
      </div>
      
      <div className="flex border-b border-[var(--border-color)] mb-6 gap-6">
        <button 
          onClick={() => setActiveTab('security')} 
          className={`pb-3 font-medium transition-colors ${activeTab === 'security' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-[var(--text-secondary)] hover:text-[var(--text-secondary)]'}`}
        >
          <div className="flex items-center gap-2"><Key size={16}/> Account Security</div>
        </button>
        <button 
          onClick={() => setActiveTab('users')} 
          className={`pb-3 font-medium transition-colors ${activeTab === 'users' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-[var(--text-secondary)] hover:text-[var(--text-secondary)]'}`}
        >
          <div className="flex items-center gap-2"><Users size={16}/> User Management</div>
        </button>
        <button 
          onClick={() => setActiveTab('system')} 
          className={`pb-3 font-medium transition-colors ${activeTab === 'system' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-[var(--text-secondary)] hover:text-[var(--text-secondary)]'}`}
        >
          <div className="flex items-center gap-2"><Monitor size={16}/> System Preferences</div>
        </button>
      </div>

      {activeTab === 'security' && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-8 animate-in fade-in duration-300">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 bg-indigo-500/10 rounded-lg">
              <Shield className="w-6 h-6 text-indigo-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">Two-Factor Authentication (2FA)</h3>
              <p className="text-[var(--text-secondary)] text-sm">Add an extra layer of security to your account. When logging in, you'll need to enter a unique 6-digit code generated by your Authenticator app (like Google Authenticator or Authy).</p>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-[var(--border-color)]">
            {currentUser?.mfa_enabled ? (
              <div className="flex flex-col items-center justify-center p-8 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <CheckCircle className="w-16 h-16 text-emerald-500 mb-4" />
                <h4 className="text-xl font-bold text-emerald-400 mb-2">2FA Configuration Done</h4>
                <p className="text-[var(--text-secondary)] text-center mb-6">Your account is secured with 2FA.</p>
                <button onClick={handleResetMFA} className="text-red-400 hover:text-red-300 border border-red-500/30 hover:bg-red-500/10 px-4 py-2 rounded transition-colors text-sm font-medium">Reset / Disable 2FA</button>
              </div>
            ) : mfaSuccess ? (
              <div className="flex flex-col items-center justify-center p-8 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <CheckCircle className="w-16 h-16 text-emerald-500 mb-4" />
                <h4 className="text-xl font-bold text-emerald-400 mb-2">2FA is Successfully Enabled!</h4>
                <p className="text-[var(--text-secondary)] text-center">Your account is now secured with Time-Based One-Time Passwords (TOTP). You will be prompted for a code next time you log in.</p>
              </div>
            ) : !mfaSetup ? (
              <button 
                onClick={handleEnableMFA}
                className="bg-indigo-600 hover:bg-indigo-700 text-[var(--text-primary)] px-6 py-3 rounded-lg font-medium shadow-lg shadow-indigo-900/20 transition-colors"
              >
                Set up 2FA via Authenticator App
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-12">
                <div className="space-y-6">
                  <div>
                    <h4 className="font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-sm">1</span> 
                      Scan the QR Code
                    </h4>
                    <p className="text-[var(--text-secondary)] text-sm mb-4">Open your preferred Authenticator app (e.g. Google Authenticator, Authy, Aegis) and scan this QR code.</p>
                    <div className="bg-white p-4 rounded-xl inline-block shadow-lg">
                      <QRCodeSVG value={mfaSetup.uri} size={180} level="M" />
                    </div>
                  </div>
                  <div>
                    <p className="text-[var(--text-secondary)] text-sm mb-2">Can't scan the QR code? Enter this secret manually:</p>
                    <div className="flex items-center gap-2 bg-[var(--bg-primary)] border border-[var(--border-color)] p-3 rounded-lg font-mono text-indigo-400 tracking-widest">
                      {mfaSetup.secret}
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <h4 className="font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-sm">2</span> 
                      Verify & Enable
                    </h4>
                    <p className="text-[var(--text-secondary)] text-sm mb-4">Enter the 6-digit code generated by your app to confirm the setup.</p>
                    
                    {mfaError && (
                      <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />
                        <p className="text-sm text-red-400">{mfaError}</p>
                      </div>
                    )}

                    <div className="flex gap-4">
                      <input 
                        type="text" 
                        maxLength={6}
                        placeholder="000000"
                        value={mfaCode}
                        onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))}
                        className="w-48 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-3 text-center tracking-[0.5em] font-mono text-xl text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
                      />
                      <button 
                        onClick={handleVerifyMFA}
                        disabled={mfaCode.length < 6}
                        className="bg-indigo-600 hover:bg-indigo-700 text-[var(--text-primary)] px-6 py-3 rounded-lg font-medium disabled:opacity-50 transition-colors"
                      >
                        Verify Code
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-8 animate-in fade-in duration-300 relative">
          <div className="flex items-center gap-3 mb-6">
            <Users size={24} className="text-purple-500" />
            <h3 className="text-lg font-bold text-[var(--text-primary)]">User Management & RBAC</h3>
          </div>
          <p className="text-[var(--text-secondary)] text-sm mb-8">Manage portal access, user credentials, and assign role-based privileges.</p>
          
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-b border-[var(--border-color)]">
                <tr>
                  <th className="p-4 font-semibold">User ID</th>
                  <th className="p-4 font-semibold">Full Name</th>
                  <th className="p-4 font-semibold">Role</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {users?.map((u: any) => (
                  <tr key={u.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                    <td className="p-4 text-[var(--text-primary)] font-medium">{u.username}</td>
                    <td className="p-4 text-[var(--text-secondary)]">{u.real_name || '-'}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${u.role === 'admin' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : u.role === 'l1' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-gray-500/10 text-[var(--text-secondary)] border border-gray-500/20'}`}>
                        {u.role.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={u.status === 'Active' ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>{u.status}</span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex gap-3 justify-end">
                        {canEdit && <button onClick={() => setEditingUser(u)} className="text-gray-500 hover:text-[var(--text-primary)] transition-colors">Edit</button>}
                        {canEdit && u.username !== 'admin' && (
                          <button onClick={() => handleDeleteUser(u.id)} className="text-gray-500 hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {canEdit && (
            <button onClick={() => setIsAddingUser(true)} className="flex items-center gap-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-[var(--text-primary)] px-4 py-2.5 rounded-lg transition-colors font-medium">
              <UserPlus size={18} /> Provision New User
            </button>
          )}

          {/* ADD USER MODAL */}
          {isAddingUser && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 rounded-xl">
              <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-6 w-96 shadow-2xl animate-in fade-in zoom-in-95">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">Provision New User</h3>
                  <button onClick={() => setIsAddingUser(false)} className="text-gray-500 hover:text-[var(--text-primary)]"><X size={20} /></button>
                </div>
                
                {userError && <div className="mb-4 text-sm text-red-400 bg-red-500/10 p-2 rounded">{userError}</div>}
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-[var(--text-secondary)] mb-1">Username</label>
                    <input type="text" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none rounded p-2.5 text-[var(--text-primary)]" placeholder="johndoe" />
                  </div>
                  <div>
                    <label className="block text-sm text-[var(--text-secondary)] mb-1">Password</label>
                    <input type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none rounded p-2.5 text-[var(--text-primary)]" placeholder="••••••••" />
                  </div>
                  <div>
                    <label className="block text-sm text-[var(--text-secondary)] mb-1">Full Name</label>
                    <input type="text" value={newUser.real_name} onChange={e => setNewUser({...newUser, real_name: e.target.value})} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] focus:border-blue-500 outline-none rounded p-2.5 text-[var(--text-primary)]" placeholder="John Doe" />
                  </div>
                  <div>
                    <label className="block text-sm text-[var(--text-secondary)] mb-1">Role</label>
                    <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] focus:border-blue-500 outline-none rounded p-2.5 text-[var(--text-primary)]">
                      <option value="admin">Admin</option>
                      <option value="l3">L3 Analyst</option>
                      <option value="l2">L2 Analyst</option>
                      <option value="l1">L1 Analyst</option>
                      <option value="readonly">Read-Only</option>
                    </select>
                  </div>
                  <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-[var(--border-color)]">
                    <button onClick={() => setIsAddingUser(false)} className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Cancel</button>
                    <button onClick={handleCreateUser} className="bg-blue-600 hover:bg-blue-700 text-[var(--text-primary)] px-5 py-2 rounded-lg text-sm font-medium transition-colors">Create User</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* EDIT USER MODAL */}
          {editingUser && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 rounded-xl">
              <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-6 w-96 shadow-2xl animate-in fade-in zoom-in-95">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">Edit User: {editingUser.username}</h3>
                  <button onClick={() => setEditingUser(null)} className="text-gray-500 hover:text-[var(--text-primary)]"><X size={20} /></button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-[var(--text-secondary)] mb-1">Full Name</label>
                    <input type="text" value={editingUser.real_name || ''} onChange={e => setEditingUser({...editingUser, real_name: e.target.value})} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] focus:border-blue-500 outline-none rounded p-2.5 text-[var(--text-primary)]" />
                  </div>
                  <div>
                    <label className="block text-sm text-[var(--text-secondary)] mb-1">Role</label>
                    <select value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value})} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] focus:border-blue-500 outline-none rounded p-2.5 text-[var(--text-primary)]" disabled={editingUser.username === 'admin'}>
                      <option value="admin">Admin</option>
                      <option value="l3">L3 Analyst</option>
                      <option value="l2">L2 Analyst</option>
                      <option value="l1">L1 Analyst</option>
                      <option value="readonly">Read-Only</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-[var(--text-secondary)] mb-1">Status</label>
                    <select value={editingUser.status} onChange={e => setEditingUser({...editingUser, status: e.target.value})} className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] focus:border-blue-500 outline-none rounded p-2.5 text-[var(--text-primary)]" disabled={editingUser.username === 'admin'}>
                      <option value="Active">Active</option>
                      <option value="Disabled">Disabled</option>
                    </select>
                  </div>
                  <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-[var(--border-color)]">
                    <button onClick={() => setEditingUser(null)} className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">Cancel</button>
                    <button onClick={handleSaveUser} className="bg-blue-600 hover:bg-blue-700 text-[var(--text-primary)] px-5 py-2 rounded-lg text-sm font-medium transition-colors">Save Changes</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'system' && (
         <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-8 animate-in fade-in duration-300 space-y-8">
             <div>
               <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">Display & Alerts</h3>
               <div className="space-y-1">
                 <SettingToggle disabled={!canEdit} label="Dark Theme Toggle" description="Switch between dark and light modes." enabled={darkMode} onToggle={handleToggleDarkMode} />
                 <SettingToggle disabled={!canEdit} label="Audio Notifications" description="Play a sound when a Critical or High severity alert is generated." enabled={audioEnabled} onToggle={() => { setAudioEnabled(!audioEnabled); localStorage.setItem('soc_audio_enabled', String(!audioEnabled)); }} />
                 <SettingToggle disabled={!canEdit} label="Email Alert Summaries" description="Send daily summary emails to the SOC mailing list." enabled={emailEnabled} onToggle={() => { setEmailEnabled(!emailEnabled); localStorage.setItem('soc_email_enabled', String(!emailEnabled)); }} />
               </div>
             </div>

             <div className="pt-6 border-t border-[var(--border-color)]">
               <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">Security & Compliance</h3>
               <div className="space-y-1">
                 <SettingToggle disabled={!canEdit} label="Strict IP Allowlisting" description="Only allow logins from pre-approved corporate IP ranges." enabled={ipStrict} onToggle={() => { setIpStrict(!ipStrict); localStorage.setItem('soc_ip_strict', String(!ipStrict)); }} />
                 
                 <div className="flex items-center justify-between py-4 border-b border-[var(--border-color)]">
                   <div>
                     <h4 className={`text-sm font-medium ${!canEdit ? 'text-gray-500' : 'text-[var(--text-primary)]'}`}>Session Idle Timeout (Minutes)</h4>
                     <p className="text-[var(--text-secondary)] text-xs mt-0.5">Auto-logout analysts after inactivity.</p>
                   </div>
                   <select disabled={!canEdit} value={idleTimeout} onChange={e => { setIdleTimeout(e.target.value); localStorage.setItem('soc_idle_timeout', e.target.value); window.dispatchEvent(new Event('idle_timeout_change')); }} className="bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-primary)] text-sm rounded px-3 py-1.5 focus:border-blue-500 outline-none">
                     <option value="15">15 Minutes</option>
                     <option value="30">30 Minutes</option>
                     <option value="60">1 Hour</option>
                     <option value="120">2 Hours</option>
                   </select>
                 </div>
               </div>
             </div>

             <div className="pt-6 border-t border-[var(--border-color)]">
               <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">Data Management</h3>
               <div className="space-y-1">
                 <div className="flex items-center justify-between py-4 border-b border-[var(--border-color)]">
                   <div>
                     <h4 className={`text-sm font-medium ${!canEdit ? 'text-gray-500' : 'text-[var(--text-primary)]'}`}>Data Retention Policy (Days)</h4>
                     <p className="text-[var(--text-secondary)] text-xs mt-0.5">How long to keep raw logs before cold archiving.</p>
                   </div>
                   <select disabled={!canEdit} value={retention} onChange={e => { setRetention(e.target.value); localStorage.setItem('soc_retention', e.target.value); }} className="bg-[var(--bg-primary)] border border-[var(--border-color)] text-[var(--text-primary)] text-sm rounded px-3 py-1.5 focus:border-blue-500 outline-none">
                     <option value="30">30 Days</option>
                     <option value="90">90 Days</option>
                     <option value="180">180 Days</option>
                     <option value="365">1 Year</option>
                   </select>
                 </div>

                 <div className="py-4 border-b border-[var(--border-color)]">
                   <div className="flex items-center justify-between mb-3">
                     <div>
                       <h4 className={`text-sm font-medium ${!canEdit ? 'text-gray-500' : 'text-[var(--text-primary)]'}`}>Dashboard Auto-Refresh</h4>
                       <p className="text-[var(--text-secondary)] text-xs mt-0.5">
                         Polling interval for live logs and alerts. Takes effect immediately on the dashboard.
                       </p>
                     </div>
                     <span className="text-xs font-mono px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                       {autoRefresh === '10' ? '10s' : autoRefresh === '30' ? '30s' : autoRefresh === '60' ? '1m' : autoRefresh === '300' ? '5m' : `${autoRefresh}s`}
                     </span>
                   </div>
                   <div className="flex flex-wrap gap-2">
                     {[
                       { label: '10 sec',  value: '10'  },
                       { label: '30 sec',  value: '30'  },
                       { label: '1 min',   value: '60'  },
                       { label: '5 min',   value: '300' },
                     ].map(opt => (
                       <button
                         key={opt.value}
                         disabled={!canEdit}
                         onClick={() => {
                           setAutoRefresh(opt.value);
                           localStorage.setItem('soc_refresh_interval', opt.value);
                           window.dispatchEvent(new Event('refresh_interval_change'));
                         }}
                         className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                           autoRefresh === opt.value
                             ? 'bg-blue-600 border-blue-500 text-white shadow-sm shadow-blue-500/30'
                             : 'bg-[var(--bg-primary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-blue-500/50'
                         }`}
                       >
                         {opt.label}
                       </button>
                     ))}
                   </div>
                   {autoRefresh && (
                     <p className="text-xs text-[var(--text-secondary)] mt-2">
                       Dashboard refreshes every {autoRefresh === '10' ? '10 seconds' : autoRefresh === '30' ? '30 seconds' : autoRefresh === '60' ? '1 minute' : '5 minutes'}. Change takes effect instantly — no page reload needed.
                     </p>
                   )}
                 </div>
               </div>
             </div>
         </div>
      )}
    </div>
  );
}
