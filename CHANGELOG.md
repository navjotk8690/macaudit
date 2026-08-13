# Changelog

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
