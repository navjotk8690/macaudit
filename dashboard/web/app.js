const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let summaryData=null;

async function json(url){const r=await fetch(url,{cache:'no-store'});if(r.status===401)throw new Error('Open the dashboard with: sudo /usr/local/libexec/macaudit dashboard');if(!r.ok)throw new Error(`Dashboard error ${r.status}`);return r.json()}
function flag(label,value,warning=true,description=''){const known=value===true||value===false;const cls=!known?'unknown':value&&warning?'yes':'no';const text=!known?'UNKNOWN':value?'ON':'OFF';return `<div class="status-row" title="${esc(description)}"><span class="status-copy"><b>${esc(label)}</b>${description?`<small>${esc(description)}</small>`:''}</span><span class="pill ${cls}">${text}</span></div>`}
function monitor(label,group,description,enabled=true){return `<div class="monitor" title="${esc(description)}"><span><b>${esc(label)}</b><small>${esc(description)}</small></span><span class="group">${enabled?esc(group):'Disabled'}</span></div>`}
function when(v){if(!v)return'Not yet';const d=new Date(v);return isNaN(d)?esc(v):d.toLocaleString()}
function renderEvent(e){
  const cleared=e.state==='cleared'?'<span class="cleared">RESOLVED</span>':'';
  const human=`<details class="detail-toggle"><summary>Explanation and recommended action</summary><div class="explanation"><strong>When this may be normal:</strong> ${esc(e.normal_when||'When you or trusted IT staff made the change.')}<br><strong>What to check:</strong> ${esc(e.recommended_action||'Confirm that you expected this activity.')}<br><strong>Recorded event:</strong> ${esc(e.message||'No additional event message was recorded.')}</div></details>`;
  const evidence=String(e.evidence||'').trim();
  const system=evidence?`<details class="detail-toggle system-log"><summary>System log / raw evidence</summary><div class="log-note">Original system-generated output captured when this event was detected.</div><pre>${esc(evidence)}</pre></details>`:`<details class="detail-toggle system-log"><summary>System log / raw evidence</summary><div class="log-note">No raw system output was captured for this event.</div></details>`;
  return `<div class="event"><time>${when(e.timestamp)}</time><div class="sev sev-${esc(e.severity)}">${esc(e.severity)}${cleared}</div><div class="category">${esc(e.category)}</div><div><div class="message">${esc(e.title||e.message)}</div><div class="summary">${esc(e.summary||e.message||'MacAudit recorded a system change.')}</div><div class="event-details">${human}${system}</div></div></div>`
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
function severityCard(level,count){return `<button type="button" class="card" data-severity="${level}" aria-pressed="false" title="Show ${level.toLowerCase()} events"><div class="label">${level}</div><div class="number sev-${level}">${count||0}</div><div class="hint">Click to filter logs</div></button>`}

async function loadSummary(){const d=await json(`/api/summary?${dateQuery()}`);summaryData=d;const levels=['CRITICAL','HIGH','MEDIUM','LOW','INFO'];$('#severityCards').innerHTML=levels.map(x=>severityCard(x,d.severity[x]||0)).join('');updateCardSelection();const s=d.status||{},h=d.health||{};$('#lastScan').textContent=h.completed_at?`Last scan ${when(h.completed_at)}`:'No completed scan yet';$('#collectorVersion').textContent=h.version?`Collector ${h.version}`:'';$('#posture').innerHTML=flag('Remote Login',s.remote_login,true,'Allows command-line connections from another computer')+flag('Screen Sharing',s.screen_sharing_loaded,true,'Allows another Mac to view or control this screen')+flag('Apple Remote Desktop',s.ard_running,true,'Apple remote management agent')+flag('Remote Apple Events',s.remote_apple_events,true,'Allows remote control of scriptable apps')+flag('FileVault',s.filevault_on,false,'Encrypts data stored on this Mac')+flag('Firewall',s.firewall_on,false,'Blocks unwanted incoming network connections')+flag('System Protection (SIP)',s.sip_on,false,'Protects important macOS system files')+flag('App Protection (Gatekeeper)',s.gatekeeper_on,false,'Checks downloaded apps before they run');$('#tools').innerHTML=Object.entries(s.tools||{}).map(([n,on])=>`<div class="tool" title="${esc(n)}: ${on?'running':'not running'}"><span><i class="dot ${on?'running':'stopped'}"></i>${esc(n)}</span><strong>${on?'Running':'Idle'}</strong></div>`).join('')||'<div class="empty">Remote tool status is unavailable.</div>';const enabled=d.monitoring||{};$('#monitoring').innerHTML=monitor('Active SSH connections','Fast','Checks whether someone is connected through Remote Login')+monitor('Remote-support apps','Fast','Looks for TeamViewer, AnyDesk, Splashtop, RustDesk and similar tools')+monitor('Remote network activity','Fast','Checks whether remote-support apps have outside connections')+monitor('Remote access settings','Standard','Tracks SSH, Screen Sharing, Apple Remote Desktop and listening ports')+monitor('SSH configuration','Standard','Tracks authorised keys and SSH server configuration')+monitor('Users and administrators','Standard','Detects local user and administrator account changes')+monitor('macOS security settings','Standard','Tracks SIP, Gatekeeper, FileVault and firewall settings')+monitor('Automatic-start items','Standard','Tracks LaunchAgents, LaunchDaemons and scheduled startup files')+monitor('Device management','Slow','Tracks MDM enrolment and system extensions')+monitor('Installed software','Slow','Tracks applications and installer packages')+monitor('Privacy permissions','Slow','Tracks screen recording, accessibility, camera, microphone and protected-file access',enabled.tcc!==false)+monitor('Unified security logs','Optional','Reviews selected remote-access and management log activity',enabled.unified_logs!==false);const badge=$('#healthBadge');if(d.collector_status==='stale'){badge.className='live bad';badge.innerHTML='<span></span><b>Collector stopped checking in</b>'}else if(d.collector_status==='unknown'){badge.className='live warn';badge.innerHTML='<span></span><b>Waiting for first scan</b>'}else{badge.className='live';badge.innerHTML='<span></span><b>Live</b> · refreshes every 10s'}}

async function loadEvents(){const sev=$('#severity').value,q=$('#search').value;updateCardSelection();const d=await json(`/api/events?limit=1000&severity=${encodeURIComponent(sev)}&q=${encodeURIComponent(q)}&${dateQuery()}`);$('#eventCount').textContent=`${d.count} event${d.count===1?'':'s'} · ${dateLabel()}`;$('#events').innerHTML=d.events.length?d.events.map(renderEvent).join(''):`<div class="empty">No matching events for ${esc(dateLabel().toLowerCase())}.</div>`}
async function refresh(){try{await Promise.all([loadSummary(),loadEvents()])}catch(e){$('#events').innerHTML=`<div class="empty">${esc(e.message)}</div>`}}

$('#severityCards').addEventListener('click',e=>{const card=e.target.closest('.card');if(!card)return;const select=$('#severity');select.value=select.value===card.dataset.severity?'':card.dataset.severity;loadEvents();$('#eventTimeline').scrollIntoView({behavior:'smooth',block:'start'})});
$('#severity').addEventListener('change',loadEvents);
$('#datePreset').addEventListener('change',()=>{const custom=$('#datePreset').value==='custom';$('#customDates').hidden=!custom;if(!custom)refresh();else{$('#dateFrom').focus();refresh()}});
$('#dateFrom').addEventListener('change',refresh);$('#dateTo').addEventListener('change',refresh);
let timer;$('#search').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(loadEvents,250)});
initialiseDates();refresh();setInterval(refresh,10000);
