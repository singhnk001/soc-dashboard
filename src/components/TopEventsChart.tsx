'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface TopEventData {
  eventId: number;
  count: number;
  description: string;
}

interface TopEventsChartProps {
  data: TopEventData[];
}

export default function TopEventsChart({ data }: TopEventsChartProps) {
  return (
    <div className="h-[300px] w-full bg-[#1a1f2e] border border-gray-800 rounded-lg p-4">
      <h3 className="text-white text-lg font-medium mb-4">Top 10 Event IDs</h3>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3e" horizontal={false} />
          <XAxis type="number" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis dataKey="eventId" type="category" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} width={50} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1a1f2e', border: '1px solid #374151', color: '#fff' }}
            cursor={{ fill: '#2a2f3e' }}
            formatter={(value, name, props) => [value, props.payload.description]}
            labelFormatter={(label) => `Event ID: ${label}`}
          />
          <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
