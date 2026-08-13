const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let summaryData=null;

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
    'device-management':'MacAudit recorded the current device-management state as the starting point for future comparisons.'
  };
  return map[category]||'MacAudit recorded the current state as the starting point for future comparisons.'
}
function renderEvent(e){
  const cleared=e.state==='cleared'?'<span class="cleared">RESOLVED</span>':'';
  const isBaseline=e.state==='baseline';
  const headline=e.message||e.title||'MacAudit recorded a system change.';
  const context=isBaseline?baselineSummary(e.category):(e.summary||e.title||'MacAudit recorded a system change.');
  const normal=isBaseline?'This is expected after first installation, an upgrade that rebuilds a collector baseline, or a manual baseline reset.':(e.normal_when||'When you or trusted IT staff made the change.');
  const action=isBaseline?'No action is required. Future scans will compare against this recorded state.':(e.recommended_action||'Confirm that you expected this activity.');
  const human=`<details class="detail-toggle"><summary>Explanation and recommended action</summary><div class="explanation"><strong>What MacAudit detected:</strong> ${esc(headline)}<br><strong>When this may be normal:</strong> ${esc(normal)}<br><strong>What to check:</strong> ${esc(action)}</div></details>`;
  const evidence=String(e.evidence||'').trim();
  const system=evidence?`<details class="detail-toggle system-log"><summary>System log / raw evidence</summary><div class="log-note">Original system-generated output captured when this event was detected.</div><pre>${esc(evidence)}</pre></details>`:`<details class="detail-toggle system-log"><summary>System log / raw evidence</summary><div class="log-note">No raw system output was captured for this event.</div></details>`;
  return `<div class="event"><time>${when(e.timestamp)}</time><div class="sev sev-${esc(e.severity)}">${esc(e.severity)}${cleared}</div><div class="category">${esc(e.category)}</div><div><div class="message">${esc(headline)}</div><div class="summary">${esc(context)}</div><div class="event-details">${human}${system}</div></div></div>`
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
function severityCard(level,count){return `<button type="button" class="card" data-severity="${level}" aria-pressed="false" title="Show ${level.toLowerCase()} events"><div class="label">${level}</div><div class="number sev-${level}">${count||0}</div><div class="hint">Recorded events · click to filter</div></button>`}

async function loadSummary(){const d=await json(`/api/summary?${dateQuery()}`);summaryData=d;const levels=['CRITICAL','HIGH','MEDIUM','LOW','INFO'];$('#severityCards').innerHTML=levels.map(x=>severityCard(x,d.severity[x]||0)).join('');updateCardSelection();const s=d.status||{},h=d.health||{};$('#lastScan').textContent=h.completed_at?`Last scan ${when(h.completed_at)}`:'No completed scan yet';$('#collectorVersion').textContent=h.version?`Collector ${h.version}`:'';$('#posture').innerHTML=`<div class="status-group"><div class="status-group-title">Remote access</div>${flag('Remote Login',s.remote_login,'remote','Allows command-line connections from another computer')}${flag('Screen Sharing',s.screen_sharing_loaded,'remote','Allows another Mac to view or control this screen')}${flag('Apple Remote Desktop',s.ard_running,'remote','Apple remote management capability')}${flag('Remote Apple Events',s.remote_apple_events,'remote','Allows remote control of scriptable applications')}</div><div class="status-group"><div class="status-group-title">Mac protection</div>${flag('FileVault',s.filevault_on,'protection','Encrypts data stored on this Mac')}${flag('Firewall',s.firewall_on,'protection','Blocks unwanted incoming network connections')}${flag('System Protection (SIP)',s.sip_on,'protection','Protects important macOS system files')}${flag('App Protection (Gatekeeper)',s.gatekeeper_on,'protection','Checks downloaded applications before they run')}</div>`;$('#tools').innerHTML=Object.entries(s.tools||{}).map(([n,on])=>`<div class="tool" title="${esc(n)}: ${on?'running':'not running'}"><span><i class="dot ${on?'running':'stopped'}"></i>${esc(n)}</span><strong class="${on?'tool-running':'tool-stopped'}">${on?'RUNNING':'NOT RUNNING'}</strong></div>`).join('')||'<div class="empty">Remote tool status is unavailable.</div>';const enabled=d.monitoring||{};$('#monitoring').innerHTML=monitor('Active SSH connections','Fast','Checks whether someone is connected through Remote Login')+monitor('Remote-support apps','Fast','Looks for TeamViewer, AnyDesk, Splashtop, RustDesk and similar tools')+monitor('Remote network activity','Fast','Checks whether remote-support apps have outside connections')+monitor('Remote access settings','Standard','Tracks Remote Login, Screen Sharing and Remote Apple Events; remote-support tools are tracked separately')+monitor('SSH configuration','Standard','Tracks authorised keys and SSH server configuration')+monitor('Users and administrators','Standard','Detects local user and administrator account changes')+monitor('macOS security settings','Standard','Tracks SIP, Gatekeeper, FileVault and firewall settings')+monitor('Automatic-start items','Standard','Tracks LaunchAgents, LaunchDaemons and scheduled startup files')+monitor('Device management','Slow','Tracks MDM enrolment and system extensions')+monitor('Installed software','Slow','Tracks applications and installer packages')+monitor('Privacy permissions','Slow','Tracks screen recording, accessibility, camera, microphone and protected-file access',enabled.tcc!==false)+monitor('Unified security logs','Optional','Reviews selected remote-access and management log activity',enabled.unified_logs!==false);const badge=$('#healthBadge');if(d.collector_status==='stale'){badge.className='live bad';badge.innerHTML='<span></span><b>Collector stopped checking in</b>'}else if(d.collector_status==='unknown'){badge.className='live warn';badge.innerHTML='<span></span><b>Waiting for first scan</b>'}else{badge.className='live';badge.innerHTML='<span></span><b>Live</b> · refreshes every 10s'}}

async function loadEvents(){const sev=$('#severity').value,q=$('#search').value;updateCardSelection();const d=await json(`/api/events?limit=1000&severity=${encodeURIComponent(sev)}&q=${encodeURIComponent(q)}&${dateQuery()}`);$('#eventCount').textContent=`${d.count} event${d.count===1?'':'s'} · ${dateLabel()}`;$('#events').innerHTML=d.events.length?d.events.map(renderEvent).join(''):`<div class="empty">No matching events for ${esc(dateLabel().toLowerCase())}.</div>`}
async function refresh(){try{await Promise.all([loadSummary(),loadEvents()])}catch(e){$('#events').innerHTML=`<div class="empty">${esc(e.message)}</div>`}}

$('#severityCards').addEventListener('click',e=>{const card=e.target.closest('.card');if(!card)return;const select=$('#severity');const level=card.dataset.severity||'';const isActive=card.classList.contains('active')||select.value===level;select.value=isActive?'':level;updateCardSelection();loadEvents();$('#eventTimeline').scrollIntoView({behavior:'smooth',block:'start'})});
$('#severity').addEventListener('change',loadEvents);
$('#datePreset').addEventListener('change',()=>{const custom=$('#datePreset').value==='custom';$('#customDates').hidden=!custom;if(!custom)refresh();else{$('#dateFrom').focus();refresh()}});
$('#dateFrom').addEventListener('change',refresh);$('#dateTo').addEventListener('change',refresh);
let timer;$('#search').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(loadEvents,250)});
initialiseDates();refresh();setInterval(refresh,10000);
