'use client';
import { useState } from 'react';
import { Shield, KeyRound, User } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [userId, setUserId] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (userId === 'admin' && password === 'Password@123') {
      document.cookie = 'soc_session=admin; path=/';
      router.push('/');
    } else if (userId === 'readonly' && password === 'readonly123') {
      document.cookie = 'soc_session=readonly; path=/';
      router.push('/');
    } else if (userId === 'l1' && password === 'l1pass') {
      document.cookie = 'soc_session=l1; path=/';
      router.push('/');
    } else {
      setError('Invalid credentials. Hint: admin/Password@123 or readonly/readonly123');
    }
  };

  return (
    <div className="min-h-screen bg-[#0f1219] flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-[#1a1f2e] rounded-xl border border-gray-800 p-8 shadow-2xl relative overflow-hidden">
        {/* Decorative background element */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600"></div>
        
        <div className="flex flex-col items-center mb-8">
          <div className="bg-blue-600/10 p-4 rounded-2xl mb-4 border border-blue-500/20">
            <Shield size={36} className="text-blue-500" />
          </div>
          <h1 className="text-2xl font-bold text-white">SOC Dashboard</h1>
          <p className="text-gray-400 mt-2 text-sm text-center">Security Operations Center Authentication Portal</p>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-5">
          {error && (
            <div className="bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg p-3 text-sm text-center">
              {error}
            </div>
          )}
          
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">User ID</label>
            <div className="relative">
              <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input 
                type="text" 
                required 
                value={userId} 
                onChange={e => setUserId(e.target.value)} 
                className="w-full bg-[#11141e] border border-gray-700 rounded-lg pl-10 pr-4 py-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder-gray-600"
                placeholder="Enter user ID"
              />
            </div>
          </div>
          
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">Password</label>
            <div className="relative">
              <KeyRound size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input 
                type="password" 
                required 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                className="w-full bg-[#11141e] border border-gray-700 rounded-lg pl-10 pr-4 py-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder-gray-600"
                placeholder="Enter password"
              />
            </div>
          </div>
          
          <div className="pt-2">
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors shadow-lg shadow-blue-900/50 flex items-center justify-center gap-2">
              Sign In to Portal <Shield size={16} />
            </button>
          </div>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-800 text-center">
          <p className="text-xs text-gray-500">Authorized personnel only. All access is logged.</p>
        </div>
      </div>
    </div>
  );
}
