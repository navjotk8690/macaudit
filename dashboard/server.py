#!/usr/bin/env python3
from __future__ import annotations
import hashlib, hmac, json, os, re, secrets, subprocess, threading, time
from datetime import datetime, timezone
from collections import Counter, deque
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse

HOST='127.0.0.1'; BASE=Path('/Library/Application Support/MacAudit'); WEB=Path(__file__).resolve().parent/'web'
TOKEN_FILE=BASE/'dashboard.token'; EVENTS=BASE/'dashboard-events.jsonl'; RAW_EVENTS=Path('/Library/Logs/MacAudit/events.jsonl'); HEALTH=BASE/'health.json'
PORT=int(os.environ.get('MACAUDIT_DASHBOARD_PORT','8765'));
REMOTE_TOOLS = {
    "Apple Remote Desktop": [r"/ARDAgent(?:\s|$)"],
    "Screen Sharing": [r"/screensharingd(?:\s|$)"],
    "JumpCloud Assist": [r"jumpcloud-assist-(?:service|launcher)"],
    # Do not treat TeamViewer's KeychainService or uninstall helpers as an
    # active remote-control process. The GUI/desktop/service processes count.
    "TeamViewer": [r"/Applications/TeamViewer\.app/Contents/MacOS/TeamViewer(?:\s|$)", r"TeamViewer_(?:Service|Desktop)(?:\s|$)"],
    "AnyDesk": [r"AnyDesk"],
    "Splashtop": [r"Splashtop"],
    "RustDesk": [r"RustDesk"],
    "ScreenConnect / ConnectWise": [r"ScreenConnect", r"ConnectWise"],
    "BeyondTrust / Bomgar": [r"BeyondTrust", r"Bomgar"],
    "LogMeIn": [r"LogMeIn"],
    "VNC": [r"RealVNC", r"TigerVNC", r"VNC Server"],
}

def command(*args):
    try:
        return subprocess.run(args, capture_output=True, text=True, timeout=3, check=False).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ''

def contains_on(text):
    t=text.lower()
    if any(x in t for x in (' off', ': off', 'disabled', 'not enabled', 'not_loaded', 'not running')): return False
    if any(x in t for x in (' on', ': on', 'enabled', 'active', 'loaded', 'running')): return True
    return None

def live_status():
    remote_login=contains_on(command('/usr/sbin/systemsetup','-getremotelogin'))
    remote_apple=contains_on(command('/usr/sbin/systemsetup','-getremoteappleevents'))
    screen=bool(command('/bin/launchctl','print','system/com.apple.screensharing'))
    processes=command('/bin/ps','-axo','command=')
    lines=processes.splitlines()
    app_rows=command('/bin/ps','-axo','pid=,user=,etime=,command=').splitlines()
    applications=[]
    seen_apps=set()
    for row in app_rows:
        m=re.match(r'\s*(\d+)\s+(\S+)\s+(\S+)\s+(.+?\.app/Contents/MacOS/[^\s]+)(?:\s|$)',row)
        if not m: continue
        pid,user,elapsed,exe=m.groups()
        app_path=exe.split('.app/',1)[0]+'.app'
        name=Path(app_path).stem
        key=(user,app_path)
        if key in seen_apps: continue
        seen_apps.add(key)
        applications.append({'name':name,'pid':int(pid),'user':user,'elapsed':elapsed,'path':app_path,'executable':exe})
    applications.sort(key=lambda x:x['name'].lower())
    tools={name:any(re.search(pattern, line, re.IGNORECASE) for line in lines for pattern in patterns) for name,patterns in REMOTE_TOOLS.items()}
    sip=contains_on(command('/usr/bin/csrutil','status'))
    gatekeeper=contains_on(command('/usr/sbin/spctl','--status'))
    filevault=contains_on(command('/usr/bin/fdesetup','status'))
    firewall_text=command('/usr/libexec/ApplicationFirewall/socketfilterfw','--getglobalstate')
    firewall=contains_on(firewall_text) if firewall_text else None
    if firewall is None:
        firewall_raw=command('/usr/bin/defaults','read','/Library/Preferences/com.apple.alf','globalstate')
        firewall=True if firewall_raw in {'1','2'} else False if firewall_raw=='0' else None
    return {
        'remote_login':remote_login, 'remote_apple_events':remote_apple,
        'screen_sharing_loaded':screen, 'ard_running':tools.get('Apple Remote Desktop',False),
        'sip_on':sip, 'gatekeeper_on':gatekeeper, 'filevault_on':filevault,
        'firewall_on':firewall, 'tools':tools, 'applications':applications,
    }

