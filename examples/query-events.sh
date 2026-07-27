#!/bin/bash
LOG=/Library/Logs/MacAudit/events.jsonl
case "${1:-high}" in
  critical) grep '"severity":"CRITICAL"' "$LOG" ;;
  high) grep -E '"severity":"(CRITICAL|HIGH)"' "$LOG" ;;
  remote) grep -E '"category":"(remote-access|remote-session|ssh|network)"' "$LOG" ;;
  *) cat "$LOG" ;;
esac
