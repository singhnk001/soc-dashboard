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
    <div className="h-[250px] w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[var(--text-primary)] text-sm font-semibold">MITRE ATT&CK Activity</h3>
        <span className="text-[10px] text-[var(--text-secondary)] bg-[var(--bg-secondary)] px-2 py-0.5 rounded">
          Top detected techniques
        </span>
      </div>
      {sorted.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-[var(--text-secondary)] text-xs">
          No MITRE detections yet
        </div>
      ) : (
        <div className="flex-1 min-h-0 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3e" horizontal={false} />
              <XAxis type="number" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis dataKey="technique_id" type="category" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} width={65} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1f2e', border: '1px solid #374151', color: '#fff', fontSize: 11 }}
                cursor={{ fill: '#2a2f3e' }}
                formatter={(value, _, props) => [value.toLocaleString(), `Severity: ${props.payload.severity}`]}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={12}>
                {sorted.map((d, i) => (
                  <Cell key={i} fill={SEV_COLOR[d.severity] || SEV_COLOR.info} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
