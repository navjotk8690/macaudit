# MacAudit

> **Version 3.4.18**

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

## Data movement monitoring

MacAudit 3.4 adds local-only filename-level evidence for data movement. It can record:

- `scp`, `sftp`, `rsync`, and `rclone` process lifecycle activity
- creation of sizeable archives in configured user folders
- sizeable files written to mounted external volumes
- movement or removal of sizeable files from configured Desktop, Documents, and Downloads folders
- local move/rename correlation using filesystem identity, including the detected destination path when it can be established
- stronger correlation when a monitored file disappears shortly after transfer-tool activity

This evidence stays local in MacAudit's root-owned state/log files. It is evidence of activity, **not automatic proof of exfiltration**. HTTPS/encrypted transfers can prevent MacAudit from proving which file contents crossed the network.

Default settings:

```text
ENABLE_DATA_MOVEMENT_SCAN=1
DATA_MOVEMENT_RECORD_FILENAMES=1
DATA_MOVEMENT_MIN_FILE_MB=1
DATA_MOVEMENT_TRACK_MIN_BYTES=0
DATA_MOVEMENT_MAX_DROP_PERCENT=35
DATA_MOVEMENT_LOOKBACK_MINUTES=10
DATA_MOVEMENT_INTERVAL_SECONDS=300
DATA_MOVEMENT_WATCH_FOLDERS=Desktop,Documents,Downloads
```

The watched folder names are applied to local user home directories. Transfer-tool process/network checks remain fast, while filesystem data-movement scans run every five minutes by default. Increase `DATA_MOVEMENT_MIN_FILE_MB` or `DATA_MOVEMENT_INTERVAL_SECONDS` if you prefer lower scan overhead.

## Smarter startup-item monitoring

MacAudit now fingerprints the persistence-relevant fields inside LaunchAgent and LaunchDaemon plists separately from the raw file hash. Changes to executable paths, arguments, `RunAtLoad`, `KeepAlive`, users, schedules, watched paths, sockets and similar startup behaviour remain HIGH events. Metadata-only rewrites that do not change effective startup behaviour are recorded as INFO instead of repeatedly generating HIGH alerts.


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


# What's New in 3.4.18

3.4.18 is a polish and repository-safety release. Periodic Data Movement reconciliation now recognises recent live move/delete events for both a source path and its descendants, preventing a second vague `destination not determined` event after an already-resolved directory operation. Emptying a folder from Trash now reports the top-level Trash item rather than every child file inside it.

The Running applications panel now uses the more accurate `RUNNING` label and describes its scope as GUI plus selected security-relevant processes. No monitoring baselines are reset by this upgrade.

A local `scripts/privacy-check.sh` helper is included for pre-push checks. It scans project files for common secret/token formats, private-key material, concrete macOS home paths, email addresses and public IPv4 literals; optional extra terms can be supplied for names, hostnames or company domains.

Before publishing a checkout, run:

```bash
./scripts/privacy-check.sh .
```

You can also supply project-specific terms that must not appear in the public tree:

```bash
./scripts/privacy-check.sh . your-name your-hostname company.example
```

The checker inspects the current project tree (or Git-visible files when run inside a repository). It does not rewrite or inspect prior Git commits, so an existing repository with sensitive data in history must be cleaned separately before publication.

# What's New in 3.4.17

3.4.17 fixes the Finder-to-Trash regression without changing the working Desktop/Projects move resolver. Trash monitoring now keeps its own startup baseline, notices every newly appearing top-level Trash entry, and then attempts `FROM -> TO` correlation using both the current identity map and recent device/inode history. If macOS does not provide enough evidence to prove the source, MacAudit still records `Item appeared in Trash` rather than losing the transition entirely.

The identity map is now serialised so the background Trash observer and live filesystem watcher cannot overwrite each other's state. Permanent removal from Trash continues to use `unlink`/`rmdir` evidence.

Photos Library maintenance is also quieter: `photolibraryd` package-root churn is ignored, and periodic reconciliation treats `.photoslibrary` contents as an opaque package instead of walking the internal caches/databases. Ordinary user files in `~/Pictures` remain monitored.

