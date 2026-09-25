'use client';

import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Alert } from '@/lib/types';
import { ShieldAlert, CheckCircle2, Clock, X, ThumbsUp, ThumbsDown, Save } from 'lucide-react';
import { mutate } from 'swr';

interface AlertCardProps {
  alert: Alert;
}

const severityColors: Record<string, string> = {
  critical: 'bg-red-500 border-red-500',
  high: 'bg-orange-500 border-orange-500',
  medium: 'bg-yellow-500 border-yellow-500',
  low: 'bg-blue-500 border-blue-500',
  info: 'bg-gray-500 border-gray-500',
};

const statusConfig: Record<string, { icon: typeof ShieldAlert; color: string; pulse: boolean }> = {
  new: { icon: ShieldAlert, color: 'text-red-500 bg-red-500/10', pulse: true },
  investigating: { icon: Clock, color: 'text-yellow-500 bg-yellow-500/10', pulse: false },
  resolved: { icon: CheckCircle2, color: 'text-green-500 bg-green-500/10', pulse: false },
  false_positive: { icon: CheckCircle2, color: 'text-gray-500 bg-gray-500/10', pulse: false },
};

export default function AlertCard({ alert }: AlertCardProps) {
  const StatusIcon = statusConfig[alert.status].icon;
  const [isResolving, setIsResolving] = useState(false);
  const [resolutionType, setResolutionType] = useState('true_positive');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateStatus = async (newStatus: string, rType?: string, alertNotes?: string) => {
    setIsSubmitting(true);
    try {
      await fetch(`/api/alerts/${alert.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          resolution_type: rType,
          notes: alertNotes
        })
      });
      // Tell SWR to re-fetch any endpoints that end with /api/alerts or /api/stats
      mutate((key) => typeof key === 'string' && (key.includes('/api/alerts') || key.includes('/api/stats')), undefined, { revalidate: true });
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
      setIsResolving(false);
    }
  };

  return (
    <div className={`bg-[#1a1f2e] border border-gray-800 rounded-lg overflow-hidden flex relative transition-colors`}>
      <div className={`w-1.5 ${severityColors[alert.severity].split(' ')[0]}`} />
      <div className="p-4 flex-grow flex flex-col">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h4 className="text-white font-medium text-lg">{alert.title}</h4>
            <span className="text-sm text-gray-400">Source: {alert.source} • {formatDistanceToNow(new Date(alert.timestamp))} ago</span>
          </div>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[alert.status].color}`}>
            {statusConfig[alert.status].pulse && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
            )}
            {!statusConfig[alert.status].pulse && <StatusIcon size={12} />}
            <span className="capitalize">{alert.status.replace('_', ' ')}</span>
          </div>
        </div>
        <p className="text-gray-300 text-sm mb-4">{alert.description}</p>
        
        {/* If resolved, show notes */}
        {(alert.status === 'resolved' || alert.status === 'false_positive') && (alert.resolution_type || alert.notes) && (
           <div className="mb-4 p-3 bg-gray-900/50 border border-gray-800 rounded text-sm">
             <div className="text-gray-400 uppercase text-xs font-bold mb-1">Resolution Notes</div>
             {alert.resolution_type && (
               <div className="mb-1">
                 <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${alert.resolution_type === 'true_positive' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                   {alert.resolution_type === 'true_positive' ? <ThumbsUp size={12}/> : <ThumbsDown size={12}/>}
                   {alert.resolution_type === 'true_positive' ? 'True Positive' : 'False Positive'}
                 </span>
               </div>
             )}
             {alert.notes && <div className="text-gray-300 whitespace-pre-wrap">{alert.notes}</div>}
           </div>
        )}

        {/* Raw Log Details */}
        {alert.raw_log && (
          <div className="mb-4">
            <details className="group">
              <summary className="text-xs font-medium text-gray-400 cursor-pointer hover:text-gray-300 select-none">
                View Raw Log Details
              </summary>
              <div className="mt-2 p-3 bg-[#11141e] border border-gray-800 rounded text-xs font-mono text-green-400 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(alert.raw_log), null, 2);
                  } catch (e) {
                    return alert.raw_log;
                  }
                })()}
              </div>
            </details>
          </div>
        )}

        {/* Resolution Form */}
        {isResolving && (
          <div className="mb-4 p-3 border border-blue-500/30 bg-blue-500/5 rounded-lg">
            <h5 className="text-sm font-medium text-blue-400 mb-2">Close Alert</h5>
            <div className="flex gap-2 mb-3">
              <button 
                onClick={() => setResolutionType('true_positive')}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded text-sm transition-colors border ${resolutionType === 'true_positive' ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200'}`}
              >
                <ThumbsUp size={14} /> True Positive
              </button>
              <button 
                onClick={() => setResolutionType('false_positive')}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded text-sm transition-colors border ${resolutionType === 'false_positive' ? 'bg-gray-600/50 border-gray-500/50 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200'}`}
              >
                <ThumbsDown size={14} /> False Positive
              </button>
            </div>
            <textarea
              className="w-full bg-[#11141e] border border-gray-700 rounded p-2 text-sm text-white mb-2 focus:outline-none focus:border-blue-500"
              placeholder="Investigation notes..."
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setIsResolving(false)} className="text-xs text-gray-400 hover:text-white px-3 py-1.5">Cancel</button>
              <button 
                onClick={() => updateStatus(resolutionType === 'true_positive' ? 'resolved' : 'false_positive', resolutionType, notes)} 
                disabled={isSubmitting}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded flex items-center gap-1 disabled:opacity-50"
              >
                <Save size={14} /> Save & Close
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-800">
          <div className="flex gap-2">
            {alert.mitreRef && (
              <span className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded border border-gray-700">
                {alert.mitreRef}
              </span>
            )}
            <span className={`text-xs px-2 py-1 rounded border capitalize ${severityColors[alert.severity].replace('bg-', 'text-').replace('border-', 'border-').split(' ')[0]} bg-opacity-10 border-opacity-30`}>
              {alert.severity}
            </span>
          </div>
          <div className="flex gap-2">
            {!isResolving && alert.status === 'new' && (
              <button 
                onClick={() => updateStatus('investigating')}
                disabled={isSubmitting}
                className="text-xs bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded transition-colors disabled:opacity-50"
              >
                Start Investigation
              </button>
            )}
            {!isResolving && (alert.status === 'new' || alert.status === 'investigating') && (
              <button 
                onClick={() => setIsResolving(true)}
                className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded transition-colors"
              >
                Resolve Alert
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

