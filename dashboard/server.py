#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import time
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HOST = os.environ.get("MACAUDIT_DASHBOARD_HOST", "127.0.0.1")
PORT = int(os.environ.get("MACAUDIT_DASHBOARD_PORT", "8765"))
LOG_DIR = Path("/Library/Logs/MacAudit")
EVENTS = LOG_DIR / "events.jsonl"
WEB_DIR = Path(__file__).resolve().parent / "web"


def read_events(limit: int = 500) -> list[dict]:
    if not EVENTS.exists():
        return []
    try:
        lines = EVENTS.read_text(encoding="utf-8", errors="replace").splitlines()[-max(1, min(limit, 5000)):]
    except OSError:
        return []
    out = []
    for line in lines:
        try:
            item = json.loads(line)
            if isinstance(item, dict):
                out.append(item)
        except json.JSONDecodeError:
            continue
    return out


def run(cmd: list[str]) -> str:
    try:
        return subprocess.run(cmd, text=True, capture_output=True, timeout=4, check=False).stdout.strip()
    except Exception:
        return ""


def current_status() -> dict:
    remote_login = run(["/usr/sbin/systemsetup", "-getremotelogin"])
    ard = bool(run(["/usr/bin/pgrep", "-x", "ARDAgent"]))
    screen = subprocess.run(["/bin/launchctl", "print", "system/com.apple.screensharing"], capture_output=True).returncode == 0
    processes = run(["/bin/ps", "-axo", "pid=,user=,command="])
    tools = {}
    signatures = {
        "TeamViewer": "TeamViewer",
        "AnyDesk": "AnyDesk",
        "Splashtop": "Splashtop",
        "RustDesk": "RustDesk",
        "Apple Remote Desktop": "ARDAgent",
    }
    lower = processes.lower()
    for label, needle in signatures.items():
        tools[label] = needle.lower() in lower
    return {
        "remote_login": "On" in remote_login,
        "remote_login_text": remote_login or "Unknown",
        "screen_sharing_loaded": screen,
        "ard_running": ard,
        "tools": tools,
        "last_scan": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(EVENTS.stat().st_mtime)) if EVENTS.exists() else None,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "MacAuditDashboard/2.0"

    def log_message(self, fmt: str, *args) -> None:
        return

    def send_json(self, payload: object, status: int = 200) -> None:
        data = json.dumps(payload, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/events":
            qs = parse_qs(parsed.query)
            limit = int(qs.get("limit", ["500"])[0])
            events = read_events(limit)
            severity = qs.get("severity", [""])[0].upper()
            category = qs.get("category", [""])[0].lower()
            query = qs.get("q", [""])[0].lower()
            if severity:
                events = [e for e in events if str(e.get("severity", "")).upper() == severity]
            if category:
                events = [e for e in events if category in str(e.get("category", "")).lower()]
            if query:
                events = [e for e in events if query in json.dumps(e).lower()]
            self.send_json({"events": list(reversed(events)), "count": len(events)})
            return
        if parsed.path == "/api/summary":
            events = read_events(5000)
            severity = Counter(str(e.get("severity", "INFO")).upper() for e in events)
            categories = Counter(str(e.get("category", "unknown")) for e in events)
            self.send_json({
                "total": len(events),
                "severity": severity,
                "categories": categories.most_common(10),
                "status": current_status(),
            })
            return
        if parsed.path == "/api/health":
            self.send_json({"ok": True})
            return

        path = parsed.path
        if path == "/":
            path = "/index.html"
        target = (WEB_DIR / path.lstrip("/")).resolve()
        if WEB_DIR.resolve() not in target.parents and target != WEB_DIR.resolve():
            self.send_error(403)
            return
        if not target.exists() or not target.is_file():
            self.send_error(404)
            return
        mime = "text/html; charset=utf-8"
        if target.suffix == ".js":
            mime = "application/javascript; charset=utf-8"
        elif target.suffix == ".css":
            mime = "text/css; charset=utf-8"
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"MacAudit dashboard listening on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()
