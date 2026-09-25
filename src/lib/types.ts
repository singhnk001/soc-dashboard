export interface LogEntry {
  id: string;
  timestamp: string;
  source: string;
  eventId: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  message: string;
  hostname: string;
  username: string;
  mitreAttackId?: string;
  mitreTactic?: string;
  mitreTechnique?: string;
  rawLog: string;
}

export interface MitreMapping {
  eventId: number;
  title: string;
  description: string;
  tactic: string;
  tacticId: string;
  technique: string;
  techniqueId: string;
  severity: string;
  platform: 'windows' | 'linux' | 'both';
}

export interface Alert {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  source: string;
  timestamp: string;
  eventId: number;
  mitreRef?: string;
  description: string;
  status: 'new' | 'investigating' | 'resolved' | 'false_positive';
  assignedTo?: string;
  resolution_type?: string;
  notes?: string;
  raw_log?: string;
}

export interface DashboardStats {
  totalLogs: number;
  criticalAlerts: number;
  activeSources: number;
  mitreCoverage: number;
  logsByHour: { hour: string; count: number }[];
  topEventIds: { eventId: number; count: number; description: string }[];
  severityDistribution: { severity: string; count: number }[];
}

export interface MitreTactic {
  id: string;
  name: string;
  techniques: MitreTechnique[];
}

export interface MitreTechnique {
  id: string;
  name: string;
  description: string;
  eventIds: number[];
  severity: string;
  detected: boolean;
}
