# MacAudit

MacAudit is a local, read-only macOS auditing system focused on remote access, SSH, privacy permissions, MDM, persistence, accounts, security controls, installed software, and evidence timelines.

## What it detects

- Remote Login/SSH state and established SSH connections
- Apple Screen Sharing and Apple Remote Desktop indicators
- Common remote-support tools such as TeamViewer, AnyDesk, Splashtop, RustDesk, ScreenConnect, BeyondTrust/Bomgar, LogMeIn, and VNC-related processes
- Strong remote-session indicators in macOS Unified Logs
- Screen Recording, Accessibility, Full Disk Access, Camera, Microphone, and other TCC permission changes when macOS permits database access
- New or modified LaunchAgents, LaunchDaemons, cron jobs, and periodic jobs
- New users and administrators
- MDM enrollment and system-extension changes
- FileVault, SIP, Gatekeeper, firewall, Remote Login, and Remote Apple Events changes
- Installed application and package changes

## Important limitations

MacAudit records evidence; it does not guarantee detection of every commercial remote-support product or server-controlled policy. A permission such as Screen Recording means an app is allowed to capture the screen, not that it is actively doing so. Likewise, a running support service is capability evidence, not proof of an active technician session.

TCC databases are protected by macOS. The root daemon may still receive `Operation not permitted`. If that happens, keep the warning in the audit log and review permissions manually in System Settings > Privacy & Security. Do not disable SIP to make this tool work.

## Install

1. Unzip the package.
2. Open Terminal in the extracted `macaudit` folder.
3. Validate the scripts before installation:

   ```bash
   bash -n bin/macaudit bin/install.sh bin/uninstall.sh
   plutil -lint launchd/io.github.macaudit.plist
   ```

4. Install:

   ```bash
   sudo ./bin/install.sh
   ```

The daemon runs immediately and then every 60 seconds.

## Files

- Events: `/Library/Logs/MacAudit/events.jsonl`
- Agent log: `/Library/Logs/MacAudit/agent.log`
- Launchd output: `/Library/Logs/MacAudit/launchd.out.log`
- Launchd errors: `/Library/Logs/MacAudit/launchd.err.log`
- Baselines/state: `/Library/Application Support/MacAudit/`
- Configuration: `/Library/Application Support/MacAudit/macaudit.conf`

## Use

Status:

```bash
sudo /usr/local/libexec/macaudit status
```

Run immediately:

```bash
sudo /usr/local/libexec/macaudit run
```

Readable recent events:

```bash
sudo tail -f /Library/Logs/MacAudit/events.jsonl
```

Last seven days:

```bash
sudo /usr/local/libexec/macaudit report 7
```

Pretty-print JSON with `jq`, if installed:

```bash
sudo tail -n 100 /Library/Logs/MacAudit/events.jsonl | jq .
```

Create a new baseline after reviewing expected changes:

```bash
sudo /usr/local/libexec/macaudit baseline
```

## First-run behavior

The first run creates baselines and produces INFO events. Later changes produce alerts. Review the first baseline carefully because existing software, permissions, accounts, and services are treated as known after that point.

## Test safely

Test SSH detection from another device only when authorized:

```bash
ssh your-user@your-mac
```

Then inspect:

```bash
sudo grep '"category":"ssh"' /Library/Logs/MacAudit/events.jsonl | tail
```

Test persistence detection by creating and then removing a harmless plist in your own `~/Library/LaunchAgents` directory. Do not load or execute it; the file change alone is sufficient.

## Hardening recommendations

- If Remote Login is not required, turn it off in System Settings > General > Sharing.
- If it is required, limit it to named users and use SSH keys.
- Review Screen & System Audio Recording, Accessibility, Remote Desktop, Full Disk Access, Camera, and Microphone permissions.
- Keep FileVault, SIP, Gatekeeper, and the firewall enabled.
- On a company-managed Mac, coordinate changes with IT because MDM may restore settings or software.

## Uninstall

```bash
sudo ./bin/uninstall.sh
```

The uninstall script intentionally preserves evidence and baselines.

## Local dashboard

The dashboard binds only to `127.0.0.1:8765`; it is not exposed to other devices.

Open it after installation:

```bash
sudo /usr/local/libexec/macaudit dashboard
```

Or visit `http://127.0.0.1:8765` in a browser.

It includes current remote-access posture, running remote-support tools, severity totals, searchable events, and automatic refresh every 10 seconds.

Check its service and logs:

```bash
sudo launchctl print system/io.github.macaudit.dashboard
sudo tail -f /Library/Logs/MacAudit/dashboard.err.log
```

## MacAudit 2.0 accuracy and notifications

Version 2.0 avoids generic matching of Apple's normal `remoted` and `mediaremoted` processes. It matches named remote-support tools only, ignores loopback sockets, and emits a changed event only when the underlying evidence changes.

Native notifications are enabled by default for HIGH and CRITICAL events. They appear in macOS Notification Center for the currently logged-in user and play the Submarine alert sound. Identical alerts are rate-limited for 15 minutes.

Test notifications:

```bash
sudo /usr/local/libexec/macaudit notify-test
```

Configure them in:

```text
/Library/Application Support/MacAudit/macaudit.conf
```

Useful settings:

```text
ENABLE_NOTIFICATIONS=1
NOTIFY_MIN_SEVERITY=HIGH
NOTIFICATION_COOLDOWN_SECONDS=900
```

After changing the file, restart the collector:

```bash
sudo launchctl kickstart -k system/io.github.macaudit
```

If the test event is written but no banner appears, open System Settings > Notifications and allow notifications for `osascript` or Script Editor if macOS presents that entry. The event is still preserved in `/Library/Logs/MacAudit/events.jsonl` even when a banner cannot be displayed.
