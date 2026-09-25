"use client";

import React, { useState } from "react";
import useSWR from "swr";
import { ShieldAlert, Search, Filter, Globe, Hash, Server, Shield, ExternalLink, Download } from "lucide-react";
import { format } from "date-fns";

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function ThreatIntelPage() {
  const { data, error, isLoading } = useSWR('/api/threat-intel', fetcher);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const iocs = data?.data || [];
  
  const filteredIoCs = iocs.filter((ioc: any) => {
    const matchesSearch = 
      ioc.indicator.toLowerCase().includes(searchTerm.toLowerCase()) || 
      ioc.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === "all" || ioc.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const getIcon = (type: string) => {
    if (type.includes("IP")) return <Server size={16} className="text-blue-400" />;
    if (type.includes("Domain") || type.includes("URL") || type.includes("Hostname")) return <Globe size={16} className="text-purple-400" />;
    if (type.includes("Hash") || type.includes("MD5") || type.includes("SHA")) return <Hash size={16} className="text-yellow-400" />;
    return <ShieldAlert size={16} className="text-red-400" />;
  };

  const getBadgeColor = (type: string) => {
    if (type.includes("IP")) return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    if (type.includes("Domain") || type.includes("URL")) return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    if (type.includes("Hash")) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    return "bg-red-500/20 text-red-400 border-red-500/30";
  };

  const uniqueTypes = Array.from(new Set(iocs.map((ioc: any) => ioc.type)));

  const handleExport = () => {
    if (!filteredIoCs.length) return;
    const csv = ["Indicator type,Indicator,Description"];
    filteredIoCs.forEach((ioc: any) => {
      csv.push("","","");
    });
    const blob = new Blob([csv.join('n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "alienvault-threat-intel-" + format(new Date(), 'yyyyMMdd') + ".csv";
    a.click();
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
            <ShieldAlert className="text-red-500" />
            Threat Intelligence
          </h1>
          <p className="text-gray-400">Open-Source Intelligence (OSINT) Indicators of Compromise</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-gray-800 rounded border border-gray-700 text-sm flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            AlienVault OTX Sync: Active
          </div>
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-[#1a1f2e] hover:bg-gray-800 text-gray-300 border border-gray-700 rounded transition-colors text-sm"
          >
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
        </div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-lg flex items-center gap-2">
          <ShieldAlert size={20} />
          Failed to load AlienVault threat intelligence data.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-[#1a1f2e] border border-gray-800 p-5 rounded-lg">
              <div className="text-gray-400 text-sm mb-1">Total IoCs</div>
              <div className="text-2xl font-bold text-white">{iocs.length}</div>
            </div>
            <div className="bg-[#1a1f2e] border border-gray-800 p-5 rounded-lg">
              <div className="text-gray-400 text-sm mb-1">Malicious IPs</div>
              <div className="text-2xl font-bold text-blue-400">
                {iocs.filter((i: any) => i.type.includes('IP')).length}
              </div>
            </div>
            <div className="bg-[#1a1f2e] border border-gray-800 p-5 rounded-lg">
              <div className="text-gray-400 text-sm mb-1">Malware Hashes</div>
              <div className="text-2xl font-bold text-yellow-400">
                {iocs.filter((i: any) => i.type.includes('Hash')).length}
              </div>
            </div>
            <div className="bg-[#1a1f2e] border border-gray-800 p-5 rounded-lg">
              <div className="text-gray-400 text-sm mb-1">Bad Domains</div>
              <div className="text-2xl font-bold text-purple-400">
                {iocs.filter((i: any) => i.type.includes('Domain')).length}
              </div>
            </div>
          </div>

          <div className="bg-[#1a1f2e] border border-gray-800 rounded-lg overflow-hidden flex flex-col h-[600px]">
            {/* Toolbar */}
            <div className="p-4 border-b border-gray-800 flex gap-4 bg-[#11141e]">
              <div className="relative flex-grow max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input 
                  type="text"
                  placeholder="Search indicators or descriptions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[#0a0e1a] border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="appearance-none bg-[#0a0e1a] border border-gray-700 rounded-lg pl-10 pr-8 py-2 text-sm text-white focus:outline-none focus:border-red-500 cursor-pointer"
                >
                  <option value="all">All Indicator Types</option>
                  {uniqueTypes.map((type: any) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="flex-grow overflow-auto">
              <table className="w-full text-left text-sm text-gray-300">
                <thead className="bg-[#11141e] text-gray-400 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-3 font-medium border-b border-gray-800 w-1/4">Indicator Type</th>
                    <th className="px-6 py-3 font-medium border-b border-gray-800 w-1/3">Indicator / Value</th>
                    <th className="px-6 py-3 font-medium border-b border-gray-800">Threat Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filteredIoCs.slice(0, 100).map((ioc: any, idx: number) => (
                    <tr key={idx} className="hover:bg-gray-800/50 transition-colors">
                      <td className="px-6 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-medium ${getBadgeColor(ioc.type)}`}>
                          {getIcon(ioc.type)}
                          {ioc.type}
                        </span>
                      </td>
                      <td className="px-6 py-3 font-mono text-red-400 break-all">
                        {ioc.indicator}
                      </td>
                      <td className="px-6 py-3 text-gray-400">
                        {ioc.description || 'No description provided'}
                      </td>
                    </tr>
                  ))}
                  {filteredIoCs.length > 100 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-4 text-center text-gray-500 text-xs italic bg-gray-900/30">
                        Showing first 100 results of {filteredIoCs.length}. Use Search to find specific indicators.
                      </td>
                    </tr>
                  )}
                  {filteredIoCs.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                        No indicators found matching your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}



