/**
 * src/lib/demo-data.ts
 * High-fidelity SOC data for Vercel preview and demo access mode.
 */

export function shouldProxy(): boolean {
  const url = process.env.NEXT_PUBLIC_API_URL;
  return Boolean(url && !url.includes('127.0.0.1') && !url.includes('localhost'));
}

export const DEMO_SYSTEM_HEALTH = {
  status: 'ok',
  cpu_percent: 18.4,
  ram_percent: 26.2,
  ram_used_gb: 4.2,
  ram_total_gb: 16.0,
  soc_memory_mb: 284,
  uptime_formatted: '14d 6h 32m',
  total_logs: 104280,
  timestamp: new Date().toISOString(),
};

export const DEMO_SERVICES = [
  {
    id: 'vector-agent',
    name: 'VectorAgent (Log Forwarder)',
    type: 'Windows Service',
    status: 'running',
    pid: 3412,
    uptime: '14d 6h',
    memory_mb: 48,
  },
  {
    id: 'soc-ingestion',
    name: 'SOC Telemetry Ingestion Core',
    type: 'Core Engine',
    status: 'running',
    pid: 1892,
    uptime: '14d 6h',
    memory_mb: 145,
  },
  {
    id: 'syslog-listener',
    name: 'RFC3164 Syslog UDP (1514)',
    type: 'Network Listener',
    status: 'running',
    pid: 1892,
    uptime: '14d 6h',
    memory_mb: 32,
  },
  {
    id: 'threat-intel-sync',
    name: 'Threat Feed Synchronizer',
    type: 'Background Worker',
    status: 'running',
    pid: 1892,
    uptime: '14d 6h',
    memory_mb: 64,
  },
  {
    id: 'correlation-engine',
    name: 'MITRE Correlation & SOAR Pipeline',
    type: 'Analysis Pipeline',
    status: 'running',
    pid: 1892,
    uptime: '14d 6h',
    memory_mb: 82,
  },
];

export const DEMO_AGENTS = [
  {
    hostname: 'WIN-DC01.corp.local',
    ip_address: '10.0.0.10',
    os: 'Windows Server 2022 Datacenter',
    agent_version: '0.41.1',
    status: 'live',
    criticality: 'critical',
    last_seen: 'Just now',
    events_per_sec: 185,
    log_count: 52400,
  },
  {
    hostname: 'WIN-FILE02.corp.local',
    ip_address: '10.0.0.15',
    os: 'Windows Server 2019 Standard',
    agent_version: '0.41.1',
    status: 'live',
    criticality: 'high',
    last_seen: 'Just now',
    events_per_sec: 42,
    log_count: 14200,
  },
  {
    hostname: 'SQL-PROD-01.corp.local',
    ip_address: '10.0.0.22',
    os: 'Windows Server 2022',
    agent_version: '0.41.1',
    status: 'live',
    criticality: 'critical',
    last_seen: '1 min ago',
    events_per_sec: 120,
    log_count: 34100,
  },
  {
    hostname: 'UBUNTU-K8S-NODE01',
    ip_address: '10.0.1.50',
    os: 'Ubuntu 22.04 LTS (Kernel 5.15)',
    agent_version: '0.41.1',
    status: 'live',
    criticality: 'medium',
    last_seen: '2 min ago',
    events_per_sec: 65,
    log_count: 18400,
  },
  {
    hostname: 'PFSENSE-FW-01',
    ip_address: '192.168.1.1',
    os: 'pfSense Plus 24.03',
    agent_version: 'Syslog UDP',
    status: 'live',
    criticality: 'critical',
    last_seen: 'Just now',
    events_per_sec: 230,
    log_count: 68900,
  },
  {
    hostname: 'WIN-WS-ANALYST04',
    ip_address: '10.0.2.104',
    os: 'Windows 11 Enterprise 23H2',
    agent_version: '0.41.1',
    status: 'recent',
    criticality: 'low',
    last_seen: '8 min ago',
    events_per_sec: 14,
    log_count: 4800,
  },
];

