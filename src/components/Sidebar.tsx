'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { LayoutDashboard, FileText, Shield, Bell, Settings, ShieldAlert, Menu, Target, Code, Server } from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [realName, setRealName] = useState('');
  const [uptime, setUptime] = useState('');

  useEffect(() => {
    setRealName(localStorage.getItem('soc_real_name') || 'Administrator');
    
    const updateUptime = () => {
      const loginTime = parseInt(localStorage.getItem('soc_login_time') || Date.now().toString());
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
    { name: 'Sources', href: '/sources', icon: Server },
    { name: 'Logs', href: '/logs', icon: FileText },
    { name: 'Parsers', href: '/parsers', icon: Code },
    { name: 'Use Cases', href: '/usecases', icon: Target },
    { name: 'MITRE ATT&CK', href: '/mitre', icon: Shield },
    { name: 'Alerts', href: '/alerts', icon: Bell },
    { name: 'Settings, ShieldAlert', href: '/settings', icon: Settings, ShieldAlert },
  ];

  if (pathname === '/login') return null;

  return (
    <aside className={`bg-[var(--bg-card)] border-r border-[#1f2937] flex flex-col transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`}>
      <div className="h-16 flex items-center justify-between px-4 border-b border-[#1f2937]">
        {!collapsed && (
          <div className="flex items-center gap-2 text-white font-bold text-lg">
            <Shield className="text-[var(--accent-blue)]" />
            <span>SOC Dashboard</span>
          </div>
        )}
        {collapsed && <Shield className="text-[var(--accent-blue)] mx-auto" />}
        <button onClick={() => setCollapsed(!collapsed)} className="text-gray-400 hover:text-white md:hidden">
          <Menu size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                  isActive 
                    ? 'bg-[var(--bg-secondary)] text-[var(--accent-blue)]' 
                    : 'text-gray-400 hover:text-white hover:bg-[var(--bg-secondary)]'
                }`}
              >
                <Icon size={20} />
                {!collapsed && <span>{item.name}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-[#1f2937] flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[var(--accent-green)]"></div>
          {!collapsed && <span className="text-sm text-gray-400">System Status: Online</span>}
        </div>
        {!collapsed && (
          <div className="mt-2 text-xs text-gray-500 bg-gray-800/30 p-2 rounded border border-gray-800">
            <div className="text-gray-300 font-medium truncate">{realName}</div>
            <div className="flex justify-between mt-1">
              <span>Session:</span>
              <span className="font-mono text-blue-400">{uptime}</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
