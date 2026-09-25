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
    <div className="bg-[#1a1f2e] border border-gray-800 rounded-lg p-6 hover:bg-[#202636] transition-colors">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-gray-400 text-sm font-medium">{title}</h3>
        <div className={`p-2 rounded-md ${colorStyles[color]}`}>
          <Icon size={20} />
        </div>
      </div>
      <div className="flex items-baseline gap-4">
        <span className="text-3xl font-bold text-white">{value}</span>
        <div className={`flex items-center text-sm ${trend === 'up' ? 'text-green-500' : 'text-red-500'}`}>
          {trend === 'up' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
          <span className="ml-1">{change}%</span>
        </div>
      </div>
    </div>
  );
}
