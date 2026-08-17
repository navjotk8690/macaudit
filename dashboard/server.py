#!/usr/bin/env python3
from __future__ import annotations
import hashlib, hmac, json, os, plistlib, re, secrets, subprocess, threading, time
from datetime import datetime, timedelta, timezone
from collections import Counter, deque
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse

HOST='127.0.0.1'; BASE=Path('/Library/Application Support/MacAudit'); WEB=Path(__file__).resolve().parent/'web'
TOKEN_FILE=BASE/'dashboard.token'; EVENTS=BASE/'dashboard-events.jsonl'; RAW_EVENTS=Path('/Library/Logs/MacAudit/events.jsonl'); HEALTH=BASE/'health.json'; PRESENCE_SAMPLES=BASE/'state'/'presence-samples.tsv'
PORT=int(os.environ.get('MACAUDIT_DASHBOARD_PORT','8765'));

SYSTEM_APP_NAMES = {
    'AirPlayUIAgent','AXVisualSupportAgent','BackgroundTaskManagementAgent','ControlCenter',
    'CoreLocationAgent','CoreServicesUIAgent','Dock','Finder','identityservicesd','imagent',
    'IMAutomaticHistoryDeletionAgent','Keychain Circle Notification','LinkedNotesUIService','loginwindow',
    'MobileDeviceUpdater','NotificationCenter','Spotlight','SystemUIServer','TextInputMenuAgent',
    'TextInputSwitcher','UIKitSystem','universalAccessAuthWarn','UserNotificationCenter','WallpaperAgent',
    'WiFiAgent','WindowManager'
}
SECURITY_REMOTE_NAMES = {
    'EndpointAgentDaemon','ExpressVPN','JumpCloudApp','Microsoft Remote Desktop','RTProtectionDaemon','UTunnel'
}
BACKGROUND_NAMES = {
    'Adobe Desktop Service','AdobeIPCBroker','CCXProcess','Core Sync','Creative Cloud',
    'Creative Cloud Helper','DisplayLink Manager','Microsoft AutoUpdate','OneDrive','Postman Agent'
}
USER_APP_NAMES = {
    '1Password','Adobe Acrobat','Google Chrome','Mail','Messages','Microsoft Excel','Microsoft Outlook',
    'Microsoft Teams','Microsoft Word','Notes','Script Editor','Slack','Spotify','SQLPro Studio',
    'Sublime Text','Terminal','Visual Studio Code','Xcode'
}
AMBIGUOUS_NAMES = {'UserAgent','SettingsDaemon','System Monitoring'}
BACKGROUND_NAME_RE = re.compile(r'(helper|agent|daemon|service|sync|updater|update|broker|manager)$', re.I)


def application_role(name, path, user):
    # Prefer concrete identity/path evidence over a generic process-name guess.
    if path.startswith('/System/') or name in SYSTEM_APP_NAMES:
        return 'system'
    if name in SECURITY_REMOTE_NAMES:
        return 'security_remote'
    if name in USER_APP_NAMES:
        return 'user'
    if name in BACKGROUND_NAMES:
        return 'background'
    if name in AMBIGUOUS_NAMES:
        return 'unclassified'
    # Normal .app bundles launched from the user's or system Applications folders are
    # treated as user apps unless their name clearly identifies a helper component.
    if (path.startswith('/Applications/') or '/Applications/' in path) and not BACKGROUND_NAME_RE.search(name):
        return 'user'
    if BACKGROUND_NAME_RE.search(name):
        return 'background'
    # Root ownership alone is not enough evidence to call something security-related
    # or disposable. Unknown processes are shown separately for review.
    return 'unclassified'

def live_presence():
    user=command('/usr/bin/stat','-f','%Su','/dev/console')
    if not user or user in {'root','loginwindow'}:
        return {'state':'LOGGED_OUT','input_state':'NO USER','idle_seconds':0,'user':user or 'none','screen':'LOGGED OUT','system':'AWAKE'}
    idle_seconds=None
    idle_raw=command('/usr/sbin/ioreg','-c','IOHIDSystem','-r','-d','1')
    m=re.search(r'"?HIDIdleTime"?\s*=\s*(\d+)', idle_raw)
    if m:
        idle_seconds=int(m.group(1))//1_000_000_000
    locked=False
    try:
        raw=subprocess.run(['/usr/sbin/ioreg','-n','Root','-d1','-a'],capture_output=True,timeout=3,check=False).stdout
        roots=plistlib.loads(raw) if raw else []
        users=(roots[0] if roots else {}).get('IOConsoleUsers',[])
        for item in users:
            item_user=str(item.get('kCGSSessionUserNameKey',item.get('CGSSessionUserNameKey','')))
            if item_user==user:
                locked=bool(item.get('CGSSessionScreenIsLocked'))
                break
    except Exception:
        pass
    display_raw=command('/usr/sbin/ioreg','-r','-n','IODisplayWrangler','-d','1')
    display_asleep=bool(re.search(r'"CurrentPowerState"\s*=\s*[0-3](?:\s|$)',display_raw))
    away_threshold=600
    try:
        conf=(BASE/'macaudit.conf').read_text()
        mm=re.search(r'^PRESENCE_AWAY_SECONDS=(\d+)\s*$',conf,re.M)
        if mm: away_threshold=max(60,int(mm.group(1)))
    except OSError:
        pass
    if locked:
        state='LOCKED'; screen='LOCKED'
    elif display_asleep:
        state='AWAY'; screen='DISPLAY ASLEEP'
    elif idle_seconds is None:
        state='UNKNOWN'; screen='UNLOCKED'
    elif idle_seconds>=away_threshold:
        state='AWAY'; screen='UNLOCKED'
    else:
        state='ACTIVE'; screen='UNLOCKED'
    input_state='ACTIVE' if idle_seconds is not None and idle_seconds<away_threshold else 'IDLE' if idle_seconds is not None else 'UNKNOWN'
    return {'state':state,'input_state':input_state,'idle_seconds':idle_seconds or 0,'user':user,'screen':screen,'system':'AWAKE'}

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
        applications.append({'name':name,'pid':int(pid),'user':user,'elapsed':elapsed,'path':app_path,'executable':exe,'role':application_role(name,app_path,user)})
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
        'firewall_on':firewall, 'tools':tools, 'applications':applications, 'presence':live_presence(),
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

