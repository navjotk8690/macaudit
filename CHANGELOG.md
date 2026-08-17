# 3.4.18

- Suppress reconciliation-only `destination not determined` duplicates when a recent live move/delete already resolved the source path or a descendant of that source.
- Coalesce permanent deletion of a trashed folder to the top-level Trash item instead of emitting one event for every nested child.
- Rename Running applications status from `OPEN` to `RUNNING` and clarify that the panel includes GUI and selected security-relevant processes.
- Remove a personal username from an old README movement example.
- Add `scripts/privacy-check.sh` for local pre-push privacy/secret checks.
- Preserve all existing monitoring baselines and identity state across the upgrade.

# 3.4.17

- Restores the lock-protected, history-backed device/inode movement engine from the last known-good build.
- Fixes regression affecting moves between project folders and other same-home locations.
- Keeps Running Applications dashboard support isolated from movement state.
- Strengthens Cmd+Delete/Trash resolution by checking the exact Trash basename before broader filesystem search.
- Preserves Photos Library opaque-package/noise filtering from 3.4.15.
- Does not reset existing Data Movement or software-download baselines during this upgrade.

# Changelog

## 3.4.17

- Restored independent Trash visibility while keeping the working device/inode move resolver from 3.4.12/3.4.13.
- Removed a race where the background Trash poller and main filesystem watcher could rewrite the same identity-state file concurrently.
- Added an append-only recent identity history so a Finder move into Trash can still be correlated even when the current-path map has already advanced.
- Baselines existing top-level Trash contents when the watcher starts; only newly appearing Trash entries are evaluated.
- Emits `Moved to Trash` when a new Trash entry matches a prior path by device/inode. If the source cannot be proven, emits `Item appeared in Trash` instead of silently dropping the Trash transition.
- Preserves `Permanently deleted from Trash` for later `unlink`/`rmdir` operations.
- Suppresses `photolibraryd` maintenance calls against `.photoslibrary` bundles and treats Photos Library package contents as opaque during periodic reconciliation, while leaving ordinary user files in `~/Pictures` monitored.
- Preserves software-download, presence, SSH/IP, remote-support, persistence, privacy/TCC, identity, MDM and macOS security collectors.

## 3.4.14

- Added a dedicated Trash-appearance correlator for Finder moves that do not expose a usable rename record through `fs_usage`.
- Matches new top-level `~/.Trash` entries against the last tracked filesystem device/inode identity and emits `Moved to Trash` with `FROM` and `TO` paths.
- Requires the prior source path to have disappeared and limits correlation to recent identity state to avoid stale/hard-link false positives.
- Preserves existing data-movement and software-download baselines during upgrade.


## 3.4.13

- Finalised Finder/Trash move correlation by normalising additional `fs_usage`/`renameat` path forms before device/inode resolution.
- Preserved the proven Desktop -> Projects `FROM -> TO` correlation while extending the same path resolution to moves into `~/.Trash`.
- Added a persistent software-download baseline marker and one-time repair migration so older empty baselines cannot re-announce existing installers as new.
- Live software-download detections are written into the periodic baseline immediately to prevent duplicate inventory events.
- Suppressed internal Photos Library package churn while still allowing movement of the library bundle itself to be observed.
- Kept SSH/source-IP, remote-support network, presence, installed-software, persistence, privacy/TCC, identity, MDM and macOS security collectors unchanged.

## 3.4.12

- Resolve Finder source-only rename/move events by stable device/inode identity search across monitored user roots.
- Track newly-created/re-written files silently from writable open events so moves before the next periodic inventory can still be correlated.
- Preserve software-download baselines when a discovery pass transiently returns empty; removals no longer generate misleading download events.
- Software-download events are emitted only for genuinely new candidates; baseline removals are silent maintenance.
- Preserve all existing SSH/IP, remote-support, persistence, privacy, account, MDM and macOS security monitoring.

## [3.4.11] - 2026-08-17

- Adds a live device/inode path index so files and folders created after the last periodic baseline can still be followed across Finder renames and moves.
- Correlates the tested workflow `create -> rename -> move -> Trash -> permanent delete` into distinct path-aware events when macOS exposes the corresponding filesystem activity.
- Reports verified moves with `FROM` and `TO` evidence instead of a one-sided generic rename card.
- Reports moves into `~/.Trash` as **Moved to Trash** and later `unlink`/`rmdir` removal from Trash as **Permanently deleted from Trash**.
- Keeps one-sided rename calls silent when a destination cannot be proven; five-minute reconciliation remains the conservative fallback.
- Preserves 3.4.10 software-download baselining and ZIP classification fixes.
- Preserves SSH/IP, remote-support networking, software installation, persistence, presence, privacy, account, MDM and macOS security monitoring.

## [3.4.9] - 2026-08-17

