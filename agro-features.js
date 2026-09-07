function parseCampaignDateSimple(raw){
  if(!raw)return null;
  const s=String(raw).trim().toLowerCase();
  let m=s.match(/^(\d{1,2})[-\/]([a-záéíóú]{3,})/i);
  if(m){const months={ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,set:9,oct:10,nov:11,dic:12};const mon=months[m[2].slice(0,3)];if(mon)return `2026-${String(mon).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`;}
  if(/^2026-\d{2}-\d{2}$/.test(s))return s;
  return null;
}
function addDaysISO(iso,days){const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+Math.round(days));return d.toISOString().slice(0,10)}
function daysBetween(a,b){return Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/86400000)}
function cerealCode(stage){const s=String(stage||'').toLowerCase();let m=s.match(/z\s*(\d{2})\s*[\-\/]\s*z?\s*(\d{2})/i);if(m)return(+m[1]+ +m[2])/2;m=s.match(/z\s*(\d{2})/i);return m?+m[1]:null}
function colzaCode(stage){const s=String(stage||'').toLowerCase();let m=s.match(/bbch\s*(\d{2})\s*[\-\/]\s*(\d{2})/i);if(m)return(+m[1]+ +m[2])/2;m=s.match(/bbch\s*(\d{2})/i);if(m)return +m[1];if(/primeras flores|inicio reproductivo/.test(s))return 59.5;if(/reproductivo temprano/.test(s))return57;if(/d1/.test(s))return50.5;return null}
const CEREAL_CURVE=[{code:30,label:'Z30 · inicio encañado',day:0},{code:31,label:'Z31 · 1.er nudo',day:5},{code:32,label:'Z32 · 2.º nudo',day:10},{code:37,label:'Z37 · hoja bandera visible',day:18},{code:39,label:'Z39 · hoja bandera desplegada',day:22},{code:49,label:'Z49 · aristas visibles',day:30},{code:59,label:'Z59 · espigazón completa',day:38},{code:61,label:'Z61 · inicio floración',day:42},{code:65,label:'Z65 · plena floración',day:47}];
const COLZA_CURVE=[{code:50,label:'BBCH 50 · botón floral',day:0},{code:51,label:'BBCH 51 · botón floral visible',day:2},{code:55,label:'BBCH 55 · inflorescencia en desarrollo',day:7},{code:59,label:'BBCH 59 · prefloración',day:12},{code:60,label:'BBCH 60 · primeras flores',day:14},{code:61,label:'BBCH 61 · inicio floración',day:16},{code:63,label:'BBCH 63 · floración en avance',day:21},{code:65,label:'BBCH 65 · ~50% floración',day:27},{code:69,label:'BBCH 69 · fin floración',day:42}];
function curveDay(code,curve){if(code==null)return null;for(let i=0;i<curve.length-1;i++){let a=curve[i],b=curve[i+1];if(code>=a.code&&code<=b.code)return a.day+(code-a.code)*(b.day-a.day)/(b.code-a.code)}return code<curve[0].code?curve[0].day:curve[curve.length-1].day}
function phenologyForLot(l){
  const sc=latestScout(l),crop=norm(l.Cultivo),sow=parseCampaignDateSimple(l['Fecha siembra real']);
  const isCer=crop.includes('trigo')||crop.includes('cebada'); const curve=isCer?CEREAL_CURVE:crop.includes('colza')?COLZA_CURVE:null;if(!curve)return null;
  let code=isCer?cerealCode(sc?.stage):colzaCode(sc?.stage),anchor=null,anchorDay=null,confidence='Baja',uncertainty=10,basis='fecha de siembra';
  if(code!=null&&sc){anchor=new Date(sc.ts).toISOString().slice(0,10);anchorDay=curveDay(code,curve);confidence='Alta';uncertainty=isCer?4:6;basis='última recorrida + fecha de siembra';}
  else if(sow){anchor=isCer?addDaysISO(sow,crop.includes('cebada')?66:73):addDaysISO(sow,68);anchorDay=0;confidence=l.Variedad?'Media':'Baja';uncertainty=isCer?8:12;basis='fecha de siembra + curva estimada';}
  if(!anchor)return null;
  const today=new Date().toISOString().slice(0,10);
  const milestones=curve.map(x=>({...x,date:addDaysISO(anchor,x.day-anchorDay),days:daysBetween(today,addDaysISO(anchor,x.day-anchorDay))})).filter(x=>x.days>=-3&&x.days<=30);
  return{confidence,uncertainty,basis,milestones};
}
async function renderWeatherSimple(l){
  const box=document.querySelector('#weatherSimple');if(!box)return;
  const start=parseCampaignDateSimple(l['Fecha siembra real']);
  if(!start){box.innerHTML='<div class="muted">Falta fecha de siembra confirmada para armar el historial climático.</div>';return;}
  box.innerHTML='<div class="muted">Cargando condiciones desde la siembra…</div>';
  try{const q=new URLSearchParams({start,lat:DATA.weather?.latitude,lon:DATA.weather?.longitude});const r=await fetch('/api/weather?'+q);const w=await r.json();if(!r.ok)throw new Error(w.error||'sin datos');const s=w.summary||{};box.innerHTML=`<div class="grid3"><div class="metric"><b>${Number(s.precipitation_mm||0).toLocaleString('es-UY',{maximumFractionDigits:1})}</b><span>mm lluvia</span></div><div class="metric"><b>${s.frost_days||0}</b><span>heladas</span></div><div class="metric"><b>${Number(s.mean_temp_c||0).toLocaleString('es-UY',{maximumFractionDigits:1})}°</b><span>T media</span></div></div><div class="kv"><span>T mín / máx</span><b>${Number(s.min_temp_c||0).toLocaleString('es-UY',{maximumFractionDigits:1})} / ${Number(s.max_temp_c||0).toLocaleString('es-UY',{maximumFractionDigits:1})} °C</b></div><div class="kv"><span>Período seco máx.</span><b>${s.longest_dry_spell||0} días</b></div><div class="kv"><span>P − ET0</span><b>${Number(s.water_balance_mm||0).toLocaleString('es-UY',{maximumFractionDigits:1})} mm</b></div><small>Desde ${dmy(w.start_date)} hasta ${dmy(w.end_date)} · Open-Meteo histórico gridded.</small>`}catch(e){box.innerHTML=`<div class="muted">No pude cargar clima: ${e.message}</div>`}}
function renderPhenologySimple(l){const box=document.querySelector('#phenologySimple');if(!box)return;const p=phenologyForLot(l);if(!p){box.innerHTML='<div class="muted">Sin base suficiente para proyectar estadios.</div>';return}const ms=p.milestones.slice(0,5);box.innerHTML=`<div class="muted">Confianza ${p.confidence.toLowerCase()} · ±${p.uncertainty} días · ${p.basis}</div>${ms.map(m=>`<div class="line"><div><b>${m.label}</b><small>${m.days<0?'recién pasado':m.days===0?'estimado hoy':`en ~${m.days} días`}</small></div><span>${dmy(m.date)}</span></div>`).join('')||'<div class="muted">Sin hitos próximos en 30 días.</div>'}`}
const lotDetailBase=lotDetail;
lotDetail=function(){lotDetailBase();if(!selected)return;document.querySelector('#lots').insertAdjacentHTML('beforeend',`<div class="card"><h2>Predicción de estadios</h2><div id="phenologySimple"></div></div><div class="card"><h2>Clima desde siembra</h2><div id="weatherSimple"></div></div>`);renderPhenologySimple(selected);renderWeatherSimple(selected)};
