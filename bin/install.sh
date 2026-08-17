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
# Preserve existing user configuration while adding new 3.4.13 safety knobs.
if [ -f "$BASE/macaudit.conf" ]; then
  grep -q '^DATA_MOVEMENT_WATCH_ALL_USERS=' "$BASE/macaudit.conf" 2>/dev/null || printf '\nDATA_MOVEMENT_WATCH_ALL_USERS=0\n' >> "$BASE/macaudit.conf"
  grep -q '^DATA_MOVEMENT_MAX_RECONCILE_CHANGES=' "$BASE/macaudit.conf" 2>/dev/null || printf 'DATA_MOVEMENT_MAX_RECONCILE_CHANGES=200\n' >> "$BASE/macaudit.conf"
  grep -q '^PRESENCE_AWAY_SECONDS=' "$BASE/macaudit.conf" 2>/dev/null || printf 'PRESENCE_AWAY_SECONDS=600\n' >> "$BASE/macaudit.conf"
  grep -q '^PERSISTENCE_CHANGE_COOLDOWN_SECONDS=' "$BASE/macaudit.conf" 2>/dev/null || printf 'PERSISTENCE_CHANGE_COOLDOWN_SECONDS=21600\n' >> "$BASE/macaudit.conf"
  grep -q '^ENABLE_SOFTWARE_DOWNLOAD_SCAN=' "$BASE/macaudit.conf" 2>/dev/null || printf 'ENABLE_SOFTWARE_DOWNLOAD_SCAN=1\n' >> "$BASE/macaudit.conf"
fi
[ -s "$BASE/dashboard.token" ] || { umask 077; (command -v openssl >/dev/null && openssl rand -hex 32 || dd if=/dev/urandom bs=32 count=1 2>/dev/null | shasum -a 256 | awk '{print $1}') > "$BASE/dashboard.token"; }
install -m 644 "$ROOT/launchd/com.local.macaudit.plist" /Library/LaunchDaemons/com.local.macaudit.plist
install -m 644 "$ROOT/launchd/com.local.macaudit.datawatch.plist" /Library/LaunchDaemons/com.local.macaudit.datawatch.plist
sed -e "s#__PYTHON__#$PYTHON#g" "$ROOT/launchd/com.local.macaudit.dashboard.plist" > /Library/LaunchDaemons/com.local.macaudit.dashboard.plist
chown -R root:wheel "$BASE" "$LOG" /usr/local/libexec/macaudit /usr/local/libexec/macaudit-dashboard /Library/LaunchDaemons/com.local.macaudit*.plist
chmod 700 "$BASE" "$BASE/state" "$BASE/snapshots" "$BASE/state/notifications"; chmod 600 "$BASE/macaudit.conf" "$BASE/dashboard.token"; chmod 750 "$LOG"
for label in com.local.macaudit.datawatch com.local.macaudit.dashboard com.local.macaudit; do launchctl bootout "system/$label" >/dev/null 2>&1 || true; done

# A previous scheduled scan may still be winding down after launchd is booted out.
# Wait briefly for the real MacAudit owner, but never trust a recycled PID in run.lock.
LOCK="$BASE/state/run.lock"
if [ -d "$LOCK" ]; then
  owner="$(cat "$LOCK/pid" 2>/dev/null || true)"
  waited=0
  while [[ "$owner" =~ ^[0-9]+$ ]] && kill -0 "$owner" 2>/dev/null && \
        ps -p "$owner" -o command= 2>/dev/null | grep -Eq '/usr/local/libexec/macaudit run|/bin/macaudit run'; do
    [ "$waited" -ge 120 ] && { echo "Existing MacAudit scan $owner did not finish within 120 seconds." >&2; exit 1; }
    sleep 1; waited=$((waited+1))
  done
  rm -rf "$LOCK"
fi

# Run and verify the initial scan before enabling the scheduled services.
# Clear cadence stamps so an upgrade always performs every collector group once.
rm -f "$BASE/health.json" "$BASE/state"/due-*
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
launchctl bootstrap system /Library/LaunchDaemons/com.local.macaudit.datawatch.plist
launchctl kickstart -k system/com.local.macaudit.dashboard
/usr/local/libexec/macaudit status
echo; echo 'MacAudit 3.4.13 installed.'; echo 'Initial scan completed successfully.'; echo 'Open the private dashboard with:'; echo '  sudo /usr/local/libexec/macaudit dashboard'
