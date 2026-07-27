#!/bin/bash
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo"; exit 1; fi
for label in io.github.macaudit.dashboard io.github.macaudit; do launchctl bootout "system/$label" >/dev/null 2>&1 || true; done
rm -f /Library/LaunchDaemons/io.github.macaudit.plist /Library/LaunchDaemons/io.github.macaudit.dashboard.plist
rm -f /usr/local/libexec/macaudit
rm -rf /usr/local/libexec/macaudit-dashboard
echo "MacAudit removed. Historical logs and configuration were retained."
