SOC ENDPOINT AGENT DEPLOYMENT GUIDE
===================================

To monitor other Windows machines (laptops, servers, VMs) and have their logs show up on your central SOC Dashboard, follow these 3 simple steps:

STEP 1: Find Your Dashboard IP
------------------------------
On this computer (the SOC server), open Command Prompt and type: `ipconfig`
Look for your IPv4 Address (for example, 192.168.1.50). 
Ensure this computer allows inbound traffic on Port 8000 in the Windows Firewall.

STEP 2: Copy the Deployment Script
----------------------------------
Take the `deploy_agent.ps1` file from this folder and copy it to a USB drive or email it to the target Windows machine you want to monitor.

STEP 3: Run the Script on the Target Machine
--------------------------------------------
On the target machine:
1. Right-click the Start Menu and select "Windows PowerShell (Admin)" or "Terminal (Admin)".
2. Navigate to where you saved the script.
3. Run the script and pass your SOC server's IP address like this:

   .\deploy_agent.ps1 -SocServerIP "192.168.1.50"

(Note: If PowerShell gives you a "running scripts is disabled" error, run this first: `Set-ExecutionPolicy Bypass -Scope Process`)

WHAT THE SCRIPT DOES AUTOMATICALLY:
- Downloads the secure Vector v0.58.0 agent from Datadog.
- Configures it to stream logs directly to your SOC dashboard.
- Creates a hidden `C:\Program Files\SOC_Vector_Agent` folder.
- Installs it as a background "SYSTEM" service so it silently starts every time the computer boots up and has full access to the Security event logs.
