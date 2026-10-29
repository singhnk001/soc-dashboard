'use client';

import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  change: number;
  trend: 'up' | 'down';
  color: 'blue' | 'red' | 'yellow' | 'green';
  icon: React.ElementType;
}

const colorStyles = {
  blue: 'text-blue-500 bg-blue-500/10',
  red: 'text-red-500 bg-red-500/10',
  yellow: 'text-yellow-500 bg-yellow-500/10',
  green: 'text-green-500 bg-green-500/10',
};

export default function StatsCard({ title, value, change, trend, color, icon: Icon }: StatsCardProps) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4 hover:bg-[#202636] transition-colors flex flex-col justify-between h-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[var(--text-secondary)] text-xs uppercase font-medium">{title}</h3>
        <div className={`p-1.5 rounded-md ${colorStyles[color]}`}>
          <Icon size={16} />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-[var(--text-primary)]">{value}</span>
        <div className={`flex items-center text-xs ${trend === 'up' ? 'text-green-500' : 'text-red-500'}`}>
          {trend === 'up' ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          <span className="ml-0.5">{change}%</span>
        </div>
      </div>
    </div>
  );
}
