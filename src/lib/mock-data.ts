import { LogEntry, Alert, DashboardStats } from './types';
import { MITRE_ATTACK_MAPPINGS } from './mitre-mapping';

const HOSTNAMES = ['DC-01', 'WEB-SRV-02', 'WORKSTATION-15', 'DB-03', 'EXCHANGE-01'];
const USERNAMES = ['admin', 'jdoe', 'asmith', 'system', 'network_svc'];

export function generateMockLogs(count: number): LogEntry[] {
  const logs: LogEntry[] = [];
  const now = Date.now();
  
  for (let i = 0; i < count; i++) {
    const timestamp = new Date(now - Math.random() * 24 * 60 * 60 * 1000).toISOString();
    const mapping = MITRE_ATTACK_MAPPINGS[Math.floor(Math.random() * MITRE_ATTACK_MAPPINGS.length)];
    const hostname = HOSTNAMES[Math.floor(Math.random() * HOSTNAMES.length)];
    const username = USERNAMES[Math.floor(Math.random() * USERNAMES.length)];
    
    logs.push({
      id: `log-${Math.random().toString(36).substring(2, 9)}`,
      timestamp,
      source: 'Windows Event Log',
      eventId: mapping.eventId,
      severity: mapping.severity as any,
      message: mapping.description,
      hostname,
      username,
      mitreAttackId: mapping.techniqueId,
      mitreTactic: mapping.tactic,
      mitreTechnique: mapping.technique,
      rawLog: `EventData: ${JSON.stringify({ EventID: mapping.eventId, Computer: hostname, User: username })}`
    });
  }
  
  return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function generateMockAlerts(count: number): Alert[] {
  const alerts: Alert[] = [];
  const now = Date.now();
  
  const highSeverityMappings = MITRE_ATTACK_MAPPINGS.filter(m => m.severity === 'high' || m.severity === 'critical');
  
  for (let i = 0; i < count; i++) {
    const mapping = highSeverityMappings[Math.floor(Math.random() * highSeverityMappings.length)];
    const statusOpts: ('new' | 'investigating' | 'resolved' | 'false_positive')[] = ['new', 'investigating', 'resolved', 'false_positive'];
    
    alerts.push({
      id: `alt-${Math.random().toString(36).substring(2, 9)}`,
      title: mapping.title,
      severity: mapping.severity as any,
      source: 'SIEM Core',
      timestamp: new Date(now - Math.random() * 24 * 60 * 60 * 1000).toISOString(),
      eventId: mapping.eventId,
      mitreRef: mapping.techniqueId,
      description: `Suspicious activity detected: ${mapping.description}`,
      status: statusOpts[Math.floor(Math.random() * statusOpts.length)]
    });
  }
  
  return alerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function generateDashboardStats(): DashboardStats {
  const logsByHour = Array.from({length: 24}).map((_, i) => ({
    hour: `${i.toString().padStart(2, '0')}:00`,
    count: Math.floor(Math.random() * 1000) + 100
  }));
  const topEventIds = [
    { event_id: 4624, eventId: 4624, count: 4500, description: "Successful Logon" },
    { event_id: 4688, eventId: 4688, count: 3200, description: "Process Creation" },
    { event_id: 5156, eventId: 5156, count: 2100, description: "WFP Connection Permitted" }
  ];
  const severityDistribution = [
    { severity: 'info', count: 10500 },
    { severity: 'low', count: 3200 },
    { severity: 'medium', count: 1500 },
    { severity: 'high', count: 500 },
    { severity: 'critical', count: 147 }
  ];
  return {
    total_logs: 15847,
    totalLogs: 15847,
    total_alerts: 147,
    critical_alerts: 23,
    criticalAlerts: 23,
    new_alerts: 12,
    active_sources: 12,
    activeSources: 12,
    mitre_coverage: 68,
    mitreCoverage: 68,
    eps: 42.5,
    logs_by_hour: logsByHour,
    logsByHour: logsByHour,
    top_event_ids: topEventIds,
    topEventIds: topEventIds,
    severity_distribution: severityDistribution,
    severityDistribution: severityDistribution,
    top_sources: [{ source: 'Firewall', count: 1200 }],
    topSources: [{ source: 'Firewall', count: 1200 }]
  };
}
