'use client';

import React from 'react';
import MitreHeatmap from '@/components/MitreHeatmap';
import EventIdTable from '@/components/EventIdTable';
import { MITRE_ATTACK_MAPPINGS, MITRE_TACTICS } from '@/lib/mitre-mapping';
import useSWR from 'swr';
import { Loader2 } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function MitrePage() {
  const allTechniques = MITRE_TACTICS.flatMap(t => t.techniques);
  const { data: stats, isLoading } = useSWR('/api/stats', fetcher, { refreshInterval: 5000 });

  // Convert API returned detected_techniques to the Record structure expected by the heatmap
  const activeDetections: Record<string, { count: number; severity: string }> = {};
  
  if (stats?.detected_techniques) {
    stats.detected_techniques.forEach((tech: any) => {
      activeDetections[tech.technique_id] = {
        count: tech.count,
        severity: tech.severity
      };
    });
  }

  return (
    <div className="p-6 space-y-6 bg-[#0f1219] min-h-screen text-white">
      <div>
        <h1 className="text-2xl font-bold">MITRE ATT&CK Framework</h1>
        <p className="text-gray-400 text-sm mt-1">Mapping detections to adversarial tactics and techniques</p>
      </div>

      {isLoading ? (
        <div className="py-12 flex justify-center bg-[#1a1f2e] border border-gray-800 rounded-lg">
          <Loader2 className="animate-spin text-blue-500" size={32} />
        </div>
      ) : (
        <MitreHeatmap 
          tactics={MITRE_TACTICS} 
          techniques={allTechniques} 
          mappings={MITRE_ATTACK_MAPPINGS} 
          activeDetections={activeDetections}
        />
      )}

      <div className="pt-4">
        <h2 className="text-xl font-bold mb-4">Detection Engineering Reference</h2>
        <EventIdTable mappings={MITRE_ATTACK_MAPPINGS} tactics={MITRE_TACTICS} />
      </div>
    </div>
  );
}

