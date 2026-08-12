
const $ = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>[...r.querySelectorAll(s)];
let DATA, state = {selectedLot:null};
const LS_KEY='agroCopilotoV050';
const DIRTY_KEY='agroCopilotoDirtyV050';

function normalize(s){return (s??'').toString().trim().toLowerCase();}
function saved(){try{return JSON.parse(localStorage.getItem(LS_KEY))||{scouts:[],photos:[],tasks:[],validations:{}}}catch{return {scouts:[],photos:[],tasks:[],validations:{}}}}
async function pushLocalState(d=saved()){
  try{
    const r=await fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});
    if(r.ok){ localStorage.removeItem(DIRTY_KEY); return true; }
  }catch(e){}
  return false;
}
function persist(d){
  localStorage.setItem(LS_KEY,JSON.stringify(d));
  localStorage.setItem(DIRTY_KEY,'1');
  pushLocalState(d);
}
async function syncFromServer(){
  try{
    const local=saved();
    // Si hubo cambios sin señal, primero manda lo local para no perder la recorrida al reconectar.
    if(localStorage.getItem(DIRTY_KEY)==='1'){
      const ok=await pushLocalState(local);
      if(ok)return;
    }
    const r=await fetch('/api/state'); if(!r.ok)return;
    const remote=await r.json();
    const hasRemote=(remote.scouts?.length||remote.photos?.length||remote.tasks?.length||Object.keys(remote.validations||{}).length);
    if(hasRemote){ localStorage.setItem(LS_KEY,JSON.stringify(remote)); }
    else { await pushLocalState(local); }
  }catch(e){}
}
window.addEventListener('online',()=>pushLocalState());
function fmt(v,d=0){if(v===null||v===undefined||v==='')return '—'; const n=Number(v); return Number.isFinite(n)?n.toLocaleString('es-UY',{maximumFractionDigits:d,minimumFractionDigits:d}):v}
function parseCampaignDate(raw){
  if(!raw)return null;
  const m=raw.toString().trim().toLowerCase().match(/^(\d{1,2})[-\/]([a-záéíóú]{3,})/i);
  if(!m)return null;
  const months={ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,set:9,oct:10,nov:11,dic:12};
  const mon=months[m[2].slice(0,3)]; if(!mon)return null;
  return `2026-${String(mon).padStart(2,'0')}-${String(Number(m[1])).padStart(2,'0')}`;
}
function weatherStartForLot(l){
  return parseCampaignDate(l['Fecha siembra real']);
}
function maxDrySpell(daily, threshold=1){
  let best=0,cur=0;
  (daily||[]).forEach(x=>{ if(Number(x.precipitation||0)<threshold){cur++;best=Math.max(best,cur)} else cur=0; });
  return best;
}
async function loadWeatherForLot(l){
  const box=$('#weatherBox'); if(!box)return;
  const start=weatherStartForLot(l);
  if(!start){
    box.innerHTML='<div class="notice">Falta confirmar la fecha de siembra de este lote. No calculo clima desde siembra hasta tener esa fecha.</div>';
    return;
  }
  box.innerHTML='<div class="muted">Cargando serie meteorológica desde la siembra…</div>';
  try{
    const lat=DATA.weather?.latitude, lon=DATA.weather?.longitude;
    const q=new URLSearchParams({start,lat,lon});
    const r=await fetch('/api/weather?'+q.toString());
    const w=await r.json(); if(!r.ok)throw new Error(w.error||'No se pudo cargar clima');
    const s=w.summary||{}, ev=w.events||[];
    box.innerHTML=`
      <div class="grid four stats weather-stats">
        <div><div class="small muted">LLUVIA</div><b>${fmt(s.precipitation_mm,1)} mm</b><div class="small muted">${s.rain_days||0} días ≥1 mm</div></div>
        <div><div class="small muted">TEMPERATURA</div><b>${fmt(s.mean_temp_c,1)} °C</b><div class="small muted">${fmt(s.min_temp_c,1)} / ${fmt(s.max_temp_c,1)} °C</div></div>
        <div><div class="small muted">HELADAS</div><b>${s.frost_days||0}</b><div class="small muted">Tmin absoluta ${fmt(s.min_temp_c,1)} °C</div></div>
        <div><div class="small muted">SEQUÍA CORTA</div><b>${s.longest_dry_spell||0} días</b><div class="small muted">con &lt;1 mm/día</div></div>
      </div>
      <div class="grid three stats" style="margin-top:10px">
        <div><div class="small muted">ET0 ACUM.</div><b>${fmt(s.et0_mm,1)} mm</b></div>
        <div><div class="small muted">P − ET0</div><b>${fmt(s.water_balance_mm,1)} mm</b></div>
        <div><div class="small muted">PERÍODO</div><b>${w.start_date} → ${w.end_date}</b></div>
      </div>
      ${ev.length?`<div style="margin-top:12px"><b>Eventos destacados</b>${ev.map(e=>`<div class="small weather-event"><b>${e.date}</b> · ${e.text}</div>`).join('')}</div>`:''}
      <div class="small muted" style="margin-top:10px">Fuente automática: ${w.source}. Ubicación: centroide del establecimiento (${fmt(w.latitude,4)}, ${fmt(w.longitude,4)}). Referencia oficial para validación: INUMET / INIA GRAS.</div>`;
  }catch(e){
    box.innerHTML=`<div class="notice">No pude descargar la meteorología: ${e.message}. La app necesita conexión a internet para actualizar esta sección.</div>`;
  }
}
function lotKey(l){return `${l['Campo']}|${l['Lote']}|${l['Cultivo']||l['Cultivo/estado']||''}`}
function showView(id){
  $$('.view').forEach(v=>v.classList.toggle('active',v.id===id));
  $$('.bottomnav button').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
  if(id==='homeView')renderHome(); if(id==='lotsView')renderLots(); if(id==='scoutView')renderScout();
  if(id==='photosView')renderPhotos(); if(id==='prescriptionsView')renderPrescriptions(); if(id==='tasksView')renderTasks();
  window.scrollTo({top:0,behavior:'smooth'});
}
function getLot(campo,lote,cultivo){
  return DATA.lots.find(x=>normalize(x.Campo)===normalize(campo)&&normalize(x.Lote)===normalize(lote)&&(!cultivo||normalize(x.Cultivo)===normalize(cultivo)));
}
function lotPrescriptions(l){
  const match=(r)=>normalize(r.Campo)===normalize(l.Campo)&&normalize(r.Lote)===normalize(l.Lote);
  return {
    b2: DATA.prescriptionB2Z22.find(match),
    c1: DATA.prescriptionC1Z30.find(match)
  }
}
function currentScout(l){
  const s=saved().scouts.filter(x=>{
    if(x.lotKey) return x.lotKey===lotKey(l);
    return normalize(x.campo)===normalize(l.Campo) && normalize(x.lote)===normalize(l.Lote) &&
      (!x.cultivo || normalize(x.cultivo)===normalize(l.Cultivo));
  });
  return s.sort((a,b)=>b.ts-a.ts)[0];
}
function renderHome(){
  const db=saved(), lots=DATA.lots;
  const fields=[...new Set(lots.map(x=>x.Campo).filter(Boolean))];
  const withRx=lots.filter(l=>{const p=lotPrescriptions(l);return p.b2||p.c1}).length;
  const pendingRx=lots.filter(l=>{const p=lotPrescriptions(l); const key=lotKey(l); return (p.b2||p.c1)&&!db.validations[key]}).length;
  $('#homeView').innerHTML=`
    <div class="grid two">
      <div class="card"><div class="muted small">UNIDADES DE LOTE</div><div class="metric">${lots.length}</div><div class="muted">${fields.join(' · ')}</div></div>
      <div class="card"><div class="muted small">PRESCRIPCIONES SIN VALIDAR</div><div class="metric">${pendingRx}</div><div class="muted">${withRx} lotes con alguna dosis cargada</div></div>
    </div>
    <div class="card" style="margin-top:12px">
      <h3>Acciones rápidas</h3>
      <div class="grid two">
        <button class="btn" onclick="showView('scoutView')">+ Nueva recorrida</button>
        <button class="btn secondary" onclick="showView('photosView')">Analizar / guardar foto</button>
        <button class="btn secondary" onclick="showView('prescriptionsView')">Validar dosis</button>
        <button class="btn secondary" onclick="showView('tasksView')">Pendientes (${db.tasks.filter(t=>!t.done).length})</button>
      </div>
    </div>
    <div class="card" id="predictiveHome" style="margin-top:12px"><div class="muted">Cargando copiloto predictivo…</div></div>
    <div class="card" id="calendarHome" style="margin-top:12px"><div class="muted">Armando calendario agronómico…</div></div>
    <div class="card" style="margin-top:12px">
      <h3>Últimas recorridas</h3>
      <div class="stack">
      ${(db.scouts.slice().sort((a,b)=>b.ts-a.ts).slice(0,5).map(s=>`<div><b>${s.campo} ${s.lote}</b> · ${s.cultivo||''}<div class="small muted">${new Date(s.ts).toLocaleString('es-UY')} · ${s.stage||'sin estadio'} · ${s.condition||'sin estado'}</div></div>`).join(''))||'<div class="muted">Todavía no cargaste recorridas desde la app.</div>'}
      </div>
    </div>`;
  renderPredictiveDashboard();
  renderAgronomicCalendar();
}
function renderLots(){
  const fields=[...new Set(DATA.lots.map(x=>x.Campo).filter(Boolean))];
  $('#lotsView').innerHTML=`<div class="card"><h2>Lotes</h2><input id="lotSearch" class="search" placeholder="Buscar campo, lote, cultivo o variedad..." />
  <div class="tabs">${['Todos',...fields].map((f,i)=>`<button class="tab ${i===0?'active':''}" data-field="${f}">${f}</button>`).join('')}</div><div id="lotList" class="lot-list"></div></div>`;
  let filter='Todos';
  const draw=()=>{
    const q=normalize($('#lotSearch').value);
    let ls=DATA.lots.filter(l=>(filter==='Todos'||l.Campo===filter)&&normalize([l.Campo,l.Lote,l.Cultivo,l.Variedad].join(' ')).includes(q));
    $('#lotList').innerHTML=ls.map(l=>{
      const scout=currentScout(l), p=lotPrescriptions(l);
      return `<button class="lot-item" data-key="${encodeURIComponent(lotKey(l))}">
        <div class="row"><div><div class="lot-title">${l.Campo} · ${l.Lote}</div><div class="lot-meta">${l.Cultivo||'—'} · ${l.Variedad||'variedad pendiente'} · ${fmt(l['Superficie ha'],2)} ha</div></div>
        <span class="pill ${scout?'':'warn'}">${scout?.stage||'sin recorrida'}</span></div>
        <div class="lot-meta">${p.b2?`B2/Z22 ${fmt(p.b2['Promedio kg/ha'],2)} kg/ha`:''}${p.b2&&p.c1?' · ':''}${p.c1?`C1/Z30 ${fmt(p.c1['Promedio Urea azufrada kg/ha']||p.c1['Promedio kg/ha'],2)} kg/ha`:''}</div>
      </button>`}).join('');
    $$('.lot-item').forEach(b=>b.onclick=()=>{const key=decodeURIComponent(b.dataset.key);state.selectedLot=DATA.lots.find(l=>lotKey(l)===key);renderLot();showView('lotView')})
  };
  $('#lotSearch').oninput=draw;
  $$('.tab').forEach(t=>t.onclick=()=>{$$('.tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');filter=t.dataset.field;draw()});
  draw();
}
function relevantHistory(l){
  const target=normalize(l.Lote).replace(/\s+/g,' ');
  const belongs=(raw)=>{
    const s=normalize(raw).replace(/\s+/g,' ');
    if(s===target) return true;
    const parts=s.split('-').map(x=>x.trim()).filter(Boolean);
    if(parts.includes(target)) return true;
    if(target==='14-15' && (s==='14-15'||(parts.includes('14')&&parts.includes('15')))) return true;
    return false;
  };
  return DATA.history.filter(h=>normalize(h.Campo)===normalize(l.Campo) && belongs(h.Lote));
}

