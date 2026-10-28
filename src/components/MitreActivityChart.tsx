'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface TechniqueData {
  technique_id: string;
  severity: string;
  count: number;
}

const SEV_COLOR: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#3b82f6',
  info: '#6b7280',
};

export default function MitreActivityChart({ data }: { data: TechniqueData[] }) {
  const sorted = [...data].sort((a, b) => b.count - a.count).slice(0, 10);

  return (
    <div className="h-[300px] w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[var(--text-primary)] text-lg font-medium">MITRE ATT&CK Activity</h3>
        <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] px-2 py-1 rounded">
          Top detected techniques
        </span>
      </div>
      {sorted.length === 0 ? (
        <div className="flex items-center justify-center h-3/4 text-[var(--text-secondary)] text-sm">
          No MITRE detections yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="85%">
          <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3e" horizontal={false} />
            <XAxis type="number" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis dataKey="technique_id" type="category" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} width={70} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1a1f2e', border: '1px solid #374151', color: '#fff', fontSize: 12 }}
              cursor={{ fill: '#2a2f3e' }}
              formatter={(value, _, props) => [value.toLocaleString(), `Severity: ${props.payload.severity}`]}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={14}>
              {sorted.map((d, i) => (
                <Cell key={i} fill={SEV_COLOR[d.severity] || SEV_COLOR.info} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
