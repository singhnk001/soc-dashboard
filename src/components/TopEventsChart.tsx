'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface TopEventData {
  event_id: string;
  count: number;
}

interface TopEventsChartProps {
  data: TopEventData[];
}

const KNOWN_EVENTS: Record<string, string> = {
  '4624': 'Logon Success',
  '4625': 'Logon Failure',
  '4634': 'Logoff',
  '4648': 'Explicit Logon',
  '4672': 'Priv Logon',
  '4688': 'Process Created',
  '4698': 'Sched Task',
  '4720': 'Account Created',
  '4732': 'Group Member Add',
  '4907': 'Audit Policy Chg',
  '5379': 'Credential Read',
  '7045': 'Service Install',
  '7040': 'Service Changed',
  '7021': 'Service Changed',
  '10016': 'COM Permission',
  '16384': 'Cert Enroll',
  '16394': 'Cert Policy',
  'Syslog': 'Syslog',
};

export default function TopEventsChart({ data }: TopEventsChartProps) {
  const chartData = data.map(d => ({
    ...d,
    label: KNOWN_EVENTS[d.event_id] || `EID ${d.event_id}`,
  }));

  return (
    <div className="h-[300px] w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4">
      <h3 className="text-[var(--text-primary)] text-lg font-medium mb-4">Top 10 Event IDs</h3>
      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3e" horizontal={false} />
          <XAxis type="number" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis dataKey="label" type="category" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} width={90} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1a1f2e', border: '1px solid #374151', color: '#fff', fontSize: 12 }}
            cursor={{ fill: '#2a2f3e' }}
            formatter={(value) => [value.toLocaleString(), 'Events']}
            labelFormatter={(label) => label}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={14}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={i === 0 ? '#ef4444' : i === 1 ? '#f97316' : i < 4 ? '#f59e0b' : '#3b82f6'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
