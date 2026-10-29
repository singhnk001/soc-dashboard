'use client';

import { Search, Bell, User, LogOut, Timer } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === '/login';

  // Session validation: Never log out if cookie is present
  useEffect(() => {
    if (pathname === '/login') return;

    if (typeof window !== 'undefined') {
      const hasCookie = document.cookie.includes('soc_session=');
      const sessionUser = sessionStorage.getItem('soc_user');

      if (hasCookie && !sessionUser) {
        const match = document.cookie.match(/soc_session=([^;]+)/);
        const userRole = match ? match[1].trim() : 'readonly';
        const defaultUser = userRole === 'admin' ? 'admin' : 'demo';
        sessionStorage.setItem('soc_user', defaultUser);
        sessionStorage.setItem('soc_role', userRole);
        sessionStorage.setItem(
          'soc_real_name',
          defaultUser === 'admin' ? 'Lead SOC Administrator' : 'Demo SOC Analyst'
        );
        setRole(userRole);
        return;
      }

      if (!hasCookie && !sessionUser) {
        router.push('/login');
      }
    }
  }, [pathname, router]);

  const fetcher = (url: string) =>
    fetch(url).then(res => {
      if (!res.ok) return null;
      return res.json().catch(() => null);
    });

  // Only poll alerts when NOT on login page
  const { data: alerts } = useSWR(isLoginPage ? null : '/api/alerts', fetcher, {
    refreshInterval: 10000,
  });

  const newAlertsCount =
    alerts?.data?.filter((a: any) => a.status === 'new').length ||
    alerts?.items?.filter((a: any) => a.status === 'new').length ||
    0;

  const [prevCount, setPrevCount] = useState(0);
  useEffect(() => {
    if (newAlertsCount > prevCount) {
      if (localStorage.getItem('soc_audio_enabled') === 'true') {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.play().catch(() => {});
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
    sessionStorage.removeItem('user');
    router.push('/login');
  };

  const getTimeoutSeconds = () => {
    try {
      const stored = localStorage.getItem('soc_idle_timeout');
      const mins = stored ? parseInt(stored, 10) : 30;
      return (isNaN(mins) || mins < 10 ? 30 : mins) * 60;
    } catch {
      return 1800;
    }
  };

  const [timeLeft, setTimeLeft] = useState<number>(1800);

  // User navigation counts as activity: reset timeout on route change
  useEffect(() => {
    setTimeLeft(getTimeoutSeconds());
  }, [pathname]);

  useEffect(() => {
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
        setTimeLeft(getTimeoutSeconds());
      }
    };

    const handleCustomEvent = () => resetTimer();

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('idle_timeout_change', handleCustomEvent);
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('click', resetTimer);

    return () => {
      clearInterval(timer);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('idle_timeout_change', handleCustomEvent);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('click', resetTimer);
    };
  }, []);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString() + ' ' + now.toLocaleDateString());
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    setRole(sessionStorage.getItem('soc_role') || 'readonly');

    return () => clearInterval(interval);
  }, [pathname]);

  const getPageTitle = () => {
    if (pathname === '/') return 'Dashboard';
    const name = pathname.split('/')[1];
    return name ? name.charAt(0).toUpperCase() + name.slice(1).replace('-', ' ') : 'Dashboard';
  };

  if (pathname === '/login') return null;

  return (
    <header className="h-14 bg-[var(--bg-card)] border-b border-[var(--border-color)] flex items-center justify-between px-5 shrink-0 relative z-10">
      <h1 className="text-lg font-semibold text-[var(--text-primary)] select-none cursor-default">
        {getPageTitle()}
      </h1>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-2.5 py-1 bg-[var(--bg-hover)]/50 rounded-md text-xs font-mono text-[var(--text-secondary)] select-none cursor-default">
          <Timer size={13} className={timeLeft < 60 ? 'text-red-500 animate-pulse' : 'text-gray-500'} />
          <span className={timeLeft < 60 ? 'text-red-500 font-bold' : ''}>
            {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
          </span>
        </div>

        <div className="text-xs text-[var(--text-secondary)] hidden sm:block font-mono select-none cursor-default">
          {currentTime}
        </div>

        <Link
          href="/alerts"
          className="relative text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-1"
        >
          <Bell size={18} />
          {newAlertsCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-[var(--text-primary)] flex items-center justify-center font-bold">
              {newAlertsCount}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-3 border-l border-[var(--border-color)] pl-4">
          <div className="flex flex-col items-end hidden sm:flex select-none cursor-default">
            <span className="text-xs font-medium text-[var(--text-primary)]">
              {role === 'admin'
                ? 'Administrator'
                : role === 'l3'
                ? 'L3 Analyst'
                : role === 'l2'
                ? 'L2 Analyst'
                : role === 'l1'
                ? 'L1 Analyst'
                : role === 'readonly'
                ? 'Read Only'
                : role || 'Analyst'}
            </span>
            <span className="text-[9px] text-blue-400 font-mono uppercase bg-blue-500/10 px-1 rounded">
              {role || 'readonly'} Access
            </span>
          </div>
          <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 cursor-pointer">
            <User size={16} />
          </div>
          <button
            onClick={handleLogout}
            className="text-gray-500 hover:text-red-400 transition-colors p-1.5 rounded hover:bg-red-500/10"
            title="Sign Out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