# What's New in 3.4.14

3.4.14 added the first dedicated Trash-appearance correlator and Finder/Trash path normalisation. 3.4.17 supersedes that implementation by removing its shared-state race and restoring fallback Trash visibility.

# What's New in 3.4.12

### Finder move correlation that does not depend on two rename lines

Finder can expose only the **source** path for a rename/move in `fs_usage`. MacAudit 3.4.12 now resolves that source's stable filesystem device/inode identity against the current monitored user tree to find the destination. This is used only when MacAudit already knows the object's identity from the live watcher or the periodic baseline.

For the intended workflow:

```text
Desktop/untitled folder
  -> Desktop/example-folder
  -> Projects/example-folder
  -> ~/.Trash/example-folder
  -> permanently removed
```

MacAudit can now record `FROM` -> `TO` for the rename/move stages, classify a move into Trash separately, and classify the final `unlink`/`rmdir` from Trash as permanent deletion.

### Newly created files are tracked before the five-minute scan

Writable/create-style file opens are used only to seed the local device/inode path map. They do not create user-facing events by themselves. This allows a newly created file that is moved before the next periodic inventory to still participate in later move correlation.

### Software-download baseline continuity

A transient empty or severely collapsed software-download inventory no longer replaces a good baseline. Removals are treated as baseline maintenance rather than new-download evidence, so an incomplete scan cannot create a later false `52 new` event for files that were already present.

### Existing monitoring remains enabled

3.4.12 retains presence/away tagging, active SSH source/socket evidence, remote-support external IP/port checks, installed-software monitoring, software-download detection, startup-item persistence checks, TCC/privacy permissions, users/admins, MDM, Remote Login, FileVault, Firewall, SIP and Gatekeeper monitoring.


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
### Activity while you are away

MacAudit 3.4.12 tags new events with whether the console user was active, idle/away, the screen was locked, nobody was logged in, or presence could not be determined. The dashboard can filter to **While I was away / locked**. Presence is inferred locally from the console session, screen-lock state when macOS exposes it, and HID idle time.

### Presence reliability in 3.4.12

`ACTIVE` now requires three signals at the time the event is recorded: an unlocked console session, an awake display, and recent HID input. This prevents background wake activity from being labelled as if a person were using the Mac. SSH and supported remote-tool activity recorded while `AWAY`, `LOCKED`, or `LOGGED_OUT` is explicitly marked as unattended.

### Persistence deduplication in 3.4.12

Startup-item evidence now identifies the exact semantic fields that changed (for example `ProgramArguments`, `RunAtLoad`, or `KeepAlive`) instead of showing only old/new hashes. Repeated changes to the same path and same set of semantic fields are suppressed for `PERSISTENCE_CHANGE_COOLDOWN_SECONDS` (21600 seconds / six hours by default). Different fields or different startup items still produce separate alerts.

### Software downloads and installations

MacAudit distinguishes software-like downloads from installed software. The live watcher records `.dmg`, `.pkg`, `.mpkg`, `.app`, and ZIP archives only when the ZIP actually contains an application bundle or installer package. Existing files are baselined and are not claimed as newly downloaded. The slower installed-software inventory separately records applications and installer receipts that were actually added or removed.


### Software-download baseline safety in 3.4.12

The first software-download inventory records existing installer candidates as a baseline instead of reporting them as new downloads. Generic ZIP archives containing documents, source code, exports or backups are no longer classified as software solely because of the `.zip` extension.

### Evidence-backed reconciliation in 3.4.12

Periodic Data Movement summaries are emitted only when MacAudit has path-level evidence for the affected files or folders. A count-only reconciliation with no source/destination paths is suppressed rather than shown as an unexplained event card.

### Remote connection evidence

The existing remote-access checks remain enabled. Active SSH evidence includes socket/source-address details exposed by `lsof`, and supported remote-support processes are checked for non-loopback external IP/port connections. A running support agent or external service connection is capability evidence, not by itself proof of an active technician session.