- ACTIVE presence now requires an unlocked console session, awake display and recent HID input; background wakes are classified away.
- Add UNKNOWN presence when reliable input state cannot be established.
- Mark SSH and remote-support activity occurring while away, locked or logged out as unattended.
- Report exact changed LaunchAgent/LaunchDaemon semantic fields instead of hash-only evidence.
- Suppress repeated changes to the same persistence item and same field set for six hours by default.
- Preserve SSH source-IP/socket evidence, remote-tool external IP/port evidence, software downloads and installed-software monitoring.

## 3.4.8

- Tags each recorded event with local user-presence state: active, away/idle, screen locked, or logged out.
- Adds an Event History presence filter so activity that occurred while the user was away can be reviewed separately.
- Improves live Finder move correlation by matching filesystem identity against the previous inventory when only one rename path is exposed.
- Distinguishes verified moves, moves to Trash, and permanent unlink/rmdir deletion events.
- Adds local software-download detection for disk images, installer packages, application bundles, and likely software archives in download locations.
- Keeps existing SSH source-IP evidence and remote-support external IP/port monitoring.
- Expands temporary/generated file suppression for Chrome partial downloads, Apple copy temp files, Codex temp state, SQLite sidecars, and photo-cache churn.

## [3.4.8] - 2026-08-14

### Fixed
- Live filesystem events now parse the actual `fs_usage` path column instead of matching `/Users/...` substrings embedded inside unrelated system paths.
- Apple Parental Controls `.dat.nosync*` activity and similar generated metadata no longer appears as user Data Movement events.
- Finder rename/move pairs are correlated into a single `FROM -> TO` event when both sides can be verified.
- Finder moves into `.Trash` are reported as `Moved to Trash` instead of generic rename events.
- Direct `unlink` and `rmdir` operations are reported as file/folder deletions.
- Raw filesystem evidence now renders real line breaks instead of a literal `\n`.
- Periodic reconciliation suppresses moves/deletions already captured by the live watcher, reducing duplicate timeline events.

### Changed
- One-sided rename records are no longer emitted as definitive move events; the periodic inventory remains the fallback for activity that cannot be correlated confidently.

## [3.4.6] - 2026-08-14

### Fixed
- Periodic Data Movement reconciliation can no longer treat a second incomplete filesystem walk as proof of mass deletion.
- Missing monitored roots, large inventory collapses, and more than 200 unresolved disappearances retain the last known-good baseline.
- Data Movement inventories now include explicit root sentinels and root-level collection metadata.
- Whole-home monitoring defaults to the currently logged-in user's home instead of silently combining multiple local user homes.
- Reconciliation warnings are rate-limited and raw evidence is capped to useful samples.
- Rebaselines persistence once during upgrade so the MacAudit datawatch LaunchDaemon is not reported as a migration-only startup item.
- Improved `fs_usage` parsing for create, delete, rename, and move events across macOS output variations.

### Changed
- The live filesystem watcher is the primary source for short-lived file/folder activity.
- Five-minute inventory scans now act as conservative reconciliation only and will report low-volume, high-confidence moves/removals.
- Added `DATA_MOVEMENT_WATCH_ALL_USERS` (default `0`) and `DATA_MOVEMENT_MAX_RECONCILE_CHANGES` (default `200`).

## [3.4.5] - 2026-08-14

### Fixed
- Canonicalised installed application/package inventories so harmless output reordering no longer creates software-change events.
- Rate-limited repeated incomplete-inventory warnings while preserving the last good baseline.

### Added
- Local `fs_usage`-based watcher for short-lived create, delete and rename/move activity between periodic snapshots.

## [3.4.4] - 2026-08-14

### Fixed
- Prevented incomplete Data Movement inventories from producing mass false-deletion events.
- Previous good baselines are now retained when filesystem collection is incomplete or an abnormal percentage of objects disappears.
- Added raw evidence for inventory safety rejections.
- Expanded default exclusions for generated development/cache trees.
- Local move tracking no longer inherits the 1 MB transfer-alert threshold.
- Capped large change evidence to keep local logs and dashboard events manageable.

## [3.4.3] - 2026-08-14

### Added
- Whole-home Data Movement monitoring by default.
- Folder move and rename correlation.
- Configurable directory exclusions for noisy trees.

### Improved
- Folder moves are emitted once instead of producing a flood of child-file events.
- Unknown removals explicitly state that the destination could not be determined.

## [3.4.2] - 2026-08-14

### Added
- Local file move/rename destination correlation using device and inode identity.
- Dedicated `data_movement` collector timing in health status.

### Improved
- Data Movement filesystem scans now run on their own five-minute cadence instead of extending every standard security scan.
- Batched file metadata collection reduces process-launch and filesystem overhead.
- Removed-file events distinguish confirmed local moves from removals whose destination cannot be determined.
- Dashboard refreshes preserve expanded event details, raw-log panels, filters and scroll position.