export const DEMO_SOURCES = [
  {
    hostname: 'WIN-DC01.corp.local',
    ip_address: '10.0.0.10',
    os_version: 'Windows Server 2022 Datacenter',
    status: 'healthy',
    eps: 185,
    events_per_second: 185,
    lastSeen: new Date(Date.now() - 30 * 1000).toISOString(),
    last_seen: new Date(Date.now() - 30 * 1000).toISOString(),
    agent_version: '0.41.1',
    source: 'VectorAgent (Security EventLog)',
    protocol: 'Vector HTTP Sink',
    link_speed: '10 Gbps',
    totalEvents: 52400,
    total_events: 52400,
  },
  {
    hostname: 'SQL-PROD-01.corp.local',
    ip_address: '10.0.0.22',
    os_version: 'Windows Server 2022',
    status: 'healthy',
    eps: 120,
    events_per_second: 120,
    lastSeen: new Date(Date.now() - 60 * 1000).toISOString(),
    last_seen: new Date(Date.now() - 60 * 1000).toISOString(),
    agent_version: '0.41.1',
    source: 'VectorAgent (Application & System)',
    protocol: 'Vector HTTP Sink',
    link_speed: '10 Gbps',
    totalEvents: 34100,
    total_events: 34100,
  },
  {
    hostname: 'PFSENSE-FW-01',
    ip_address: '192.168.1.1',
    os_version: 'pfSense Plus 24.03',
    status: 'healthy',
    eps: 230,
    events_per_second: 230,
    lastSeen: new Date(Date.now() - 15 * 1000).toISOString(),
    last_seen: new Date(Date.now() - 15 * 1000).toISOString(),
    agent_version: 'RFC3164 Syslog',
    source: 'pfSense Packet Filter (filterlog)',
    protocol: 'UDP 1514',
    link_speed: '1 Gbps',
    totalEvents: 68900,
    total_events: 68900,
  },
  {
    hostname: 'UBUNTU-K8S-NODE01',
    ip_address: '10.0.1.50',
    os_version: 'Ubuntu 22.04 LTS',
    status: 'healthy',
    eps: 65,
    events_per_second: 65,
    lastSeen: new Date(Date.now() - 120 * 1000).toISOString(),
    last_seen: new Date(Date.now() - 120 * 1000).toISOString(),
    agent_version: '0.41.1',
    source: 'VectorAgent (Syslog / Auth.log)',
    protocol: 'Vector HTTP Sink',
    link_speed: '1 Gbps',
    totalEvents: 18400,
    total_events: 18400,
  },
  {
    hostname: 'FG-100F-HQ-CORE',
    ip_address: '192.168.1.254',
    os_version: 'FortiOS v7.4.3 build2573',
    status: 'healthy',
    eps: 340,
    events_per_second: 340,
    lastSeen: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    agent_version: 'FortiGate Syslog (CEF / Key-Value)',
    source: 'Fortinet FortiGate (Traffic, UTM, IPS)',
    protocol: 'UDP 514 / Syslog',
    link_speed: '10 Gbps SFP+',
    totalEvents: 142800,
    total_events: 142800,
  },
];

export const DEMO_API_SOURCES = [
  {
    id: 'api-aws-01',
    name: 'AWS CloudTrail Production',
    type: 'AWS CloudTrail',
    status: 'active',
    created_at: new Date(Date.now() - 86400 * 1000 * 14).toISOString(),
  },
  {
    id: 'api-crowdstrike-01',
    name: 'CrowdStrike Falcon FDR Stream',
    type: 'CrowdStrike Falcon',
    status: 'active',
    created_at: new Date(Date.now() - 86400 * 1000 * 7).toISOString(),
  },
  {
    id: 'api-m365-01',
    name: 'Microsoft 365 Audit Logs',
    type: 'Microsoft 365',
    status: 'active',
    created_at: new Date(Date.now() - 86400 * 1000 * 10).toISOString(),
  },
];