def monitoring_config():
    values={'tcc':True,'unified_logs':True,'data_movement':True}
    conf=BASE/'macaudit.conf'
    try:
        for raw in conf.read_text().splitlines():
            line=raw.strip()
            if not line or line.startswith('#') or '=' not in line: continue
            k,v=(x.strip() for x in line.split('=',1))
            if k=='ENABLE_TCC_SCAN': values['tcc']=v=='1'
            elif k=='ENABLE_UNIFIED_LOG_SCAN': values['unified_logs']=v=='1'
            elif k=='ENABLE_DATA_MOVEMENT_SCAN': values['data_movement']=v=='1'
    except OSError: pass
    return values

CACHE_LOCK=threading.Lock(); CACHE={'at':0.0,'events':[],'health':{}}


def parse_event_time(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace('Z','+00:00')).astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None

def parse_bound(value):
    if not value:
        return None
    try:
        dt=datetime.fromisoformat(str(value).replace('Z','+00:00'))
        if dt.tzinfo is None: dt=dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None

def filter_events(events, qs):
    sev=qs.get('severity',[''])[0].upper()
    q=qs.get('q',[''])[0].lower()[:100]
    presence=qs.get('presence',[''])[0].upper()
    date_from=parse_bound(qs.get('date_from',[''])[0])
    date_to=parse_bound(qs.get('date_to',[''])[0])
    out=[]
    for event in events:
        if sev and str(event.get('severity','')).upper()!=sev: continue
        if q and q not in json.dumps(event).lower(): continue
        if presence:
            ps=str(event.get('presence_state','')).upper()
            if presence=='AWAY' and ps not in {'AWAY','LOCKED','LOGGED_OUT'}: continue
            if presence=='ACTIVE' and ps!='ACTIVE': continue
            if presence in {'LOCKED','LOGGED_OUT','UNKNOWN'} and ps!=presence: continue
        if date_from or date_to:
            timestamp=parse_event_time(event.get('timestamp'))
            if timestamp is None: continue
            if date_from and timestamp<date_from: continue
            if date_to and timestamp>date_to: continue
        out.append(event)
    return out

def token():
    try: return TOKEN_FILE.read_text().strip()
    except OSError: return ''

def session_value(t:str)->str: return hashlib.sha256(('MacAudit:'+t).encode()).hexdigest()

def cached():
    now=time.monotonic()
    with CACHE_LOCK:
        if now-CACHE['at']<3: return CACHE['events'],CACHE['health']
        ev=[]
        try:
            with EVENTS.open(encoding='utf-8',errors='replace') as f:
                for line in f:
                    try:
                        item=json.loads(line)
                        if isinstance(item,dict): ev.append(item)
                    except json.JSONDecodeError: pass
        except OSError: pass
        # Add system-generated evidence to older dashboard records that were
        # created before evidence was included in dashboard-events.jsonl.
        evidence_by_key={}
        try:
            with RAW_EVENTS.open(encoding='utf-8',errors='replace') as f:
                for line in f:
                    try:
                        raw=json.loads(line)
                        if isinstance(raw,dict):
                            key=(raw.get('timestamp'),raw.get('category'),raw.get('message'),raw.get('state'))
                            evidence_by_key[key]=raw.get('evidence','')
                    except json.JSONDecodeError: pass
        except OSError: pass
        for item in ev:
            if not item.get('evidence'):
                key=(item.get('timestamp'),item.get('category'),item.get('message'),item.get('state'))
                item['evidence']=evidence_by_key.get(key,'')
        try: health=json.loads(HEALTH.read_text())
        except (OSError,json.JSONDecodeError): health={}
        CACHE.update(at=now,events=ev,health=health); return ev,health

