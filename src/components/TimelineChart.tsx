'use client';

import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface TimelineData {
  hour: string;
  count: number;
}

interface TimelineChartProps {
  data: TimelineData[];
}

export default function TimelineChart({ data }: TimelineChartProps) {
  return (
    <div className="h-[300px] w-full bg-[#1a1f2e] border border-gray-800 rounded-lg p-4">
      <h3 className="text-white text-lg font-medium mb-4">Log Volume (24h)</h3>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3e" vertical={false} />
          <XAxis dataKey="hour" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1a1f2e', border: '1px solid #374151', color: '#fff' }}
            itemStyle={{ color: '#60a5fa' }}
          />
          <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorCount)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
