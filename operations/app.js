(() => {
  const STATUS_COLUMNS = [
    ['NEW','NEW'],['ASSIGNED','ASSIGNED'],['IN_PROGRESS','IN PROGRESS'],['BLOCKED','BLOCKED'],['COMPLETED','DONE']
  ];
  const VALID_TRANSITIONS = {
    NEW:['ASSIGNED','CANCELLED'],
    ASSIGNED:['IN_PROGRESS','BLOCKED','CANCELLED'],
    IN_PROGRESS:['BLOCKED','COMPLETED'],
    BLOCKED:['ASSIGNED','IN_PROGRESS','CANCELLED'],
    COMPLETED:[], CANCELLED:[]
  };
  const demoStaff = [
    {id:'maria',name:'Maria Santos',department:'housekeeping',initials:'MS'},
    {id:'ana',name:'Ana Kim',department:'housekeeping',initials:'AK'},
    {id:'carlos',name:'Carlos Vega',department:'engineering',initials:'CV'},
    {id:'lucia',name:'Lucía Romero',department:'front_desk',initials:'LR'}
  ];
  const minsAgo = n => new Date(Date.now()-n*60000).toISOString();
  const demoRequests = [
    {id:'r1',display_id:'REQ-1042',room_number:'512',guest_name:'Toh',request_type:'amenity',details:'2 extra towels',quantity:2,department:'housekeeping',priority:'normal',status:'NEW',assignee_id:null,source:'Voice',created_at:minsAgo(2),sla_target_at:new Date(Date.now()+8*60000).toISOString(),events:[{type:'CREATED',actor:'Ava · Voice',at:minsAgo(2),note:'Guest requested 2 extra towels.'}]},
    {id:'r2',display_id:'REQ-1041',room_number:'407',guest_name:'Morgan',request_type:'amenity',details:'Extra pillow',quantity:1,department:'housekeeping',priority:'normal',status:'ASSIGNED',assignee_id:'maria',source:'Front desk',created_at:minsAgo(7),sla_target_at:new Date(Date.now()+5*60000).toISOString(),events:[{type:'CREATED',actor:'Front desk',at:minsAgo(7),note:'Guest requested an extra pillow.'},{type:'ASSIGNED',actor:'Ops supervisor',at:minsAgo(5),note:'Assigned to Maria Santos.'}]},
    {id:'r3',display_id:'REQ-1040',room_number:'806',guest_name:'Lee',request_type:'maintenance',details:'AC not cooling',department:'engineering',priority:'high',status:'IN_PROGRESS',assignee_id:'carlos',source:'Voice',created_at:minsAgo(14),sla_target_at:new Date(Date.now()-1*60000).toISOString(),events:[{type:'CREATED',actor:'Ava · Voice',at:minsAgo(14),note:'Guest reports AC is running but not cooling.'},{type:'ASSIGNED',actor:'Ops supervisor',at:minsAgo(12),note:'Assigned to Carlos Vega.'},{type:'STARTED',actor:'Carlos Vega',at:minsAgo(8),note:'Work started.'}]},
    {id:'r4',display_id:'REQ-1039',room_number:'319',guest_name:'Patel',request_type:'amenity',details:'Toiletries unavailable',department:'housekeeping',priority:'normal',status:'BLOCKED',assignee_id:'maria',source:'Staff',created_at:minsAgo(21),sla_target_at:new Date(Date.now()-6*60000).toISOString(),blocked_reason:'Item unavailable',events:[{type:'CREATED',actor:'Maria Santos',at:minsAgo(21),note:'Guest requested toiletries.'},{type:'BLOCKED',actor:'Maria Santos',at:minsAgo(10),note:'Item unavailable on floor.'}]},
    {id:'r5',display_id:'REQ-1038',room_number:'214',guest_name:'Ng',request_type:'amenity',details:'Baby cot delivered',department:'housekeeping',priority:'normal',status:'COMPLETED',assignee_id:'ana',source:'Front desk',created_at:minsAgo(38),sla_target_at:minsAgo(18),completed_at:minsAgo(16),events:[{type:'CREATED',actor:'Front desk',at:minsAgo(38),note:'Guest requested baby cot.'},{type:'ASSIGNED',actor:'Ops supervisor',at:minsAgo(33),note:'Assigned to Ana Kim.'},{type:'STARTED',actor:'Ana Kim',at:minsAgo(25),note:'Delivery started.'},{type:'COMPLETED',actor:'Ana Kim',at:minsAgo(16),note:'Guest request completed.'}]}
  ];

  let state = {requests:[], staff:[...demoStaff], filter:'all', query:'', live:false, supabase:null};
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  function loadDemo(){
    const saved = localStorage.getItem('hotelOpsRequestsV2');
    state.requests = saved ? JSON.parse(saved) : demoRequests;
  }
  function saveDemo(){ if(!state.live) localStorage.setItem('hotelOpsRequestsV2',JSON.stringify(state.requests)); }
  function staffName(id){return state.staff.find(s=>String(s.id)===String(id))?.name || 'Unassigned'}
  function initials(id){const s=state.staff.find(s=>String(s.id)===String(id));return s?.initials || (s?.name?s.name.split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase():'—')}
  function ageMinutes(date){return Math.max(0,Math.floor((Date.now()-new Date(date))/60000))}
  function ageLabel(date){const m=ageMinutes(date); return m<1?'just now':m<60?`${m} min ago`:`${Math.floor(m/60)}h ${m%60}m ago`}
  function slaState(r){ if(r.status==='COMPLETED'||r.status==='CANCELLED')return 'ok'; const target=new Date(r.sla_target_at).getTime(); const now=Date.now(); const total=Math.max(1,target-new Date(r.created_at).getTime()); const remaining=target-now; if(remaining<=0)return 'breach'; if(remaining/total<=.2)return 'risk'; return 'ok'}
  function departmentLabel(d){return {housekeeping:'Housekeeping',engineering:'Maintenance',front_desk:'Guest Services'}[d]||d}
  function statusLabel(s){return {NEW:'New',ASSIGNED:'Assigned',IN_PROGRESS:'In progress',BLOCKED:'Blocked',COMPLETED:'Done',CANCELLED:'Cancelled'}[s]||s}
  function nextDisplayId(){const nums=state.requests.map(r=>parseInt((r.display_id||'').replace(/\D/g,''))).filter(Boolean);return `REQ-${Math.max(1042,...nums)+1}`}
  function normalizeLiveRow(r){return {...r,events:r.request_events||r.events||[]}}

  function filtered(){return state.requests.filter(r=>{
    const statusVisible = r.status!=='CANCELLED';
    const dept = state.filter==='all'||r.department===state.filter;
    const q=state.query.trim().toLowerCase();
    const text=[r.room_number,r.display_id,r.details,r.guest_name,staffName(r.assignee_id),departmentLabel(r.department)].join(' ').toLowerCase();
    return statusVisible&&dept&&(!q||text.includes(q));
  })}

  function render(){renderMetrics();renderBoard();renderStaff();}
  function renderMetrics(){const active=state.requests.filter(r=>!['COMPLETED','CANCELLED'].includes(r.status));$('#activeMetric').textContent=active.length;$('#unassignedMetric').textContent=active.filter(r=>!r.assignee_id).length;$('#riskMetric').textContent=active.filter(r=>['risk','breach'].includes(slaState(r))).length;$('#blockedMetric').textContent=active.filter(r=>r.status==='BLOCKED').length}
  function renderBoard(){
    const data=filtered();
    $('#board').innerHTML=STATUS_COLUMNS.map(([status,label])=>{
      const items=data.filter(r=>r.status===status);
      return `<section class="lane" data-status="${status}"><div class="lane-head"><div class="lane-label"><span class="lane-dot"></span>${label}</div><span class="lane-count">${items.length}</span></div><div class="lane-cards">${items.length?items.map(cardHTML).join(''):`<div class="empty-lane">${status==='COMPLETED'?'Completed requests will appear here.':'No requests in this stage.'}</div>`}</div></section>`
    }).join('');
    $$('.request-card').forEach(el=>el.addEventListener('click',()=>openDrawer(el.dataset.id)));
  }
  function cardHTML(r){const sla=slaState(r);return `<article class="request-card" data-id="${r.id}"><div class="card-top"><div><div class="room">${escapeHTML(r.room_number)}</div><div class="request-title">${escapeHTML(r.details)}</div></div><span class="priority ${r.priority}"></span></div><div class="meta"><span class="pill">${departmentLabel(r.department)}</span><span class="pill">${escapeHTML(r.source||'Manual')}</span>${sla==='risk'?'<span class="pill sla-risk">SLA at risk</span>':sla==='breach'?'<span class="pill sla-breach">SLA breached</span>':''}</div><div class="assignee-line"><span>${ageLabel(r.created_at)}</span><span><span class="avatar">${initials(r.assignee_id)}</span>${staffName(r.assignee_id)}</span></div></article>`}

  function renderStaff(){
    const maria=state.staff.find(s=>s.name==='Maria Santos')||state.staff.find(s=>s.department==='housekeeping');
    const tasks=state.requests.filter(r=>maria&&String(r.assignee_id)===String(maria.id)&&!['COMPLETED','CANCELLED'].includes(r.status)).sort((a,b)=>new Date(a.sla_target_at)-new Date(b.sla_target_at));
    $('#staffTasks').innerHTML=tasks.length?tasks.map(r=>`<article class="staff-task"><div class="room">${escapeHTML(r.room_number)}</div><p>${escapeHTML(r.details)}</p><div class="meta"><span class="pill">${statusLabel(r.status)}</span><span class="pill ${slaState(r)==='breach'?'sla-breach':slaState(r)==='risk'?'sla-risk':''}">${ageLabel(r.created_at)}</span></div><div class="task-actions">${r.status==='ASSIGNED'?`<button class="button primary full" data-staff-action="IN_PROGRESS" data-id="${r.id}">Start</button>`:''}${r.status==='IN_PROGRESS'?`<button class="button secondary" data-staff-action="BLOCKED" data-id="${r.id}">Block</button><button class="button primary" data-staff-action="COMPLETED" data-id="${r.id}">Complete</button>`:''}${r.status==='BLOCKED'?`<button class="button primary full" data-staff-action="IN_PROGRESS" data-id="${r.id}">Resume</button>`:''}</div></article>`).join(''):`<div class="empty-lane">No active tasks assigned to Maria.</div>`;
    $$('[data-staff-action]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();transitionRequest(btn.dataset.id,btn.dataset.staffAction,'Maria Santos')}));
  }

  function openDrawer(id){
    const r=state.requests.find(x=>String(x.id)===String(id)); if(!r)return;
    const staffOptions=state.staff.filter(s=>s.department===r.department).map(s=>`<option value="${s.id}" ${s.id===r.assignee_id?'selected':''}>${s.name}</option>`).join('');
    const transitions=VALID_TRANSITIONS[r.status]||[];
    $('#requestDrawer').innerHTML=`<div class="drawer-head"><div><div class="eyebrow">${escapeHTML(r.display_id)}</div><h2>Room ${escapeHTML(r.room_number)}</h2><p>${escapeHTML(r.details)}</p></div><button class="icon-button" id="closeDrawerBtn">×</button></div><div class="drawer-grid"><div class="info-box"><small>Status</small><strong>${statusLabel(r.status)}</strong></div><div class="info-box"><small>Department</small><strong>${departmentLabel(r.department)}</strong></div><div class="info-box"><small>Guest</small><strong>${escapeHTML(r.guest_name||'—')}</strong></div><div class="info-box"><small>Source</small><strong>${escapeHTML(r.source||'Manual')}</strong></div><div class="info-box"><small>Created</small><strong>${ageLabel(r.created_at)}</strong></div><div class="info-box"><small>SLA</small><strong>${slaState(r)==='breach'?'Breached':slaState(r)==='risk'?'At risk':'On track'}</strong></div></div><div class="drawer-actions"><select id="assigneeSelect"><option value="">Unassigned</option>${staffOptions}</select><button class="button secondary" id="assignBtn">Assign</button>${transitions.filter(s=>s!=='CANCELLED').map(s=>`<button class="button ${s==='COMPLETED'?'primary':'secondary'}" data-transition="${s}">${statusLabel(s)}</button>`).join('')}</div><div class="timeline"><h3>Activity</h3>${(r.events||[]).slice().sort((a,b)=>new Date(b.at||b.created_at)-new Date(a.at||a.created_at)).map(e=>`<div class="event"><strong>${escapeHTML(e.type||e.event_type)}</strong><p>${escapeHTML(e.note||'')} · ${ageLabel(e.at||e.created_at)}</p></div>`).join('')}</div>`;
    $('#requestDrawer').classList.remove('hidden');$('#drawerBackdrop').classList.remove('hidden');$('#requestDrawer').setAttribute('aria-hidden','false');
    $('#closeDrawerBtn').onclick=closeDrawer;$('#assignBtn').onclick=()=>assignRequest(r.id,$('#assigneeSelect').value);
    $$('[data-transition]').forEach(btn=>btn.onclick=()=>transitionRequest(r.id,btn.dataset.transition,'Ops supervisor'));
  }
  function closeDrawer(){ $('#requestDrawer').classList.add('hidden');$('#drawerBackdrop').classList.add('hidden');$('#requestDrawer').setAttribute('aria-hidden','true'); }

  async function assignRequest(id,assigneeId){
    if(state.live){await sendAction({action:'assign',request_id:id,assignee_id:assigneeId});closeDrawer();return}
    const r=state.requests.find(x=>x.id===id); if(!r)return; r.assignee_id=assigneeId||null; if(assigneeId&&r.status==='NEW')r.status='ASSIGNED';r.events=r.events||[];r.events.push({type:'ASSIGNED',actor:'Ops supervisor',at:new Date().toISOString(),note:assigneeId?`Assigned to ${staffName(assigneeId)}.`:'Unassigned.'});saveDemo();render();openDrawer(id);toast('Assignment updated');
  }
  async function transitionRequest(id,to,actor){
    const r=state.requests.find(x=>String(x.id)===String(id)); if(!r)return;
    if(!(VALID_TRANSITIONS[r.status]||[]).includes(to) && !(r.status==='BLOCKED'&&to==='IN_PROGRESS')){toast(`Invalid transition: ${r.status} → ${to}`);return}
    let blocked_reason=null;if(to==='BLOCKED'){blocked_reason=prompt('Why is this blocked?','Item unavailable')||'Blocked'}
    if(state.live){await sendAction({action:'transition',request_id:id,to_status:to,blocked_reason});closeDrawer();return}
    const from=r.status;r.status=to;r.blocked_reason=blocked_reason||r.blocked_reason;if(to==='COMPLETED')r.completed_at=new Date().toISOString();r.events=r.events||[];r.events.push({type:to==='IN_PROGRESS'?'STARTED':to,actor,at:new Date().toISOString(),note:`${statusLabel(from)} → ${statusLabel(to)}${blocked_reason?`: ${blocked_reason}`:''}`});saveDemo();render();closeDrawer();toast(`Request moved to ${statusLabel(to)}`);
  }

  function createLocalRequest(data,source='Manual'){
    const dept=data.department||'housekeeping';const sla=dept==='housekeeping'?10:dept==='engineering'?15:20;
    const r={id:`local-${Date.now()}`,display_id:nextDisplayId(),room_number:data.room_number,guest_name:data.guest_name||'',request_type:data.request_type||'amenity',details:data.details,quantity:data.quantity||null,department:dept,priority:data.priority||'normal',status:'NEW',assignee_id:null,source,created_at:new Date().toISOString(),sla_target_at:new Date(Date.now()+sla*60000).toISOString(),events:[{type:'CREATED',actor:source==='Voice'?'Ava · Voice':'Manual intake',at:new Date().toISOString(),note:data.details}]};state.requests.unshift(r);saveDemo();render();toast(`${r.display_id} created`);return r;
  }

  async function sendAction(body){
    try{const res=await fetch(window.HOTEL_OPS_CONFIG.ACTION_API_URL||'/api/request-action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await res.json();if(!res.ok)throw new Error(data.error||'Action failed');toast('Updated');return data}catch(e){toast(e.message||'Action failed')}
  }

  async function initSupabase(){
    let cfg=window.HOTEL_OPS_CONFIG||{};
    if(!cfg.SUPABASE_URL||!cfg.SUPABASE_PUBLISHABLE_KEY){
      try{
        const response=await fetch('/api/public-config',{cache:'no-store'});
        if(response.ok) cfg=await response.json();
      }catch(e){ console.warn('Public config unavailable',e); }
    }
    if(!cfg.SUPABASE_URL||!cfg.SUPABASE_PUBLISHABLE_KEY){loadDemo();render();return}
    try{
      const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');state.supabase=createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY);state.live=true;$('#modeDot').classList.add('live');$('#modeLabel').textContent='Live · Supabase';
      await refreshLive();
      state.supabase.channel('ops-board').on('postgres_changes',{event:'*',schema:'public',table:'service_requests'},refreshLive).on('postgres_changes',{event:'*',schema:'public',table:'request_events'},refreshLive).subscribe();
    }catch(e){console.error(e);loadDemo();render();toast('Live connection failed — using demo mode')}
  }
  async function refreshLive(){
    const [requestResult,staffResult]=await Promise.all([
      state.supabase.from('service_requests').select('*, request_events(*)').order('created_at',{ascending:false}),
      state.supabase.from('staff').select('*').eq('active',true).order('name')
    ]);
    if(requestResult.error){console.error(requestResult.error);return}
    if(!staffResult.error&&staffResult.data) state.staff=staffResult.data;
    state.requests=(requestResult.data||[]).map(normalizeLiveRow);render();
  }

  function escapeHTML(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]))}
  function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.add('hidden'),2600)}
  function showModal(){ $('#modalBackdrop').classList.remove('hidden');$('#newRequestModal').classList.remove('hidden') }
  function hideModal(){ $('#modalBackdrop').classList.add('hidden');$('#newRequestModal').classList.add('hidden');$('#newRequestForm').reset() }

  $$('.nav-item').forEach(btn=>btn.onclick=()=>{$$('.nav-item').forEach(b=>b.classList.remove('active'));btn.classList.add('active');$$('.view').forEach(v=>v.classList.remove('active'));$(`#${btn.dataset.view}View`).classList.add('active')});
  $$('.chip').forEach(btn=>btn.onclick=()=>{$$('.chip').forEach(b=>b.classList.remove('active'));btn.classList.add('active');state.filter=btn.dataset.filter;renderBoard()});
  $('#searchInput').addEventListener('input',e=>{state.query=e.target.value;renderBoard()});
  $('#drawerBackdrop').onclick=closeDrawer;$('#newRequestBtn').onclick=showModal;$('#closeModalBtn').onclick=hideModal;$('#cancelModalBtn').onclick=hideModal;$('#modalBackdrop').onclick=hideModal;
  $('#newRequestForm').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget).entries());if(state.live){await sendAction({action:'create',...data,source:'Manual'});await refreshLive();}else createLocalRequest(data,'Manual');hideModal()};
  $('#simulateBtn').onclick=async()=>{const data={room_number:'512',guest_name:'Toh',request_type:'amenity',details:'2 extra towels',quantity:2,department:'housekeeping',priority:'normal'};if(state.live){await sendAction({action:'create',...data,source:'Voice simulation'});await refreshLive();}else createLocalRequest(data,'Voice')};

  initSupabase();
})();
