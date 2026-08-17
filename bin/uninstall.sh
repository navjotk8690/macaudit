#!/bin/bash
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo 'Run with sudo.'; exit 1; }
for label in com.local.macaudit.datawatch com.local.macaudit.dashboard com.local.macaudit; do launchctl bootout "system/$label" >/dev/null 2>&1 || true; done
rm -f /Library/LaunchDaemons/com.local.macaudit.plist /Library/LaunchDaemons/com.local.macaudit.dashboard.plist /Library/LaunchDaemons/com.local.macaudit.datawatch.plist /usr/local/libexec/macaudit
rm -rf /usr/local/libexec/macaudit-dashboard
echo 'MacAudit was removed. Logs, configuration, token, and historical state were retained in /Library.'
