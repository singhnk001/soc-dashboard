'use client';

import { Search, Bell, User, LogOut } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, KeyboardEvent } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Timer } from 'lucide-react';

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  
  const fetcher = (url: string) => fetch(url).then(res => res.json());
  const { data: alerts } = useSWR('/api/alerts', fetcher, { refreshInterval: 10000 });
  const newAlertsCount = alerts?.items?.filter((a: any) => a.status === 'new').length || 0;
  const [currentTime, setCurrentTime] = useState<string>('');
  const [role, setRole] = useState<string>('');
  


  const handleLogout = () => {
    document.cookie = 'soc_session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT';
    localStorage.removeItem('soc_user');
    localStorage.removeItem('soc_real_name');
    localStorage.removeItem('soc_role');
    router.push('/login');
  };

  const [timeLeft, setTimeLeft] = useState<number>(90);

  useEffect(() => {
    const configuredTimeout = parseInt(localStorage.getItem('soc_idle_timeout') || '90', 10);
    setTimeLeft(configuredTimeout);
    
    let timer: NodeJS.Timeout;
    const resetTimer = () => setTimeLeft(configuredTimeout);

    const tick = () => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          handleLogout();
          return 0;
        }
        return prev - 1;
      });
    };

    timer = setInterval(tick, 1000);
    
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'soc_idle_timeout') {
        const newTimeout = parseInt(e.newValue || '90', 10);
        setTimeLeft(newTimeout);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('idle_timeout_change', () => { setTimeLeft(parseInt(localStorage.getItem('soc_idle_timeout') || '90', 10)); });
    
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(e => document.addEventListener(e, resetTimer));

    return () => {
      clearInterval(timer);
      events.forEach(e => document.removeEventListener(e, resetTimer));
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [pathname]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleString());
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    
    // Simple cookie parser for session
    const getCookie = (name: string) => {
      const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
      if (match) return decodeURIComponent(match[2]);
      return null;
    };
    setRole(localStorage.getItem('soc_role') || 'ERROR_PLEASE_HARD_REFRESH_LOGIN_PAGE');
    

    return () => clearInterval(interval);
  }, [pathname]);

  const getPageTitle = () => {
    if (pathname === '/') return 'Dashboard';
    const name = pathname.split('/')[1];
    return name.charAt(0).toUpperCase() + name.slice(1);
  };



  // Hide header on login page
  if (pathname === '/login') return null;

  return (
    <header className="h-16 bg-[#1a1f2e] border-b border-gray-800 flex items-center justify-between px-6 shrink-0 relative z-10">
      <h1 className="text-xl font-semibold text-white">{getPageTitle()}</h1>
      
      <div className="flex items-center gap-6">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                router.push(`/logs?search=${encodeURIComponent(searchQuery.trim())}`);
              }
            }}
            placeholder="Search logs, alerts, hosts..." 
            className="pl-10 pr-4 py-2 bg-[#11141e] border border-gray-700 rounded-md text-sm text-white focus:outline-none focus:border-blue-500 w-64 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 px-3 py-1 bg-gray-800/50 rounded text-xs font-mono text-gray-400">
          <Timer size={14} className={timeLeft < 15 ? 'text-red-500 animate-pulse' : 'text-gray-500'} />
          <span className={timeLeft < 15 ? 'text-red-500' : ''}>
            {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
          </span>
        </div>
        <div className="text-sm text-gray-400 hidden sm:block font-mono">
          {currentTime}
        </div>

        <Link href="/alerts" className="relative text-gray-400 hover:text-white transition-colors">
          <Bell size={20} />
          {newAlertsCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
              {newAlertsCount}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-3 border-l border-gray-800 pl-6">
          <div className="flex flex-col items-end hidden sm:flex">
            <span className="text-sm font-medium text-white">
              {role === 'admin' ? 'Administrator' : role === 'l3' ? 'L3 Analyst' : role === 'l2' ? 'L2 Analyst' : role === 'l1' ? 'L1 Analyst' : role === 'readonly' ? 'Read Only' : role}
            </span>
            <span className="text-[10px] text-blue-400 font-mono uppercase bg-blue-500/10 px-1.5 rounded">{role} Access</span>
          </div>
          <div className="w-9 h-9 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 cursor-pointer">
            <User size={18} />
          </div>
          <button 
            onClick={handleLogout}
            className="ml-2 text-gray-500 hover:text-red-400 transition-colors p-2 rounded hover:bg-red-500/10"
            title="Sign Out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
