'use client';

import React from 'react';
import { Activity, ShieldAlert, Radio, Crosshair, Loader2 } from 'lucide-react';
import StatsCard from '@/components/StatsCard';
import TimelineChart from '@/components/TimelineChart';
import SeverityChart from '@/components/SeverityChart';
import TopEventsChart from '@/components/TopEventsChart';
import AlertCard from '@/components/AlertCard';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useSWR('/api/stats', fetcher, { refreshInterval: 5000 });
  const { data: alertsData, isLoading: alertsLoading } = useSWR('/api/alerts?limit=4', fetcher, { refreshInterval: 5000 });

  if (statsLoading || alertsLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#0f1219]"><Loader2 className="animate-spin text-blue-500" size={48} /></div>;
  }

  const recentAlerts = alertsData?.data || [];

  return (
    <div className="p-6 space-y-6 bg-[#0f1219] min-h-screen text-white">
      <h1 className="text-2xl font-bold mb-6">Security Operations Center Overview</h1>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard 
          title="Total Logs" 
          value={stats?.total_logs?.toLocaleString() || "0"} 
          change={0} 
          trend="up" 
          color="blue" 
          icon={Activity} 
        />
        <StatsCard 
          title="Critical Alerts" 
          value={stats?.critical_alerts || 0} 
          change={0} 
          trend="down" 
          color="red" 
          icon={ShieldAlert} 
        />
        <StatsCard 
          title="Active Sources" 
          value={stats?.active_sources || 0} 
          change={0} 
          trend="up" 
          color="green" 
          icon={Radio} 
        />
        <StatsCard 
          title="Current EPS" 
          value={`${stats?.eps || 0}`} 
          change={0} 
          trend="up" 
          color="yellow" 
          icon={Activity} 
        />
      </div>

      {/* Timeline */}
      <div className="w-full">
        <TimelineChart data={stats?.logs_by_hour || []} />
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SeverityChart data={stats?.severity_distribution || []} />
        <TopEventsChart data={stats?.top_event_ids || []} />
      </div>

      {/* Recent Alerts */}
      <div>
        <div className="flex justify-between items-end mb-4">
          <h2 className="text-xl font-bold">Recent Alerts</h2>
          <a href="/alerts" className="text-sm text-blue-400 hover:text-blue-300">View All →</a>
        </div>
        <div className="bg-[#1a1f2e] border border-gray-800 rounded-lg overflow-hidden">
          {recentAlerts.length === 0 ? (
            <div className="text-gray-500 py-8 text-center">No recent alerts found.</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-[#11141e] border-b border-gray-800 text-gray-400 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 font-medium">Severity</th>
                  <th className="px-4 py-3 font-medium">Incident Title</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Resolution</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {recentAlerts.map((alert: any) => (
                  <tr key={alert.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase ${
                        alert.severity === 'critical' ? 'bg-red-500 text-white' :
                        alert.severity === 'high' ? 'bg-orange-500 text-white' :
                        alert.severity === 'medium' ? 'bg-yellow-500 text-black' :
                        alert.severity === 'low' ? 'bg-green-500 text-white' : 'bg-gray-500 text-white'
                      }`}>{alert.severity}</span>
                    </td>
                    <td className="px-4 py-3 text-white font-medium max-w-xs truncate">{alert.title}</td>
                    <td className="px-4 py-3">
                      <span className="bg-gray-800 text-gray-300 px-2 py-1 rounded text-xs font-mono">{alert.source || 'N/A'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {alert.resolution_type ? (
                        <span className={`text-xs font-medium ${alert.resolution_type === 'true_positive' ? 'text-green-400' : 'text-gray-400'}`}>
                          {alert.resolution_type === 'true_positive' ? 'True Positive' : 'False Positive'}
                        </span>
                      ) : <span className="text-gray-600 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium capitalize ${
                        alert.status === 'new' ? 'text-red-400' :
                        alert.status === 'investigating' ? 'text-yellow-400' :
                        'text-green-400'
                      }`}>
                        {alert.status === 'new' && (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                          </span>
                        )}
                        {alert.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {(() => { try { return require('date-fns').formatDistanceToNow(new Date(alert.timestamp)) + ' ago'; } catch { return alert.timestamp; } })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

