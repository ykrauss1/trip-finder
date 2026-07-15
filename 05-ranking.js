function adapt(f){
  const c=CITY[f.to]||{he:f.to,cc:'',fresh:false};
  const durTo=f.durationToMin ?? (f.durationMin?Math.round(f.durationMin/2):180);
  const durBack=f.durationBackMin ?? (f.durationMin?Math.round(f.durationMin/2):180);
  return {to:f.to,cityHe:c.he,cc:c.cc,fresh:c.fresh,al:f.airline,alHe:AIRLN[f.airline]||f.airline,
    price:f.price,stops:f.stops||0,depUTC:f.depUTC,retUTC:f.retUTC,durTo,durBack,deep_link:f.deep_link};
}
function passesHard(f,I){
  for(const c of (I.constraints||[])){
    if(c.type==='airline' && f.al!==c.value) return false;
    if(c.type==='noShabbat'){const TS=tripShabbat(f.depUTC,f.durTo,f.retUTC,f.durBack); if(TS&&TS.k==='fly') return false;}
  }
  return true;
}
const RAW={price:f=>f.price,novelty:f=>f.fresh?1:0,comfort:f=>f.stops===0?1:0.4};
function rankLive(flights,I){
  let c=flights.filter(f=>passesHard(f,I));
  let scs=(I.scorers||[]).filter(s=>RAW[s.name]); if(!scs.length)scs=[{name:'price',w:3}];
  const norm={};
  for(const s of scs){const v=c.map(f=>RAW[s.name](f));const mn=Math.min(...v),mx=Math.max(...v),rng=(mx-mn)||1;norm[s.name]=x=>s.name==='price'?1-(x-mn)/rng:(mx===mn?0.5:(x-mn)/rng);}
  for(const f of c){f._s=0;for(const s of scs)f._s+=norm[s.name](RAW[s.name](f))*(s.w||1);}
  c.sort((a,b)=>b._s-a._s); return c;
}

