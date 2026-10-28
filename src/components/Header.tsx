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
  useEffect(() => {
    if (pathname !== '/login' && !sessionStorage.getItem('soc_user')) {
      document.cookie = 'soc_session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT';
      router.push('/login');
    }
  }, [pathname, router]);

  
  const isLoginPage = pathname === '/login';

  const fetcher = (url: string) => fetch(url).then(res => {
    if (!res.ok) return null;
    return res.json().catch(() => null);
  });
  // Only poll alerts when NOT on the login page — avoids 500 errors before auth
  const { data: alerts } = useSWR(isLoginPage ? null : '/api/alerts', fetcher, { refreshInterval: 10000 });
  const newAlertsCount = alerts?.data?.filter((a: any) => a.status === 'new').length || alerts?.items?.filter((a: any) => a.status === 'new').length || 0;
  const [prevCount, setPrevCount] = useState(0);
  useEffect(() => {
    if (newAlertsCount > prevCount) {
      if (localStorage.getItem('soc_audio_enabled') === 'true') {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.play().catch(e => console.log('Audio autoplay prevented'));
      }
    }
    setPrevCount(newAlertsCount);
  }, [newAlertsCount, prevCount]);

  const [currentTime, setCurrentTime] = useState<string>('');
  const [role, setRole] = useState<string>('');
  


  const handleLogout = () => {
    document.cookie = 'soc_session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT';
    sessionStorage.removeItem('soc_user');
    sessionStorage.removeItem('soc_real_name');
    sessionStorage.removeItem('soc_role');
    router.push('/login');
  };

  const [timeLeft, setTimeLeft] = useState<number>(90);

  useEffect(() => {
    const getTimeoutSeconds = () => parseInt(localStorage.getItem('soc_idle_timeout') || '30', 10) * 60;
    setTimeLeft(getTimeoutSeconds());
    
    let timer: NodeJS.Timeout;
    const resetTimer = () => setTimeLeft(getTimeoutSeconds());

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
        const newTimeout = parseInt(e.newValue || '30', 10) * 60;
        setTimeLeft(newTimeout);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('idle_timeout_change', () => { setTimeLeft(parseInt(localStorage.getItem('soc_idle_timeout') || '30', 10) * 60); });
    
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
    setRole(sessionStorage.getItem('soc_role') || 'ERROR_PLEASE_HARD_REFRESH_LOGIN_PAGE');
    

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
    <header className="h-16 bg-[var(--bg-card)] border-b border-[var(--border-color)] flex items-center justify-between px-6 shrink-0 relative z-10">
      <h1 className="text-xl font-semibold text-[var(--text-primary)] select-none cursor-default">{getPageTitle()}</h1>
      
      <div className="flex items-center gap-6">


        <div className="flex items-center gap-2 px-3 py-1 bg-[var(--bg-hover)]/50 rounded text-xs font-mono text-[var(--text-secondary)] select-none cursor-default">
          <Timer size={14} className={timeLeft < 15 ? 'text-red-500 animate-pulse' : 'text-gray-500'} />
          <span className={timeLeft < 15 ? 'text-red-500' : ''}>
            {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
          </span>
        </div>
        <div className="text-sm text-[var(--text-secondary)] hidden sm:block font-mono select-none cursor-default">
          {currentTime}
        </div>

        <Link href="/alerts" className="relative text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
          <Bell size={20} />
          {newAlertsCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-[var(--text-primary)] flex items-center justify-center font-bold">
              {newAlertsCount}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-3 border-l border-[var(--border-color)] pl-6">
          <div className="flex flex-col items-end hidden sm:flex select-none cursor-default">
            <span className="text-sm font-medium text-[var(--text-primary)]">
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
