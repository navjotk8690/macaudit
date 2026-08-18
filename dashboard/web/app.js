const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let summaryData=null;
let lastEventsSignature="";

async function json(url){const r=await fetch(url,{cache:'no-store'});if(r.status===401)throw new Error('Open the dashboard with: sudo /usr/local/libexec/macaudit dashboard');if(!r.ok)throw new Error(`Dashboard error ${r.status}`);return r.json()}
function flag(label,value,type='protection',description=''){const known=value===true||value===false;let cls='unknown',text='UNAVAILABLE';if(known){if(type==='protection'){if(value){cls='ok';text='ON'}else{cls='attention';text='OFF'}}else if(type==='remote'){if(value){cls='attention';text='ENABLED'}else{cls='ok';text='DISABLED'}}}const tip=!known?`${description}. MacAudit could not determine this status on the current scan.`:description;return `<div class="status-row" title="${esc(tip)}"><span class="status-copy"><b>${esc(label)}</b></span><span class="pill ${cls}">${text}</span></div>`}
function monitor(label,group,description,enabled=true){return `<div class="monitor" title="${esc(description)}"><span><b>${esc(label)}</b><small>${esc(description)}</small></span><span class="group">${enabled?esc(group):'Disabled'}</span></div>`}
function when(v){if(!v)return'Not yet';const d=new Date(v);return isNaN(d)?esc(v):d.toLocaleString()}
function baselineSummary(category){
  const map={
    'privacy-permissions':'MacAudit recorded the current privacy permissions as the starting point for future comparisons.',
    'software':'MacAudit recorded the currently installed applications and packages as the starting point for future comparisons.',
    'persistence':'MacAudit recorded the current automatic-start items as the starting point for future comparisons.',
    'security-settings':'MacAudit recorded the current macOS security settings as the starting point for future comparisons.',
    'identity':'MacAudit recorded the current local users and administrators as the starting point for future comparisons.',
    'remote-access':'MacAudit recorded the current remote-access settings as the starting point for future comparisons.',
    'ssh':'MacAudit recorded the current SSH configuration as the starting point for future comparisons.',
    'device-management':'MacAudit recorded the current device-management state as the starting point for future comparisons.',
    'data-movement':'MacAudit recorded the current monitored files as the starting point for future move and removal comparisons.'
  };
  return map[category]||'MacAudit recorded the current state as the starting point for future comparisons.'
}
function eventKey(e){
  const raw=[e.timestamp,e.category,e.message||e.title,e.state,e.severity].join('|');
  let h=2166136261;
  for(let i=0;i<raw.length;i++){h^=raw.charCodeAt(i);h=Math.imul(h,16777619)}
  return (h>>>0).toString(16);
}
function captureEventViewState(){
  const open=new Set();
  document.querySelectorAll('#events .event[data-event-key]').forEach(event=>{
    const key=event.dataset.eventKey;
    event.querySelectorAll('details[open]').forEach(d=>open.add(`${key}:${d.dataset.detail||''}`));
  });
  return {open,scrollY:window.scrollY};
}
function restoreEventViewState(state){
  if(!state)return;
  document.querySelectorAll('#events .event[data-event-key]').forEach(event=>{
    const key=event.dataset.eventKey;
    event.querySelectorAll('details').forEach(d=>{if(state.open.has(`${key}:${d.dataset.detail||''}`))d.open=true});
  });
  window.scrollTo({top:state.scrollY,left:window.scrollX,behavior:'auto'});
}
function renderEvent(e){
  const cleared=e.state==='cleared'?'<span class="cleared">RESOLVED</span>':'';
  const isBaseline=e.state==='baseline';
  const headline=e.message||e.title||'MacAudit recorded a system change.';
  const context=isBaseline?baselineSummary(e.category):(e.summary||e.title||'MacAudit recorded a system change.');
  const normal=isBaseline?'This is expected after first installation, an upgrade that rebuilds a collector baseline, or a manual baseline reset.':(e.normal_when||'When you or trusted IT staff made the change.');
  const action=isBaseline?'No action is required. Future scans will compare against this recorded state.':(e.recommended_action||'Confirm that you expected this activity.');
  const human=`<details class="detail-toggle" data-detail="explanation"><summary>Explanation and recommended action</summary><div class="explanation"><strong>What MacAudit detected:</strong> ${esc(headline)}<br><strong>When this may be normal:</strong> ${esc(normal)}<br><strong>What to check:</strong> ${esc(action)}</div></details>`;
  const evidence=String(e.evidence||'').trim();
  const presenceState=String(e.presence_state||'');
  const presenceLabel=e.presence_label||({ACTIVE:'User active at the Mac',AWAY:'User away / idle',LOCKED:'Screen locked',LOGGED_OUT:'No logged-in console user',UNKNOWN:'User presence could not be determined'}[presenceState]||'');
  const presence=presenceLabel?`<div class="presence-note presence-${esc(presenceState.toLowerCase())}">${esc(presenceLabel)}${Number.isFinite(Number(e.idle_seconds))&&Number(e.idle_seconds)>0?` · idle ${Math.floor(Number(e.idle_seconds)/60)} min`:''}</div>`:'';
  const collector=e.collector_version?`<span class="collector-note">Collector ${esc(e.collector_version)}</span>`:'';
  const system=evidence?`<details class="detail-toggle system-log" data-detail="system"><summary>System log / raw evidence</summary><div class="log-note">Original system-generated output captured when this event was detected.</div><pre>${esc(evidence)}</pre></details>`:`<details class="detail-toggle system-log" data-detail="system"><summary>System log / raw evidence</summary><div class="log-note">No raw system output was captured for this event.</div></details>`;
  return `<div class="event" data-event-key="${eventKey(e)}"><time>${when(e.timestamp)}</time><div class="sev sev-${esc(e.severity)}">${esc(e.severity)}${cleared}</div><div class="category">${esc(e.category)}</div><div><div class="message">${esc(headline)}</div><div class="summary">${esc(context)}</div>${presence}${collector}<div class="event-details">${human}${system}</div></div></div>`
}