### Fixed
- Ten-second dashboard refreshes no longer collapse raw evidence while it is being reviewed.
- Corrected awkward `filesremoved` style data-movement wording.

## 3.4.1
- Fixed installer first-scan failures caused by stale or recycled scan-lock PIDs.
- Scan locks now verify that the recorded PID is actually a MacAudit collector before treating it as active.
- Installer waits for a genuine in-progress MacAudit scan before clearing stale lock state.
- Legacy `REMOTE_SESSION_REGEX` configuration is accepted silently for upgrade compatibility.
- `status` now identifies health records left behind by an older installed version.

## [3.4.0] - 2026-08-14

### Added
- Local-only Data Movement monitoring with filename-level evidence.
- Transfer-tool lifecycle detection for scp, sftp, rsync and rclone.
- Monitored-file removal, archive creation and external-volume write evidence.
- Correlation of file removals with recent transfer-tool activity.

### Improved
- LaunchAgent/LaunchDaemon monitoring now compares effective persistence behaviour separately from raw file hashes.
- Metadata-only plist rewrites are INFO instead of repeated HIGH persistence alerts.
- Dashboard monitoring coverage includes Data Movement.
- Includes the latest compact security-status wording and severity-card toggle fix.

## [3.3.3] - 2026-08-13

### Fixed
- Canonical remote-access settings snapshots so harmless output reordering cannot create HIGH events.
- Separated Remote Login, Screen Sharing and Remote Apple Events configuration from remote-tool lifecycle and network-connection evidence.
- Apple Remote Desktop process state is tracked as a remote-tool lifecycle signal rather than a settings snapshot value.
- Removed duplicate Remote Login tracking from the general macOS security snapshot.
- Added truthful baseline descriptions that explain a starting point was recorded rather than claiming a change occurred.
- Corrected current-posture health semantics: FileVault, Firewall, SIP and Gatekeeper are healthy when ON, while remote-access features are healthy when OFF unless intentionally used.
- Improved Firewall detection using Apple Application Firewall tooling with a legacy fallback.

### Improved
- Severity cards are explicitly labelled as recorded event history rather than current security status.
- Firewall UNKNOWN is shown as UNAVAILABLE with explanatory context.

## [3.3.2] - 2026-08-13

### Fixed
- Tracks each remote-support product independently, so an always-running management tool no longer hides another tool starting or stopping.
- Emits specific `TeamViewer started` / `TeamViewer stopped` style events instead of one aggregate remote-software state.
- Tracks external network connections per remote-support product and records when each connection ends.
- Initial remote-tool observations now say the tool was already running when monitoring started instead of claiming it just started.
- Initial baseline events now explain that MacAudit recorded a starting point rather than implying a change occurred.
- Event detail text now uses the specific interpreted event message instead of repeating a generic category title.
- Notification text now uses the specific event message.

## [3.3.1] - 2026-08-13

### Fixed
- Corrected per-collector snapshot isolation so remote-access, security, persistence, identity, device-management and software checks can no longer compare against another collector's baseline.
- Migrates away invalid shared `standard.current` and `slow.current` snapshot files created by the earlier Bash scoping bug.
- Baseline command now forces all scan groups to rebuild their snapshots.
- Smart interpreted event text is now the visible dashboard headline instead of being hidden in the expanded details.
- Added a clearer remote-access change summary while retaining full raw system evidence.

All notable changes to MacAudit are documented here.

## [3.3.0] - 2026-08-13

### Added
- Intelligent event summaries for software, startup items, users/administrators, and macOS security settings
- Added/removed/modified counts in human-readable event messages
- Administrator access grant/revocation descriptions
- Individual security-setting change descriptions

### Improved
- Raw forensic diffs remain available under System log / raw evidence
- Dashboard event titles now explain what actually changed instead of exposing raw baseline mechanics
- Startup-item hashes remain available for verification without dominating the normal dashboard view

## [3.2.5] - 2026-07-30

### Added
- Local authenticated dashboard
- Clickable severity cards
- Date filtering
- Human-readable event summaries
- Expandable raw system evidence
- Native macOS notifications
- Collector heartbeat
- Active/resolved event tracking

### Improved
- Dashboard layout and usability
- Remote tool detection
- Installation verification
- Configuration validation
- Apple Silicon compatibility
- Event retention handling

### Fixed
- Initial scan verification
- Stale collector lock recovery
- Notification cooldown logic
- Bash startup issue (`set -u`)
- Dashboard label wrapping
- Event pruning

## [3.2.0]
- Dashboard introduced.

## [2.0.0]
- Improved detection accuracy and notifications.

## [1.0.0]
- Initial public release.
