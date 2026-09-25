'use client';

import React from 'react';
import LogTable from '@/components/LogTable';
import { Download, Loader2 } from 'lucide-react';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function LogsPage() {
  const { data, error, isLoading } = useSWR('/api/logs?limit=100', fetcher, { refreshInterval: 5000 });

  return (
    <div className="p-6 bg-[#0f1219] min-h-screen text-white h-screen flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Log Explorer</h1>
          <p className="text-gray-400 text-sm mt-1">
            {isLoading ? "Loading events..." : `Showing latest events (Total in DB: ${data?.total || 0})`}
          </p>
        </div>
        <button className="flex items-center gap-2 bg-[#1a1f2e] border border-gray-700 hover:bg-[#202636] px-4 py-2 rounded-md transition-colors text-sm">
          <Download size={16} />
          <span>Export CSV</span>
        </button>
      </div>
      
      <div className="flex-grow overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin text-blue-500" size={32} /></div>
        ) : error ? (
          <div className="text-red-500 flex justify-center items-center h-full">Failed to load logs. Ensure FastAPI is running on port 8000.</div>
        ) : (
          <LogTable logs={data?.data || []} />
        )}
      </div>
    </div>
  );
}

