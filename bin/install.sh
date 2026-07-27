#!/bin/bash
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo: sudo ./bin/install.sh"; exit 1; fi
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BASE="/Library/Application Support/MacAudit"
LOG="/Library/Logs/MacAudit"
PYTHON="$(command -v python3 || true)"
if [ -z "$PYTHON" ]; then
  echo "Python 3 is required for the dashboard. Install it first with: brew install python"
  exit 1
fi
mkdir -p "$BASE" "$BASE/state" "$BASE/snapshots" "$LOG" /usr/local/libexec/macaudit-dashboard/web
install -m 755 "$ROOT_DIR/bin/macaudit" /usr/local/libexec/macaudit
install -m 755 "$ROOT_DIR/dashboard/server.py" /usr/local/libexec/macaudit-dashboard/server.py
install -m 644 "$ROOT_DIR/dashboard/web/"* /usr/local/libexec/macaudit-dashboard/web/
[ -f "$BASE/macaudit.conf" ] || install -m 600 "$ROOT_DIR/config/macaudit.conf" "$BASE/macaudit.conf"
install -m 644 "$ROOT_DIR/launchd/io.github.macaudit.plist" /Library/LaunchDaemons/io.github.macaudit.plist
sed "s#<string>/usr/bin/env</string><string>python3</string>#<string>$PYTHON</string>#" "$ROOT_DIR/launchd/io.github.macaudit.dashboard.plist" > /Library/LaunchDaemons/io.github.macaudit.dashboard.plist
chmod 644 /Library/LaunchDaemons/io.github.macaudit.dashboard.plist
chown -R root:wheel "$BASE" "$LOG" /usr/local/libexec/macaudit /usr/local/libexec/macaudit-dashboard /Library/LaunchDaemons/io.github.macaudit*.plist
chmod 700 "$BASE" "$BASE/state" "$BASE/snapshots"
chmod 750 "$LOG"
for label in io.github.macaudit io.github.macaudit.dashboard; do launchctl bootout "system/$label" >/dev/null 2>&1 || true; done
launchctl bootstrap system /Library/LaunchDaemons/io.github.macaudit.plist
launchctl bootstrap system /Library/LaunchDaemons/io.github.macaudit.dashboard.plist
launchctl kickstart -k system/io.github.macaudit
launchctl kickstart -k system/io.github.macaudit.dashboard
sleep 2
/usr/local/libexec/macaudit status
echo
echo "Installed MacAudit with dashboard."
echo "Dashboard: http://127.0.0.1:8765"
echo "Open it with: sudo /usr/local/libexec/macaudit dashboard"
echo "Events: /Library/Logs/MacAudit/events.jsonl"
