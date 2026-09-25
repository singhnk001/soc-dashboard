'use client';

import React, { useState } from 'react';
import { MitreTactic, MitreTechnique, MitreMapping } from '@/lib/types';

interface MitreHeatmapProps {
  tactics: MitreTactic[];
  techniques: MitreTechnique[];
  mappings: MitreMapping[];
  activeDetections?: Record<string, { count: number, severity: string }>; // techniqueId -> count
}

export default function MitreHeatmap({ tactics, techniques, mappings, activeDetections = {} }: MitreHeatmapProps) {
  const [hoveredTechnique, setHoveredTechnique] = useState<MitreTechnique | null>(null);

  const getCellColor = (techniqueId: string) => {
    const detection = activeDetections[techniqueId];
    if (!detection) return 'bg-[#1e2436] border-gray-800 text-gray-400 hover:bg-[#2a3147] hover:border-gray-600';
    
    if (detection.severity === 'critical') return 'bg-red-500/20 border-red-500 text-red-100 font-medium hover:bg-red-500/30';
    if (detection.severity === 'high') return 'bg-orange-500/20 border-orange-500 text-orange-100 font-medium hover:bg-orange-500/30';
    return 'bg-blue-500/20 border-blue-500 text-blue-100 font-medium hover:bg-blue-500/30';
  };

  return (
    <div className="bg-[#1a1f2e] border border-gray-800 rounded-lg p-6 relative overflow-x-auto">
      <h3 className="text-white text-lg font-medium mb-6">MITRE ATT&CK Matrix Coverage</h3>
      
      <div className="flex gap-2 min-w-max">
        {tactics.map(tactic => {
          const tacticTechniques = tactic.techniques;
          
          return (
            <div key={tactic.id} className="flex flex-col w-48 shrink-0">
              <div className="bg-[#151a27] p-2 border-b-2 border-blue-500 mb-2 rounded-t">
                <h4 className="text-white text-sm font-semibold truncate" title={tactic.name}>{tactic.name}</h4>
                <div className="text-gray-500 text-xs">{tactic.id}</div>
              </div>
              
              <div className="flex flex-col gap-1.5">
                {tacticTechniques.map(tech => (
                  <div 
                    key={tech.id}
                    className={`p-2 border rounded text-xs cursor-pointer transition-colors ${getCellColor(tech.id)}`}
                    onMouseEnter={() => setHoveredTechnique(tech)}
                    onMouseLeave={() => setHoveredTechnique(null)}
                  >
                    <div className="truncate" title={tech.name}>{tech.name}</div>
                    <div className="opacity-60">{tech.id}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {hoveredTechnique && (
        <div className="fixed bottom-8 right-8 w-80 bg-[#11141e] border border-gray-700 shadow-xl rounded-lg p-4 z-50 pointer-events-none">
          <div className="flex justify-between items-start mb-2">
            <h4 className="text-white font-bold">{hoveredTechnique.name}</h4>
            <span className="text-blue-400 text-xs font-mono bg-blue-500/10 px-1.5 py-0.5 rounded">{hoveredTechnique.id}</span>
          </div>
          <p className="text-gray-400 text-sm mb-3">{hoveredTechnique.description}</p>
          
          {activeDetections[hoveredTechnique.id] && (
            <div className="mt-3 pt-3 border-t border-gray-800 flex justify-between text-sm">
              <span className="text-gray-400">Detections (24h)</span>
              <span className={`font-bold ${activeDetections[hoveredTechnique.id].severity === 'critical' ? 'text-red-500' : 'text-blue-500'}`}>
                {activeDetections[hoveredTechnique.id].count}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
