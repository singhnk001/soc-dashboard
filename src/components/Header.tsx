'use client';

import { Search, Bell, User, LogOut } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState<string>('');
  const [role, setRole] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleString());
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    
    // Simple cookie parser for session
    const getCookie = (name: string) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(';').shift();
      return null;
    };
    setRole(getCookie('soc_session') || 'admin');

    return () => clearInterval(interval);
  }, []);

  const getPageTitle = () => {
    if (pathname === '/') return 'Dashboard';
    const name = pathname.split('/')[1];
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  const handleLogout = () => {
    document.cookie = 'soc_session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT';
    router.push('/login');
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
            placeholder="Search logs, alerts, hosts..." 
            className="pl-10 pr-4 py-2 bg-[#11141e] border border-gray-700 rounded-md text-sm text-white focus:outline-none focus:border-blue-500 w-64 transition-colors"
          />
        </div>

        <div className="text-sm text-gray-400 hidden sm:block font-mono">
          {currentTime}
        </div>

        <button className="relative text-gray-400 hover:text-white transition-colors">
          <Bell size={20} />
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
            3
          </span>
        </button>

        <div className="flex items-center gap-3 border-l border-gray-800 pl-6">
          <div className="flex flex-col items-end hidden sm:flex">
            <span className="text-sm font-medium text-white capitalize">{role} User</span>
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
