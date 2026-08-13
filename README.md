# MacAudit

> **Version 3.3.3**

MacAudit is a **local, read-only macOS auditing system** focused on remote access, SSH, privacy permissions, MDM, persistence, user accounts, security controls, installed software, and evidence timelines.

Unlike many security products, **MacAudit never uploads telemetry, never requires cloud services, and never sends your audit data anywhere**. Every scan, event, report and dashboard view is generated locally on your Mac.

---

# What it detects

## Remote access

- Remote Login (SSH) state and established SSH connections
- Apple Screen Sharing and Apple Remote Desktop indicators
- Common remote-support tools including TeamViewer, AnyDesk, Splashtop, RustDesk, ScreenConnect, BeyondTrust/Bomgar, LogMeIn and VNC-related processes
- Strong remote-session indicators in macOS Unified Logs

## Privacy permissions

- Screen Recording
- Accessibility
- Full Disk Access
- Camera
- Microphone
- Automation
- Files & Folders
- Other TCC permission changes where macOS permits database access

## Persistence

- New or modified LaunchAgents
- LaunchDaemons
- Login Items
- cron jobs
- periodic jobs

## System security

- New users and administrators
- MDM enrolment and System Extension changes
- FileVault, SIP, Gatekeeper, Firewall, Remote Login and Remote Apple Events changes
- Installed applications and package changes

---

# Important limitations

MacAudit records **evidence**. It does not guarantee detection of every commercial remote-support product or every server-controlled policy.

A Screen Recording permission means an application **is allowed** to capture the screen—not that it is actively recording.

Likewise, a running remote-support service is evidence that remote access is possible, **not proof that somebody is connected**.

TCC databases are protected by macOS. Even when running as root, macOS may return **Operation not permitted**. If this happens, keep the warning in the audit log and review permissions manually in **System Settings → Privacy & Security**. **Do not disable SIP** to make MacAudit work.

MacAudit operates in **read-only mode**. It never modifies security settings or attempts automatic remediation.

---

# Installation

1. Unzip the package.
2. Open Terminal inside the extracted `macaudit` folder.
3. Validate the project:

```bash
bash -n bin/macaudit bin/install.sh bin/uninstall.sh
plutil -lint launchd/io.github.macaudit.plist
python3 -m py_compile dashboard/server.py
```

4. Install:

```bash
sudo ./bin/install.sh
```

The installer automatically:

- creates the initial baseline
- performs and verifies the first scan
- starts monitoring services
- enables the authenticated local dashboard

The collector runs immediately and then every 60 seconds.

---

# Files

- Events: `/Library/Logs/MacAudit/events.jsonl`
- Agent log: `/Library/Logs/MacAudit/agent.log`
- Launchd output: `/Library/Logs/MacAudit/launchd.out.log`
- Launchd errors: `/Library/Logs/MacAudit/launchd.err.log`
- Dashboard events: `/Library/Application Support/MacAudit/dashboard-events.jsonl`
- Health: `/Library/Application Support/MacAudit/health.json`
- Baselines/state: `/Library/Application Support/MacAudit/`
- Configuration: `/Library/Application Support/MacAudit/macaudit.conf`

---

# Usage

```bash
sudo /usr/local/libexec/macaudit status
sudo /usr/local/libexec/macaudit run
sudo tail -f /Library/Logs/MacAudit/events.jsonl
sudo /usr/local/libexec/macaudit report 7
sudo tail -n 100 /Library/Logs/MacAudit/events.jsonl | jq .
sudo /usr/local/libexec/macaudit baseline
```

---

# First-run behaviour

The first run creates baselines and produces INFO events. Future scans compare against those baselines and only meaningful changes generate alerts.

Every event includes:

- Timestamp
- Severity
- Category
- Human-readable explanation
- Recommended action
- Expandable raw technical evidence

Events are retained for the configured retention period (90 days by default).

---

# Test safely

Test SSH detection only when authorised:

```bash
ssh your-user@your-mac
sudo grep '"category":"ssh"' /Library/Logs/MacAudit/events.jsonl | tail
```

