'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface SourceData {
  source: string;
  count: number;
}

const COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#818cf8', '#60a5fa', '#34d399', '#f59e0b'];

export default function TopSourcesChart({ data }: { data: SourceData[] }) {
  const chartData = data.map(d => ({
    ...d,
    label: d.source.replace('Windows-', 'Win-').replace('Microsoft-Windows-', ''),
  }));

  return (
    <div className="h-[250px] w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4 flex flex-col">
      <h3 className="text-[var(--text-primary)] text-sm font-semibold mb-2">Top Log Sources</h3>
      <div className="flex-1 min-h-0 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3e" horizontal={false} />
            <XAxis type="number" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis dataKey="label" type="category" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} width={90} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1a1f2e', border: '1px solid #374151', color: '#fff', fontSize: 11 }}
              cursor={{ fill: '#2a2f3e' }}
              formatter={(value) => [value.toLocaleString(), 'Logs']}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={12}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
