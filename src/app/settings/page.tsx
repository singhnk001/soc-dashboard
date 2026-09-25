"use client";

import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { Save, Shield, Monitor, ToggleLeft, ToggleRight, Users, UserPlus, Trash2, Key, CheckCircle, AlertCircle } from 'lucide-react';
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
  const { data: usersData } = useSWR('/api/users', fetcher);
  const users = usersData?.data || usersData || [];
  
  const [activeTab, setActiveTab] = useState('security');
  const [currentUser, setCurrentUser] = useState<any>(null);

  // MFA State
  const [mfaSetup, setMfaSetup] = useState<any>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [mfaSuccess, setMfaSuccess] = useState(false);
  
  useEffect(() => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        setCurrentUser(JSON.parse(userStr));
      }
    } catch(e) {}
  }, []);
  
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
        // Update local user object
        const updatedUser = { ...currentUser, mfa_enabled: true };
        setCurrentUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
      } else {
        setMfaError(data.detail || 'Verification failed. Try again.');
      }
    } catch(e) {
      setMfaError('Error verifying code.');
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Platform Settings</h1>
          <p className="text-gray-400">Manage security, users, and system preferences</p>
        </div>
      </div>
      
      <div className="flex border-b border-gray-800 mb-6 gap-6">
        <button 
          onClick={() => setActiveTab('security')} 
          className={`pb-3 font-medium transition-colors ${activeTab === 'security' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-gray-400 hover:text-gray-300'}`}
        >
          <div className="flex items-center gap-2"><Key size={16}/> Account Security</div>
        </button>
        <button 
          onClick={() => setActiveTab('users')} 
          className={`pb-3 font-medium transition-colors ${activeTab === 'users' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-gray-400 hover:text-gray-300'}`}
        >
          <div className="flex items-center gap-2"><Users size={16}/> User Management</div>
        </button>
        <button 
          onClick={() => setActiveTab('system')} 
          className={`pb-3 font-medium transition-colors ${activeTab === 'system' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-gray-400 hover:text-gray-300'}`}
        >
          <div className="flex items-center gap-2"><Monitor size={16}/> System Preferences</div>
        </button>
      </div>

      {activeTab === 'security' && (
        <div className="bg-[#1a1f2e] border border-gray-800 rounded-xl p-8 animate-in fade-in duration-300">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 bg-indigo-500/10 rounded-lg">
              <Shield className="w-6 h-6 text-indigo-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-white mb-1">Two-Factor Authentication (2FA)</h3>
              <p className="text-gray-400 text-sm">Add an extra layer of security to your account. When logging in, you'll need to enter a unique 6-digit code generated by your Authenticator app (like Google Authenticator or Authy).</p>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-800">
            {mfaSuccess ? (
              <div className="flex flex-col items-center justify-center p-8 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <CheckCircle className="w-16 h-16 text-emerald-500 mb-4" />
                <h4 className="text-xl font-bold text-emerald-400 mb-2">2FA is Successfully Enabled!</h4>
                <p className="text-gray-400 text-center">Your account is now secured with Time-Based One-Time Passwords (TOTP). You will be prompted for a code next time you log in.</p>
              </div>
            ) : !mfaSetup ? (
              <button 
                onClick={handleEnableMFA}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-medium shadow-lg shadow-indigo-900/20 transition-colors"
              >
                Set up 2FA via Authenticator App
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-12">
                <div className="space-y-6">
                  <div>
                    <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-sm">1</span> 
                      Scan the QR Code
                    </h4>
                    <p className="text-gray-400 text-sm mb-4">Open your preferred Authenticator app (e.g. Google Authenticator, Authy, Aegis) and scan this QR code.</p>
                    <div className="bg-white p-4 rounded-xl inline-block shadow-lg">
                      <QRCodeSVG value={mfaSetup.uri} size={180} level="M" />
                    </div>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm mb-2">Can't scan the QR code? Enter this secret manually:</p>
                    <div className="flex items-center gap-2 bg-[#0a0e1a] border border-gray-700 p-3 rounded-lg font-mono text-indigo-400 tracking-widest">
                      {mfaSetup.secret}
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-sm">2</span> 
                      Verify & Enable
                    </h4>
                    <p className="text-gray-400 text-sm mb-4">Enter the 6-digit code generated by your app to confirm the setup.</p>
                    
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
                        className="w-48 bg-[#0a0e1a] border border-gray-700 rounded-lg p-3 text-center tracking-[0.5em] font-mono text-xl text-white focus:border-indigo-500 focus:outline-none"
                      />
                      <button 
                        onClick={handleVerifyMFA}
                        disabled={mfaCode.length < 6}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 transition-colors"
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
        <div className="bg-[#1a1f2e] border border-gray-800 rounded-xl p-8 animate-in fade-in duration-300">
          <div className="flex items-center gap-3 mb-6">
            <Users size={24} className="text-purple-500" />
            <h3 className="text-lg font-bold text-white">User Management & RBAC</h3>
          </div>
          <p className="text-gray-400 text-sm mb-8">Manage portal access, user credentials, and assign role-based privileges.</p>
          
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0f1219] text-gray-400 border-b border-gray-800">
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
                  <tr key={u.id} className="hover:bg-[#11141e] transition-colors">
                    <td className="p-4 text-white font-medium">{u.username}</td>
                    <td className="p-4 text-gray-300">{u.real_name || '-'}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${u.role === 'admin' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : u.role === 'l1' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'}`}>
                        {u.role.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={u.status === 'Active' ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>{u.status}</span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex gap-3 justify-end">
                        <button className="text-gray-500 hover:text-white transition-colors">Edit</button>
                        {u.username !== 'admin' && (
                          <button className="text-gray-500 hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <button className="flex items-center gap-2 bg-[#11141e] hover:bg-gray-800 border border-gray-700 text-white px-4 py-2.5 rounded-lg transition-colors font-medium">
            <UserPlus size={18} /> Provision New User
          </button>
        </div>
      )}

      {activeTab === 'system' && (
         <div className="bg-[#1a1f2e] border border-gray-800 rounded-xl p-8 animate-in fade-in duration-300">
             <h3 className="text-lg font-bold text-white mb-6">System Preferences</h3>
             <SettingToggle label="Enable Email Notifications" description="Send critical alerts to SOC distribution lists." enabled={false} onToggle={()=>{}} />
             <SettingToggle label="Dark Mode Enforcement" description="Force dark mode for all analysts globally." enabled={true} onToggle={()=>{}} />
         </div>
      )}
    </div>
  );
}
