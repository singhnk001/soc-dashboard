'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { LayoutDashboard, FileText, Shield, Bell, Settings, ShieldAlert, Menu, Target, Code, Server, Database, Activity, Zap } from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [realName, setRealName] = useState('');
  const [uptime, setUptime] = useState('');

  useEffect(() => {
    setRealName(sessionStorage.getItem('soc_user') || 'Administrator');
    
    const updateUptime = () => {
      let loginTimeStr = sessionStorage.getItem('soc_login_time');
      if (!loginTimeStr) {
        loginTimeStr = Date.now().toString();
        sessionStorage.setItem('soc_login_time', loginTimeStr);
      }
      const loginTime = parseInt(loginTimeStr);
      const diffInSeconds = Math.floor((Date.now() - loginTime) / 1000);
      const m = Math.floor(diffInSeconds / 60);
      const s = diffInSeconds % 60;
      setUptime(`${m}m ${s}s`);
    };
    
    updateUptime();
    const interval = setInterval(updateUptime, 1000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Threat Intel', href: '/threat-intel', icon: ShieldAlert },
    { name: 'Sources', href: '/sources', icon: Server },
    { name: 'Logs', href: '/logs', icon: FileText },
    { name: 'Parsers', href: '/parsers', icon: Code },
    { name: 'Use Cases', href: '/usecases', icon: Target },
    { name: 'MITRE ATT&CK', href: '/mitre', icon: Shield },
    { name: 'Alerts', href: '/alerts', icon: Bell },
    { name: 'Playbooks', href: '/playbooks', icon: Zap },
    { name: 'Reference Sets', href: '/reference-sets', icon: Database },
    { name: 'Settings', href: '/settings', icon: Settings },
    { name: 'Troubleshooting', href: '/troubleshooting', icon: Activity },
  ];

  if (pathname === '/login') return null;

  return (
    <aside className={`bg-[var(--bg-card)] border-r border-[#1f2937] flex flex-col transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'} shrink-0 select-none`}>
      <div className="h-14 flex items-center justify-between px-4 border-b border-[#1f2937]">
        {!collapsed && (
          <div className="flex items-center gap-2.5 text-[var(--text-primary)] font-bold text-lg tracking-tight">
            <Shield className="text-[var(--accent-blue)] shrink-0" size={22} />
            <span className="truncate">SOC Dashboard</span>
          </div>
        )}
        {collapsed && <Shield className="text-[var(--accent-blue)] mx-auto" size={22} />}
        <button onClick={() => setCollapsed(!collapsed)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] md:hidden p-1">
          <Menu size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        <nav className="space-y-1 px-2.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3.5 px-3 py-2 rounded-lg transition-colors text-sm font-semibold ${
                  isActive 
                    ? 'bg-blue-600/15 text-blue-400 border-l-2 border-blue-500 font-bold' 
                    : 'text-gray-300 hover:text-white hover:bg-[var(--bg-secondary)]'
                }`}
              >
                <Icon size={19} className="shrink-0" />
                {!collapsed && <span className="truncate">{item.name}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 pb-6 border-t border-[#1f2937] flex flex-col gap-2 select-none cursor-default bg-[var(--bg-card)]/50">
        <div className="flex items-center gap-2.5 text-xs font-semibold text-gray-200">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse shrink-0" />
          <span>System Status: Online</span>
        </div>
        {!collapsed && (
          <div className="flex flex-col gap-0.5 text-xs">
            <span className="font-bold text-white truncate">{realName}</span>
            <div className="flex justify-between items-center text-xs text-gray-400 font-mono mt-0.5">
              <span>Session:</span>
              <span className="text-blue-400 font-bold">{uptime}</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
