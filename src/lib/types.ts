/**
 * Core TypeScript definitions for SOC Dashboard.
 * Unified data contracts shared across services, hooks, and presentation layers.
 */

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type AlertStatus = 'new' | 'investigating' | 'resolved' | 'false_positive';
export type CriticalityLevel = 'low' | 'medium' | 'high' | 'critical';

export interface LogEntry {
  id: string;
  timestamp: string;
  source: string;
  eventId?: number | string;
  logType?: string;
  severity: SeverityLevel;
  message: string;
  hostname: string;
  username?: string;
  sourceIp?: string;
  destinationIp?: string;
  rawLog?: any;
  mitreTactic?: string;
  mitreTechnique?: string;
  mitreAttackId?: string;
}

export interface Alert {
  id: string;
  title: string;
  severity: SeverityLevel;
  source: string;
  timestamp: string;
  eventId?: number | string;
  mitreRef?: string;
  description: string;
  status: AlertStatus;
  assignedTo?: string;
  assigned_to?: string;
  resolution_type?: string;
  notes?: string;
  raw_log?: string;
  extracted_fields?: string;
}

export interface AlertComment {
  id: string;
  alert_id?: string;
  user: string;
  comment: string;
  created_at: string;
}

export interface DashboardStats {
  total_logs: number;
  total_alerts: number;
  critical_alerts: number;
  new_alerts: number;
  active_sources: number;
  mitre_coverage: number;
  eps: number;
  severity_distribution?: any[];
  top_event_ids?: any[];
  logs_by_hour?: any[];
  top_sources?: any[];
  severity_timeline?: any[];
  detected_techniques?: any[];
  [key: string]: any;
}

export interface ThreatFeed {
  id: string;
  name: string;
  url: string;
  type: string;
  category: string;
  status: string;
  last_updated?: string;
  indicator_count: number;
  schedule?: string;
}

export interface ThreatIndicator {
  id: string;
  feed_id?: string;
  type: string;
  indicator: string;
  description?: string;
}

export interface PlaybookActionItem {
  name: string;
  type: 'slack' | 'teams' | 'webhook' | 'disable_ad_user' | 'block_ip_windows' | 'block_ip_pfsense' | 'email' | string;
  api_token?: string;
  webhook_url?: string;
  domain?: string;
  pfsense_url?: string;
  api_key?: string;
  alias_name?: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_pass?: string;
  to?: string;
}

export interface Playbook {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  trigger_severity: SeverityLevel | string;
  trigger_keyword?: string;
  actions: PlaybookActionItem[];
  created_at?: string;
  updated_at?: string;
}

export interface PlaybookExecution {
  id: string;
  playbook_id: string;
  playbook_name?: string;
  alert_id?: string;
  triggered_at: string;
  status: 'running' | 'success' | 'failed' | 'partial';
  results: any[];
  error?: string;
}

export interface ReferenceSet {
  id: string;
  name: string;
  type: 'IP' | 'Domain' | 'Hash' | 'Port' | 'User';
  description?: string;
  ttl_days?: number;
  count?: number;
}

export interface ReferenceSetItem {
  id: string;
  set_id?: string;
  value: string;
  added_by: string;
  added_at: string;
}

export interface LogParser {
  id: string;
  name: string;
  regex: string;
  description?: string;
  log_source?: string;
  active: boolean;
}

export interface DetectionUseCase {
  id: string;
  title: string;
  description?: string;
  type: 'match' | 'threshold';
  event_id?: string;
  mitre_technique?: string;
  threshold_count?: number;
  severity: SeverityLevel;
  active: boolean;
  rule_logic?: string;
}

export interface ConnectedSource {
  hostname: string;
  source: string;
  lastSeen?: string;
  firstSeen?: string;
  totalEvents: number;
  status: 'healthy' | 'inactive' | 'unknown';
  ip_address?: string;
  os_version?: string;
  protocol?: string;
  agent_version?: string;
  link_speed?: string;
  eps?: number;
}

export interface VectorAgent {
  hostname: string;
  log_count: number;
  last_seen?: string;
  first_seen?: string;
  sync_status: 'live' | 'recent' | 'stale' | 'unknown';
  criticality?: CriticalityLevel;
  severity_breakdown: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface ManagedService {
  id: string;
  name: string;
  type: string;
  command: string;
  status: 'running' | 'stopped' | 'not_installed';
  pid?: number | null;
  started_at?: number | null;
  memory_mb?: number;
  cpu_percent?: number;
  service_name?: string;
  start_type?: string;
  description?: string;
}

export interface SystemHealth {
  status: string;
  cpu_percent: number;
  ram: {
    total_gb: number;
    used_gb: number;
    percent: number;
  };
  interfaces: {
    name: string;
    speed: string;
    status: string;
  }[];
  boot_time: number;
}

export interface MitreMapping {
  eventId: number | string;
  title: string;
  description: string;
  tactic: string;
  tacticId: string;
  technique: string;
  techniqueId: string;
  severity: string;
  platform: 'windows' | 'linux' | 'both';
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
  eventIds: (number | string)[];
  severity: string;
  detected: boolean;
}