/* ===== busy-weeks brick (researched, 2027 ski season) + ski selection ===== */
const PEAK=[
  {from:'2026-12-19',to:'2027-01-08',why:'חג המולד + ראש השנה + זנב חופשת החורף האיטלקית (עד ~8.1)'},
  {from:'2027-02-13',to:'2027-02-22',why:'שיא: חצי-טרמסטר בריטניה+צרפת+אוסטריה+הולנד'},
];
const BUSY=[ {from:'2027-02-06',to:'2027-03-08',why:'חופשות סקי אירופיות (אזורי צרפת)'} ];
function absISO(iso){const m=iso.match(/(\d{4})-(\d{2})-(\d{2})/);return gregToAbs(+m[1],+m[2],+m[3]);}
function busyLevel(depAbs,retAbs){
  for(const w of PEAK) if(depAbs<=absISO(w.to)&&retAbs>=absISO(w.from)) return {k:'peak',why:w.why};
  for(const w of BUSY) if(depAbs<=absISO(w.to)&&retAbs>=absISO(w.from)) return {k:'busy',why:w.why};
  return null;
}
function tierScore(tripK,busy){return (tripK==='away'?2:0)+(busy?(busy.k==='peak'?1.6:0.7):0);}
// annotate a calendar flight with date/shabbat/busy, given the user's floor + allowed start days
function annotate(f,fromAbs,allowedDows){
  const depAbs=ilAbs(f.depUTC);
  const landUTC=f.retUTC?f.retUTC+(f.durBack||180)*60000:f.depUTC;
  const retAbs=ilAbs(landUTC);
  const TS=tripShabbat(f.depUTC,f.durTo,f.retUTC,f.durBack);
  return {...f,depAbs,retAbs,TS,busy:busyLevel(depAbs,retAbs),
    inRange:depAbs>=fromAbs, startOk:allowedDows.includes(dow(depAbs))};
}
// from many calendar flights across ski destinations -> best valid trip per destination, ranked
function skiSelect(flights,fromAbs,allowedDows,noFly){
  const ann=flights.map(f=>annotate(f,fromAbs,allowedDows))
    .filter(x=>x.inRange && x.startOk && (!noFly || x.TS.k!=='fly'));
  const best={};
  for(const x of ann){
    const key=x.to;
    const sc=tierScore(x.TS.k,x.busy)*100000 + x.price; // tier first, then price
    if(!best[key] || sc<best[key]._sc){ x._sc=sc; best[key]=x; }
  }
  return Object.values(best).sort((a,b)=>a._sc-b._sc);
}
/* ===== generic flexible date selector (any destination): nights + start day + Shabbat relation ===== */
function nextMonth(ym){ const [y,m]=ym.split('-').map(Number); return new Date(Date.UTC(y,m,1)).toISOString().slice(0,7); }
async function fetchFlex(origin,dest,months,nights){
  const tasks=months.map(m=>fetchCalOne(origin,dest,m,nights).catch(()=>[]));
  const res=await Promise.all(tasks); return res.flat();
}
// opts: { startDow: null|0..6, shabbat: 'any'|'none'|'away' }. Never allows flying on Shabbat.
function flexSelect(flights,opts){
  const out=[];
  for(const f of flights){
    if(!f.depUTC||!f.retUTC) continue;
    if(opts.startDow!=null && dow(ilAbs(f.depUTC))!==opts.startDow) continue;
    const TS=tripShabbat(f.depUTC,f.durTo,f.retUTC,f.durBack);
    if(TS && TS.k==='fly' && !(typeof STATE!=='undefined' && STATE.allowShabbat)) continue;   // travel on Shabbat (off by default)
    if(opts.shabbat==='none' && TS && TS.k==='away') continue;        // want no Shabbat at all
    if(opts.shabbat==='away' && (!TS || TS.k!=='away')) continue;     // want Shabbat at destination
    out.push({...f,TS});
  }
  out.sort((a,b)=>a.price-b.price);
  const seen=new Set(),res=[];
  for(const x of out){ if(seen.has(x.depUTC))continue; seen.add(x.depUTC); res.push(x); }
  return res;
}
/* ===== window generator: build valid date-windows from rules, attach cache prices, classify Shabbat by date ===== */
const DOW_FULL=['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
function* dateRange(fromISO,toISO){ let d=new Date(fromISO+'T00:00:00Z'); const end=new Date(toISO+'T00:00:00Z'); while(d<=end){ yield new Date(d); d=new Date(d.getTime()+864e5);} }
function onewayShabbat(dep){
  const dow=new Date(dep+'T12:00:00Z').getUTCDay();
  if(dow===6) return {k:'fly',t:'יציאה בשבת'};
  if(dow===5) return {k:'fri',t:'יציאה בשישי'};
  return {k:'clean',t:'יציאה'};
}
function onewayWindows(){
  const today=new Date().toISOString().slice(0,10);
  let deps=[];
  if(STATE.dateMode==='exact'){
    const f=+STATE.flexDays||0;
    for(let i=-f;i<=f;i++) deps.push(_jAddDays(STATE.fromDate,i));
    deps=deps.filter(d=>d>=today).sort((a,b)=>Math.abs(_nightsBetween(STATE.fromDate,a))-Math.abs(_nightsBetween(STATE.fromDate,b)));
  }else if(STATE.dateMode==='month'){
    const ms=(STATE.months.length?STATE.months:[(STATE.fromDate||new Date().toISOString().slice(0,10)).slice(0,7)]).slice().sort();
    for(const mm of ms){ const [y,m]=mm.split('-').map(Number); const dim=new Date(Date.UTC(y,m,0)).getUTCDate(); for(let d=1;d<=dim;d++) deps.push(`${mm}-${String(d).padStart(2,'0')}`); }
    deps=deps.filter(d=>d>=today);
  }else{
    let d=STATE.fromDate<today?today:STATE.fromDate; while(d<=STATE.toDate){ deps.push(d); d=_jAddDays(d,1); }
  }
  const allowFly=STATE.allowShabbat||STATE.shabbatTime;
  return deps.map(dep=>({start:dep, ret:null, nights:0, oneway:true, TS:onewayShabbat(dep), price:null}))
             .filter(w=> w.TS.k!=='fly' || allowFly);
}
function genWindows(fromISO,toISO,rules){
  const out=[];
  for(const start of dateRange(fromISO,toISO)){
    if(rules.startDows && !rules.startDows.includes(start.getUTCDay())) continue;
    for(let n=rules.nightsMin;n<=rules.nightsMax;n++){
      const ret=new Date(start.getTime()+n*864e5);
      out.push({start:start.toISOString().slice(0,10),nights:n,ret:ret.toISOString().slice(0,10)});
    }
  }
  return out;
}
function windowShabbat(startISO,retISO){
  const s=new Date(startISO+'T12:00:00Z'), r=new Date(retISO+'T12:00:00Z');
  const sd=s.getUTCDay(), rd=r.getUTCDay();
  if(sd===6||rd===6) return {k:'fly',t:'טיסה בשבת'};
  let away=false;
  for(let d=new Date(s.getTime()+864e5); d<r; d=new Date(d.getTime()+864e5)) if(d.getUTCDay()===6){away=true;break;}
  if(sd===5) return {k:'fri',t:'יציאה בשישי — לבדוק זמן'};
  if(rd===5) return {k:'fri',t:'חזרה בשישי — לבדוק זמן'};
  if(away) return {k:'away',t:'שבת ביעד'};
  return {k:'clean',t:'נקי משבת'};
}
function keepByShabbat(k,pref){
  if(k==='fly') return (typeof STATE!=='undefined' && (STATE.allowShabbat||STATE.shabbatTime));
  if(pref==='none') return k==='clean'||k==='fri';
  if(pref==='away') return k==='away';
  return true;
}
// expand a center departure/return pair into all valid combinations within ±flex days
function flexWindows(fromISO,toISO,flex){
  const _add=(iso,n)=>new Date(Date.parse(iso+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
  const out=[];
  for(let di=-flex; di<=flex; di++){
    const dep=_add(fromISO,di);
    for(let ri=-flex; ri<=flex; ri++){
      const ret=_add(toISO,ri);
      const nts=Math.round((Date.parse(ret)-Date.parse(dep))/864e5);
      if(nts<1) continue;
      const TS=windowShabbat(dep,ret);
      if(TS.k==='fly' && !(typeof STATE!=='undefined' && (STATE.allowShabbat||STATE.shabbatTime))) continue; // travel on Shabbat (off by default)
      out.push({start:dep,ret,nights:nts,TS,price:null,_prox:Math.abs(di)+Math.abs(ri)});
    }
  }
  out.sort((a,b)=>a._prox-b._prox||a.start.localeCompare(b.start)); // closest to chosen dates first
  return out;
}