function localDateValue(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
function startOfDay(d){const x=new Date(d);x.setHours(0,0,0,0);return x}
function endOfDay(d){const x=new Date(d);x.setHours(23,59,59,999);return x}
function dateRange(){
  const preset=$('#datePreset').value,now=new Date();let from=null,to=null;
  if(preset==='today'){from=startOfDay(now);to=endOfDay(now)}
  else if(preset==='yesterday'){const d=new Date(now);d.setDate(d.getDate()-1);from=startOfDay(d);to=endOfDay(d)}
  else if(preset==='7days'){const d=new Date(now);d.setDate(d.getDate()-6);from=startOfDay(d);to=endOfDay(now)}
  else if(preset==='30days'){const d=new Date(now);d.setDate(d.getDate()-29);from=startOfDay(d);to=endOfDay(now)}
  else if(preset==='custom'){
    const a=$('#dateFrom').value,b=$('#dateTo').value;
    if(a)from=startOfDay(new Date(`${a}T00:00:00`));
    if(b)to=endOfDay(new Date(`${b}T00:00:00`));
  }
  return {from:from&&!isNaN(from)?from.toISOString():'',to:to&&!isNaN(to)?to.toISOString():''};
}
function dateLabel(){const p=$('#datePreset');return p.options[p.selectedIndex]?.text||'Selected dates'}
function dateQuery(){const r=dateRange();return `date_from=${encodeURIComponent(r.from)}&date_to=${encodeURIComponent(r.to)}`}
function initialiseDates(){const now=new Date();$('#dateFrom').value=localDateValue(now);$('#dateTo').value=localDateValue(now)}

function updateCardSelection(){const selected=$('#severity').value;document.querySelectorAll('.card').forEach(card=>{const active=card.dataset.severity===selected;card.classList.toggle('active',active);card.setAttribute('aria-pressed',String(active))});const note=$('#activeFilter');if(selected){note.hidden=false;note.textContent=`Showing ${selected.toLowerCase()} events for ${dateLabel().toLowerCase()}. Click the selected card again to show all severities.`}else{note.hidden=true;note.textContent=''}}
function severityCard(level,count){return `<button type="button" class="card" data-severity="${level}" aria-pressed="false" title="Show ${level.toLowerCase()} events"><div class="label">${level}</div><div class="number sev-${level}">${count||0}</div><div class="hint">Click to filter</div></button>`}

function durationLabel(seconds){
  seconds=Math.max(0,Number(seconds)||0);const mins=Math.round(seconds/60);
  if(mins<1)return '< 1 min';if(mins<60)return `${mins} min`;
  const h=Math.floor(mins/60),m=mins%60;return m?`${h}h ${m}m`:`${h}h`;
}
function sessionTime(v){const d=new Date(v);return isNaN(d)?'':d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}
function renderActivity(a){
  const box=$('#activitySummary'),sessions=$('#activitySessions');
  if(!a||!a.available){box.innerHTML=`<div class="activity-empty">${esc(a?.message||'Activity sampling is not available yet.')}</div>`;sessions.innerHTML='';return}
  const locked=(a.locked_seconds||0)+(a.logged_out_seconds||0);
  box.innerHTML=`<div class="activity-stat active-stat"><span>Active</span><strong>${durationLabel(a.active_seconds)}</strong></div><div class="activity-stat idle-stat"><span>Away / idle</span><strong>${durationLabel(a.idle_seconds)}</strong></div><div class="activity-stat"><span>Locked / logged out</span><strong>${durationLabel(locked)}</strong></div><div class="activity-stat"><span>Not observed</span><strong>${durationLabel(a.unobserved_seconds)}</strong></div>`;
  const labels={ACTIVE:'Active',AWAY:'Away / idle',LOCKED:'Locked',LOGGED_OUT:'Logged out',UNKNOWN:'Unknown'};
  sessions.innerHTML=(a.sessions||[]).length?`<div class="session-label">Recent periods</div><div class="session-list">${a.sessions.map(x=>`<span class="session session-${esc(String(x.state).toLowerCase())}"><b>${esc(labels[x.state]||x.state)}</b> ${sessionTime(x.start)}–${sessionTime(x.end)}</span>`).join('')}</div>`:'';
}

async function loadSummary(){
  const d=await json(`/api/summary?${dateQuery()}`);
  summaryData=d;
  $('#activityPeriod').textContent=`${dateLabel()} · sampled locally about once per minute`;
  renderActivity(d.activity);

  const levels=['CRITICAL','HIGH','MEDIUM','LOW','INFO'];
  $('#severityCards').innerHTML=levels.map(x=>severityCard(x,d.severity[x]||0)).join('');
  updateCardSelection();

  const s=d.status||{},h=d.health||{},sys=d.system||{};
  $('#systemName').textContent=sys.model_name||'This Mac';
  const sysBits=[];
  if(sys.model_identifier)sysBits.push(sys.model_identifier);
  if(sys.chip)sysBits.push(sys.chip);
  $('#systemLine').textContent=sysBits.length?sysBits.join(' · '):'Local MacAudit monitoring';
  $('#systemOS').textContent=sys.macos_version?`macOS ${sys.macos_version}${sys.macos_build?` · ${sys.macos_build}`:''}`:'Unavailable';
  $('#systemHardware').textContent=sys.architecture?`${sys.chip||sys.architecture} · ${sys.architecture}`:(sys.chip||'Unavailable');
  $('#systemUptime').textContent=durationLabel(sys.uptime_seconds||0);
  $('#lastScan').textContent=h.completed_at?when(h.completed_at):'Not yet';
  $('#collectorVersion').textContent=h.version||'Unknown';

  $('#posture').innerHTML=`<div class="status-group"><div class="status-group-title">Remote access</div>${flag('Remote Login',s.remote_login,'remote','Allows command-line connections from another computer')}${flag('Screen Sharing',s.screen_sharing_loaded,'remote','Allows another Mac to view or control this screen')}${flag('Apple Remote Desktop',s.ard_running,'remote','Apple remote management capability')}${flag('Remote Apple Events',s.remote_apple_events,'remote','Allows remote control of scriptable applications')}</div><div class="status-group"><div class="status-group-title">Mac protection</div>${flag('FileVault',s.filevault_on,'protection','Encrypts data stored on this Mac')}${flag('Firewall',s.firewall_on,'protection','Blocks unwanted incoming network connections')}${flag('System Protection (SIP)',s.sip_on,'protection','Protects important macOS system files')}${flag('App Protection (Gatekeeper)',s.gatekeeper_on,'protection','Checks downloaded applications before they run')}</div>`;
  $('#tools').innerHTML=Object.entries(s.tools||{}).map(([n,on])=>`<div class="tool" title="${esc(n)}: ${on?'running':'not running'}"><span><i class="dot ${on?'running':'stopped'}"></i>${esc(n)}</span><strong class="${on?'tool-running':'tool-stopped'}">${on?'RUNNING':'NOT RUNNING'}</strong></div>`).join('')||'<div class="empty">Remote tool status is unavailable.</div>';

  const groups={user:[],background:[],security_remote:[],unclassified:[],system:[]};
  (s.applications||[]).forEach(a=>(groups[a.role]||groups.user).push(a));
  const appRow=a=>`<details class="app-row" title="${esc(a.path)}"><summary><span><i class="dot running"></i>${esc(a.name)}</span><strong>RUNNING</strong></summary><div class="app-meta">PID ${esc(a.pid)} · ${esc(a.user)} · runtime ${esc(a.elapsed)}<br><span>${esc(a.path)}</span></div></details>`;
  const appGroup=(key,title,note,collapsed=false)=>{const items=groups[key]||[];if(!items.length)return '';const body=items.map(appRow).join('');return collapsed?`<details class="app-group collapsed"><summary><span>${esc(title)}</span><small>${items.length} running · ${esc(note)}</small></summary><div class="app-list">${body}</div></details>`:`<section class="app-group"><div class="app-group-head"><span>${esc(title)}</span><small>${items.length} running · ${esc(note)}</small></div><div class="app-list">${body}</div></section>`};
  $('#applications').innerHTML=appGroup('user','User apps','Interactive applications you opened or normally control')+appGroup('background','Background services & helpers','Sync, update, display or application support components')+appGroup('security_remote','Security, VPN & remote access','Review before quitting; these may protect, manage or connect this Mac')+appGroup('unclassified','Unclassified processes','MacAudit does not have enough evidence to recommend quitting these')+appGroup('system','macOS system processes','Normally leave running',true)||'<div class="empty">No application processes detected.</div>';

  const enabled=d.monitoring||{};
  $('#monitoring').innerHTML=monitor('Active SSH connections','Fast','Checks whether someone is connected through Remote Login')+monitor('Remote-support apps','Fast','Looks for TeamViewer, AnyDesk, Splashtop, RustDesk and similar tools')+monitor('Remote network activity','Fast','Records external IP addresses and ports used by SSH and supported remote-access tools when macOS exposes them')+monitor('Data movement','Live + 5 min','Tracks file/folder create, move, Trash and delete activity plus transfer tools; filenames stay local',enabled.data_movement!==false)+monitor('Software downloads','Live + 5 min','Detects disk images, installer packages, app bundles and likely software archives appearing in user download locations',enabled.data_movement!==false)+monitor('Remote access settings','Standard','Tracks Remote Login, Screen Sharing and Remote Apple Events; remote-support tools are tracked separately')+monitor('SSH configuration','Standard','Tracks authorised keys and SSH server configuration')+monitor('Users and administrators','Standard','Detects local user and administrator account changes')+monitor('macOS security settings','Standard','Tracks SIP, Gatekeeper, FileVault and firewall settings')+monitor('Automatic-start items','Standard','Tracks LaunchAgents, LaunchDaemons and scheduled startup files')+monitor('Device management','Slow','Tracks MDM enrolment and system extensions')+monitor('Installed software','Slow','Tracks applications and installer packages')+monitor('Privacy permissions','Slow','Tracks screen recording, accessibility, camera, microphone and protected-file access',enabled.tcc!==false)+monitor('Unified security logs','Optional','Reviews selected remote-access and management log activity',enabled.unified_logs!==false);

  const badge=$('#healthBadge');
  if(d.collector_status==='stale'){badge.className='health-badge bad';badge.innerHTML='<span></span><b>Collector offline</b>'}
  else if(d.collector_status==='unknown'){badge.className='health-badge warn';badge.innerHTML='<span></span><b>Waiting for scan</b>'}
  else{badge.className='health-badge';badge.innerHTML='<span></span><b>Live monitoring</b>'}
}

async function loadEvents(){
  const sev=$('#severity').value,q=$('#search').value,presence=$('#presence').value;
  updateCardSelection();
  const d=await json(`/api/events?limit=1000&severity=${encodeURIComponent(sev)}&q=${encodeURIComponent(q)}&presence=${encodeURIComponent(presence)}&${dateQuery()}&_=${Date.now()}`);
  $('#eventCount').textContent=`${d.count} event${d.count===1?'':'s'} · ${dateLabel()}`;
  const rn=$('#eventsRefreshNote');if(rn)rn.textContent=`Live event feed · checked ${clockTime(new Date())}`;
  const signature=JSON.stringify(d.events);
  // The dashboard refreshes every 10 seconds. Do not destroy/recreate the event
  // DOM when nothing changed: that used to collapse raw logs while reading them.
  if(signature===lastEventsSignature)return;
  const state=captureEventViewState();
  $('#events').innerHTML=d.events.length?d.events.map(renderEvent).join(''):`<div class="empty">No matching events for ${esc(dateLabel().toLowerCase())}.</div>`;
  lastEventsSignature=signature;
  restoreEventViewState(state);
}
let refreshInFlight=false,lastRefreshAt=null;
function clockTime(d){return d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit',second:'2-digit'}).replace(/:00(?=\s|$)/,'')}
function setRefreshState(mode,text){const el=$('#refreshState');if(!el)return;el.className=`refresh-state ${mode||''}`.trim();el.innerHTML=`<span class="refresh-dot"></span><span>${esc(text)}</span>`;const btn=$('#refreshNow');if(btn){btn.disabled=mode==='refreshing';btn.classList.toggle('spinning',mode==='refreshing')}}
async function refresh(){
  if(refreshInFlight)return;
  refreshInFlight=true;setRefreshState('refreshing','Refreshing…');
  const results=await Promise.allSettled([loadSummary(),loadEvents()]);
  const failures=results.filter(x=>x.status==='rejected');
  refreshInFlight=false;
  if(failures.length){setRefreshState('error','Refresh issue');console.error(...failures.map(x=>x.reason));return}
  lastRefreshAt=new Date();setRefreshState('','Live · updated '+clockTime(lastRefreshAt));
}


$('#severityCards').addEventListener('click',e=>{const card=e.target.closest('.card');if(!card)return;const select=$('#severity');const level=card.dataset.severity||'';const isActive=card.classList.contains('active')||select.value===level;select.value=isActive?'':level;lastEventsSignature='';updateCardSelection();loadEvents();$('#eventTimeline').scrollIntoView({behavior:'smooth',block:'start'})});
$('#severity').addEventListener('change',()=>{lastEventsSignature='';loadEvents()});
$('#presence').addEventListener('change',()=>{lastEventsSignature='';loadEvents()});
$('#datePreset').addEventListener('change',()=>{const custom=$('#datePreset').value==='custom';$('#customDates').hidden=!custom;lastEventsSignature='';if(!custom)refresh();else{$('#dateFrom').focus();refresh()}});
$('#dateFrom').addEventListener('change',()=>{lastEventsSignature='';refresh()});$('#dateTo').addEventListener('change',()=>{lastEventsSignature='';refresh()});
let timer;$('#search').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{lastEventsSignature='';loadEvents()},250)});
$('#refreshNow')?.addEventListener('click',()=>refresh());
initialiseDates();refresh();setInterval(refresh,10000);

const navLinks=[...document.querySelectorAll('.nav-item')];const navSections=navLinks.map(a=>document.querySelector(a.getAttribute('href'))).filter(Boolean);const sectionObserver=new IntersectionObserver(entries=>{const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(!visible)return;navLinks.forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+visible.target.id))},{rootMargin:'-18% 0px -68% 0px',threshold:[0,.1,.5]});navSections.forEach(s=>sectionObserver.observe(s));
