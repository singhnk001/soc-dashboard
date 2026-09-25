'use client';

import React, { useState } from 'react';
import { MitreMapping, MitreTactic } from '@/lib/types';
import { Search, Filter } from 'lucide-react';

interface EventIdTableProps {
  mappings: MitreMapping[];
  tactics: MitreTactic[];
}

export default function EventIdTable({ mappings, tactics }: EventIdTableProps) {
  const [search, setSearch] = useState('');
  const [tacticFilter, setTacticFilter] = useState('all');

  const filteredMappings = mappings.filter(m => {
    const matchesSearch = String(m.eventId).includes(search) || m.description.toLowerCase().includes(search.toLowerCase());
    const matchesTactic = tacticFilter === 'all' || m.tacticId === tacticFilter;
    return matchesSearch && matchesTactic;
  });

  return (
    <div className="bg-[#1a1f2e] border border-gray-800 rounded-lg overflow-hidden flex flex-col">
      <div className="p-4 border-b border-gray-800 flex flex-col sm:flex-row gap-4 justify-between items-center bg-[#1e2436]">
        <h3 className="text-white font-medium">Windows Event ID Reference</h3>
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="Search Event IDs or description..." 
              className="w-full bg-[#11141e] border border-gray-700 text-white text-sm rounded-md pl-9 pr-3 py-2 focus:outline-none focus:border-blue-500"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-400" />
            <select 
              className="bg-[#11141e] border border-gray-700 text-white text-sm rounded-md px-3 py-2 focus:outline-none focus:border-blue-500 max-w-[200px]"
              value={tacticFilter}
              onChange={(e) => setTacticFilter(e.target.value)}
            >
              <option value="all">All Tactics</option>
              {tactics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full text-left text-sm text-gray-300">
          <thead className="bg-[#151a27] text-gray-400 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 font-medium">Event ID</th>
              <th className="px-4 py-3 font-medium">Platform</th>
              <th className="px-4 py-3 font-medium">Tactic</th>
              <th className="px-4 py-3 font-medium">Technique</th>
              <th className="px-4 py-3 font-medium">Severity Default</th>
              <th className="px-4 py-3 font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {filteredMappings.map((mapping) => (
              <tr key={`${mapping.platform}-${mapping.eventId}`} className="border-b border-gray-800 hover:bg-[#202636] transition-colors">
                <td className="px-4 py-3 font-mono font-medium text-white">{mapping.eventId}</td>
                <td className="px-4 py-3 capitalize">{mapping.platform}</td>
                <td className="px-4 py-3">{tactics.find(t => t.id === mapping.tacticId)?.name || mapping.tacticId}</td>
                <td className="px-4 py-3 font-mono text-xs">{mapping.techniqueId}</td>
                <td className="px-4 py-3 capitalize">
                  <span className={`px-2 py-1 rounded text-xs border ${
                    mapping.severity === 'critical' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                    mapping.severity === 'high' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                    mapping.severity === 'medium' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                    'bg-blue-500/10 text-blue-500 border-blue-500/20'
                  }`}>
                    {mapping.severity}
                  </span>
                </td>
                <td className="px-4 py-3 max-w-md truncate" title={mapping.description}>{mapping.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
