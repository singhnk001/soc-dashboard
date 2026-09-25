import { MitreMapping, MitreTactic } from './types';

export const MITRE_ATTACK_MAPPINGS: MitreMapping[] = [
  // Initial Access (TA0001)
  { eventId: 4625, title: "Failed Logon", description: "An account failed to log on (potential brute force or initial access).", tactic: "Initial Access", tacticId: "TA0001", technique: "Valid Accounts", techniqueId: "T1078", severity: "medium", platform: "windows" },
  { eventId: 4648, title: "Explicit Credentials Logon", description: "A logon was attempted using explicit credentials.", tactic: "Initial Access", tacticId: "TA0001", technique: "Valid Accounts", techniqueId: "T1078", severity: "medium", platform: "windows" },
  
  // Execution (TA0002)
  { eventId: 4688, title: "Process Creation", description: "A new process has been created.", tactic: "Execution", tacticId: "TA0002", technique: "Command and Scripting Interpreter", techniqueId: "T1059", severity: "info", platform: "windows" },
  { eventId: 4104, title: "PowerShell Script Block Logging", description: "PowerShell script block executed.", tactic: "Execution", tacticId: "TA0002", technique: "Command and Scripting Interpreter: PowerShell", techniqueId: "T1059.001", severity: "medium", platform: "windows" },
  { eventId: 1, title: "Sysmon Process Create", description: "Process Creation via Sysmon.", tactic: "Execution", tacticId: "TA0002", technique: "Command and Scripting Interpreter", techniqueId: "T1059", severity: "info", platform: "windows" },
  
  // Persistence (TA0003)
  { eventId: 4697, title: "Service Installed", description: "A service was installed in the system.", tactic: "Persistence", tacticId: "TA0003", technique: "Create or Modify System Process: Windows Service", techniqueId: "T1543.003", severity: "high", platform: "windows" },
  { eventId: 7045, title: "New Service Installed", description: "A new service was installed.", tactic: "Persistence", tacticId: "TA0003", technique: "Create or Modify System Process: Windows Service", techniqueId: "T1543.003", severity: "high", platform: "windows" },
  { eventId: 4698, title: "Scheduled Task Created", description: "A scheduled task was created.", tactic: "Persistence", tacticId: "TA0003", technique: "Scheduled Task/Job", techniqueId: "T1053", severity: "medium", platform: "windows" },
  { eventId: 13, title: "Sysmon Registry Event", description: "Registry value set via Sysmon.", tactic: "Persistence", tacticId: "TA0003", technique: "Boot or Logon Autostart Execution: Registry Run Keys", techniqueId: "T1547.001", severity: "medium", platform: "windows" },
  
  // Privilege Escalation (TA0004)
  { eventId: 4672, title: "Special Privileges Assigned", description: "Special privileges assigned to new logon.", tactic: "Privilege Escalation", tacticId: "TA0004", technique: "Valid Accounts", techniqueId: "T1078", severity: "medium", platform: "windows" },
  { eventId: 4673, title: "Privileged Service Called", description: "A privileged service was called.", tactic: "Privilege Escalation", tacticId: "TA0004", technique: "Exploitation for Privilege Escalation", techniqueId: "T1068", severity: "medium", platform: "windows" },
  { eventId: 4674, title: "Privileged Object Operation", description: "Operation attempted on a privileged object.", tactic: "Privilege Escalation", tacticId: "TA0004", technique: "Exploitation for Privilege Escalation", techniqueId: "T1068", severity: "medium", platform: "windows" },
  
  // Defense Evasion (TA0005)
  { eventId: 1102, title: "Audit Log Cleared", description: "The audit log was cleared.", tactic: "Defense Evasion", tacticId: "TA0005", technique: "Indicator Removal: Clear Windows Event Logs", techniqueId: "T1070.001", severity: "critical", platform: "windows" },
  { eventId: 4657, title: "Registry Value Modified", description: "A registry value was modified.", tactic: "Defense Evasion", tacticId: "TA0005", technique: "Modify Registry", techniqueId: "T1112", severity: "medium", platform: "windows" },
  { eventId: 4719, title: "Audit Policy Changed", description: "System audit policy was changed.", tactic: "Defense Evasion", tacticId: "TA0005", technique: "Impair Defenses: Disable Windows Event Logging", techniqueId: "T1562.002", severity: "high", platform: "windows" },
  
  // Credential Access (TA0006)
  { eventId: 4768, title: "Kerberos TGT Requested", description: "A Kerberos authentication ticket (TGT) was requested.", tactic: "Credential Access", tacticId: "TA0006", technique: "Steal or Forge Kerberos Tickets", techniqueId: "T1558", severity: "info", platform: "windows" },
  { eventId: 4769, title: "Kerberos Service Ticket Requested", description: "A Kerberos service ticket was requested.", tactic: "Credential Access", tacticId: "TA0006", technique: "Steal or Forge Kerberos Tickets", techniqueId: "T1558", severity: "info", platform: "windows" },
  { eventId: 4771, title: "Kerberos Pre-Auth Failed", description: "Kerberos pre-authentication failed.", tactic: "Credential Access", tacticId: "TA0006", technique: "Brute Force: Password Guessing", techniqueId: "T1110.001", severity: "medium", platform: "windows" },
  { eventId: 4776, title: "Credential Validation", description: "The computer attempted to validate the credentials for an account.", tactic: "Credential Access", tacticId: "TA0006", technique: "Brute Force", techniqueId: "T1110", severity: "info", platform: "windows" },
  
  // Discovery (TA0007)
  { eventId: 4799, title: "Security Group Enumeration", description: "A security-enabled local group membership was enumerated.", tactic: "Discovery", tacticId: "TA0007", technique: "Permission Groups Discovery", techniqueId: "T1069", severity: "low", platform: "windows" },
  { eventId: 4661, title: "Handle to Object Requested", description: "A handle to an object was requested.", tactic: "Discovery", tacticId: "TA0007", technique: "System Information Discovery", techniqueId: "T1082", severity: "info", platform: "windows" },
  
  // Lateral Movement (TA0008)
  { eventId: 4624, title: "Successful Logon", description: "An account was successfully logged on.", tactic: "Lateral Movement", tacticId: "TA0008", technique: "Remote Services", techniqueId: "T1021", severity: "info", platform: "windows" },
  { eventId: 4778, title: "Session Reconnected", description: "A session was reconnected to a Window Station.", tactic: "Lateral Movement", tacticId: "TA0008", technique: "Remote Services: Remote Desktop Protocol", techniqueId: "T1021.001", severity: "low", platform: "windows" },
  
  // Collection (TA0009)
  { eventId: 4663, title: "Attempt to Access Object", description: "An attempt was made to access an object.", tactic: "Collection", tacticId: "TA0009", technique: "Data from Local System", techniqueId: "T1005", severity: "info", platform: "windows" },
  { eventId: 4656, title: "Handle to Object Requested", description: "A handle to an object was requested (Collection).", tactic: "Collection", tacticId: "TA0009", technique: "Data from Local System", techniqueId: "T1005", severity: "info", platform: "windows" },
  
  // Command and Control (TA0011)
  { eventId: 5156, title: "WFP Connection Permitted", description: "The Windows Filtering Platform has permitted a connection.", tactic: "Command and Control", tacticId: "TA0011", technique: "Application Layer Protocol", techniqueId: "T1071", severity: "info", platform: "windows" },
  { eventId: 5157, title: "WFP Connection Blocked", description: "The Windows Filtering Platform has blocked a connection.", tactic: "Command and Control", tacticId: "TA0011", technique: "Application Layer Protocol", techniqueId: "T1071", severity: "medium", platform: "windows" },
  
  // Exfiltration (TA0010)
  { eventId: 2004, title: "Firewall Rule Added", description: "A rule has been added to the Windows Defender Firewall exception list.", tactic: "Exfiltration", tacticId: "TA0010", technique: "Exfiltration Over Alternative Protocol", techniqueId: "T1048", severity: "medium", platform: "windows" },
  
  // Impact (TA0040)
  { eventId: 4720, title: "User Account Created", description: "A user account was created.", tactic: "Impact", tacticId: "TA0040", technique: "Account Access Removal", techniqueId: "T1531", severity: "medium", platform: "windows" },
  { eventId: 4726, title: "User Account Deleted", description: "A user account was deleted.", tactic: "Impact", tacticId: "TA0040", technique: "Account Access Removal", techniqueId: "T1531", severity: "high", platform: "windows" },
  
  // Resource Development (TA0042)
  // Reusing 4720 to map here as requested
  
  // Reconnaissance (TA0043)
  // Reusing 4625 to map here as requested
];

export const MITRE_TACTICS: MitreTactic[] = [
  { id: "TA0043", name: "Reconnaissance", techniques: [] },
  { id: "TA0042", name: "Resource Development", techniques: [] },
  { id: "TA0001", name: "Initial Access", techniques: [] },
  { id: "TA0002", name: "Execution", techniques: [] },
  { id: "TA0003", name: "Persistence", techniques: [] },
  { id: "TA0004", name: "Privilege Escalation", techniques: [] },
  { id: "TA0005", name: "Defense Evasion", techniques: [] },
  { id: "TA0006", name: "Credential Access", techniques: [] },
  { id: "TA0007", name: "Discovery", techniques: [] },
  { id: "TA0008", name: "Lateral Movement", techniques: [] },
  { id: "TA0009", name: "Collection", techniques: [] },
  { id: "TA0011", name: "Command and Control", techniques: [] },
  { id: "TA0010", name: "Exfiltration", techniques: [] },
  { id: "TA0040", name: "Impact", techniques: [] }
];