function groupedHistoryForLot(l){
  const rows = relevantHistory(l);
  const groups = {};
  rows.forEach(h=>{
    const date = h['Fecha real'] || h['Fecha recom'] || 'sin fecha';
    const rawLabor = (h.Labor || h.Recom || 'Labor').toString().trim();
    // Agroquímicos: todo lo que sea "Aplicar" el mismo día se muestra como una sola mezcla.
    // Fertilizaciones y siembras quedan separadas para no mezclar operaciones distintas.
    const laborNorm = normalize(rawLabor);
    let groupLabor = rawLabor;
    if(laborNorm.includes('aplicar')) groupLabor = 'Aplicación';
    else if(laborNorm.includes('fert')) groupLabor = 'Fertilización';
    else if(laborNorm.includes('siembra')) groupLabor = 'Siembra';

    const key = `${date}|||${groupLabor}`;
    if(!groups[key]) groups[key] = {date, labor:groupLabor, items:[], observations:[]};

    const product = (h.Producto||'').toString().trim();
    const dose = h['Dosis/ha'] ?? h['Dosis (lts, kgs/ha)'];
    if(product){
      const doseTxt = (dose===null || dose===undefined || dose==='') ? '' : fmt(dose,2);
      const item = `${product}${doseTxt ? ' '+doseTxt : ''}`.trim();
      if(!groups[key].items.includes(item)) groups[key].items.push(item);
    }
    if(h.Observaciones && !groups[key].observations.includes(h.Observaciones)){
      groups[key].observations.push(h.Observaciones);
    }
  });
  return Object.values(groups).reverse().slice(0,30);
}


