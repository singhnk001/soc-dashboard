# MITRE ATT&CK Mapping Reference

## Introduction
The MITRE ATT&CK framework provides a comprehensive matrix of tactics and techniques used by threat actors.

## Tactics
1. **Initial Access (TA0001)**
2. **Execution (TA0002)**
3. **Persistence (TA0003)**
4. **Privilege Escalation (TA0004)**
5. **Defense Evasion (TA0005)**
6. **Credential Access (TA0006)**
7. **Discovery (TA0007)**
8. **Lateral Movement (TA0008)**
9. **Collection (TA0009)**
10. **Command and Control (TA0011)**
11. **Exfiltration (TA0010)**
12. **Impact (TA0040)**

## Mapping Table

| Event ID | Tactic | Technique | Description | Severity |
|----------|--------|-----------|-------------|----------|
| 4625     | Credential Access | Brute Force | Failed Logon | High |
| 4688     | Execution | Command-Line Interface | Process Creation | Medium |

## Detection Use Cases
### Brute Force Detection
Monitor Event ID 4625 for multiple failed attempts within a short timeframe.

### Lateral Movement Detection
Monitor Event ID 4624 (Type 3 or 10) for remote interactive logons.

## References
[Official MITRE ATT&CK Site](https://attack.mitre.org/)
