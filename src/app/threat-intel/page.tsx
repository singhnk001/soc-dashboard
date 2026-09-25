"use client";

import React, { useState } from "react";
import useSWR from "swr";
import { Search, Settings, ChevronRight, ChevronDown } from "lucide-react";
import { format } from "date-fns";

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function ThreatIntelIntegrationPage() {
  const { data, error, isLoading } = useSWR('/api/threat-intel', fetcher);
  
  const [activeTab, setActiveTab] = useState("Malware URLs");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({"Malware URLs": true});
  
  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => (Object.assign({}, prev, { [cat]: !prev[cat] })));
  };

  const alienVaultCount = data?.count || 1144;
  
  const categories = [
    { name: "Watch Lists", sub: [] },
    { name: "Lookup Tables", sub: [] },
    { name: "Osquery", sub: [] },
    { name: "Automation", sub: [] },
    { name: "Malware Domains", sub: [] },
    { name: "Malware IPc", sub: [] },
    { name: "Malware Hash", sub: [] },
    { name: "Malware Processes", sub: [] },
    { name: "Malware URLs", sub: [
      "ThreatStream Malware URL",
      "FortiSandbox Malware URL",
      "FortiGuard Malware URL",
      "OpenPhish Malware URL",
      "URLHaus Malware URL",
      "TweetFeed Malware URL",
      "ThreatFox Malware URL",
      "MISP Malware URL"
    ]}
  ];

  const feeds = [
    { status: "Not Scheduled", name: "OpenPhish Malware URL", indicators: "0 - 0", lastUpdated: "-", schedule: "-", type: "API" },
    { status: "Not Scheduled", name: "URLHaus Malware URL", indicators: "0 - 0", lastUpdated: "-", schedule: "-", type: "API" },
    { status: "Not Scheduled", name: "TweetFeed Malware URL", indicators: "0 - 0", lastUpdated: "-", schedule: "-", type: "API" },
    { status: "Not Scheduled", name: "ThreatFox Malware URL", indicators: "0 - 0", lastUpdated: "-", schedule: "-", type: "API" },
    { status: "Not Configured", name: "MISP Malware URL", indicators: "0 - 0", lastUpdated: "-", schedule: "-", type: "MANUAL" },
    { status: "Not Scheduled", name: "FortiRecon Malware URL", indicators: "0 - 0", lastUpdated: "-", schedule: "-", type: "API" },
    { status: "Not Scheduled", name: "FortiSOAR Malware URL", indicators: "0 - 0", lastUpdated: "-", schedule: "-", type: "API" },
    { status: "Not Scheduled", name: "OpenCTI Malware URL", indicators: "0 - 0", lastUpdated: "-", schedule: "-", type: "API" },
    { status: "Not Scheduled", name: "Mandiant Malware URL", indicators: "0 - 0", lastUpdated: "-", schedule: "-", type: "API" },
    { status: "Not Scheduled", name: "ANY.RUN URL", indicators: "0 - 0", lastUpdated: "-", schedule: "-", type: "API" },
    { status: "Normal", name: "AlienVault OTX", indicators: alienVaultCount.toLocaleString() + " - 9", lastUpdated: format(new Date(), "MMM dd, yyyy, hh:mm:ss a"), schedule: "Every 1 day at 00:00 AM starting 09/18/2024 and running for ever.", type: "API" },
    { status: "Normal", name: "Urlhaus_IOC", indicators: "16,052 - 1...", lastUpdated: format(new Date(), "MMM dd, yyyy, hh:mm:ss a"), schedule: "Every 1 day at 1:35 PM starting 08/11/2026 and running for ever.", type: "API" }
  ];

  return (
    <div className="flex h-[calc(100vh-60px)] bg-[#1e1e1e] text-[#d4d4d4] font-sans">
      
      {/* Sidebar Navigation */}
      <div className="w-64 border-r border-[#333] flex flex-col overflow-y-auto custom-scrollbar bg-[#252526]">
        <div className="py-2">
          {categories.map((category) => (
            <div key={category.name}>
              <div 
                className={"flex items-center px-2 py-1.5 cursor-pointer hover:bg-[#2a2d2e] text-sm " + (activeTab === category.name ? "bg-[#37373d] font-medium" : "")}
                onClick={() => {
                  if (category.sub.length > 0) toggleCategory(category.name);
                  setActiveTab(category.name);
                }}
              >
                <div className="w-4 flex items-center justify-center mr-1">
                  {category.sub.length > 0 ? (
                    expandedCategories[category.name] ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                  ) : <ChevronRight size={14} className="opacity-0" />}
                </div>
                {category.name}
              </div>
              
              {category.sub.length > 0 && expandedCategories[category.name] && (
                <div className="pl-7 py-1">
                  {category.sub.map((subItem) => (
                    <div 
                      key={subItem} 
                      className={"px-2 py-1.5 text-xs cursor-pointer hover:bg-[#2a2d2e] " + (activeTab === subItem ? "bg-[#094771] text-white rounded-sm" : "text-[#cccccc]")}
                      onClick={() => setActiveTab(subItem)}
                    >
                      {subItem}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col bg-[#1e1e1e]">
        {/* Top Action Bar */}
        <div className="flex items-center justify-between p-3 border-b border-[#333] bg-[#252526]">
          <div className="flex items-center gap-4 w-full">
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input 
                type="text" 
                className="w-full bg-[#3c3c3c] border border-[#3c3c3c] rounded-sm pl-8 pr-12 py-1 text-xs text-white focus:outline-none focus:border-[#007acc]"
                placeholder=""
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">(15/15)</span>
            </div>
            
            <button className="flex items-center gap-1.5 px-3 py-1 bg-[#3c3c3c] hover:bg-[#4d4d4d] border border-transparent rounded-sm text-xs transition-colors">
              <Settings size={14} />
              Actions
              <ChevronDown size={12} className="ml-1" />
            </button>
          </div>
          <div className="text-[#cccccc] text-xs font-semibold px-4">{activeTab} Integration Status</div>
        </div>

        {/* Data Table */}
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-[#1e1e1e] sticky top-0 border-b border-[#333] z-10">
              <tr className="text-[#cccccc] font-semibold">
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Feed</th>
                <th className="px-4 py-2 font-semibold">Indicators</th>
                <th className="px-4 py-2 font-semibold">Last Updated</th>
                <th className="px-4 py-2 font-semibold">Pulling Schedule</th>
                <th className="px-4 py-2 font-semibold">Integration Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#333]">
              {feeds.map((feed, idx) => (
                <tr key={idx} className={"hover:bg-[#2a2d2e] " + (idx % 2 === 0 ? "bg-[#1e1e1e]" : "bg-[#252526]")}>
                  <td className="px-4 py-1.5">
                    <span className={"inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold " + (
                      feed.status === 'Normal' ? "bg-[#1b5e20] text-[#a5d6a7]" : 
                      feed.status === 'Not Configured' ? "bg-[#424242] text-[#e0e0e0]" : 
                      "bg-[#0d47a1] text-[#90caf9]"
                    )}>
                      {feed.status}
                    </span>
                  </td>
                  <td className="px-4 py-1.5 text-[#e0e0e0] font-medium">{feed.name}</td>
                  <td className="px-4 py-1.5">{feed.indicators}</td>
                  <td className="px-4 py-1.5">{feed.lastUpdated}</td>
                  <td className="px-4 py-1.5 text-[#a0a0a0] truncate max-w-xs">{feed.schedule}</td>
                  <td className="px-4 py-1.5">{feed.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
