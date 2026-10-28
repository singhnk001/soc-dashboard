'use client';

import React from 'react';
import MitreHeatmap from '@/components/MitreHeatmap';
import EventIdTable from '@/components/EventIdTable';
import { MITRE_ATTACK_MAPPINGS, MITRE_TACTICS } from '@/lib/mitre-mapping';
import useSWR from 'swr';
import { systemService } from '@/services/system.service';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export default function MitrePage() {
  const allTechniques = MITRE_TACTICS.flatMap(t => t.techniques);
  const { data: stats, isLoading } = useSWR('/api/stats', () => systemService.getStats(), { refreshInterval: 5000 });

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
    <div className="p-6 space-y-6 bg-[var(--bg-secondary)] min-h-screen text-[var(--text-primary)]">
      <PageHeader 
        title="MITRE ATT&CK Framework"
        description="Mapping detections to adversarial tactics and techniques"
      />

      {isLoading ? (
        <LoadingSpinner message="Loading MITRE framework matrix..." />
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