class Server(ThreadingHTTPServer):
    daemon_threads=True; request_queue_size=20

class Handler(BaseHTTPRequestHandler):
    server_version='MacAuditDashboard/3.4.13'; protocol_version='HTTP/1.1'
    def log_message(self,*_): pass
    def common(self,ctype,length):
        self.send_header('Content-Type',ctype); self.send_header('Content-Length',str(length)); self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff'); self.send_header('X-Frame-Options','DENY'); self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Permissions-Policy','camera=(), microphone=(), geolocation=()')
        self.send_header('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'")
    def json(self,obj,status=200):
        data=json.dumps(obj,separators=(',',':')).encode(); self.send_response(status); self.common('application/json; charset=utf-8',len(data)); self.end_headers(); self.wfile.write(data)
    def authed(self):
        expected=session_value(token()); jar=cookies.SimpleCookie(self.headers.get('Cookie','')); got=jar.get('macaudit_session')
        return bool(expected and got and hmac.compare_digest(got.value,expected))
    def do_GET(self):
        if self.headers.get('Host','').split(':')[0] not in {'127.0.0.1','localhost'}: return self.json({'error':'invalid host'},400)
        parsed=urlparse(self.path); qs=parse_qs(parsed.query)
        if parsed.path=='/' and qs.get('token'):
            supplied=qs['token'][0]; expected=token()
            if expected and hmac.compare_digest(supplied,expected):
                self.send_response(303); self.send_header('Location','/'); self.send_header('Set-Cookie',f'macaudit_session={session_value(expected)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200'); self.send_header('Cache-Control','no-store'); self.send_header('Content-Length','0'); self.end_headers(); return
            return self.json({'error':'invalid dashboard token'},403)
        if parsed.path.startswith('/api/') and not self.authed(): return self.json({'error':'authentication required'},401)
        if parsed.path=='/api/events':
            try: limit=max(1,min(int(qs.get('limit',['300'])[0]),1000))
            except ValueError: return self.json({'error':'limit must be a number'},400)
            ev,_=cached(); out=filter_events(ev,qs)
            return self.json({'events':list(reversed(out[-limit:])), 'count':len(out)})
        if parsed.path=='/api/summary':
            ev,health=cached(); filtered=filter_events(ev,qs); severity=Counter(str(e.get('severity','INFO')).upper() for e in filtered); active=[e for e in filtered if e.get('state')=='active']
            status='healthy'
            completed=health.get('completed_at')
            if not completed: status='unknown'
            else:
                try:
                    age=(datetime.now(timezone.utc)-datetime.fromisoformat(completed.replace('Z','+00:00'))).total_seconds()
                    if age>600: status='stale'
                except Exception: status='unknown'
            return self.json({'severity':severity,'total':len(filtered),'active_count':len(active),'health':health,'collector_status':status,'status':live_status(),'monitoring':monitoring_config()})
        if parsed.path=='/api/health': return self.json({'ok':True})
        path='/index.html' if parsed.path=='/' else parsed.path; target=(WEB/path.lstrip('/')).resolve()
        if WEB.resolve() not in target.parents or not target.is_file(): self.send_error(404); return
        mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}.get(target.suffix,'application/octet-stream'); data=target.read_bytes()
        self.send_response(200); self.common(mime,len(data)); self.end_headers(); self.wfile.write(data)

if __name__=='__main__':
    if not token(): raise SystemExit('MacAudit dashboard token is missing')
    srv=Server((HOST,PORT),Handler); srv.timeout=10; print(f'MacAudit dashboard listening on {HOST}:{PORT}',flush=True); srv.serve_forever()
