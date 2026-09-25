'use client';

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface SeverityData {
  severity: string;
  count: number;
}

interface SeverityChartProps {
  data: SeverityData[];
}

const COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#3b82f6',
  info: '#6b7280',
};

export default function SeverityChart({ data }: SeverityChartProps) {
  const total = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="h-[300px] w-full bg-[#1a1f2e] border border-gray-800 rounded-lg p-4 flex flex-col">
      <h3 className="text-white text-lg font-medium mb-4">Events by Severity</h3>
      <div className="flex-grow relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="count"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[entry.severity.toLowerCase()] || COLORS.info} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ backgroundColor: '#1a1f2e', border: '1px solid #374151', color: '#fff' }}
              itemStyle={{ color: '#fff' }}
            />
            <Legend verticalAlign="bottom" height={36} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <span className="text-2xl font-bold text-white">{total}</span>
            <span className="block text-xs text-gray-400">Total</span>
          </div>
        </div>
      </div>
    </div>
  );
}