export const DEMO_THREAT_FEEDS = [
  {
    id: 'tf-alienvault',
    name: 'AlienVault OTX Community Feed',
    url: 'https://otx.alienvault.com/api/v1/pulses/subscribed',
    type: 'API',
    category: 'Multi-Source IOCs',
    indicator_count: 5240,
    last_updated: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
    status: 'active',
  },
  {
    id: 'tf-urlhaus',
    name: 'abuse.ch URLhaus Malware URLs',
    url: 'https://urlhaus.abuse.ch/downloads/json/recent/',
    type: 'JSON',
    category: 'Malware URLs & C2',
    indicator_count: 3120,
    last_updated: new Date(Date.now() - 3600 * 1000 * 1).toISOString(),
    status: 'active',
  },
  {
    id: 'tf-threatfox',
    name: 'abuse.ch ThreatFox IOC Feed',
    url: 'https://threatfox.abuse.ch/export/json/recent/',
    type: 'JSON',
    category: 'Botnets & Ransomware Hashes',
    indicator_count: 2450,
    last_updated: new Date(Date.now() - 3600 * 1000 * 3).toISOString(),
    status: 'active',
  },
  {
    id: 'tf-cisa',
    name: 'CISA Known Exploited Vulnerabilities (KEV)',
    url: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
    type: 'JSON',
    category: 'CVE Exploits in the Wild',
    indicator_count: 1120,
    last_updated: new Date(Date.now() - 86400 * 1000).toISOString(),
    status: 'active',
  },
  {
    id: 'tf-abuseipdb',
    name: 'AbuseIPDB Blacklist Top 10000',
    url: 'https://api.abuseipdb.com/api/v2/blacklist',
    type: 'API',
    category: 'High-Risk Malicious IPs',
    indicator_count: 4890,
    last_updated: new Date(Date.now() - 3600 * 1000 * 4).toISOString(),
    status: 'active',
  },
];