function addDaysISO(iso,days){
  const d=new Date(iso+'T12:00:00'); d.setDate(d.getDate()+Math.round(days)); return d.toISOString().slice(0,10);
}
function isoFromTs(ts){return new Date(ts).toISOString().slice(0,10)}
function prettyISO(iso){if(!iso)return '—'; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`}
function protectionForLot(l){
  return (DATA.cropProtectionPlan||[]).find(x=>normalize(x.Campo)===normalize(l.Campo)&&normalize(x.Lote)===normalize(l.Lote)&&normalize(x.Cultivo)===normalize(l.Cultivo));
}
function isCereal(l){const c=normalize(l.Cultivo);return c.includes('trigo')||c.includes('cebada')}
function cerealObservedCode(stage){
  if(!stage)return null; const s=normalize(stage);
  let m=s.match(/z\s*(\d{2})\s*[\/\-]\s*z?\s*(\d{2})/i); if(m)return (+m[1]+ +m[2])/2;
  m=s.match(/z\s*(\d{2})/i); if(!m)return null; let v=+m[1];
  if(/avanz|entrando/.test(s))v+=0.6; return v;
}
const CEREAL_CURVE=[
  {code:29,label:'Z29 · macollaje avanzado',day:-8},
  {code:30,label:'Z30 · pseudotallo erecto',day:0},
  {code:31,label:'Z31 · 1er nudo perceptible',day:7},
  {code:32,label:'Z32 · 2º nudo perceptible',day:15},
  {code:37,label:'Z37 · hoja bandera visible',day:31},
  {code:39,label:'Z39 · hoja bandera totalmente emergida',day:38},
  {code:51,label:'Z51 · primera espiga visible',day:50},
  {code:59,label:'Z59 · espiga completamente emergida',day:59},
  {code:61,label:'Z61 · inicio de floración',day:62},
  {code:65,label:'Z65 · floración media',day:67},
  {code:69,label:'Z69 · floración terminada',day:73},
  {code:71,label:'Z71 · grano acuoso',day:80}
];
function curveDayForCode(code,curve){
  if(code===null||code===undefined)return null;
  let lo=curve[0],hi=curve[curve.length-1];
  for(let i=0;i<curve.length-1;i++){if(code>=curve[i].code&&code<=curve[i+1].code){lo=curve[i];hi=curve[i+1];break}}
  if(hi.code===lo.code)return lo.day;
  return lo.day+(code-lo.code)*(hi.day-lo.day)/(hi.code-lo.code);
}
function colzaObservedCode(stage){
  if(!stage)return null; const s=normalize(stage);
  let m=s.match(/bbch\s*(\d{2})\s*[\-\/]\s*(\d{2})/i); if(m)return (+m[1]+ +m[2])/2;
  m=s.match(/bbch\s*(\d{2})/i); if(m)return +m[1];
  if(/primeras flores|inicio reproductivo/.test(s))return 59.5;
  if(/reproductivo temprano/.test(s))return 57;
  if(/d1/.test(s))return 50.5;
  return null;
}
const COLZA_CURVE=[
  {code:50,label:'BBCH 50 · botón floral / inicio reproductivo',day:0},
  {code:51,label:'BBCH 51 · botón floral visible',day:2},
  {code:55,label:'BBCH 55 · inflorescencia desarrollándose',day:7},
  {code:59,label:'BBCH 59 · prefloración',day:12},
  {code:60,label:'BBCH 60 · primeras flores abiertas',day:14},
  {code:61,label:'BBCH 61 · inicio de floración',day:16},
  {code:63,label:'BBCH 63 · floración en avance',day:21},
  {code:65,label:'BBCH 65 · ~50% floración',day:27},
  {code:67,label:'BBCH 67 · floración declinante',day:34},
  {code:69,label:'BBCH 69 · fin de floración',day:42}
];
function phenologyProjection(l){
  const scout=currentScout(l), sow=weatherStartForLot(l), crop=normalize(l.Cultivo);
  let curve, observedCode=null, anchorDate=null, anchorCurveDay=null, conf='Baja', uncertainty=9, basis='Fecha de siembra + curva genérica';
  if(isCereal(l)){
    curve=CEREAL_CURVE; observedCode=cerealObservedCode(scout?.stage);
    if(observedCode!==null && scout){anchorDate=isoFromTs(scout.ts);anchorCurveDay=curveDayForCode(observedCode,curve);conf='Alta';uncertainty=4;basis='Zadoks observado en recorrida + fecha de siembra';}
    else if(sow){const z30Days=crop.includes('cebada')?66:73;anchorDate=addDaysISO(sow,z30Days);anchorCurveDay=0;conf=l.Variedad?'Media':'Baja';uncertainty=l.Variedad?7:10;basis='Fecha real de siembra + cultivo/variedad (sin Zadoks reciente)';}
  }else if(crop.includes('colza')){
    curve=COLZA_CURVE; observedCode=colzaObservedCode(scout?.stage);
    if(observedCode!==null && scout){anchorDate=isoFromTs(scout.ts);anchorCurveDay=curveDayForCode(observedCode,curve);conf='Alta';uncertainty=6;basis='BBCH/estado observado en recorrida + fecha de siembra';}
    else if(sow){anchorDate=addDaysISO(sow,68);anchorCurveDay=0;conf=l.Variedad?'Media':'Baja';uncertainty=12;basis='Fecha real de siembra + cultivo/variedad (estimación local)';}
  }else return null;
  if(!anchorDate)return {confidence:'Baja',basis:'Falta fecha de siembra y no hay estadio calibrable',milestones:[],stageAt:()=>null};
  const anchorMs=new Date(anchorDate+'T12:00:00').getTime();
  const dateFor=(x)=>addDaysISO(anchorDate,x.day-anchorCurveDay);
  const stageAt=(iso)=>{
    const target=new Date(iso+'T12:00:00').getTime(); const rel=anchorCurveDay+(target-anchorMs)/86400000;
    let before=curve[0],after=curve[curve.length-1];
    for(let i=0;i<curve.length-1;i++){if(rel>=curve[i].day&&rel<=curve[i+1].day){before=curve[i];after=curve[i+1];break}}
    if(rel<curve[0].day)return `${curve[0].label} o anterior`;
    if(rel>curve[curve.length-1].day)return `${curve[curve.length-1].label} o posterior`;
    return Math.abs(rel-before.day)<=Math.abs(after.day-rel)?before.label:after.label;
  };
  let keyCodes=isCereal(l)?[32,39,59,61,65]:[60,61,65,69];
  const milestones=keyCodes.map(c=>curve.find(x=>x.code===c)).filter(Boolean).map(x=>({...x,date:dateFor(x)}));
  return {confidence:conf,uncertainty,basis,milestones,stageAt,anchorDate,observedCode};
}

let FORECAST_PROMISE=null;
function daysBetweenISO(a,b){
  const A=new Date(a+'T12:00:00').getTime(), B=new Date(b+'T12:00:00').getTime();
  return Math.round((B-A)/86400000);
}
async function farmForecast(){
  if(FORECAST_PROMISE)return FORECAST_PROMISE;
  FORECAST_PROMISE=(async()=>{
    const lat=DATA.weather?.latitude,lon=DATA.weather?.longitude;
    const q=new URLSearchParams({lat,lon,days:10});
    const r=await fetch('/api/forecast?'+q.toString());
    const j=await r.json(); if(!r.ok)throw new Error(j.error||'No se pudo cargar pronóstico');
    return j;
  })();
  try{return await FORECAST_PROMISE}catch(e){FORECAST_PROMISE=null;throw e}
}

function calendarEvent(date,title,detail,l,type='fenologia',priority='media'){
  return {date,title,detail,type,priority,campo:l?.Campo||'',lote:l?.Lote||'',cultivo:l?.Cultivo||'',key:l?lotKey(l):''};
}
function calendarEventsForLot(l){
  const out=[],pr=phenologyProjection(l),prot=protectionForLot(l);
  if(pr?.milestones){
    pr.milestones.forEach(m=>out.push(calendarEvent(m.date,m.label,`Estimado · confianza ${pr.confidence.toLowerCase()} · ±${pr.uncertainty||'?'} días`,l,'fenologia','media')));
  }
  const op=DATA.operationalPlan;
  if(op && op.crops?.some(c=>normalize(c)===normalize(l.Cultivo)) && prot && /planificado/i.test(prot.Estado||'')){
    const mix=(prot.items||[]).map(x=>`${x.Producto} ${fmt(x.Dosis,2)} ${x.Unidad||''}`).join(' + ');
    out.push(calendarEvent(op.startDate,'Aplicación prevista con mosquito',`${mix}. ${op.notes}`,l,'aplicacion','alta'));
  }
  return out;
}
function calendarBucket(events,days){
  const today='2026-08-12';
  return events.filter(e=>{const d=daysBetweenISO(today,e.date);return d>=0&&d<=days}).sort((a,b)=>a.date.localeCompare(b.date)||({alta:0,media:1,baja:2}[a.priority]-({alta:0,media:1,baja:2}[b.priority])));
}
function calItemHTML(e){
  return `<div class="calendar-item" data-cal-key="${encodeURIComponent(e.key||'')}">
    <div class="row"><div><b>${prettyISO(e.date)} · ${e.title}</b><div class="small">${e.campo} ${e.lote} · ${e.cultivo}</div></div><span class="pill ${e.priority==='alta'?'warn':''}">${e.type}</span></div>
    <div class="small muted" style="margin-top:4px">${e.detail}</div>
  </div>`;
}
async function renderAgronomicCalendar(){
  const box=$('#calendarHome'); if(!box)return;
  const events=DATA.lots.flatMap(calendarEventsForLot);
  const b7=calendarBucket(events,7), b15=calendarBucket(events,15), b30=calendarBucket(events,30);
  box.innerHTML=`<div class="row"><div><h3>Calendario agronómico</h3><div class="small muted">Ventanas de 7 / 15 / 30 días. Las fechas fenológicas son estimadas; las labores quedan planificadas hasta que confirmes ejecución.</div></div><span class="pill">7·15·30</span></div>
    <div class="grid three calendar-grid" style="margin-top:12px">
      <div><h4>Próximos 7 días</h4><div class="stack">${b7.length?b7.slice(0,18).map(calItemHTML).join(''):'<div class="muted small">Sin eventos destacados.</div>'}</div></div>
      <div><h4>8–15 días</h4><div class="stack">${b15.filter(e=>!b7.includes(e)).slice(0,18).map(calItemHTML).join('')||'<div class="muted small">Sin eventos destacados.</div>'}</div></div>
      <div><h4>16–30 días</h4><div class="stack">${b30.filter(e=>!b15.includes(e)).slice(0,18).map(calItemHTML).join('')||'<div class="muted small">Sin eventos destacados.</div>'}</div></div>
    </div>`;
  $$('#calendarHome [data-cal-key]').forEach(el=>el.onclick=()=>{const key=decodeURIComponent(el.dataset.calKey||'');if(!key)return;const l=DATA.lots.find(x=>lotKey(x)===key);if(l){state.selectedLot=l;renderLot();showView('lotView')}});
}

function alertItem(severity,title,text,l,kind='operativo'){
  const rank={alta:3,media:2,baja:1,info:0}[severity]??0;
  return {severity,rank,title,text,kind,lot:l?lotKey(l):null,campo:l?.Campo,lote:l?.Lote,cultivo:l?.Cultivo};
}
function isStageWindow(pr,low,high,iso){
  if(!pr||!iso)return false;
  const text=pr.stageAt(iso)||'';
  const m=text.match(/(?:Z|BBCH)\s*(\d{2})/i);
  if(!m)return false; const z=Number(m[1]); return z>=low&&z<=high;
}
function predictiveAlertsForLot(l,forecast){
  const out=[],today=new Date().toISOString().slice(0,10), scout=currentScout(l), p=lotPrescriptions(l), pr=phenologyProjection(l);
  const daily=forecast?.daily||[], seven=daily.slice(0,7);
  const rain7=seven.reduce((a,r)=>a+Number(r.precipitation||0),0);
  const heavy=seven.filter(r=>Number(r.precipitation||0)>=25);
  const frosts=seven.filter(r=>Number(r.tmin)<0);
  const windy=seven.filter(r=>Number(r.wind_gusts)>=45);
  const crop=normalize(l.Cultivo);

  if(pr?.milestones?.length){
    const upcoming=pr.milestones.map(m=>({...m,days:daysBetweenISO(today,m.date)})).filter(m=>m.days>=0&&m.days<=10).sort((a,b)=>a.days-b.days)[0];
    if(upcoming){
      out.push(alertItem('info','Fenología próxima',`${upcoming.label} estimado para ${prettyISO(upcoming.date)} (±${pr.uncertainty} d).`,l,'fenología'));
    }
  }
  if(frosts.length){
    const d=frosts[0];
    const reproductive=crop.includes('colza') ? isStageWindow(pr,55,69,d.date) : isStageWindow(pr,30,69,d.date);
    out.push(alertItem(reproductive?'alta':'media','Helada pronosticada',`${prettyISO(d.date)}: Tmin ${fmt(d.tmin,1)} °C${reproductive?' coincidiendo con una etapa sensible/activa estimada':''}. Revisar el lote después del evento.`,l,'clima'));
  }
  if(heavy.length||rain7>=35){
    const peak=heavy.sort((a,b)=>Number(b.precipitation||0)-Number(a.precipitation||0))[0];
    const detail=peak?`${fmt(peak.precipitation,1)} mm el ${prettyISO(peak.date)}`:`${fmt(rain7,1)} mm acumulados en 7 días`;
    out.push(alertItem('media','Ventana de ingreso / piso',`${detail}. Puede condicionar aplicaciones y recorridas; priorizar decisiones pendientes antes del evento si las condiciones de aplicación son adecuadas.`,l,'operativo'));
  }
  if(rain7<5 && (crop.includes('trigo')||crop.includes('cebada')||crop.includes('colza'))){
    out.push(alertItem('baja','Semana seca pronosticada',`Menos de 5 mm previstos en 7 días. Seguir evolución del cultivo y balance hídrico; no equivale a diagnóstico de estrés.`,l,'clima'));
  }
  if(windy.length){
    const d=windy.sort((a,b)=>Number(b.wind_gusts||0)-Number(a.wind_gusts||0))[0];
    out.push(alertItem('baja','Viento fuerte en el pronóstico',`Ráfagas diarias máximas cercanas a ${fmt(d.wind_gusts,0)} km/h el ${prettyISO(d.date)}. Verificar condiciones horarias antes de pulverizar.`,l,'operativo'));
  }
  if(p.c1 && !saved().validations[lotKey(l)]){
    const observed=(scout?.stage||'');
    if(/Z3[0-9]/i.test(observed) || isStageWindow(pr,30,39,today)){
      out.push(alertItem('alta','N C1/Z30 pendiente de validar',`El lote ya está en encañado observado/estimado y mantiene una prescripción C1/Z30 sin decisión registrada.`,l,'nutrición'));
    }
  }
  if(crop.includes('trigo')){
    const protection=protectionForLot(l);
    const unico=(protection?.items||[]).find(x=>normalize(x.producto||x.Producto).includes('unico') && /0[,.]?55/.test(String(x.dosis||x.Dosis||x['Dosis/ha']||'')));
    if(unico && (/Z3[0-9]/i.test(scout?.stage||'') || isStageWindow(pr,30,39,today))){
      out.push(alertItem(rain7>=20?'alta':'media','Fungicida planificado',`Único 0,550 L/ha está definido y el trigo está en encañado. Revisar ventana de aplicación y piso; la app no decide la aplicación automáticamente.`,l,'sanidad'));
    }
  }
  if(crop.includes('cebada') && (normalize(scout?.condition).includes('muy bueno')||/vuelco/i.test((scout?.notes||'')+' '+(scout?.condition||'')))){
    out.push(alertItem('media','Biomasa / vuelco',`Canopia vigorosa o antecedente de vuelco en la recorrida. Revisar biomasa, N y riesgo de vuelco antes de cerrar decisiones nutricionales.`,l,'nutrición'));
  }
  if(normalize(l.Campo)==='isletas'&&normalize(l.Lote)==='13'){
    out.push(alertItem('media','Sector ralo / NDVI',`Se estimó visualmente ~21% sin cultivo en el mapa NDVI compartido. Mantenerlo como alerta hasta cuantificar con raster/polígono.`,l,'mapa'));
  }
  if(scout && /aneg|helad|ralo|desuniform|heterog/i.test((scout.notes||'')+' '+(scout.condition||''))){
    out.push(alertItem('media','Seguimiento de heterogeneidad',`La última recorrida registró heterogeneidad, anegamiento, helada o stand ralo. Comparar los mismos sectores en la próxima visita.`,l,'recorrida'));
  }
  return out.sort((a,b)=>b.rank-a.rank);
}
function severityLabel(s){return s==='alta'?'ALTA':s==='media'?'MEDIA':s==='baja'?'BAJA':'INFO'}
function alertHTML(a,compact=false){
  return `<div class="predict-alert sev-${a.severity}" ${a.lot?`data-alert-lot="${encodeURIComponent(a.lot)}"`:''}>
    <div class="predict-head"><span class="alert-badge ${a.severity}">${severityLabel(a.severity)}</span><b>${a.title}</b>${a.campo?`<span class="muted small">${a.campo} ${a.lote} · ${a.cultivo||''}</span>`:''}</div>
    <div class="${compact?'small':''}">${a.text}</div>
  </div>`;
}
async function renderPredictiveDashboard(){
  const box=$('#predictiveHome'); if(!box)return;
  try{
    const f=await farmForecast(), s=f.summary||{};
    let alerts=DATA.lots.flatMap(l=>predictiveAlertsForLot(l,f))
      .filter(a=>!['Ventana de ingreso / piso','Semana seca pronosticada','Viento fuerte en el pronóstico'].includes(a.title));
    const seven=(f.daily||[]).slice(0,7), rain7=Number(s.precipitation_7d_mm||0);
    const heavy=seven.filter(r=>Number(r.precipitation||0)>=25).sort((a,b)=>Number(b.precipitation||0)-Number(a.precipitation||0))[0];
    const windy=seven.filter(r=>Number(r.wind_gusts||0)>=45).sort((a,b)=>Number(b.wind_gusts||0)-Number(a.wind_gusts||0))[0];
    if(heavy||rain7>=35){
      const detail=heavy?`${fmt(heavy.precipitation,1)} mm el ${prettyISO(heavy.date)}`:`${fmt(rain7,1)} mm acumulados en 7 días`;
      alerts.push(alertItem('media','Piso / ingreso al establecimiento',`${detail}. Puede condicionar aplicaciones y recorridas en varios lotes.`,null,'operativo'));
    }else if(rain7<5){
      alerts.push(alertItem('baja','Semana seca a escala de campo',`Menos de 5 mm previstos en 7 días. Seguir balance hídrico y respuesta por ambiente.`,null,'clima'));
    }
    if(windy) alerts.push(alertItem('baja','Viento fuerte a escala de campo',`Ráfagas máximas diarias cercanas a ${fmt(windy.wind_gusts,0)} km/h el ${prettyISO(windy.date)}. Verificar condiciones horarias antes de pulverizar.`,null,'operativo'));
    const dedup=new Map();
    alerts.forEach(a=>{const k=[a.title,a.lot||'campo'].join('|'); if(!dedup.has(k)||dedup.get(k).rank<a.rank)dedup.set(k,a)});
    alerts=[...dedup.values()].sort((a,b)=>b.rank-a.rank).slice(0,10);
    box.innerHTML=`
      <div class="row"><div><h3>Copiloto · próximos 10 días</h3><div class="small muted">Cruza fenología estimada, recorridas, decisiones pendientes y pronóstico.</div></div><span class="pill">predictivo</span></div>
      <div class="grid four stats forecast-strip" style="margin-top:12px">
        <div><div class="small muted">LLUVIA 7 DÍAS</div><b>${fmt(s.precipitation_7d_mm,1)} mm</b></div>
        <div><div class="small muted">TMIN 10 DÍAS</div><b>${fmt(s.min_temp_c,1)} °C</b><div class="small muted">${s.frost_days||0} días &lt;0 °C</div></div>
        <div><div class="small muted">RÁFAGA MÁX.</div><b>${fmt(s.max_wind_gust_kmh,0)} km/h</b></div>
        <div><div class="small muted">PRONÓSTICO</div><b>${f.start_date} → ${f.end_date}</b></div>
      </div>
      <div class="predict-list">${alerts.length?alerts.map(a=>alertHTML(a,true)).join(''):'<div class="muted">Sin alertas destacadas con las reglas actuales.</div>'}</div>
      <div class="small muted" style="margin-top:10px">Alertas de seguimiento, no recomendaciones automáticas. Pronóstico: ${f.source}. La recorrida y la decisión técnica prevalecen.</div>`;
    $$('[data-alert-lot]',box).forEach(el=>el.onclick=()=>{const key=decodeURIComponent(el.dataset.alertLot);const l=DATA.lots.find(x=>lotKey(x)===key);if(l){state.selectedLot=l;renderLot();showView('lotView')}});
  }catch(e){box.innerHTML=`<div class="notice">No pude cargar el pronóstico predictivo: ${e.message}</div>`}
}
async function renderLotPredictive(l){
  const box=$('#lotPredictive'); if(!box)return;
  try{
    const f=await farmForecast(), alerts=predictiveAlertsForLot(l,f);
    box.innerHTML=alerts.length?alerts.map(a=>alertHTML(a)).join(''):'<div class="muted">Sin alertas destacadas para este lote con las reglas actuales.</div>';
  }catch(e){box.innerHTML=`<div class="notice">No pude actualizar alertas: ${e.message}</div>`}
}

function renderPhenology(l){
  const box=$('#phenologyBox'); if(!box)return;
  const pr=phenologyProjection(l); if(!pr){box.innerHTML='<div class="muted">Sin modelo para este cultivo.</div>';return}
  if(!pr.milestones.length){box.innerHTML='<div class="notice">No hay fecha de siembra explícita en la planilla madre ni un estadio que permita calibrar con seguridad. No invento una fecha.</div>';return}
  const today=new Date().toISOString().slice(0,10); const current=pr.stageAt(today);
  const ref=isCereal(l)?`<a href="${DATA.phenologyModel?.iniaFloweringReference||'#'}" target="_blank" rel="noopener">Modelo fenológico INIA (floración)</a>`:'Colza: estimación local calibrada; no se presenta como salida oficial de un modelo INIA.';
  box.innerHTML=`
    <div class="grid three stats phenology-summary">
      <div><div class="small muted">ESTIMADO HOY</div><b>${current||'—'}</b></div>
      <div><div class="small muted">CONFIANZA</div><b>${pr.confidence}</b><div class="small muted">±${pr.uncertainty} días aprox.</div></div>
      <div><div class="small muted">BASE</div><b class="small">${pr.basis}</b></div>
    </div>
    <div class="phenology-track">${pr.milestones.map(m=>`<div class="phenology-milestone"><b>${m.label}</b><span>${prettyISO(m.date)} <span class="muted">±${pr.uncertainty} d</span></span></div>`).join('')}</div>
    <div class="date-query"><label>¿Qué estadio estimamos para una fecha?</label><div class="row"><input id="phenDate" type="date" value="${today}"><div id="phenAnswer" class="phen-answer"></div></div></div>
    <div class="small muted" style="margin-top:10px">${ref}. La recorrida real manda: cada nuevo Zadoks/BBCH recalibra la curva. Para trigo/cebada, INIA calcula floración usando localidad, época de emergencia y variedad; esta app usa una aproximación operacional desde siembra y la corrige con tus observaciones.</div>`;
  const inp=$('#phenDate'),ans=$('#phenAnswer'); const upd=()=>ans.textContent=pr.stageAt(inp.value)||'—'; inp.onchange=upd; upd();
}

function renderLot(){
  const l=state.selectedLot;if(!l)return;
  const p=lotPrescriptions(l), db=saved(), val=db.validations[lotKey(l)], scout=currentScout(l), protection=protectionForLot(l);
  const hist=groupedHistoryForLot(l);
  const lotPhotos=db.photos.filter(x=>x.lotKey===lotKey(l)||(
    normalize(x.campo)===normalize(l.Campo)&&normalize(x.lote)===normalize(l.Lote)
  ));
  const latestNotes=scout?.notes||'Sin observación de recorrida cargada.';
  const sowDose=l['Dosis siembra']!==null&&l['Dosis siembra']!==undefined?`${fmt(l['Dosis siembra'],1)} ${normalize(l.Cultivo).includes('colza')?'kg/ha':'kg/ha'}`:'—';
  const c1=p.c1?fmt(p.c1['Promedio Urea azufrada kg/ha']||p.c1['Promedio kg/ha'],2)+' kg/ha':'—';
  const alerts=[];
  if(scout?.condition && /heterog|ralo|desuniform|flaco|vuelco/i.test((scout.condition||'')+' '+(scout.notes||''))) alerts.push(scout.condition);
  if(normalize(l.Campo)==='isletas'&&normalize(l.Lote)==='13') alerts.push('NDVI: ~21% sin cultivo (estimación visual, falta raster)');
  if(normalize(l.Campo)==='isletas'&&normalize(l.Lote)==='11 chico') alerts.push('Revisar N por biomasa/riesgo de vuelco');
  $('#lotView').innerHTML=`
  <button class="ghost" onclick="showView('lotsView')">← Volver</button>
  <div class="card hero-lot" style="margin-top:10px">
    <div class="row"><div><div class="eyebrow">${l.Campo}</div><h2>${l.Lote} · ${l.Cultivo||'Cultivo pendiente'}</h2></div><span class="pill ${scout?'':'warn'}">${scout?.stage||'sin recorrida'}</span></div>
    <div class="grid four stats" style="margin-top:14px">
      <div><div class="small muted">SUPERFICIE</div><b>${fmt(l['Superficie ha'],2)} ha</b></div>
      <div><div class="small muted">VARIEDAD</div><b>${l.Variedad||'A verificar'}</b></div>
      <div><div class="small muted">SIEMBRA</div><b>${l['Fecha siembra real']||'A verificar'}</b><div class="small muted">${sowDose}</div>${l['Dato siembra nota']?`<div class="small source-note">${l['Dato siembra nota']}</div>`:''}</div>
      <div><div class="small muted">ÚLTIMA RECORRIDA</div><b>${scout?new Date(scout.ts).toLocaleDateString('es-UY'):'Sin recorrida'}</b></div>
    </div>
  </div>

  <div class="grid two" style="margin-top:10px">
    <div class="card">
      <div class="row"><h3>Estado actual</h3><button class="ghost" onclick="state.prefillLot='${encodeURIComponent(lotKey(l))}';showView('scoutView')">+ Recorrida</button></div>
      <div class="status-stage">${scout?.stage||'Sin estadio cargado'}</div>
      <div class="small muted">${scout?.condition||'Sin calificación'}</div>
      <p>${latestNotes}</p>
      ${alerts.length?`<div class="notice"><b>A mirar:</b> ${alerts.join(' · ')}</div>`:''}
    </div>
    <div class="card">
      <h3>Qué mirar ahora</h3>
      <div class="checklines">
        ${normalize(l.Cultivo).includes('cebada')?'<div>• Confirmar estadio y riesgo de vuelco antes de cerrar N.</div>':''}
        ${normalize(l.Cultivo).includes('trigo')?'<div>• Ventana de fungicida + Único 0,550 L/ha definida con Dioni; ejecutar cuando haya piso.</div>':''}
        ${normalize(l.Cultivo).includes('colza')?'<div>• Uniformidad, compensación, floración y sectores afectados por agua/helada.</div>':''}
        <div>• Registrar cambios respecto a la recorrida anterior.</div>
      </div>
    </div>
  </div>

  <div class="card" style="margin-top:10px">
    <div class="row"><h3>Alertas predictivas</h3><span class="pill">próximos 10 días</span></div>
    <div id="lotPredictive"><div class="muted">Cruzando clima, fenología y decisiones…</div></div>
  </div>

  <div class="card" style="margin-top:10px">
    <div class="row"><h3>Fenología estimada</h3><span class="pill">estimación · no reemplaza recorrida</span></div>
    <div id="phenologyBox"><div class="muted">Calculando proyección…</div></div>
  </div>

  <div class="card" style="margin-top:10px">
    <h3>Nutrición y prescripciones</h3>
    <table><tr><th>Momento / fuente</th><th>Dosis</th><th>Estado</th></tr>
      <tr><td>SPS base</td><td>${fmt(l['SPS kg/ha'],0)} kg/ha</td><td>Realizado / fuente planilla</td></tr>
      <tr><td>KCl base</td><td>${fmt(l['KCl kg/ha'],0)} kg/ha</td><td>Realizado / fuente planilla</td></tr>
      <tr><td>Urea S base</td><td>${fmt(l['Urea S base kg/ha'],0)} kg/ha</td><td>Realizado / fuente planilla</td></tr>
      <tr><td>B2/Z22</td><td>${p.b2?fmt(p.b2['Promedio kg/ha'],2)+' kg/ha':'—'}</td><td>${p.b2?.Estado||'—'}</td></tr>
      <tr><td>C1/Z30</td><td>${c1}</td><td>${val?.decision||'Pendiente de validación'}</td></tr>
    </table>
    <button class="btn secondary" style="margin-top:10px" onclick="state.prefillLot='${encodeURIComponent(lotKey(l))}';showView('prescriptionsView')">Validar prescripción</button>
  </div>

  <div class="card" style="margin-top:10px">
    <h3>Sanidad · receta / estado</h3>
    ${protection?`<div class="row"><div><b>${protection.items.map(x=>`${x.Producto} ${fmt(x.Dosis,3)} ${x.Unidad}`).join(' + ')}</b><div class="small muted" style="margin-top:5px">${protection.Motivo||''}</div><div class="small muted">Fuente: ${protection.Fuente||'—'}</div></div><span class="pill ${/verificar/i.test(protection.Estado||'')?'warn':''}">${protection.Estado}</span></div>`:'<div class="muted">Sin receta sanitaria normalizada para este lote.</div>'}
  </div>

  <div class="card" style="margin-top:10px">
    <h3>Labores realizadas · cronología planilla madre</h3>
    <div class="timeline">${hist.map(h=>`<div class="timeline-item"><div class="date">${h.date}</div><div class="event">${h.labor}</div><div class="mixline">${h.items.join(' + ')||'Sin productos detallados'}</div>${h.observations.length?`<div class="small muted">${h.observations.join(' · ')}</div>`:''}</div>`).join('')||'<div class="muted">Sin historial coincidente.</div>'}</div>
  </div>

  <div class="grid two" style="margin-top:10px">
    <div class="card">
      <h3>Clima desde siembra</h3>
      <div id="weatherBox"><div class="muted">Preparando datos meteorológicos…</div></div>
    </div>
    <div class="card">
      <h3>Mapas, NDVI y fotos</h3>
      ${normalize(l.Campo)==='isletas'&&normalize(l.Lote)==='13'?'<div><b>NDVI 10/08</b><div class="small">Estimación visual: ~79% con cultivo (~49–50 ha) y ~21% sin cultivo. Pendiente cálculo exacto con raster/GeoTIFF.</div></div>':''}
      <div class="small muted" style="margin-top:8px">${lotPhotos.length} foto(s) guardada(s) desde la app.</div>
      <button class="btn secondary" style="margin-top:10px" onclick="showView('photosView')">Agregar / analizar foto</button>
    </div>
  </div>`;
  renderPhenology(l);
  loadWeatherForLot(l);
  renderLotPredictive(l);
}
function lotOptions(){
  return DATA.lots.map(l=>`<option value="${encodeURIComponent(lotKey(l))}">${l.Campo} · ${l.Lote} · ${l.Cultivo||''}</option>`).join('')
}
function renderScout(){
  $('#scoutView').innerHTML=`<div class="card"><h2>Nueva recorrida</h2><div class="formgrid">
    <div class="span2"><label>Lote</label><select id="scLot"><option value="">Seleccionar...</option>${lotOptions()}</select></div>
    <div><label>Estadio</label><input id="scStage" placeholder="Ej. Z29, Z30, C1" /></div>
    <div><label>Estado general</label><select id="scCondition"><option></option><option>Muy bueno</option><option>Bueno</option><option>Regular</option><option>Malo</option></select></div>
    <div><label>Uniformidad</label><select id="scUniform"><option></option><option>Alta</option><option>Media</option><option>Baja</option></select></div>
    <div><label>Exceso hídrico</label><select id="scWater"><option></option><option>Nada</option><option>Leve</option><option>Medio</option><option>Severo</option></select></div>
    <div class="span2"><label>Observación</label><textarea id="scNotes" placeholder="Qué viste y qué decisión te genera..."></textarea></div>
    <div class="span2"><button class="btn" id="saveScout">Guardar recorrida</button></div>
  </div></div>`;
  if(state.prefillLot){$('#scLot').value=decodeURIComponent(state.prefillLot);state.prefillLot=null}
  $('#saveScout').onclick=()=>{
    const key=$('#scLot').value;if(!key)return alert('Elegí un lote');
    const l=DATA.lots.find(x=>lotKey(x)===decodeURIComponent(key)), db=saved();
    db.scouts.push({ts:Date.now(),lotKey:lotKey(l),campo:l.Campo,lote:l.Lote,cultivo:l.Cultivo,stage:$('#scStage').value,condition:$('#scCondition').value,uniformity:$('#scUniform').value,water:$('#scWater').value,notes:$('#scNotes').value});
    persist(db);state.selectedLot=l;alert('Recorrida guardada');renderLot();showView('lotView');
  }
}
function renderPhotos(){
  const db=saved();
  $('#photosView').innerHTML=`<div class="card"><h2>Fotos de recorrida</h2>
  <div class="notice">Sacá una foto, elegí qué querés analizar y agregá contexto. La imagen se guarda en tu PC y, cuando la IA está configurada, devuelve identificación probable, confianza y qué mirar para confirmar.</div>
  <div class="formgrid" style="margin-top:12px">
    <div class="span2"><label>Lote</label><select id="phLot"><option value="">Seleccionar...</option>${lotOptions()}</select></div>
    <div><label>Qué querés analizar</label><select id="phType"><option>Estadio fenológico</option><option>Maleza</option><option>Enfermedad</option><option>Plaga</option><option>Deficiencia / daño</option><option>General</option></select></div>
    <div><label>Foto</label><input id="phFile" type="file" accept="image/*" capture="environment" /></div>
    <div class="span2"><img id="phPreview" class="photo-preview hidden"/></div>
    <div class="span2"><label>Tu hipótesis / contexto</label><textarea id="phNotes" placeholder="Ej. Para mí es raigrás. Está dentro de cebada, en un bajo..."></textarea></div>
    <div class="span2"><button id="analyzePhoto" class="btn">Analizar foto</button></div>
    <div class="span2"><div id="aiBox" class="analysis"><b>Análisis IA</b><div class="muted small">Todavía no analizado.</div></div></div>
  </div></div>
  <div class="card" style="margin-top:10px"><h3>Últimas fotos</h3>${db.photos.slice().reverse().slice(0,8).map(p=>`<div style="margin-bottom:10px"><b>${p.campo} ${p.lote}</b> · ${p.type}<div class="small muted">${new Date(p.ts).toLocaleString('es-UY')} · ${p.notes||''}</div>${p.result?`<div class="small">${p.result.slice(0,180)}${p.result.length>180?'…':''}</div>`:''}</div>`).join('')||'<div class="muted">Sin fotos guardadas.</div>'}</div>`;
  let imgFile=null;
  $('#phFile').onchange=e=>{
    imgFile=e.target.files[0]; if(!imgFile)return;
    const r=new FileReader(); r.onload=()=>{$('#phPreview').src=r.result;$('#phPreview').classList.remove('hidden')}; r.readAsDataURL(imgFile);
  };
  $('#analyzePhoto').onclick=async()=>{
    const key=$('#phLot').value; if(!key)return alert('Elegí un lote');
    if(!imgFile)return alert('Sacá o elegí una foto');
    const l=DATA.lots.find(x=>lotKey(x)===decodeURIComponent(key));
    const btn=$('#analyzePhoto'); btn.disabled=true; btn.textContent='Analizando...';
    $('#aiBox').innerHTML='<b>Análisis IA</b><div class="muted small">Procesando foto...</div>';
    const fd=new FormData();
    fd.append('image',imgFile);
    fd.append('campo',l.Campo||''); fd.append('lote',l.Lote||''); fd.append('cultivo',l.Cultivo||'');
    fd.append('analysis_type',$('#phType').value); fd.append('notes',$('#phNotes').value);
    try{
      const r=await fetch('/api/analyze-photo',{method:'POST',body:fd});
      const out=await r.json();
      if(!r.ok) throw new Error(out.error||'Error');
      $('#aiBox').innerHTML=`<b>Análisis IA</b><div style="white-space:pre-wrap;margin-top:6px">${out.result}</div>`;
      const db=saved();
      db.photos.push({ts:Date.now(),lotKey:lotKey(l),campo:l.Campo,lote:l.Lote,type:$('#phType').value,notes:$('#phNotes').value,result:out.result,photo_id:out.photo_id});
      persist(db);
    }catch(e){
      $('#aiBox').innerHTML=`<b>Análisis IA</b><div class="small" style="color:#8b2626">${e.message}</div>`;
    }finally{
      btn.disabled=false; btn.textContent='Analizar foto';
    }
  };
}
function renderPrescriptions(){
  const db=saved();
  const rows=DATA.lots.filter(l=>{const p=lotPrescriptions(l);return p.b2||p.c1});
  $('#prescriptionsView').innerHTML=`<div class="card"><h2>Validación de dosis</h2><input id="rxSearch" class="search" placeholder="Buscar lote..." />
    <div id="rxList" class="stack"></div></div>`;
  const draw=()=>{
    const q=normalize($('#rxSearch').value);
    $('#rxList').innerHTML=rows.filter(l=>normalize([l.Campo,l.Lote,l.Cultivo].join(' ')).includes(q)).map(l=>{
      const p=lotPrescriptions(l), key=lotKey(l), v=db.validations[key];
      const c1v=p.c1?.['Promedio Urea azufrada kg/ha']??p.c1?.['Promedio kg/ha'];
      return `<div class="card" style="box-shadow:none">
      <div class="row"><div><b>${l.Campo} ${l.Lote}</b><div class="small muted">${l.Cultivo||''}</div></div><span class="pill ${v?'':'warn'}">${v?.decision||'Pendiente'}</span></div>
      <div class="small" style="margin:8px 0">B2/Z22: <b>${p.b2?fmt(p.b2['Promedio kg/ha'],2):'—'}</b> · C1/Z30: <b>${c1v?fmt(c1v,2):'—'}</b> kg/ha</div>
      <div class="decision-grid">
        ${['Mantener','Bajar','Subir','Consultar'].map(d=>`<button data-key="${encodeURIComponent(key)}" data-decision="${d}" class="${v?.decision===d?'selected':''}">${d}</button>`).join('')}
      </div></div>`}).join('');
    $$('#rxList .decision-grid button').forEach(b=>b.onclick=()=>{const key=decodeURIComponent(b.dataset.key);db.validations[key]={decision:b.dataset.decision,ts:Date.now()};persist(db);draw()})
  }; $('#rxSearch').oninput=draw; draw();
}
function renderTasks(){
 const db=saved();
 $('#tasksView').innerHTML=`<div class="card"><h2>Pendientes</h2><div class="row"><input id="taskText" placeholder="Ej. Recorrer Isletas 13 el martes"><button class="btn" id="addTask">+</button></div>
 <div class="stack" style="margin-top:12px">${db.tasks.map((t,i)=>`<label class="row" style="border-bottom:1px solid var(--line);padding:8px 0"><span><input type="checkbox" data-i="${i}" ${t.done?'checked':''} style="width:auto;margin-right:8px">${t.text}</span><span class="small muted">${new Date(t.ts).toLocaleDateString('es-UY')}</span></label>`).join('')||'<div class="muted">Sin pendientes.</div>'}</div></div>`;
 $('#addTask').onclick=()=>{const text=$('#taskText').value.trim();if(!text)return;db.tasks.push({text,done:false,ts:Date.now()});persist(db);renderTasks()};
 $$('#tasksView input[type=checkbox]').forEach(c=>c.onchange=()=>{db.tasks[+c.dataset.i].done=c.checked;persist(db)});
}
document.addEventListener('click',e=>{const b=e.target.closest('.bottomnav button');if(b)showView(b.dataset.view)});
fetch('data.json').then(r=>r.json()).then(async d=>{DATA=d;await syncFromServer();renderHome()}).catch(err=>{document.body.innerHTML='<p style="padding:20px">No se pudo cargar data.json. Abrí la app mediante un servidor local, no directamente como file://.</p>'});
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
let deferredPrompt;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('#installBtn').classList.remove('hidden')});
$('#installBtn').onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('#installBtn').classList.add('hidden')}};
