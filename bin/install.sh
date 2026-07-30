#!/bin/bash
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo 'Run with sudo: sudo ./bin/install.sh'; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; BASE='/Library/Application Support/MacAudit'; LOG='/Library/Logs/MacAudit'
PYTHON=''; for p in /usr/bin/python3 /opt/homebrew/bin/python3 /usr/local/bin/python3; do [ -x "$p" ] && PYTHON="$p" && break; done
[ -n "$PYTHON" ] || { echo 'Python 3 is required for the optional local dashboard.'; exit 1; }
mkdir -p "$BASE/state" "$BASE/snapshots" "$BASE/state/notifications" "$LOG" /usr/local/libexec/macaudit-dashboard/web
install -m 755 "$ROOT/bin/macaudit" /usr/local/libexec/macaudit
install -m 755 "$ROOT/dashboard/server.py" /usr/local/libexec/macaudit-dashboard/server.py
install -m 644 "$ROOT/dashboard/web/"* /usr/local/libexec/macaudit-dashboard/web/
[ -f "$BASE/macaudit.conf" ] || install -m 600 "$ROOT/config/macaudit.conf" "$BASE/macaudit.conf"
[ -s "$BASE/dashboard.token" ] || { umask 077; (command -v openssl >/dev/null && openssl rand -hex 32 || dd if=/dev/urandom bs=32 count=1 2>/dev/null | shasum -a 256 | awk '{print $1}') > "$BASE/dashboard.token"; }
install -m 644 "$ROOT/launchd/com.local.macaudit.plist" /Library/LaunchDaemons/com.local.macaudit.plist
sed -e "s#__PYTHON__#$PYTHON#g" "$ROOT/launchd/com.local.macaudit.dashboard.plist" > /Library/LaunchDaemons/com.local.macaudit.dashboard.plist
chown -R root:wheel "$BASE" "$LOG" /usr/local/libexec/macaudit /usr/local/libexec/macaudit-dashboard /Library/LaunchDaemons/com.local.macaudit*.plist
chmod 700 "$BASE" "$BASE/state" "$BASE/snapshots" "$BASE/state/notifications"; chmod 600 "$BASE/macaudit.conf" "$BASE/dashboard.token"; chmod 750 "$LOG"
for label in com.local.macaudit.dashboard com.local.macaudit; do launchctl bootout "system/$label" >/dev/null 2>&1 || true; done

# Run and verify the initial scan before enabling the scheduled services.
rm -f "$BASE/health.json"
echo 'Running initial MacAudit scan...'
if ! /usr/local/libexec/macaudit run; then
  echo 'Initial MacAudit scan failed. Review /Library/Logs/MacAudit/agent.log.' >&2
  exit 1
fi
if [ ! -s "$BASE/health.json" ]; then
  echo 'Initial MacAudit scan did not create health.json.' >&2
  exit 1
fi

launchctl bootstrap system /Library/LaunchDaemons/com.local.macaudit.plist
launchctl bootstrap system /Library/LaunchDaemons/com.local.macaudit.dashboard.plist
launchctl kickstart -k system/com.local.macaudit.dashboard
/usr/local/libexec/macaudit status
echo; echo 'MacAudit 3.2.5 installed.'; echo 'Initial scan completed successfully.'; echo 'Open the private dashboard with:'; echo '  sudo /usr/local/libexec/macaudit dashboard'
