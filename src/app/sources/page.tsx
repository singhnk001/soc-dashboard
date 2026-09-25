'use client';

import React from 'react';
import useSWR from 'swr';
import { Loader2, Server, Activity, Clock, ShieldCheck, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function SourcesPage() {
  const { data: sources, isLoading } = useSWR('/api/sources', fetcher, { refreshInterval: 10000 });

  const sourcesArray = Array.isArray(sources) ? sources : [];
  const healthyCount = sourcesArray.filter((s: any) => s.status === 'healthy').length;
  const inactiveCount = sourcesArray.filter((s: any) => s.status === 'inactive').length;

  return (
    <div className="p-6 space-y-6 bg-[#0f1219] min-h-screen text-white">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Log Sources</h1>
          <p className="text-gray-400 text-sm mt-1">Monitor the health and reporting status of your servers and agents</p>
        </div>
      </div>

      {!isLoading && Array.isArray(sources) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-[#1a1f2e] border border-gray-800 rounded-lg p-5 flex items-center gap-4">
            <div className="bg-blue-500/10 p-3 rounded-full text-blue-400"><Server size={24} /></div>
            <div>
              <div className="text-2xl font-bold">{sourcesArray.length}</div>
              <div className="text-gray-400 text-sm">Total Sources</div>
            </div>
          </div>
          <div className="bg-[#1a1f2e] border border-green-900/50 rounded-lg p-5 flex items-center gap-4">
            <div className="bg-green-500/10 p-3 rounded-full text-green-400"><ShieldCheck size={24} /></div>
            <div>
              <div className="text-2xl font-bold text-green-400">{healthyCount}</div>
              <div className="text-gray-400 text-sm">Healthy (Active)</div>
            </div>
          </div>
          <div className="bg-[#1a1f2e] border border-red-900/50 rounded-lg p-5 flex items-center gap-4">
            <div className="bg-red-500/10 p-3 rounded-full text-red-400"><AlertCircle size={24} /></div>
            <div>
              <div className="text-2xl font-bold text-red-400">{inactiveCount}</div>
              <div className="text-gray-400 text-sm">Inactive</div>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="py-12 flex justify-center bg-[#1a1f2e] border border-gray-800 rounded-lg">
          <Loader2 className="animate-spin text-blue-500" size={32} />
        </div>
      ) : (
        <div className="bg-[#1a1f2e] border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#11141e] border-b border-gray-800 text-gray-400 uppercase text-xs">
              <tr>
                <th className="px-6 py-4 font-medium">Hostname</th>
                <th className="px-6 py-4 font-medium">Log Source</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Last Received</th>
                <th className="px-6 py-4 font-medium">Total Events</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {sourcesArray.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No log sources detected yet. Start a collector agent to see it here!
                  </td>
                </tr>
              )}
              {sourcesArray.map((source: any, idx: number) => (
                <tr key={idx} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-6 py-4 font-medium flex items-center gap-2">
                    <Server size={16} className="text-gray-400" />
                    {source.hostname}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {source.source.split(',').map((src: string, i: number) => (
                        <span key={i} className="bg-gray-800 text-gray-300 px-2 py-1 rounded-md text-xs font-mono">
                          {src}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {source.status === 'healthy' ? (
                      <span className="flex items-center gap-1.5 text-green-400 text-xs font-medium">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        Healthy
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-red-400 text-xs font-medium">
                        <div className="h-2 w-2 rounded-full bg-red-500" />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-400 flex items-center gap-2">
                    <Clock size={14} />
                    {formatDistanceToNow(new Date(source.lastSeen))} ago
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-gray-300 font-medium">
                      {source.totalEvents.toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