export function getDemoIndicatorsForFeed(feedId?: string) {
  if (feedId === 'tf-urlhaus') {
    return [
      { id: 'url-01', indicator: 'http://185.196.8.22/bins/arm7', type: 'URL', confidence: 99, severity: 'critical', description: 'Mirai botnet dropper payload URL', date_added: '1 hour ago' },
      { id: 'url-02', indicator: 'https://secure-login-portal-auth.com/verify.php', type: 'URL', confidence: 95, severity: 'high', description: 'Credential harvesting phishing landing page', date_added: '2 hours ago' },
      { id: 'url-03', indicator: 'http://cdn-update-installer.top/setup.exe', type: 'URL', confidence: 98, severity: 'critical', description: 'RedLine Stealer trojan distribution URL', date_added: '3 hours ago' },
      { id: 'url-04', indicator: 'https://pay-invoice-confirm.xyz/doc_7482.zip', type: 'URL', confidence: 92, severity: 'high', description: 'Qakbot / Pinkslipbot malware attachment link', date_added: '4 hours ago' },
      { id: 'url-05', indicator: 'http://194.38.20.108/wp-content/plugins/rev.php', type: 'URL', confidence: 96, severity: 'critical', description: 'Compromised WordPress webshell back-door', date_added: '5 hours ago' },
    ];
  }
  if (feedId === 'tf-threatfox') {
    return [
      { id: 'fox-01', indicator: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', type: 'SHA256', confidence: 100, severity: 'critical', description: 'BlackCat / ALPHV Ransomware encryptor core', date_added: '2 hours ago' },
      { id: 'fox-02', indicator: '149.202.160.104:443', type: 'IPv4:Port', confidence: 95, severity: 'high', description: 'Sliver C2 framework interactive session handler', date_added: '3 hours ago' },
      { id: 'fox-03', indicator: '84.46.251.109:8080', type: 'IPv4:Port', confidence: 90, severity: 'high', description: 'AsyncRAT command & control node', date_added: '5 hours ago' },
      { id: 'fox-04', indicator: '5d41402abc4b2a76b9719d911017c592', type: 'MD5', confidence: 97, severity: 'critical', description: 'LockBit 3.0 ransomware staging executable', date_added: '6 hours ago' },
    ];
  }
  if (feedId === 'tf-cisa') {
    return [
      { id: 'cisa-01', indicator: 'CVE-2024-3400', type: 'CVE', confidence: 100, severity: 'critical', description: 'Palo Alto PAN-OS Command Injection in GlobalProtect', date_added: '1 day ago' },
      { id: 'cisa-02', indicator: 'CVE-2023-46805', type: 'CVE', confidence: 100, severity: 'critical', description: 'Ivanti Connect Secure Authentication Bypass', date_added: '2 days ago' },
      { id: 'cisa-03', indicator: 'CVE-2023-22515', type: 'CVE', confidence: 99, severity: 'critical', description: 'Atlassian Confluence Data Center Privilege Escalation', date_added: '3 days ago' },
      { id: 'cisa-04', indicator: 'CVE-2024-1709', type: 'CVE', confidence: 98, severity: 'critical', description: 'ConnectWise ScreenConnect Authentication Bypass', date_added: '4 days ago' },
    ];
  }
  if (feedId === 'tf-abuseipdb') {
    return [
      { id: 'ab-01', indicator: '45.154.255.88', type: 'IPv4', confidence: 99, severity: 'critical', description: 'Reported 14,200 times for brute-force SSH & RDP scanning', date_added: '30 mins ago' },
      { id: 'ab-02', indicator: '185.220.101.5', type: 'IPv4', confidence: 90, severity: 'high', description: 'Tor Exit Node flagged in anomalous administrative logins', date_added: '1 hour ago' },
      { id: 'ab-03', indicator: '109.236.87.14', type: 'IPv4', confidence: 94, severity: 'high', description: 'Active port scanning and vulnerability probing', date_added: '2 hours ago' },
      { id: 'ab-04', indicator: '91.240.118.230', type: 'IPv4', confidence: 96, severity: 'critical', description: 'Exploit scanner targeting Microsoft Exchange CVEs', date_added: '3 hours ago' },
    ];
  }
  // Default (AlienVault OTX & general)
  return [
    { id: 'ind-01', indicator: '194.26.29.112', type: 'IPv4', confidence: 98, severity: 'critical', description: 'Cobalt Strike C2 server associated with FIN7 ransomware staging', date_added: '1 hour ago' },
    { id: 'ind-02', indicator: 'update-microsoft-azure.com', type: 'Domain', confidence: 94, severity: 'high', description: 'Phishing domain mimicking Microsoft Entra ID authentication page', date_added: '2 hours ago' },
    { id: 'ind-03', indicator: '185.196.8.22', type: 'IPv4', confidence: 99, severity: 'critical', description: 'Active botnet distribution staging host', date_added: '3 hours ago' },
    { id: 'ind-04', indicator: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', type: 'SHA256', confidence: 100, severity: 'critical', description: 'BlackCat / ALPHV Ransomware encryptor payload binary', date_added: '4 hours ago' },
    { id: 'ind-05', indicator: '45.154.255.88', type: 'IPv4', confidence: 95, severity: 'high', description: 'Brute-force SSH and RDP scanning botnet node', date_added: '5 hours ago' },
    { id: 'ind-06', indicator: 'auth-security-checkpoint.xyz', type: 'Domain', confidence: 91, severity: 'medium', description: 'Suspicious domain flagged in phishing campaign telemetry', date_added: '6 hours ago' },
  ];
}

export const DEMO_INDICATORS = getDemoIndicatorsForFeed();

export const DEMO_PARSERS = [
  {
    id: 'p-win-security',
    name: 'Windows Security Event XML Parser',
    regex: '<Data Name="(?<FieldName>[^"]+)">(?<FieldValue>[^<]+)</Data>',
    description: 'Extracts structured event attributes from Windows XML EventData fields (Event 4624, 4625, 4688)',
    active: true,
    log_source: 'Security',
  },
  {
    id: 'p-pfsense-filter',
    name: 'pfSense Packet Filter Syslog Parser',
    regex: 'filterlog:\s+(?<RuleNumber>\d+),(?<SubRule>\d+),(?<Anchor>\w+),(?<Tracker>\w+),(?<Interface>\w+),(?<Reason>\w+),(?<Action>\w+),(?<Direction>\w+),(?<IpVersion>\d+),(?<Tos>\w+),(?<Ecn>\w+),(?<Ttl>\d+),(?<Id>\d+),(?<Offset>\d+),(?<Flags>\w+),(?<ProtoId>\d+),(?<Proto>\w+),(?<Length>\d+),(?<SrcIp>[\d.]+),(?<DstIp>[\d.]+),(?<SrcPort>\d+),(?<DstPort>\d+)',
    description: 'Parses raw pfSense BSD syslog filterlog CSV stream into structured firewall attributes',
    active: true,
    log_source: 'pfSense',
  },
  {
    id: 'p-suricata-eve',
    name: 'Suricata IDS EVE JSON Parser',
    regex: '(?<json_body>\{.*\})',
    description: 'Extracts deep alert telemetry and flow signatures from Suricata IDS JSON events',
    active: true,
    log_source: 'Suricata',
  },
  {
    id: 'p-linux-auth',
    name: 'Linux PAM & OpenSSH Auth Parser',
    regex: 'sshd\[(?<Pid>\d+)\]:\s+(?<AuthStatus>Failed|Accepted)\s+password\s+for\s+(?:invalid\s+user\s+)?(?<Username>\S+)\s+from\s+(?<SrcIp>[\d.]+)\s+port\s+(?<SrcPort>\d+)',
    description: 'Extracts authentication status, username, and remote IP from Linux /var/log/auth.log',
    active: true,
    log_source: 'Linux-Auth',
  },
  {
    id: 'p-nginx-access',
    name: 'Nginx Web Server Access Parser',
    regex: '(?<ClientIp>[\d.]+)\s+-\s+(?<User>\S+)\s+\[(?<Time>[^\]]+)\]\s+"(?<Method>\w+)\s+(?<Uri>\S+)\s+HTTP/(?<HttpVer>[\d.]+)"\s+(?<Status>\d+)\s+(?<Bytes>\d+)',
    description: 'Extracts HTTP method, request URI, client IP, and response code from Nginx/Apache logs',
    active: true,
    log_source: 'Nginx',
  },
  {
    id: 'p-fortinet-fortigate',
    name: 'Fortinet FortiGate Key-Value Syslog Parser',
    regex: 'date=(?<Date>\\S+)\\s+time=(?<Time>\\S+)\\s+devname="(?<DevName>[^"]+)"\\s+devid="(?<DevId>[^"]+)"\\s+type="?(?<LogType>\\w+)"?\\s+subtype="?(?<SubType>\\w+)"?\\s+level="?(?<Level>\\w+)"?.*?srcip=(?<SrcIp>[\\d.]+).*?dstip=(?<DstIp>[\\d.]+).*?srcport=(?<SrcPort>\\d+).*?dstport=(?<DstPort>\\d+).*?action="?(?<Action>\\w+)"?',
    description: 'Parses FortiOS CEF/KV firewall logs into structured threat telemetry (src/dst IP, port, action, policy, service)',
    active: true,
    log_source: 'Fortinet-FortiGate',
  },
];

export const DEMO_USECASES = [
  {
    id: 'UC-W01',
    title: 'Windows: Multiple Login Failures (Brute Force)',
    description: 'Detects 3 or more failed logon attempts (Event 4625) within a 5-minute rolling window.',
    type: 'threshold',
    event_id: '4625',
    mitre_technique: 'T1110',
    threshold_count: 3,
    severity: 'high',
    active: true,
  },
  {
    id: 'UC-W02',
    title: 'Windows: Security Audit Log Cleared (Defense Evasion)',
    description: 'Detects clearing of the Windows Security event log (Event 1102), indicating tampering.',
    type: 'match',
    event_id: '1102',
    mitre_technique: 'T1070.001',
    threshold_count: 1,
    severity: 'critical',
    active: true,
  },
  {
    id: 'UC-W03',
    title: 'Windows: New Service Installed (Persistence)',
    description: 'Detects creation of a new Windows service (Event 7045 or 4697), a common persistence tactic.',
    type: 'match',
    event_id: '4697',
    mitre_technique: 'T1543.003',
    threshold_count: 1,
    severity: 'high',
    active: true,
  },
  {
    id: 'UC-W04',
    title: 'Windows: Scheduled Task Created (Persistence / Execution)',
    description: 'Detects registration of a scheduled task (Event 4698), often used for malware scheduled triggers.',
    type: 'match',
    event_id: '4698',
    mitre_technique: 'T1053.005',
    threshold_count: 1,
    severity: 'medium',
    active: true,
  },
  {
    id: 'UC-L01',
    title: 'Linux: OpenSSH Brute Force Attempt',
    description: 'Detects rapid successive failed SSH authentication attempts against Linux host.',
    type: 'threshold',
    event_id: 'sshd-fail',
    mitre_technique: 'T1110.001',
    threshold_count: 5,
    severity: 'high',
    active: true,
  },
  {
    id: 'UC-L02',
    title: 'Linux: Sudo Privilege Escalation Failure',
    description: 'Detects unauthorized user attempting to execute commands via sudo.',
    type: 'threshold',
    event_id: 'sudo-fail',
    mitre_technique: 'T1078',
    threshold_count: 2,
    severity: 'high',
    active: true,
  },
  {
    id: 'UC-FG01',
    title: 'Fortinet: Critical IPS Attack Signature Blocked',
    description: 'Alerts when FortiGate Intrusion Prevention System detects and blocks an exploit or C2 beaconing attempt.',
    type: 'signature',
    event_id: 'FG-IPS-ATTACK-0044',
    mitre_technique: 'T1071',
    threshold_count: 1,
    severity: 'critical',
    active: true,
  },
];

export const DEMO_PLAYBOOKS = [
  {
    id: 'pb-01',
    name: 'Critical Ransomware Auto-Containment',
    description: 'Blocks malicious C2 IPv4 on perimeter pfSense firewall, disables compromised AD account, and sends urgent Slack/Teams notification.',
    enabled: true,
    trigger_severity: 'critical',
    trigger_keyword: 'ransomware',
    actions: [
      { name: 'Block IP on pfSense Firewall', type: 'block_ip_pfsense' },
      { name: 'Disable AD Account', type: 'disable_ad_user' },
      { name: 'Post Incident to SOC Slack Channel', type: 'slack' },
    ],
    created_at: new Date(Date.now() - 86400 * 1000 * 30).toISOString(),
    updated_at: new Date(Date.now() - 3600 * 1000 * 12).toISOString(),
  },
  {
    id: 'pb-02',
    name: 'Brute Force Perimeter IP Auto-Block',
    description: 'Automatically inserts repeat brute-force scanning source IPs into local firewall rule table.',
    enabled: true,
    trigger_severity: 'high',
    trigger_keyword: 'brute force',
    actions: [
      { name: 'Block IP in Windows Firewall', type: 'block_ip_windows' },
      { name: 'Send Alert Notification Email', type: 'email' },
    ],
    created_at: new Date(Date.now() - 86400 * 1000 * 20).toISOString(),
    updated_at: new Date(Date.now() - 86400 * 1000 * 2).toISOString(),
  },
  {
    id: 'pb-03',
    name: 'Threat Intel Match Escalation & Webhook',
    description: 'Dispatches payload to external SIEM/SOAR webhook endpoint when live IOC match is confirmed.',
    enabled: true,
    trigger_severity: 'high',
    trigger_keyword: 'threat intel',
    actions: [
      { name: 'Post Webhook to Incident Response System', type: 'webhook' },
      { name: 'Notify Teams Security Channel', type: 'teams' },
    ],
    created_at: new Date(Date.now() - 86400 * 1000 * 15).toISOString(),
    updated_at: new Date(Date.now() - 3600 * 1000 * 6).toISOString(),
  },
];

export const DEMO_PLAYBOOK_EXECUTIONS = [
  {
    id: 'exec-01',
    playbook_id: 'pb-01',
    playbook_name: 'Critical Ransomware Auto-Containment',
    alert_id: 'ALT-98214',
    triggered_at: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
    status: 'success',
    results: [
      { action: 'block_ip_pfsense', action_name: 'Block IP on pfSense Firewall', status: 'success', output: 'Added 194.26.29.112 to SOC_Blocked_IPs alias' },
      { action: 'disable_ad_user', action_name: 'Disable AD Account', status: 'success', output: 'Disabled user account: jsmith' },
      { action: 'slack', action_name: 'Post Incident to SOC Slack Channel', status: 'success', output: 'Message delivered to #soc-incidents (HTTP 200)' },
    ],
    error: null,
  },
  {
    id: 'exec-02',
    playbook_id: 'pb-02',
    playbook_name: 'Brute Force Perimeter IP Auto-Block',
    alert_id: 'ALT-98205',
    triggered_at: new Date(Date.now() - 3600 * 1000 * 6).toISOString(),
    status: 'success',
    results: [
      { action: 'block_ip_windows', action_name: 'Block IP in Windows Firewall', status: 'success', output: 'netsh advfirewall rule added for 45.154.255.88' },
      { action: 'email', action_name: 'Send Alert Notification Email', status: 'success', output: 'Email dispatched to soc-oncall@corp.local' },
    ],
    error: null,
  },
];

export const DEMO_REFERENCE_SETS = [
  {
    id: 'rs-01',
    name: 'High-Confidence C2 IP Watchlist',
    type: 'IP',
    description: 'Active Command & Control infrastructure confirmed by ThreatFox and AlienVault',
    ttl_days: 30,
    count: 48,
  },
  {
    id: 'rs-02',
    name: 'Suspicious Domain TLDs',
    type: 'Domain',
    description: 'Punycode and typo-squatted domains observed in recent phishing campaigns',
    ttl_days: 60,
    count: 124,
  },
  {
    id: 'rs-03',
    name: 'VIP Executive User Accounts',
    type: 'User',
    description: 'High-privilege and executive accounts requiring escalated incident triage',
    ttl_days: 0,
    count: 18,
  },
  {
    id: 'rs-04',
    name: 'Known Tor Exit Nodes',
    type: 'IP',
    description: 'Public Tor relay exits used for anonymized authentication attempts',
    ttl_days: 14,
    count: 320,
  },
];

export const DEMO_REFERENCE_ITEMS = [
  { id: 'item-01', value: '194.26.29.112', added_by: 'Administrator', added_at: new Date(Date.now() - 3600 * 1000 * 4).toISOString() },
  { id: 'item-02', value: '45.154.255.88', added_by: 'Administrator', added_at: new Date(Date.now() - 3600 * 1000 * 8).toISOString() },
  { id: 'item-03', value: '185.220.101.5', added_by: 'System (Sync)', added_at: new Date(Date.now() - 3600 * 1000 * 12).toISOString() },
  { id: 'item-04', value: '109.236.87.14', added_by: 'Tier-2 Analyst', added_at: new Date(Date.now() - 86400 * 1000).toISOString() },
  { id: 'item-05', value: '91.240.118.230', added_by: 'Administrator', added_at: new Date(Date.now() - 86400 * 1000 * 2).toISOString() },
];

export const DEMO_USERS = [
  {
    id: 'usr-admin',
    username: 'admin',
    role: 'admin',
    status: 'Active',
    real_name: 'Lead SOC Administrator',
    mfa_enabled: false,
  },
  {
    id: 'usr-demo',
    username: 'demo',
    role: 'readonly',
    status: 'Active',
    real_name: 'Demo Analyst (Read-Only)',
    mfa_enabled: false,
  },
  {
    id: 'usr-analyst1',
    username: 'analyst_l1',
    role: 'analyst',
    status: 'Active',
    real_name: 'Tier-1 Triage Specialist',
    mfa_enabled: true,
  },
];

export const DEMO_SETTINGS = {
  OTX_API_KEY: '••••••••••••••••••••••••••••••••',
  VIRUSTOTAL_API_KEY: '••••••••••••••••••••••••••••••••',
  ABUSEIPDB_API_KEY: '••••••••••••••••••••••••••••••••',
  SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/••••/••••/••••••••',
  TEAMS_WEBHOOK_URL: 'https://corp.webhook.office.com/webhookb2/••••••••',
};

export const DEMO_OTX_PULSES = [
  {
    id: '65e31a89b0d1e57c6b901a12',
    name: 'Cobalt Strike & Sliver Interactive C2 Infrastructure',
    tlp: 'white',
    description: 'High-confidence command and control nodes associated with FIN7 ransomware staging and lateral movement.',
    author: 'AlienVault Labs',
    indicator_count: 42,
    tags: ['c2', 'cobalt-strike', 'fin7', 'ransomware'],
    created: new Date(Date.now() - 3600 * 1000 * 6).toISOString(),
  },
  {
    id: '65d82f12a4b8c91d2e3f4a5b',
    name: 'BlackCat / ALPHV Ransomware Campaign TTPs & Payloads',
    tlp: 'amber',
    description: 'Active encryptor hashes, PowerShell staging scripts, and exfiltration staging domains targeting healthcare and IT sectors.',
    author: 'CISA & FBI Cyber Division',
    indicator_count: 87,
    tags: ['alphv', 'blackcat', 'ransomware', 'cisa-alert'],
    created: new Date(Date.now() - 3600 * 1000 * 14).toISOString(),
  },
  {
    id: '65c49b01e2f3a4b5c6d7e8f9',
    name: 'Ivanti Connect Secure Zero-Day Exploitation (CVE-2023-46805 & CVE-2024-21887)',
    tlp: 'white',
    description: 'Nation-state scanning IPs, webshell drop paths, and reverse-tunnel proxy endpoints compromising edge appliances.',
    author: 'Mandiant Threat Intelligence',
    indicator_count: 31,
    tags: ['cve-2023-46805', 'ivanti', 'edge-exploit'],
    created: new Date(Date.now() - 3600 * 1000 * 28).toISOString(),
  },
  {
    id: '65b12a34c5d6e7f8a9b0c1d2',
    name: 'LockBit 3.0 Ransomware Staging Executables & Hashes',
    tlp: 'white',
    description: 'MD5/SHA256 file hashes and privilege escalation utility binaries associated with LockBit ransomware affiliates.',
    author: 'SentinelOne SentinelLabs',
    indicator_count: 64,
    tags: ['lockbit', 'ransomware', 'cryptor'],
    created: new Date(Date.now() - 3600 * 1000 * 48).toISOString(),
  },
  {
    id: '65a98b76d5e4f3a2b1c0d9e8',
    name: 'RedLine & Lumma Stealer Distribution via Compromised Software Sites',
    tlp: 'white',
    description: 'Fake installer URLs, credential extraction droppers, and Telegram bot exfiltration channels.',
    author: 'Proofpoint Threat Research',
    indicator_count: 53,
    tags: ['redline', 'infostealer', 'lumma'],
    created: new Date(Date.now() - 3600 * 1000 * 72).toISOString(),
  },
  {
    id: '65901c23b4a5d6e7f8a9b0c1',
    name: 'Palo Alto PAN-OS GlobalProtect Command Injection (CVE-2024-3400)',
    tlp: 'white',
    description: 'Active in-the-wild exploitation payloads, telemetry probes, and root shell persistence mechanisms.',
    author: 'Unit 42 Threat Research',
    indicator_count: 38,
    tags: ['cve-2024-3400', 'pan-os', 'paloalto'],
    created: new Date(Date.now() - 3600 * 1000 * 96).toISOString(),
  },
];