You can also test persistence detection by creating and removing a harmless plist in your own `~/Library/LaunchAgents` directory without loading it.

---

# Hardening recommendations

- Disable Remote Login if it is not required.
- If SSH is required, limit access to named users and use SSH keys.
- Review Screen Recording, Accessibility, Full Disk Access, Camera and Microphone permissions regularly.
- Keep FileVault, SIP, Gatekeeper and Firewall enabled.
- Coordinate changes with IT on MDM-managed Macs.

---

# Local dashboard

The dashboard binds only to **127.0.0.1:8765** and is never exposed to the network.

Features include:

- Local authentication
- Interactive severity cards
- Clickable severity filtering
- Date filters (Today, Yesterday, Last 7 Days, Last 30 Days, Retained History and Custom)
- Security and remote access overview
- Remote access tools overview
- Human-readable summaries
- Expandable raw system evidence
- Live search
- Automatic refresh
- Native macOS notifications

Launch:

```bash
sudo /usr/local/libexec/macaudit dashboard
```

or open **http://127.0.0.1:8765**

Dashboard diagnostics:

```bash
sudo launchctl print system/io.github.macaudit.dashboard
sudo tail -f /Library/Logs/MacAudit/dashboard.err.log
```

---

# Notifications

Native notifications are enabled by default for HIGH and CRITICAL events.

Test:

```bash
sudo /usr/local/libexec/macaudit notify-test
```

Configuration:

```text
ENABLE_NOTIFICATIONS=1
NOTIFY_MIN_SEVERITY=HIGH
NOTIFICATION_COOLDOWN_SECONDS=900
```

Restart:

```bash
sudo launchctl kickstart -k system/io.github.macaudit
```

If a banner does not appear, check Notification settings for `osascript` or Script Editor. Events are still recorded even if banners are blocked.

---

# What's New in 3.3.3

- Remote-access state now compares only stable macOS sharing settings.
- Remote-support app lifecycle and external network activity are tracked separately.
- Harmless process/socket ordering changes no longer create remote-access HIGH events.
- Initial baseline events now clearly explain that MacAudit recorded a starting point.
- Current security posture highlights FileVault, Firewall, SIP and Gatekeeper when disabled.
- Severity cards are labelled as historical event counts, not current security status.
- Firewall detection now uses Apple's Application Firewall command when available.

---

# What's New in 3.3.2

### Remote-tool lifecycle tracking

Remote-support products are tracked independently. Starting or closing TeamViewer no longer gets hidden by an always-running management tool such as JumpCloud Assist. MacAudit records specific lifecycle events such as **TeamViewer started** and **TeamViewer stopped**, and separately records when that tool gains or loses an external network connection. Background TeamViewer keychain/uninstaller helpers do not by themselves keep the dashboard marked as Running.

On the first scan, a tool that is already active is described as **already running when monitoring started** rather than falsely claiming it just started.

### Intelligent event descriptions

MacAudit interprets baseline differences before presenting them on the dashboard. The default event view explains the actual change while the original forensic output remains available under **System log / raw evidence**. Initial baseline events explicitly explain that MacAudit is recording a starting point for future comparisons.

Examples include:

- `3 applications added, 1 application removed` instead of a long software inventory diff
- `2 startup items added, 1 startup item modified` while retaining SHA-256 hashes in raw evidence
- `Administrator access granted to alice` instead of an unexplained group-membership line
- `FileVault changed from ... to ...` when a single macOS security control changes

### Preserved from 3.2.5

- Authenticated local dashboard
- Clickable severity cards and date filtering
- Human-readable explanations and recommended actions
- Expandable raw system evidence
- Collector heartbeat and active/resolved event tracking
- Native notifications
- Installer verification
- 90-day timestamp-based event retention


---

# Privacy

- No telemetry
- No analytics
- No cloud services
- No external API calls
- All data remains on your Mac unless you export it.

---

# Uninstall

```bash
sudo ./bin/uninstall.sh
```

The uninstall process intentionally preserves evidence and baselines unless you remove them manually.

---

# License

Released under the **MIT License**. See `LICENSE` for details.
