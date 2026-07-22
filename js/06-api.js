async function fetchPriceMap(origin,dest,months,nMin,nMax){
  const tasks=[];
  for(const m of months) for(let n=nMin;n<=nMax;n++)
    tasks.push(fetchCalOne(origin,dest,m,n).then(fs=>({n,fs})).catch(()=>({n,fs:[]})));
  const res=await Promise.all(tasks); const map={};
  for(const {n,fs} of res) for(const f of fs){
    const dd=new Date(f.depUTC).toISOString().slice(0,10), key=dd+'|'+n;
    if(map[key]==null||f.price<map[key]){ map[key]=f.price; map['link|'+key]=f.deep_link; }
  }
  return map;
}
function assembleWindows(fromISO,toISO,rules,priceMap,shabPref){
  const res=[];
  for(const w of genWindows(fromISO,toISO,rules)){
    const TS=windowShabbat(w.start,w.ret);
    if(!keepByShabbat(TS.k,shabPref)) continue;
    const key=w.start+'|'+w.nights;
    res.push({...w,TS,price:priceMap[key]??null,deep_link:priceMap['link|'+key]||null});
  }
  res.sort((a,b)=>{ if(a.price==null&&b.price==null) return a.start<b.start?-1:1; if(a.price==null)return 1; if(b.price==null)return -1; return a.price-b.price; });
  return res;
}
/* valid windows without prices (for the RapidAPI flow) */
function genValidWindows(fromISO,toISO,rules,shabPref){
  const res=[];
  for(const w of genWindows(fromISO,toISO,rules)){
    const TS=windowShabbat(w.start,w.ret);
    if(!keepByShabbat(TS.k,shabPref)) continue;
    res.push({...w,TS,price:null,deep_link:null});
  }
  return res;
}
/* fetch REAL prices from the RapidAPI edge function for given date-pairs */
let LAST_OJ_DIST=null;
// alternative exit airports with real direct flights home (the in-airport itself is the baseline)
const EXIT_AIRPORTS={ 'רומניה':['CLJ','IAS'] };
const AIRPORT_HE={ OTP:'בוקרשט', BUH:'בוקרשט', CLJ:'קלוז׳', IAS:'יאשי' };
function exitsFor(dest){ const c=(CITY[dest]||{}).cc; return EXIT_AIRPORTS[c]||null; }
async function _oneway(from,to,date,adults,includeStops){
  try{
    const r=await fetch(RAPID_URL,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({oneway:true,from,to,date,adults:adults||2,includeStops:!!includeStops})});
    if(!r.ok) return null;
    const j=await r.json(); return (j&&j.ok)?(j.leg||null):null;
  }catch(e){ return null; }
}
// לוח מחירים: מחיר-לכל-יום-יציאה על פני טווח, בקריאה אחת. בסיס לשכבת ה-💡 "יום זול יותר".
async function fetchPriceCalendar(origin,dest,fromISO,toISO,nights){
  try{
    const r=await fetch(RAPID_URL,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({priceCalendar:true,origin,destination:dest,from:fromISO,to:toISO,nights})});
    if(!r.ok) return null;
    const j=await r.json();
    if(!j||!j.ok||!Array.isArray(j.days)) return null;
    const map={}; for(const d of j.days){ if(d&&d.date&&d.price!=null) map[d.date]=d.price; }
    return map; // { "YYYY-MM-DD": price }
  }catch(e){ return null; }
}
async function _drivingDist(a,b){
  try{
    const r=await fetch(RAPID_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dist:true,a,b})});
    if(r.ok){ const j=await r.json(); return j&&j.dist?j.dist:null; }
  }catch(e){}
  return null;
}
async function compareExits(origin,inAirport,exits,trip,adults,includeStops,baselinePrice,baselineDirect){
  // baseline = the in-airport round-trip price (already known); other exits = open-jaw (outbound + their return)
  const options=[];
  const ojExits=exits.filter(ex=>ex.toUpperCase()!==inAirport.toUpperCase());
  // baseline row first
  if(baselinePrice!=null) options.push({exit:inAirport,price:baselinePrice,isDirect:!!baselineDirect,km:0,mins:0,baseline:true});
  // price the shared outbound once
  let outLeg=null;
  if(ojExits.length){ outLeg=await _oneway(origin,inAirport,trip.departureDate,adults,includeStops); }
  for(const ex of ojExits){
    const back=await _oneway(ex,origin,trip.returnDate,adults,includeStops);
    const dist=await _drivingDist(inAirport,ex);
    const price=(outLeg&&back)?(outLeg.price+back.price):null;
    options.push({exit:ex,price,isDirect:!!(outLeg&&back&&outLeg.isDirect&&back.isDirect),carrier:[outLeg&&outLeg.carrier,back&&back.carrier].filter(Boolean).join(' / ')||null,km:dist?dist.km:null,mins:dist?dist.mins:null});
  }
  return options.length?options:null;
}
function exitCmpHtml(inAirport,opts,trip){
  if(!opts||!opts.length) return '';
  const sorted=opts.slice().sort((a,b)=>{ if(a.price==null&&b.price==null)return 0; if(a.price==null)return 1; if(b.price==null)return -1; return a.price-b.price; });
  const ad=STATE.adults||2; const O=STATE.origin.toUpperCase();
  const rows=sorted.map((o,idx)=>{
    const he=AIRPORT_HE[o.exit]||(CITY[o.exit]&&CITY[o.exit].he)||o.exit;
    const price=o.price!=null?('€'+Math.round(o.price/ad)+' לאחד'):'<span style="color:var(--mut-2)">אין טיסה בתאריך זה</span>';
    const dir=o.price!=null?(o.baseline?'הלוך-חזור':(o.isDirect?'ישיר':'עם עצירה')):'';
    const drv=(o.km!=null&&o.km>0)?(o.km+' ק״מ · '+Math.floor(o.mins/60)+'ש׳'+(o.mins%60?(' '+(o.mins%60)+'ד׳'):'')+' נהיגה'):(o.km===0?'אותו שדה':'');
    const best=idx===0&&o.price!=null?' <span class="exbest">הכי זול</span>':'';
    const link=o.baseline
      ? `https://www.kayak.com/flights/${O}-${inAirport.toUpperCase()}/${trip.departureDate}/${trip.returnDate}`
      : `https://www.kayak.com/flights/${O}-${inAirport.toUpperCase()}/${trip.departureDate}/${o.exit.toUpperCase()}-${O}/${trip.returnDate}`;
    const book=o.price!=null?`<a class="exbook" href="${link}" target="_blank" rel="noopener">הזמן ←</a>`:'';
    return `<div class="exrow"><span class="exinfo"><b>${he} (${o.exit})</b>${best} · ${price}${dir?(' · '+dir):''}${drv?(' · '+drv):''}</span>${book}</div>`;
  }).join('');
  const f=iso=>iso.slice(8)+'.'+(+iso.slice(5,7));
  return `<div class="excmp"><div class="exhead"><span>✈ השוואת שדות חזרה · כניסה ${AIRPORT_HE[inAirport]||inAirport} · ${f(trip.departureDate)}–${f(trip.returnDate)}</span><span class="exclose" data-cmpclose="${trip.departureDate}|${trip.returnDate}">✕</span></div>${rows}<div class="exnote">מחיר חלופי = הלוך ליעד + חזור משדה אחר · בדוק שהנהיגה שווה את החיסכון</div></div>`;
}
async function onExitCompare(s,r){
  if(!LAST||!LAST.dest)return;
  const exits=exitsFor(LAST.dest); if(!exits)return;
  const key=s+'|'+r;
  LAST.exitState=LAST.exitState||{}; LAST.exitCmp=LAST.exitCmp||{};
  LAST.exitState[key]='loading'; paintResults();
  const w=(LAST.ranked||[]).find(x=>x.start===s&&x.ret===r);
  const opts=await compareExits(STATE.origin||'TLV',LAST.dest,exits,{departureDate:s,returnDate:r},STATE.adults,STATE.includeStops, w?w.price:null, w&&w.info?w.info.isDirect:false);
  delete LAST.exitState[key];
  LAST.exitCmp[key]=opts?exitCmpHtml(LAST.dest,opts,{departureDate:s,returnDate:r}):'<div class="excmp"><div class="exnote">לא הצלחתי להשוות כרגע (עומס על השרת).</div></div>';
  paintResults();
}
async function fetchOpenJawPrices(origin,inAirport,outAirport,trips,onProgress,includeStops,adults,children,infants){
  const map={}; RAPID_DIAG=""; LAST_OJ_DIST=null;
  if(!trips.length) return map;
  if(!outAirport||outAirport.length<3){ RAPID_DIAG='חסר קוד שדה יציאה'; return map; }
  // resolve all three airport ids ONCE (avoids re-resolving every call -> rate limit)
  let ids=null;
  try{
    const r=await fetch(RAPID_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({resolveOJ:true,origin,inAirport,outAirport})});
    if(!r.ok){ RAPID_DIAG='שלב זיהוי נכשל (HTTP '+r.status+')'; return map; }
    ids=await r.json();
  }catch(e){ RAPID_DIAG='שלב זיהוי: '+e.message; return map; }
  if(!ids||!ids.ok){ RAPID_DIAG='זיהוי שדות נכשל'+(ids&&ids.detail?(' · '+JSON.stringify(ids.detail)):''); return map; }
  // driving distance once
  try{
    const r=await fetch(RAPID_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dist:true,a:inAirport,b:outAirport})});
    if(r.ok){ const j=await r.json(); if(j&&j.dist) LAST_OJ_DIST=j.dist; }
  }catch(e){}
  async function priceOne(trip, incl){
    for(let attempt=0; attempt<3; attempt++){
      try{
        const r=await fetch(RAPID_URL,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({openJaw:true,origin,inAirport,outAirport,originId:ids.origin_id,inId:ids.in_id,outId:ids.out_id,trips:[trip],adults:adults||2,children:children||0,infants:infants||0,includeStops:!!incl})});
        if(r.status===429){ RAPID_DIAG='מגבלת קריאות (429)'; await _sleep(2500); continue; }
        if(!r.ok){ RAPID_DIAG='בדיקת מחיר נכשלה (HTTP '+r.status+')'; return null; }
        const j=await r.json();
        if(j&&j.dist&&LAST_OJ_DIST==null) LAST_OJ_DIST=j.dist;
        if(j&&j.ok&&Array.isArray(j.results)){ const res=j.results.find(x=>x.price!=null); if(res) return res; return null; }
        if(j&&j.error){ RAPID_DIAG='שרת: '+j.error; }
        return null;
      }catch(e){ RAPID_DIAG='בדיקת מחיר: '+e.message; }
    }
    return null;
  }
  let done=0; const LIMIT=2; // open-jaw = double the calls, so go gentler on the rate limit
  async function worker(queue){
    while(queue.length){
      const trip=queue.shift();
      let res=await priceOne(trip, includeStops);
      if(!res && !includeStops){ res=await priceOne(trip, true); }
      if(res) map[res.departureDate+'|'+res.returnDate]=res;
      done++; if(onProgress) onProgress(done,trips.length);
    }
  }
  const queue=trips.slice();
  if(onProgress) onProgress(0,trips.length);
  await Promise.all(Array(Math.min(LIMIT,queue.length)).fill(0).map(()=>worker(queue)));
  return map;
}
async function fetchPricesFor(trips,params,progressCb){
  if(!trips.length) return {};
  return params.useOJ
    ? await fetchOpenJawPrices(params.origin, params.dest, params.outAirport, trips, progressCb, params.includeStops, params.adults, params.children, params.infants)
    : await fetchRapidPrices(params.origin, params.dest, trips, progressCb, params.includeStops, params.adults, params.children, params.infants);
}
async function loadMoreWindows(){
  if(!LAST||!LAST.allWindows||LAST.loadingMore) return;
  const next=LAST.allWindows.filter(w=>!w._priced).slice(0,6);
  if(!next.length) return;
  LAST.loadingMore=true; paintResults();
  const priceMap=await fetchPricesFor(next.map(w=>({departureDate:w.start,returnDate:w.ret})), LAST.priceParams, null);
  next.forEach(w=>{ w._priced=true; const m=priceMap[w.start+'|'+w.ret]; if(m){ w.price=m.price; w.info=m; } if(LAST.zt&&w.info) w.shabV=shabbatVerdict(w,LAST.zt); });
  LAST.loadingMore=false;
  LAST.ranked=rankedWindows(LAST.allWindows);
  paintResults();
}
// Resolve a bare IATA/city code to a Skyscanner entityId via the WORKING suggest
// path, and cache it on CITY[code]. This way resolveOnly receives an explicit
// originId/destId and never has to match a bare IATA itself (fixes TLV:no-match,
// since the default origin TLV had no _entityId while picked dests like MXP did).
const _entIdCache={};
const ENT_LS_KEY='tf_entids';
function _saveEntId(code,id){ try{ const j=JSON.parse(localStorage.getItem(ENT_LS_KEY)||'{}'); j[code]=id; localStorage.setItem(ENT_LS_KEY,JSON.stringify(j)); }catch(e){} }
function _loadEntIds(){ try{ const j=JSON.parse(localStorage.getItem(ENT_LS_KEY)||'{}'); for(const k in j){ if(!CITY[k])CITY[k]={he:k,cc:''}; if(!CITY[k]._entityId)CITY[k]._entityId=j[k]; } }catch(e){} }
// "E27544068" is our internal code for an entityId-only city (no IATA). The numeric
// part IS the Skyscanner entityId the edge wants as destId/originId.
const _codeEntity=code=>{ const m=/^E(\d+)$/i.exec(code||''); return m?m[1]:null; };
let FLT_DIAG={max:0,maxPriced:0,hasOptions:false,carriers:new Set(),noprice:new Set()}; // how many flights + which carriers the edge returns (diagnostic)
let EDGE_DIAG=null; // raw Skyscanner diagnostic from the edge (set when the new edge is deployed)
// Rank ALL priced flights for one window. Each gets its own ._shabV. When not allowing
// Shabbat flights, non-forbidden are ordered first; otherwise pure price order.
function _rankFlights(results,trip){
  let priced=(results||[]).filter(x=>x && x.price!=null);
  if(!priced.length) return [];
  priced.forEach(x=>{ x._shabV = _selZT ? shabbatVerdict({start:trip.departureDate,ret:trip.returnDate,info:x},_selZT) : null; });
  const forb=x=>!!(x._shabV && x._shabV.forbidden);
  priced.sort((a,b)=>{ if(!STATE.allowShabbat){ const fa=forb(a)?1:0,fb=forb(b)?1:0; if(fa!==fb) return fa-fb; } return (+a.price)-(+b.price); });
  return priced;
}
function _pickFlight(results,trip){
  if(Array.isArray(results)){ FLT_DIAG.max=Math.max(FLT_DIAG.max,results.length); FLT_DIAG.maxPriced=Math.max(FLT_DIAG.maxPriced,results.filter(x=>x&&x.price!=null).length);
    results.forEach(x=>{ if(x&&x.carrier){ const f=carrierFamily(x.carrier); FLT_DIAG.carriers.add(f); if(x.price==null) FLT_DIAG.noprice.add(f); } }); }
  const ranked=_rankFlights(results,trip);
  if(!ranked.length) return null;
  const primary=ranked[0];
  primary._options=ranked; // full list (incl. primary) for multi-flight display
  return primary;
}
function _carrierDiag(){ return ''; /* carrier breakdown kept in EDGE_DIAG / FLT_DIAG for console only */ }
// combine one outbound leg + one return leg into a single round-trip flight option (the shape
// flightCard expects). Used to build the full outbound×return cross-product for max coverage.
function _combineLegs(o,i,trip){
  return {
    departureDate:trip.departureDate, returnDate:trip.returnDate, currency:'EUR',
    price:(o.price!=null&&i.price!=null)?o.price+i.price:null,
    isDirect:!!(o.isDirect&&i.isDirect), altPrice:null,
    carrier:[o.carrier,i.carrier].filter(Boolean).join(' / ')||null, operatedBy:null,
    stops:Math.max(o.stops||0,i.stops||0),               // per-leg semantics for the maxStops filter
    durationToMin:o.durationMin??null, durationBackMin:i.durationMin??null,
    outLayovers:o.layovers||[], backLayovers:i.layovers||[],
    outDep:o.dep, outArr:o.arr, backDep:i.dep, backArr:i.arr,
    outDepISO:o.depISO, outArrISO:o.arrISO, backDepISO:i.depISO, backArrISO:i.arrISO,
  };
}
async function ensureEntityId(code){
  if(!code) return null;
  if(CITY[code]&&CITY[code]._entityId) return CITY[code]._entityId;
  const ce=_codeEntity(code);
  if(ce){ if(!CITY[code])CITY[code]={he:code,cc:''}; CITY[code]._entityId=ce; return ce; } // bare entityId code; suggest can't resolve it
  if(_entIdCache[code]!==undefined) return _entIdCache[code];
  // the suggest endpoint is flaky — retry, and NEVER cache a failure (a transient miss must not
  // poison the whole session, which is what made TLV fail on every "try again")
  for(let attempt=0; attempt<3; attempt++){
    try{
      const r=await fetch(RAPID_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({suggest:true,q:code})});
      if(r.ok){
        const j=await r.json();
        const ms=(j&&j.ok&&j.matches)?j.matches:[];
        const hit=ms.find(m=>(m.iata||'').toUpperCase()===String(code).toUpperCase())||ms[0];
        if(hit&&hit.entityId){
          if(!CITY[code])CITY[code]={he:hit.name+(hit.sub?(' · '+hit.sub):''),cc:''};
          CITY[code]._entityId=hit.entityId; _entIdCache[code]=hit.entityId; _saveEntId(code,hit.entityId);
          return hit.entityId;
        }
      }
    }catch(e){}
    await _sleep(500);
  }
  return null; // failure NOT cached — the next search retries
}
async function fetchRapidPrices(origin,dest,trips,onProgress,includeStops,adults,children,infants){
  const map={}; RAPID_DIAG=""; FLT_DIAG={max:0,maxPriced:0,hasOptions:false,carriers:new Set(),noprice:new Set()};
  if(!trips.length) return map;
  // step 1: resolve airport ids once (use a known entityId from autocomplete if we have one)
  let ids=null;
  await ensureEntityId(origin); await ensureEntityId(dest);
  const destEntity=(CITY[dest]&&CITY[dest]._entityId)||_codeEntity(dest)||null;
  const originEntity=(CITY[origin]&&CITY[origin]._entityId)||_codeEntity(origin)||null;
  try{
    const body={origin,destination:dest,resolveOnly:true};
    if(destEntity) body.destId=destEntity;
    if(originEntity) body.originId=originEntity;
    const r=await fetch(RAPID_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!r.ok){ RAPID_DIAG='שלב זיהוי נכשל (HTTP '+r.status+')'; return map; }
    ids=await r.json();
  }catch(e){ RAPID_DIAG='שלב זיהוי: '+e.message; return map; }
  if(!ids||!ids.ok){ RAPID_DIAG='זיהוי שדה תעופה נכשל'+(ids&&ids.detail?(' · '+Object.entries(ids.detail).map(e=>e[0]+':'+e[1]).join(', ')):''); return map; }
  // step 2: price each trip — retry on rate-limit, transient errors, AND empty results
  // (RapidAPI sometimes returns a completed-but-empty search; a fresh retry usually recovers)
  async function priceOne(trip, incl){
    for(let attempt=0; attempt<3; attempt++){
      try{
        const r=await fetch(RAPID_URL,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({originId:ids.origin_id,destId:ids.dest_id,trips:[trip],adults:adults||2,children:children||0,infants:infants||0,includeStops:!!incl})});
        if(r.status===429){ RAPID_DIAG='מגבלת קריאות (429)'; await _sleep(1500); continue; }
        if(!r.ok){ RAPID_DIAG='בדיקת מחיר נכשלה (HTTP '+r.status+')'; await _sleep(700); continue; }
        const j=await r.json();
        if(j&&j.ok&&Array.isArray(j.results)){
          const win=j.results[0];
          if(win && win.diag) EDGE_DIAG=win.diag;
          const hasOpts=!!(win && Array.isArray(win.options));
          FLT_DIAG.hasOptions = FLT_DIAG.hasOptions || hasOpts;
          // If the edge returned separate outbound/returns lists, build a cross-product with CARRIER
          // COVERAGE: take the cheapest N of each leg PLUS one representative per carrier and ALL
          // direct flights — so airlines like El Al / Arkia / ITA (often pricier than the cheapest
          // connections) are never dropped before pairing. Then the machinery ranks cheapest-first,
          // filters Shabbat per-leg, dedups, and shows top-5 with "show more".
          let flights;
          if(win && Array.isArray(win.outbound) && win.outbound.length && Array.isArray(win.returns) && win.returns.length){
            const _cover=list=>{
              const out=[], seenCar=new Set(); let n=0;
              for(const f of list){                                   // list already sorted cheapest-first
                const fam=carrierFamily(f.carrier);
                const keep = n<10 || f.isDirect || (fam && !seenCar.has(fam)); // cheap 10 + every direct + 1 per carrier
                if(keep){ out.push(f); if(fam) seenCar.add(fam); }
                n++;
              }
              return out.slice(0,24); // safety cap per leg
            };
            const O=_cover(win.outbound), I=_cover(win.returns);
            flights=[]; for(const o of O) for(const ii of I){ const cmb=_combineLegs(o,ii,trip); if(cmb.price!=null) flights.push(cmb); }
          } else {
            flights=(hasOpts && win.options.length)?win.options:j.results;
          }
          const res=_pickFlight(flights,trip);
          if(res) return res;
          RAPID_DIAG='חיפוש חזר ריק — מנסה שוב'; await _sleep(800); continue; // transient empty -> retry fresh
        }
        if(j&&j.error){ RAPID_DIAG='שרת: '+j.error; await _sleep(700); continue; }
        await _sleep(700);
      }catch(e){ RAPID_DIAG='בדיקת מחיר: '+e.message; await _sleep(700); }
    }
    return null;
  }
  // step 2: price windows, 3 at a time (faster, but gentle on the rate limit)
  let done=0;
  const LIMIT=5; // window concurrency (raised 3→5 for speed; edge fans out per leg, PRO tier absorbs it)
                 // all parallel; 3 windows keeps the concurrent-call burst reasonable on the Pro tier.
  async function worker(queue){
    while(queue.length){
      const trip=queue.shift();
      let res=await priceOne(trip, includeStops);
      if(!res && !includeStops){ res=await priceOne(trip, true); } // fill empties with a connecting flight
      if(res) map[res.departureDate+'|'+res.returnDate]=res;
      done++; if(onProgress) onProgress(done,trips.length);
    }
  }
  const queue=trips.slice();
  if(onProgress) onProgress(0,trips.length);
  await Promise.all(Array(Math.min(LIMIT,queue.length)).fill(0).map(()=>worker(queue)));
  return map;
}
