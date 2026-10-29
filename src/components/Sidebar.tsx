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
    <aside className={`bg-[var(--bg-card)] border-r border-[#1f2937] flex flex-col transition-all duration-300 ${collapsed ? 'w-16' : 'w-60'} shrink-0`}>
      <div className="h-14 flex items-center justify-between px-4 border-b border-[#1f2937]">
        {!collapsed && (
          <div className="flex items-center gap-2 text-[var(--text-primary)] font-bold text-base">
            <Shield className="text-[var(--accent-blue)]" size={20} />
            <span>SOC Dashboard</span>
          </div>
        )}
        {collapsed && <Shield className="text-[var(--accent-blue)] mx-auto" size={20} />}
        <button onClick={() => setCollapsed(!collapsed)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] md:hidden">
          <Menu size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        <nav className="space-y-0.5 px-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-1.5 rounded-md transition-colors text-xs font-medium ${
                  isActive 
                    ? 'bg-[var(--bg-secondary)] text-[var(--accent-blue)]' 
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                }`}
              >
                <Icon size={16} />
                {!collapsed && <span>{item.name}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-3 pb-8 border-t border-[#1f2937] flex flex-col gap-1.5 select-none cursor-default">
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
          <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          <span>System Status: Online</span>
        </div>
        {!collapsed && (
          <div className="flex flex-col text-[11px] text-gray-500">
            <span className="truncate">{realName}</span>
            <div className="flex justify-between items-center text-[10px] text-gray-600 font-mono mt-0.5">
              <span>Session:</span>
              <span className="text-blue-400 font-medium">{uptime}</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