def activity_summary(qs):
    now=datetime.now(timezone.utc)
    requested_start=parse_bound(qs.get('date_from',[''])[0])
    requested_end=parse_bound(qs.get('date_to',[''])[0]) or now
    requested_end=min(requested_end,now)
    rows=[]
    try:
        for raw in PRESENCE_SAMPLES.read_text(errors='replace').splitlines():
            parts=raw.split('\t')
            if len(parts)<3: continue
            try: epoch=int(parts[0]); idle=int(parts[2])
            except ValueError: continue
            rows.append((datetime.fromtimestamp(epoch,timezone.utc),parts[1].upper(),idle))
    except OSError:
        pass
    rows.sort(key=lambda x:x[0])
    if not rows:
        return {'available':False,'message':'Activity tracking begins after installing MacAudit 3.4.23.'}
    first=rows[0][0]
    start=max(requested_start or first,first)
    end=max(start,requested_end)
    selected=[r for r in rows if start<=r[0]<=end]
    if not selected:
        return {'available':False,'tracking_started':first.isoformat().replace('+00:00','Z'),'message':'No presence samples were recorded in this period.'}
    totals={'ACTIVE':0,'AWAY':0,'LOCKED':0,'LOGGED_OUT':0,'UNKNOWN':0}
    sessions=[]; max_contiguous=180; nominal=60
    for i,(ts,state,idle) in enumerate(selected):
        nxt=selected[i+1][0] if i+1<len(selected) else end
        delta=max(0,(nxt-ts).total_seconds())
        credited=min(delta,nominal if delta>max_contiguous else delta)
        state=state if state in totals else 'UNKNOWN'
        totals[state]+=credited
        session_end=ts+timedelta(seconds=credited)
        if credited<=0: continue
        if sessions and sessions[-1]['state']==state and (ts-sessions[-1]['end']).total_seconds()<=max_contiguous:
            sessions[-1]['end']=session_end
        else:
            sessions.append({'state':state,'start':ts,'end':session_end})
    observed=sum(totals.values())
    tracked=max(0,(end-start).total_seconds())
    unobserved=max(0,tracked-observed)
    compact=[]
    for sess in sessions[-8:]:
        compact.append({'state':sess['state'],'start':sess['start'].isoformat().replace('+00:00','Z'),'end':sess['end'].isoformat().replace('+00:00','Z'),'seconds':int((sess['end']-sess['start']).total_seconds())})
    return {
        'available':True,'tracking_started':first.isoformat().replace('+00:00','Z'),
        'period_start':start.isoformat().replace('+00:00','Z'),'period_end':end.isoformat().replace('+00:00','Z'),
        'active_seconds':int(totals['ACTIVE']),
        'idle_seconds':int(totals['AWAY']),
        'locked_seconds':int(totals['LOCKED']),
        'logged_out_seconds':int(totals['LOGGED_OUT']),
        'unknown_seconds':int(totals['UNKNOWN']),
        'observed_seconds':int(observed),'unobserved_seconds':int(unobserved),
        'sessions':compact
    }

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
    server_version='MacAuditDashboard/3.4.23'; protocol_version='HTTP/1.1'
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
            return self.json({'severity':severity,'total':len(filtered),'active_count':len(active),'health':health,'collector_status':status,'status':live_status(),'monitoring':monitoring_config(),'activity':activity_summary(qs)})
        if parsed.path=='/api/health': return self.json({'ok':True})
        path='/index.html' if parsed.path=='/' else parsed.path; target=(WEB/path.lstrip('/')).resolve()
        if WEB.resolve() not in target.parents or not target.is_file(): self.send_error(404); return
        mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}.get(target.suffix,'application/octet-stream'); data=target.read_bytes()
        self.send_response(200); self.common(mime,len(data)); self.end_headers(); self.wfile.write(data)

if __name__=='__main__':
    if not token(): raise SystemExit('MacAudit dashboard token is missing')
    srv=Server((HOST,PORT),Handler); srv.timeout=10; print(f'MacAudit dashboard listening on {HOST}:{PORT}',flush=True); srv.serve_forever()
