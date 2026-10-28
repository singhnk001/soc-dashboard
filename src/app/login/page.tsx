"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Lock, User, AlertCircle, KeyRound, Sparkles } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // MFA States
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaUserId, setMfaUserId] = useState('');
  const [mfaCode, setMfaCode] = useState('');

  // Clear stale session data on mount
  React.useEffect(() => {
    sessionStorage.removeItem("user");
    sessionStorage.removeItem("soc_user");
    sessionStorage.removeItem("soc_role");
    sessionStorage.removeItem("soc_real_name");
  }, []);

  const handleDemoLogin = () => {
    setIsLoading(true);
    setError('');
    const demoUser = {
      id: 'demo-readonly-001',
      username: 'demo',
      real_name: 'Demo Analyst (Read-Only)',
      role: 'readonly',
      status: 'Active',
      mfa_enabled: false,
    };
    sessionStorage.setItem('user', JSON.stringify(demoUser));
    sessionStorage.setItem('soc_user', demoUser.username);
    sessionStorage.setItem('soc_real_name', demoUser.real_name);
    sessionStorage.setItem('soc_role', demoUser.role);
    sessionStorage.setItem('soc_login_time', Date.now().toString());
    document.cookie = `soc_session=${demoUser.role}; path=/`;
    router.push('/');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Instant client-side check for demo credentials
    if (
      username.trim().toLowerCase() === 'demo' &&
      (password === 'demo123' || password === 'demo')
    ) {
      handleDemoLogin();
      return;
    }

    try {
      if (mfaRequired) {
        // Step 2: MFA Verification
        const res = await fetch('/api/auth/login/mfa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: mfaUserId, token: mfaCode }),
        });
        
        const data = await res.json();
        
        if (res.ok && data.status === 'success') {
          sessionStorage.setItem('user', JSON.stringify(data.user));
          sessionStorage.setItem('soc_user', data.user.username);
          sessionStorage.setItem('soc_real_name', data.user.real_name);
          sessionStorage.setItem('soc_role', data.user.role);
          sessionStorage.setItem('soc_login_time', Date.now().toString());
          document.cookie = `soc_session=${data.user.role}; path=/`;
          router.push('/');
        } else {
          setError(data.detail || 'Invalid verification code');
        }
      } else {
        // Step 1: Initial Login
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        
        const data = await res.json();
        
        if (res.ok) {
          if (data.status === 'mfa_required') {
            setMfaRequired(true);
            setMfaUserId(data.user_id);
          } else if (data.status === 'success') {
            sessionStorage.setItem('user', JSON.stringify(data.user));
            sessionStorage.setItem('soc_user', data.user.username);
            sessionStorage.setItem('soc_real_name', data.user.real_name);
            sessionStorage.setItem('soc_role', data.user.role);
            sessionStorage.setItem('soc_login_time', Date.now().toString());
            document.cookie = `soc_session=${data.user.role}; path=/`;
            router.push('/');
          }
        } else {
          setError(data.detail || 'Invalid credentials');
        }
      }
    } catch {
      // If network/backend is unavailable (e.g. standalone Vercel preview), allow demo fallback
      if (username.trim().toLowerCase() === 'demo') {
        handleDemoLogin();
        return;
      }
      setError('Server unreachable. Click "1-Click Demo Login" below for instant read-only access.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] shadow-2xl p-8 animate-in fade-in zoom-in-95 duration-300">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mb-4">
            <Shield className="w-8 h-8 text-blue-500" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">SOC Dashboard</h1>
          <p className="text-[var(--text-secondary)] mt-2 text-sm text-center">
            {mfaRequired
              ? 'Enter the 6-digit code from your Authenticator app'
              : 'Sign in to access the Security Operations Center'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          {!mfaRequired ? (
            <>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                  Username
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg pl-10 pr-4 py-3 text-[var(--text-primary)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                    placeholder="demo or admin"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg pl-10 pr-4 py-3 text-[var(--text-primary)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="animate-in slide-in-from-right-8 duration-300">
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                Authenticator Code
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-500" />
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-[var(--bg-primary)] border border-indigo-500/50 rounded-lg pl-10 pr-4 py-3 text-[var(--text-primary)] font-mono text-center tracking-[0.5em] text-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
                  placeholder="000000"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : mfaRequired ? (
              'Verify & Sign In'
            ) : (
              'Sign In'
            )}
          </button>
          
          {mfaRequired && (
            <button
              type="button"
              onClick={() => { setMfaRequired(false); setMfaCode(''); setError(''); }}
              className="w-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm transition-colors mt-2"
            >
              Back to Password
            </button>
          )}
        </form>

        {/* Demo Account Callout */}
        <div className="mt-6 pt-5 border-t border-[var(--border-color)]">
          <div className="bg-blue-500/10 border border-blue-500/25 rounded-lg p-3 text-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-blue-400 flex items-center gap-1.5">
                <Sparkles size={14} className="text-blue-400" />
                Demo Account (Read-Only)
              </div>
              <div className="text-[var(--text-secondary)] mt-0.5">
                User: <code className="bg-black/30 px-1 py-0.5 rounded text-gray-200">demo</code> &nbsp;|&nbsp; Pass: <code className="bg-black/30 px-1 py-0.5 rounded text-gray-200">demo123</code>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDemoLogin}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white font-medium px-3.5 py-1.5 rounded-md transition-all whitespace-nowrap shadow-sm hover:shadow text-xs"
            >
              1-Click Demo Login
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
