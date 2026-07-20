async function retune(){
  if(!LAST||!LAST.allWindows||!LAST.allWindows.length) return;
  let zt=LAST.zt;
  if(shabAware()){
    const ws=LAST.allWindows;
    const zs=ws.reduce((a,w)=>w.start<a?w.start:a,ws[0].start);
    const ze=ws.reduce((a,w)=>{const e=w.ret||w.start;return e>a?e:a;},ws[0].ret||ws[0].start);
    try{ zt=await fetchShabbatTimes(zs,ze); LAST.zt=zt; }catch(e){}
  }
  _selZT=zt;
  let dzt=LAST_DZT;
  if(shabAware() && LAST.dgeo){
    const ws=LAST.allWindows;
    const zs=ws.reduce((a,w)=>w.start<a?w.start:a,ws[0].start);
    const ze=ws.reduce((a,w)=>{const e=w.ret||w.start;return e>a?e:a;},ws[0].ret||ws[0].start);
    try{ dzt=await fetchShabbatTimes(zs,ze,LAST.dgeo); LAST_DZT=dzt; }catch(e){}
  }
  LAST.allWindows.forEach(w=>{ w.shabV=(shabAware()&&w.info)?shabbatVerdict(w,zt):null;
    if(dzt&&w.info){ w.destV=destVerdict(w,dzt); if(Array.isArray(w.info._options)) w.info._options.forEach(o=>o._destV=destVerdict({start:w.start,ret:w.ret,info:o},dzt)); }
  });
  LAST.ranked=rankedWindows(LAST.allWindows);
  paintResults();
}
let _selZT=null; // zt handed to the per-window price selector for Shabbat-aware flight choice
let LAST_DZT=null; // destination-side Shabbat times for the current result set
const shabAware=()=>STATE.shabbatTime||STATE.jewishMode!=='off';
function maxStopsVal(){ return STATE.maxStops==null ? (STATE.includeStops?2:0) : +STATE.maxStops; }
function rankedWindows(windows){
  let priced=windows.filter(w=>w._priced);
  const total=priced.length;
  const withPrice=priced.filter(w=>w.price!=null).length;
  const ms=maxStopsVal();
  // A window is worth showing if ANY of its priced options satisfies the current filters — judging by
  // the single cheapest flight (w.info) was the bug: a window with real direct options got dropped just
  // because its cheapest flight happened to have a stop, and since the cheapest varies per API call the
  // same search flickered between "results" and "all have stops".
  let droppedStops=0, droppedShab=0;
  const kept=priced.filter(w=>{
    if(w.price==null) return true;                                   // unpriced window — keep as a retry/link placeholder
    let opts=(w.info&&Array.isArray(w.info._options)&&w.info._options.length)?w.info._options:(w.info?[w.info]:[]);
    if(!opts.length) return true;                                    // priced but no per-flight detail — keep
    const priceable=opts.filter(o=>o && (o.price!=null || w.price!=null));
    const stopsOk=priceable.filter(o=>!(o.stops!=null && o.stops>ms));
    if(!stopsOk.length){ droppedStops++; return false; }
    const shabOk=STATE.allowShabbat ? stopsOk : stopsOk.filter(o=>!(o._shabV&&o._shabV.forbidden));
    if(!shabOk.length){ droppedShab++; return false; }
    return true;
  });
  // a Motzei-Shabbat option is only worth showing if it actually has a (post-havdalah) priced flight
  const afterMotzei=kept.filter(w=>!(w._motzei && (w.price==null || !w.info)));
  RANK_DIAG={total,withPrice,droppedShab,droppedStops,ms,kept:afterMotzei.length};
  return sortWindows(afterMotzei);
}
function sortWindows(ws){
  ws.sort((a,b)=>{
    if(!!a._prefer!==!!b._prefer) return a._prefer?-1:1;
    if(a.price==null&&b.price==null)return a.start<b.start?-1:1; if(a.price==null)return 1; if(b.price==null)return -1; return a.price-b.price; });
  return ws;
}
/* ===== Jewish availability layer: periods from Hebcal (live), classify each window ===== */
const JCACHE={};
const _jAddDays=(iso,n)=>new Date(Date.parse(iso+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
function deriveJewishPeriods(items,profile){
  // Hebcal uses curly apostrophes (’) in titles; normalize to straight (') so matching is reliable
  items=items.map(x=>Object.assign({},x,{title:(x.title||'').replace(/[\u2018\u2019]/g,"'")}));
  const firstWith=(sub)=>{ const it=items.find(x=>x.title&&x.title.indexOf(sub)>=0); return it?it.date:null; };
  const tammuz=firstWith("Tzom Tammuz")||(items.find(x=>x.title&&x.title.indexOf("Tammuz")>=0&&x.title.indexOf("Rosh Chodesh")<0)||{}).date;
  const tishaBav=(items.find(x=>x.title&&(x.title.indexOf("Tish'a B'Av")>=0||x.title.indexOf("Tisha B'Av")>=0)&&x.title.indexOf("Erev")<0)||{}).date;
  const rcAv=(items.find(x=>x.title&&x.title.indexOf("Rosh Chodesh Av")>=0)||{}).date;
  const rcElul=(items.find(x=>x.title&&x.title.indexOf("Rosh Chodesh Elul")>=0)||{}).date;
  const roshHashana=(items.find(x=>x.title&&x.title.indexOf("Rosh Hashana")>=0)||{}).date;
  const periods=[];
  if(tammuz&&tishaBav) periods.push({start:tammuz,end:tishaBav,label:"בין המצרים",kind:"threeweeks"});
  if(rcAv&&tishaBav) periods.push({start:rcAv,end:tishaBav,label:"תשעת הימים",kind:"ninedays"});
  // בין הזמנים דקיץ — הגדרה מפורשת דרך מנוע הלוח: י' באב עד ל' באב ועד בכלל.
  // הערת מנהגים: אב מלא תמיד, ולכן ר"ח אלול יומיים (ל' אב + א' אלול). יש החוזרים לישיבות
  // בא' אלול (ביה"ז עד ל' אב — המיושם כאן), ויש החוזרים בל' אב (ביה"ז עד כ"ט אב).
  if(tishaBav){ const _hy=hebFromISO(tishaBav).y; periods.push({start:hebToISO(_hy,5,10),end:hebToISO(_hy,5,30),label:"בין הזמנים",kind:"beinhazmanim",note:"מסתיים בל׳ אב (ועד בכלל); יש המסיימים בכ״ט אב"}); }
  else if(rcElul) periods.push({start:null,end:rcElul,label:"בין הזמנים",kind:"beinhazmanim"});
  if(rcElul) periods.push({start:rcElul,end:roshHashana?_jAddDays(roshHashana,-1):_jAddDays(rcElul,28),label:"אלול",kind:"elul"});
  const holidays=items.filter(x=>x.yomtov===true).map(x=>({date:x.date,label:x.hebrew||x.title}));
  const cholHamoed=items.filter(x=>x.title&&x.title.indexOf("CH'M")>=0).map(x=>x.date);
  // favorable windows
  const favorable=[];
  const chan=items.filter(x=>x.title&&x.title.indexOf("Chanukah")>=0).map(x=>x.date).sort();
  if(chan.length) favorable.push({start:chan[0],end:chan[chan.length-1],label:"חנוכה — חופשה",kind:"good"});
  const purim=(items.find(x=>x.title&&x.title.indexOf("Purim")>=0&&x.title.indexOf("Shushan")<0)||{}).date;
  if(purim) favorable.push({start:purim,end:purim,label:"פורים",kind:"good"});
  const atz=(items.find(x=>x.title&&x.title.indexOf("Yom HaAtzma")>=0)||{}).date;
  if(atz) favorable.push({start:atz,end:atz,label:"יום העצמאות",kind:"good"});
  const lag=(items.find(x=>x.title&&(x.title.indexOf("Lag BaOmer")>=0||x.title.indexOf("Lag B'Omer")>=0||x.title.indexOf("LaOmer")>=0))||{}).date;
  if(lag) favorable.push({start:lag,end:lag,label:"ל״ג בעומר",kind:"good"});
  if(profile==='teacher'){
    const y=(tishaBav||rcElul||(items[0]&&items[0].date)||"2026-01-01").slice(0,4);
    favorable.push({start:y+"-07-01",end:y+"-08-31",label:"חופשת קיץ",kind:"good"});
  }
  // Tishrei: after Yom Kippur -> Erev Sukkot is busy with Sukkot prep (caution)
  const yomKippur=firstWith("Yom Kippur");
  const sukkotDates=items.filter(x=>x.title&&/^Sukkot/.test(x.title)).map(x=>x.date).sort();
  const sukkot=sukkotDates[0];
  if(yomKippur&&sukkot&&_jAddDays(yomKippur,1)<sukkot) periods.push({start:_jAddDays(yomKippur,1),end:_jAddDays(sukkot,-1),label:"הכנות לסוכות",kind:"prep"});
  // Tishrei bein hazmanim: after Shmini Atzeret/Simchat Torah -> end of Tishrei
  const shminiAtzeret=firstWith("Shmini Atzeret");
  const rcCheshvan=firstWith("Rosh Chodesh Cheshvan");
  // בין הזמנים תשרי — ממוצאי שמח"ת עד ל' תשרי ועד בכלל (תשרי מלא, ר"ח חשוון יומיים; יש המסיימים בכ"ט)
  if(shminiAtzeret){ const _ty=hebFromISO(shminiAtzeret).y; favorable.push({start:_jAddDays(shminiAtzeret,1),end:hebToISO(_ty,7,30),label:"בין הזמנים תשרי",kind:"good",note:"מסתיים בל׳ תשרי (ועד בכלל); יש המסיימים בכ״ט"}); }
  else if(rcCheshvan) favorable.push({start:null,end:rcCheshvan,label:"בין הזמנים תשרי",kind:"good"});
  // Nisan bein hazmanim: before Pesach (minus last ~3 prep days) and after Pesach
  const rcNisan=firstWith("Rosh Chodesh Nisan");
  const pesachDates=items.filter(x=>x.title&&/^Pesach/.test(x.title)&&x.title.indexOf("Sheni")<0).map(x=>x.date).sort();
  const pesach=pesachDates[0], pesachEnd=pesachDates[pesachDates.length-1];
  const rcIyar=firstWith("Rosh Chodesh Iyyar");
  if(pesach){
    // שני חלונות ניסן, מעוגנים במנוע הלוח:
    // א. לפני החג: מר"ח ניסן עד ערב תקופת ההכנות. שולי ההכנות מתכווננים (3–7 ימים, לוח בקרה).
    // ב. אחרי החג: מאסרו חג (כ"ב ניסן) עד ל' ניסן ועד בכלל (ניסן מלא, ר"ח אייר יומיים; יש המסיימים בכ"ט).
    const _ny=hebFromISO(pesach).y;
    const _pd=Math.min(7,Math.max(3,+(STATE.pesachPrepDays||3)));
    const prepStartD=15-_pd; // הכנות: מ-(ט"ו−ימים) עד י"ד ניסן
    if(prepStartD>1) favorable.push({start:hebToISO(_ny,1,1),end:hebToISO(_ny,1,prepStartD-1),label:"בין הזמנים ניסן",kind:"good"});
    periods.push({start:hebToISO(_ny,1,prepStartD),end:hebToISO(_ny,1,14),label:"הכנות לפסח",kind:"prep"});
    favorable.push({start:hebToISO(_ny,1,22),end:hebToISO(_ny,1,30),label:"בין הזמנים ניסן — אחרי החג",kind:"good",note:"מאסרו חג עד ל׳ ניסן (ועד בכלל); יש המסיימים בכ״ט"});
  }
  // Sefirat HaOmer: 16 Nisan (2nd day Pesach) for 49 days to Shavuot eve
  if(pesach) periods.push({start:_jAddDays(pesach,1),end:_jAddDays(pesach,49),label:"ספירת העומר",kind:"omer"});
  if(pesachEnd&&rcIyar) favorable.push({start:_jAddDays(pesachEnd,1),end:_jAddDays(rcIyar,-1),label:"בין הזמנים ניסן (אחרי)",kind:"good"});
  // minor fasts (travel permitted, but some prefer not to). Yom Kippur is handled as Yom Tov (blocked) separately.
  const FASTS=[["Tzom Gedaliah","צום גדליה"],["Asara B'Tevet","עשרה בטבת"],["Ta'anit Esther","תענית אסתר"],["Tzom Tammuz","י״ז בתמוז"],["Tish'a B'Av","תשעה באב"]];
  const fasts=[];
  for(const it of items){ if(it.title&&it.title.indexOf("Erev")<0){ for(const fm of FASTS){ if(it.title.indexOf(fm[0])>=0){ fasts.push({date:it.date,label:fm[1]}); break; } } } }
  return {periods,holidays,cholHamoed,favorable,fasts,profile};
}
async function fetchJewishData(fromISO,toISO,profile){
  const from=_jAddDays(fromISO,-45), to=_jAddDays(toISO,45);
  const key=from+'|'+to+'|'+(profile||'general');
  if(JCACHE[key]) return JCACHE[key];
  try{
    const url=`${JCAL_URL}?start=${from}&end=${to}&_=${Date.now()}`;
    const r=await fetch(url,{cache:'no-store'});
    if(r.ok){ const j=await r.json(); const items=j.items||[];
      window.__hebcalRaw=items.map(x=>x.date+' · '+x.title+(x.yomtov?' [YT]':'')); // diagnostic
      // capture weekly parsha by its Shabbat (Saturday) date — for the "ערב שבת פרשת X" greeting
      const pmap={}; for(const it of items){ const t=(it.title||''); const mh=/^פרשת\s+(.+)$/.exec(t), me=/^Parashat\s+(.+)$/i.exec(t); if(mh)pmap[(it.date||'').slice(0,10)]=mh[1]; else if(me)pmap[(it.date||'').slice(0,10)]=me[1]; } window.__parshaBySat=pmap;
      const data=deriveJewishPeriods(items,profile);
      window.__jPeriods=[...data.periods.map(p=>p.kind+': '+p.label+' '+p.start+'→'+p.end), ...data.favorable.map(p=>'good: '+p.label+' '+p.start+'→'+p.end)]; // diagnostic
      JCACHE[key]=data; return data; }
    else { window.__jErr='HTTP '+r.status; }
  }catch(e){ window.__jErr=String(e); }
  return {periods:[],holidays:[],cholHamoed:[],favorable:[],profile};
}
const _jOverlap=(s1,e1,s2,e2)=>s1<=e2&&e1>=s2;
// ---- Shabbat-time layer (TLV side): candle-lighting & havdalah, compared to actual flight times ----
const ZCACHE={};
async function fetchShabbatTimes(fromISO,toISO,geo){
  const lat=geo?geo.lat:LAT, lon=geo?geo.lon:LON, tz=geo?geo.tz:'Asia/Jerusalem';
  const from=_jAddDays(fromISO,-3), to=_jAddDays(toISO,3);
  const m = STATE.havdalah==='rt72' ? '&m=72' : ''; // rt72 -> fixed 72 min; else 8.5deg (M=on, default in edge)
  const key=(geo?geo.lat+','+geo.lon:'TLV')+'|'+from+'|'+to+'|'+STATE.candleMin+'|'+STATE.havdalah;
  if(ZCACHE[key]) return ZCACHE[key];
  const res={candle:{},havdalah:{},sunrise:{}};
  try{
    const url=`${JCAL_URL}?zmanim=1&lat=${lat}&lng=${lon}&tzid=${encodeURIComponent(tz)}&start=${from}&end=${to}&b=${STATE.candleMin}${m}&_=${Date.now()}`;
    const r=await fetch(url,{cache:'no-store'});
    if(r.ok){ const j=await r.json(); for(const it of (j.zmanim||[])){
      const d=(it.date||'').slice(0,10);
      if(it.category==='candles') res.candle[d]=it.date;
      else if(it.category==='havdalah') res.havdalah[d]=it.date;
    } if(j.sunrise) res.sunrise=j.sunrise; if(!geo) window.__zmanim=res; }
    else window.__zErr='HTTP '+r.status;
  }catch(e){ window.__zErr=String(e); }
  ZCACHE[key]=res; return res;
}
const _isoDate=s=>s?s.slice(0,10):'';
const _isoMin=s=>s?(+s.slice(11,13)*60 + +s.slice(14,16)):null; // wall-clock minutes (both flight & zmanim are TLV local)
const _hm=mins=>String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0');
const _gap=mins=>(mins<0?'-':'')+Math.floor(Math.abs(mins)/60)+':'+String(Math.abs(mins)%60).padStart(2,'0');
// build "YYYY-MM-DDTHH:MM" from a window date + a flight clock time ("13:45"); used when
// the edge gives only outDep/backArr (HH:MM) and not the full *ISO* fields.
const _hmMin=hhmm=>{ const m=/(\d{1,2}):(\d{2})/.exec(hhmm||''); return m?(+m[1]*60 + +m[2]):null; };
const _mkISO=(ymd,hhmm)=>{ const m=/(\d{1,2}):(\d{2})/.exec(hhmm||''); return (ymd&&m)?(ymd+'T'+String(m[1]).padStart(2,'0')+':'+m[2]):null; };
const _dow=d=>d?new Date(d+'T12:00:00Z').getUTCDay():null; // 0=Sun … 6=Sat
// destination coordinates: small built-in table for common destinations (instant),
// anything else is geocoded online (Open-Meteo, free/no-key) and cached.
const DEST_GEO={
  MXP:{lat:45.63,lon:8.72,tz:'Europe/Rome'}, LIN:{lat:45.45,lon:9.28,tz:'Europe/Rome'}, BGY:{lat:45.67,lon:9.70,tz:'Europe/Rome'},
  FCO:{lat:41.80,lon:12.25,tz:'Europe/Rome'}, CIA:{lat:41.80,lon:12.59,tz:'Europe/Rome'}, VRN:{lat:45.40,lon:10.89,tz:'Europe/Rome'}, TRN:{lat:45.20,lon:7.65,tz:'Europe/Rome'},
  BUH:{lat:44.57,lon:26.10,tz:'Europe/Bucharest'}, OTP:{lat:44.57,lon:26.10,tz:'Europe/Bucharest'}, CLJ:{lat:46.78,lon:23.69,tz:'Europe/Bucharest'}, IAS:{lat:47.18,lon:27.62,tz:'Europe/Bucharest'},
  ATH:{lat:37.94,lon:23.95,tz:'Europe/Athens'}, SKG:{lat:40.52,lon:22.97,tz:'Europe/Athens'}, HER:{lat:35.34,lon:25.18,tz:'Europe/Athens'}, RHO:{lat:36.41,lon:28.09,tz:'Europe/Athens'},
  LCA:{lat:34.88,lon:33.63,tz:'Asia/Nicosia'}, PFO:{lat:34.72,lon:32.49,tz:'Asia/Nicosia'},
  TBS:{lat:41.67,lon:44.95,tz:'Asia/Tbilisi'}, BCN:{lat:41.30,lon:2.08,tz:'Europe/Madrid'}, MAD:{lat:40.49,lon:-3.57,tz:'Europe/Madrid'},
  BUD:{lat:47.44,lon:19.26,tz:'Europe/Budapest'}, PRG:{lat:50.10,lon:14.26,tz:'Europe/Prague'}, VIE:{lat:48.11,lon:16.57,tz:'Europe/Vienna'},
  CDG:{lat:49.01,lon:2.55,tz:'Europe/Paris'}, ORY:{lat:48.73,lon:2.36,tz:'Europe/Paris'}, JFK:{lat:40.64,lon:-73.78,tz:'America/New_York'}, EWR:{lat:40.69,lon:-74.17,tz:'America/New_York'},
  GVA:{lat:46.24,lon:6.11,tz:'Europe/Zurich'}, ZRH:{lat:47.46,lon:8.55,tz:'Europe/Zurich'}, INN:{lat:47.26,lon:11.34,tz:'Europe/Vienna'}, SZG:{lat:47.79,lon:13.00,tz:'Europe/Vienna'},
  MUC:{lat:48.35,lon:11.79,tz:'Europe/Berlin'}, LYS:{lat:45.73,lon:5.08,tz:'Europe/Paris'}, SOF:{lat:42.69,lon:23.41,tz:'Europe/Sofia'},
  LON:{lat:51.47,lon:-0.45,tz:'Europe/London'}, LHR:{lat:51.47,lon:-0.45,tz:'Europe/London'}
};
const _geoCache={};
async function geocodeDest(code,name){
  const byBook = code && CITY[code] && CITY[code]._book && DEST_GEO[String(CITY[code]._book).toUpperCase()];
  if(DEST_GEO[code]) return DEST_GEO[code];
  if(byBook) return byBook;
  if(CITY[code]&&CITY[code]._geo) return CITY[code]._geo;
  if(_geoCache[code]!==undefined) return _geoCache[code];
  const q=String(name||(CITY[code]&&CITY[code].he)||code).split(' · ')[0].split('—')[0].split('/')[0].trim();
  if(!q) return (_geoCache[code]=null);
  try{
    const r=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`);
    if(r.ok){ const j=await r.json(); const h=j&&j.results&&j.results[0];
      if(h&&h.latitude!=null){ const g={lat:h.latitude,lon:h.longitude,tz:h.timezone||'UTC'}; if(CITY[code])CITY[code]._geo=g; return (_geoCache[code]=g); } }
  }catch(e){}
  return (_geoCache[code]=null);
}
// destination-side verdict: arriving at the destination Fri eve, or departing it on Motzei Shabbat,
// compared to the DESTINATION's own candle-lighting / havdalah (flight times are local to each airport)
function destVerdict(w,dzt){
  if(!w.info||!dzt) return null;
  const mb=(+STATE.marginBefore||3)*60, ma=(+STATE.marginAfter||3)*60;
  const parts=[]; let forbidden=false, worst='good'; const rank={good:0,note:1,tight:2}; const bump=c=>{ if(rank[c]>rank[worst]) worst=c; };
  // arrival at destination (outArr) — date is w.start, +1 if it lands past midnight
  let oaDate=w.start;
  if(!w.info.outArrISO && w.info.outDep && w.info.outArr && _hmMin(w.info.outArr)<_hmMin(w.info.outDep)) oaDate=_jAddDays(w.start,1);
  const oa=w.info.outArrISO || _mkISO(oaDate, w.info.outArr);
  if(oa){
    const dd=_isoDate(oa), dow=_dow(dd), t=_isoMin(oa);
    if(dow===5){ const ct=_isoMin(dzt.candle[dd]);
      if(ct!=null && t>ct){ parts.push(`✗ נחיתה ביעד ${_hm(t)} אחרי כניסת שבת ${_hm(ct)}`); forbidden=true; }
      else if(ct!=null && t>ct-mb){ parts.push(`ביעד · נחיתה ${_hm(t)} · כניסה ${_hm(ct)} · רק ${_gap(ct-t)} ⚠`); bump('tight'); }
      else if(ct!=null){ parts.push(`ביעד · נחיתה ${_hm(t)} · כניסת שבת ${_hm(ct)} ✓`); bump('good'); }
    } else if(dow===6){ const ht=_isoMin(dzt.havdalah[dd]);
      if(ht!=null && t>ht){ parts.push(`ביעד · נחיתה במוצ״ש ${_hm(t)} · צאת שבת ${_hm(ht)} ✓`); bump('good'); }
      else if(ht!=null){ parts.push(`✗ נחיתה ביעד בשבת · ${_hm(t)} לפני צאת שבת ${_hm(ht)}`); forbidden=true; }
      else { parts.push('✗ נחיתה ביעד בשבת'); forbidden=true; }
    }
  }
  // departure from destination (backDep) on w.ret
  if(w.ret){
    const bd=w.info.backDepISO || _mkISO(w.ret, w.info.backDep);
    if(bd){
      const dd=_isoDate(bd), dow=_dow(dd), t=_isoMin(bd);
      if(dow===6){ const ht=_isoMin(dzt.havdalah[dd]);
        if(ht!=null && t>=ht+ma){ parts.push(`ביעד · יציאה ${_hm(t)} · צאת שבת ${_hm(ht)} ✓`); bump('good'); }
        else if(ht!=null && t>=ht){ parts.push(`ביעד · יציאה ${_hm(t)} · צאת שבת ${_hm(ht)} · רק ${_gap(t-ht)} ⚠`); bump('tight'); }
        else if(ht!=null){ parts.push(`✗ יציאה מהיעד ${_hm(t)} לפני צאת שבת ${_hm(ht)}`); forbidden=true; }
      } else if(dow===5){ const ct=_isoMin(dzt.candle[dd]); if(ct!=null && t>ct){ parts.push(`✗ יציאה מהיעד ${_hm(t)} אחרי כניסת שבת`); forbidden=true; } }
    }
  }
  if(!parts.length) return null;
  return {t:parts.join(' · '), cls:forbidden?'bad':worst, forbidden};
}
// verdict for a window's TLV-side legs: outbound departs TLV, return lands TLV
function shabbatVerdict(w,zt){
  if(!w.info) return null;
  const mb=(+STATE.marginBefore||3)*60, ma=(+STATE.marginAfter||3)*60;
  const parts=[]; let forbidden=false, worst='good';
  const rank={good:0,soft:1,note:2,tight:3};
  const bump=c=>{ if(rank[c]>rank[worst]) worst=c; };
  // --- outbound departs TLV ---
  const od=w.info.outDepISO || _mkISO(w.start, w.info.outDep);
  if(od){
    const dd=_isoDate(od), dow=new Date(dd+'T12:00:00Z').getUTCDay(), t=_isoMin(od);
    if(dow===6){ // Saturday departure -> must be Motzei Shabbat
      const ht=_isoMin(zt.havdalah[dd]);
      if(ht==null){ parts.push('מוצ״ש? (חסר זמן צאת שבת)'); bump('note'); }
      else if(t>=ht+ma){ parts.push(`🕯️ מוצ״ש · המראה ${_hm(t)} · צאת שבת ${_hm(ht)} · ${_gap(t-ht)} אחרי צאת שבת ✓`); bump('good'); }
      else if(t>=ht){ parts.push(`🕯️ מוצ״ש צמוד · המראה ${_hm(t)} · צאת שבת ${_hm(ht)} · רק ${_gap(t-ht)} אחרי ⚠`); bump('tight'); }
      else { parts.push(`✗ המראה ${_hm(t)} לפני צאת שבת ${_hm(ht)} (בשבת)`); forbidden=true; }
    } else if(dow===5){ // Friday departure from TLV
      const ct=_isoMin(zt.candle[dd]);
      if(ct!=null && t>ct){ parts.push(`✗ המראה ${_hm(t)} אחרי כניסת שבת ${_hm(ct)}`); forbidden=true; }
      else if(ct!=null){ parts.push(`🕯️ יציאה בשישי · המראה ${_hm(t)} · כניסת שבת ${_hm(ct)} · לבדוק נחיתה ביעד`); bump('note'); }
    }
  }
  // --- return lands TLV ---
  let baDate=w.ret;
  if(!w.info.backArrISO && w.info.backArr && w.info.backDep){
    const dep=_hmMin(w.info.backDep), arr=_hmMin(w.info.backArr);
    if(dep!=null && arr!=null && arr<dep) baDate=_jAddDays(w.ret,1); // landed after midnight
  }
  const ba=w.info.backArrISO || _mkISO(baDate, w.info.backArr);
  if(ba){
    const dd=_isoDate(ba), dow=new Date(dd+'T12:00:00Z').getUTCDay(), t=_isoMin(ba);
    if(dow===6){ parts.push(`✗ נחיתה ${_hm(t)} בשבת`); forbidden=true; }
    else if(dow===5){
      const ct=_isoMin(zt.candle[dd]);
      const thr=friThresholdMin(zt,dd);                  // user-chosen line: sunrise / 06:00 / 08:00
      const early = thr!=null && t < thr;                // landed before the threshold = plenty of time
      const sedra = parshaFor(_jAddDays(dd,1));           // parsha of this Shabbat (Saturday = dd+1)
      const erev = `ערב שבת${sedra?` פרשת ${sedra}`:''}`;
      if(ct==null){ parts.push(`🕯️ ${erev}? (חסר זמן כניסת שבת)`); bump('note'); }
      else if(early){
        // very early / night landing — a SOFT, welcoming note, not an alert
        const icon = (zt.sunrise && _isoMin(zt.sunrise[dd])!=null && t<_isoMin(zt.sunrise[dd])) ? '🌙' : '🌅';
        parts.push(`${icon} ${erev} · נחיתה ${_hm(t)} · נשארו ${_gap(ct-t)} שעות ✓`); bump('soft');
      }
      else if(t<=ct-mb){ parts.push(`🕯️ ${erev} · נחיתה ${_hm(t)} · כניסת שבת ${_hm(ct)} · נשארו ${_gap(ct-t)} שעות ✓`); bump('good'); }
      else if(t<=ct){ parts.push(`🕯️ ${erev} צמוד · נחיתה ${_hm(t)} · כניסת שבת ${_hm(ct)} · רק ${_gap(ct-t)} שעות ⚠`); bump('tight'); }
      else { parts.push(`✗ נחיתה ${_hm(t)} אחרי כניסת שבת ${_hm(ct)}`); forbidden=true; }
    }
  }
  if(!parts.length) return null;
  return {forbidden, cls:forbidden?'bad':(worst==='tight'?'tight':(worst==='soft'?'soft':(worst==='note'?'note':'good'))), t:parts.join(' · ')};
}
// Friday-landing alert threshold (user-selectable): land after this -> normal alert; before -> soft note
function friThresholdMin(zt,dd){
  const m=STATE.friThreshold||'sunrise';
  if(m==='06:00') return 360;
  if(m==='08:00') return 480;
  return zt && zt.sunrise ? _isoMin(zt.sunrise[dd]) : null; // sunrise (netz) of that Friday
}
function parshaFor(satDate){ const mp=window.__parshaBySat||{}; return mp[satDate]||''; }
// per-day status (most relevant wins) for the day-by-day band
const DAY_HE={ normal:'רגיל', three:'שלושת השבועות', nine:'תשעת הימים', tisha:'תשעה באב', fast:'צום', prep:'הכנות לחג', chm:'חול המועד', good:'חופשה/חג', maybe:'פורים', bein:'בין הזמנים', elul:'אלול', block:'חג' };
// base = the strongest period/status (excluding minor fasts); fast = is this a minor fast day (overlay)
function dayStatus(day,data){
  const fast = (data.fasts||[]).some(f=>f.date===day && f.label!=='תשעה באב');
  let base='normal';
  const has=(()=>{
    for(const h of (data.holidays||[])) if(h.date===day) return 'block';
    for(const f of (data.fasts||[])) if(f.date===day && f.label==='תשעה באב') return 'tisha';
    let inNine=false,inThree=false,inElul=false,inBein=false,inPrep=false;
    for(const p of (data.periods||[])){ if(p.start<=day&&day<=p.end){
      if(p.kind==='ninedays')inNine=true; else if(p.kind==='threeweeks')inThree=true;
      else if(p.kind==='elul')inElul=true; else if(p.kind==='beinhazmanim')inBein=true; else if(p.kind==='prep')inPrep=true;
    }}
    for(const d of (data.cholHamoed||[])) if(d===day) return 'chm';
    if(inNine) return 'nine';
    if(inPrep) return 'prep';
    if(inThree) return 'three';
    // שכבות הלוח היהודי גוברות על חופשה גנרית בצביעת היום
    if(inBein) return 'bein';
    if(inElul) return 'elul';
    for(const f of (data.favorable||[])) if(f.start<=day&&day<=f.end){
      if(/בין הזמנים/.test(f.label||'')) return 'bein'; // בין הזמנים דניסן/תשרי — צבע בין הזמנים, לא ירוק סתמי
      return (f.kind==='maybe'?'maybe':'good');
    }
    return 'normal';
  })();
  base=has;
  // שכבה שנייה לחפיפה (פיצול צבע בתא): בין∩אלול, ושכבה הלכתית∩חופשה
  let second=null;
  {
    let inElul2=false,inBein2=false;
    for(const p of (data.periods||[])){ if(p.start<=day&&day<=p.end){ if(p.kind==='elul')inElul2=true; else if(p.kind==='beinhazmanim')inBein2=true; } }
    const favGood=(data.favorable||[]).some(f=>f.start<=day&&day<=f.end&&!/בין הזמנים/.test(f.label||''));
    if(base==='bein') second = inElul2?'elul':(favGood?'good':null);
    else if(base==='elul'||base==='nine'||base==='three'||base==='prep') second = favGood?'good':null;
  }
  // a standalone fast with no stronger backdrop shows as full fast colour
  if(fast && base==='normal') return {base:'fast', fast:false, second:null};
  return {base, fast, second};
}
function tripBand(start,ret,data){
  const days=[]; let d=start;
  while(d<=ret && days.length<40){
    const isShabbat=new Date(d+'T00:00:00Z').getUTCDay()===6;
    const st=dayStatus(d,data);
    days.push({date:d,cls:st.base,cls2:st.second||null,fast:st.fast,shabbat:isShabbat});
    d=_jAddDays(d,1);
  }
  const counts={}; let shab=0, fasts=0;
  days.forEach(x=>{ counts[x.cls]=(counts[x.cls]||0)+1; if(x.shabbat)shab++; if(x.fast||x.cls==='fast')fasts++; });
  // named holidays that fall within the trip (so "פורים", "חנוכה" etc are spelled out)
  const hols=[];
  for(const f of (data.favorable||[])){ if(f.start<=ret && f.end>=start && f.label && !/קיץ|בין הזמנים/.test(f.label)) hols.push(f.label.replace(' — חופשה','')); }
  return {days,counts,shab,fasts,hols:[...new Set(hols)]};
}
function bandHtml(band){
  if(!band||!band.days||!band.days.length) return '';
  const cells=band.days.map(d=>{
    const title=`${d.date.slice(8)}.${+d.date.slice(5,7)} · ${DAY_HE[d.cls]}${d.cls2?' + '+DAY_HE[d.cls2]:''}${(d.fast||d.cls==='fast')?' · צום':''}${d.shabbat?' · שבת':''}`;
    const split = d.fast ? `<span class="bc-fasthalf"></span>` : '';
    const half = d.cls2 ? `<span class="bcell bc-${d.cls2}" style="position:absolute;left:0;right:0;bottom:0;top:auto;height:46%;width:auto;margin:0;border:0;flex:none"></span>` : '';
    return `<span class="bcell bc-${d.cls}${d.shabbat?' bc-shab':''}" style="flex:1 1 0;position:relative;overflow:hidden" title="${title}">${half}${split}</span>`;
  }).join('');
  const order=['tisha','nine','three','prep','block','chm','elul','bein','good','normal'];
  const parts=order.filter(k=>band.counts[k]).map(k=>band.counts[k]+' '+DAY_HE[k]);
  if(band.fasts) parts.push(band.fasts+' צום');
  if(band.hols&&band.hols.length) parts.push(...band.hols);
  if(band.shab) parts.push('🕯️ '+(band.shab>1?(band.shab+' שבתות'):'שבת'));
  return `<div class="band" style="direction:rtl;width:100%">${cells}</div><div class="bandleg">${parts.join(' · ')}</div>`;
}
const TUNE_PERIODS=[
  {key:'threeweeks',label:'שלושת השבועות',grp:'m'},
  {key:'ninedays',label:'תשעת הימים',grp:'m'},
  {key:'tisha',label:'תשעה באב',grp:'m'},
  {key:'omer',label:'ספירת העומר',grp:'m'},
  {key:'fast',label:'צומות',grp:'m'},
  {key:'beinhazmanim',label:'בין הזמנים',grp:'o'},
  {key:'chanuka',label:'חנוכה',grp:'o'},
  {key:'purim',label:'פורים',grp:'o'},
  {key:'cholhamoed',label:'חול המועד',grp:'o'},
  {key:'lag',label:'ל״ג בעומר',grp:'o'},
];

/* ===== שכבת "עונות ביעד" (DEST_SEASONS) — תקופות תיירותיות בלוח הגרגוריאני, לפי היעד.
   ציר נפרד מ-TUNE_PERIODS (שהוא לוח עברי, צד תל אביב). pilot: איטליה.
   intensity: 1=קל · 2=בינוני · 3=שיא | dir: 'crowd'=עומס/יוקר · 'both'=אווירה+עומס · 'good'=חלון אידיאלי
   טווח: from/to בפורמט MM-DD (חוזר כל שנה, תומך במעבר שנה) — או years{} לתאריכים ניידים (פסחא/קרנבל). */
const DEST_SEASONS=[
  {cc:'איטליה',emoji:'🎄',label:'חג המולד–אפיפניה',intensity:3,dir:'both',from:'12-24',to:'01-06',desc:'שווקי חג ואווירה חגיגית — מנגד מחירי שיא ועומס'},
  {cc:'איטליה',emoji:'☀️',label:'שיא קיץ',intensity:3,dir:'crowd',from:'07-01',to:'08-31',desc:'חום כבד בערים, תורים ומחירי שיא'},
  {cc:'איטליה',emoji:'🏖️',label:'פֵרַאגוסטו',intensity:3,dir:'both',from:'08-10',to:'08-20',desc:'חופים בשיא ואווירה — אך ערים מתרוקנות ועסקים נסגרים (15/8)'},
  {cc:'איטליה',emoji:'⛪',label:'פסחא / השבוע הקדוש',intensity:2,dir:'crowd',years:{'2026':['2026-03-30','2026-04-06'],'2027':['2027-03-21','2027-03-28'],'2028':['2028-04-10','2028-04-16']},desc:'המון באתרים דתיים, מחירים גבוהים'},
  {cc:'איטליה',emoji:'🌿',label:'עונת ביניים אידיאלית',intensity:1,dir:'good',from:'04-20',to:'05-31',desc:'מזג אוויר נעים, פחות עומס, מחירים סבירים'},
  {cc:'איטליה',emoji:'🌿',label:'עונת ביניים אידיאלית',intensity:1,dir:'good',from:'09-01',to:'10-15',desc:'מזג אוויר נעים, פחות עומס, מחירים סבירים'},
  {city:'VCE',emoji:'🎭',label:'קרנבל ונציה',intensity:3,dir:'both',years:{'2026':['2026-02-07','2026-02-17'],'2027':['2027-01-30','2027-02-09'],'2028':['2028-02-19','2028-02-29']},desc:'מחזה ייחודי — אך ונציה צפופה ויקרה במיוחד'},
];
function seasonHits(ccHe,cityCode,startISO,endISO){
  if(!startISO) return [];
  const s=String(startISO).slice(0,10), e=String(endISO||startISO).slice(0,10);
  const code=String(cityCode||'').toUpperCase();
  const hits=[];
  for(const p of DEST_SEASONS){
    const scoped=(p.cc&&p.cc===ccHe)||(p.city&&p.city===code);
    if(!scoped) continue;
    let ranges=[];
    if(p.years){ for(const y in p.years) ranges.push(p.years[y]); }
    else if(p.from&&p.to){
      const yrs=new Set([+s.slice(0,4)-1,+s.slice(0,4),+e.slice(0,4)]);
      for(const Y of yrs){ let a=`${Y}-${p.from}`, b=(p.to<p.from)?`${Y+1}-${p.to}`:`${Y}-${p.to}`; ranges.push([a,b]); }
    }
    for(const r of ranges){ if(r[0]<=e && r[1]>=s){ hits.push(p); break; } }
  }
  hits.sort((x,y)=>(y.intensity-x.intensity)||((y.city?1:0)-(x.city?1:0)));
  return hits;
}
function seasonLabelHtml(ccHe,cityCode,startISO,endISO){
  const hits=seasonHits(ccHe,cityCode,startISO,endISO);
  if(!hits.length) return '';
  const p=hits[0];
  const col = p.dir==='crowd'?'background:#5a1e1e;color:#ffd9d9'
            : p.dir==='good' ?'background:#1e4a2e;color:#bff0cf'
            :                  'background:#5a4a1e;color:#ffe9b0';
  const tag = p.intensity===3?' · שיא':(p.intensity===2?' · בינוני':'');
  const more = hits.length>1?` <span style="font-size:9px;opacity:.7;margin-inline-start:2px">+${hits.length-1}</span>`:'';
  const title=(p.desc||'').replace(/"/g,'&quot;');
  return ` <span class="seasonbadge" style="display:inline-block;font-size:10px;font-weight:600;padding:2px 7px;border-radius:6px;margin-inline-start:6px;vertical-align:middle;white-space:nowrap;${col}" title="${title}">${p.emoji} ${p.label}${tag}</span>${more}`;
}
function defaultPeriodPrefs(){ const keys=['threeweeks','ninedays','tisha','omer','fast','beinhazmanim','chanuka','purim','cholhamoed','lag']; const o={}; for(const k of keys)o[k]={mode:'normal',scope:'travel'}; return o; }
function periodRanges(data){
  const R={}; for(const p of TUNE_PERIODS) R[p.key]=[];
  for(const p of (data.periods||[])){
    if(p.kind==='threeweeks')R.threeweeks.push({start:p.start,end:p.end});
    else if(p.kind==='ninedays')R.ninedays.push({start:p.start,end:p.end});
    else if(p.kind==='beinhazmanim')R.beinhazmanim.push({start:p.start,end:p.end});
    else if(p.kind==='omer')R.omer.push({start:p.start,end:p.end});
  }
  for(const f of (data.favorable||[])){
    if(/חנוכה/.test(f.label))R.chanuka.push({start:f.start,end:f.end});
    else if(/פורים/.test(f.label))R.purim.push({start:f.start,end:f.end});
    else if(/בעומר/.test(f.label))R.lag.push({start:f.start,end:f.end});
  }
  for(const d of (data.cholHamoed||[]))R.cholhamoed.push({start:d,end:d});
  for(const f of (data.fasts||[])){
    if(/תשעה באב/.test(f.label))R.tisha.push({start:f.date,end:f.date});
    else R.fast.push({start:f.date,end:f.date});
  }
  return R;
}
function periodHits(start,ret,R){
  const hits={};
  for(const key in R){
    let onTravel=false,inTrip=false;
    for(const r of R[key]){
      if(_jOverlap(start,ret,r.start,r.end)) inTrip=true;
      if((start>=r.start&&start<=r.end)||(ret>=r.start&&ret<=r.end)) onTravel=true;
    }
    hits[key]={onTravel,inTrip};
  }
  return hits;
}
// returns {drop:bool, prefer:bool} for a window given its hits and the user's prefs
function applyPeriodPrefs(hits){
  const prefs=STATE.periodPrefs||{};
  let drop=false, prefer=false;
  for(const key in hits){
    const pr=prefs[key]; if(!pr||pr.mode==='normal') continue;
    const h=hits[key];
    const match = pr.scope==='trip' ? h.inTrip : h.onTravel;
    if(!match) continue;
    if(pr.mode==='hide') drop=true;
    else if(pr.mode==='prefer') prefer=true;
  }
  return {drop,prefer};
}
function windowJewish(start,ret,data){
  const tags=[]; let block=false;
  const push=(t,cls)=>tags.push({t,cls});
  for(const p of data.periods){ if(_jOverlap(start,ret,p.start,p.end)){
    let cls='caution';
    if(p.kind==='beinhazmanim') cls=(data.profile==='yeshiva')?'good':'neutral';
    push(p.label,cls);
  } }
  let spansYomTov=false;
  for(const h of (data.holidays||[])){ if(_jOverlap(start,ret,h.date,h.date)) spansYomTov=true; if(h.date===start||h.date===ret) block=true; }
  if(spansYomTov){ push('חג','caution'); push('יו״ט שני בחו״ל?','caution'); }
  if(data.cholHamoed) for(const d of data.cholHamoed){ if(_jOverlap(start,ret,d,d)){ push('חול המועד','neutral'); break; } }
  for(const f of (data.favorable||[])){ if(_jOverlap(start,ret,f.start,f.end)) push(f.label,'good'); }
  let fastOnTravel=false;
  for(const f of (data.fasts||[])){
    if(f.date===start||f.date===ret){ push(f.label+' — יום נסיעה','caution'); fastOnTravel=true; }
    else if(_jOverlap(start,ret,f.date,f.date)){ push(f.label+' (בחופשה)','neutral'); }
  }
  const seen=new Set(); let out=tags.filter(x=>{ if(seen.has(x.t))return false; seen.add(x.t); return true; });
  return {tags:out,block,fastOnTravel};
}
function assembleWindowsOLD(fromISO,toISO,rules,priceMap,shabPref){
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
const ISRAELI_CARRIERS=/\b(el[\s-]?al|israir|arkia|sun[\s-]?d.?or|sundor)\b/i;
const LOWCOST_CARRIERS=/wizz|ryanair|easy[\s-]?jet|hi[\s-]?sky|transavia|vueling|norwegian|pegasus|fly[\s-]?dubai|bluebird|smart[\s-]?wings|eurowings|volotea|jet2|spirit|wow\s?air|laudamotion|blue\s?air|corendon|enter\s?air|sun\s?express|sky\s?express/i;
function isLowCost(name){ return LOWCOST_CARRIERS.test(name||''); }
// the "family" name for grouping/filtering (drop codeshare partners after + or /)
function carrierFamily(name){ return String(name||'').split(' + ')[0].split(' / ')[0].trim(); }
// For a round-trip "OUT / IN" carrier string, return EVERY leg's primary carrier — so an airline
// that only flies one direction (e.g. El Al as the direct return) is still listed and filterable,
// not hidden behind the outbound carrier.
function carrierFamilies(name){
  const fams=[];
  for(const leg of String(name||'').split(' / ')){ const f=leg.split(' + ')[0].trim(); if(f && !fams.includes(f)) fams.push(f); }
  return fams;
}
// collapse near-duplicate fares of the SAME physical flight (identical times) — keep the cheapest
function dedupFlights(arr){
  const best={}, order=[];
  for(const o of arr){
    const k=(o.outDep||'')+'|'+(o.outArr||'')+'|'+(o.backDep||'')+'|'+(o.backArr||'')+'|'+(o.stops!=null?o.stops:'');
    if(!(k in best)){ best[k]=o; order.push(k); }
    else if((o.price!=null?o.price:1e9)<(best[k].price!=null?best[k].price:1e9)) best[k]=o;
  }
  return order.map(k=>best[k]);
}
// flight duration from ISO endpoints (offset-aware, so it's correct across time zones)
function _durMin(iso1,iso2){ if(!iso1||!iso2)return null; const a=Date.parse(iso1),b=Date.parse(iso2); if(isNaN(a)||isNaN(b))return null; let d=Math.round((b-a)/60000); if(d<0)d+=1440; return (d>0&&d<2880)?d:null; }
function _durFmt(min){ if(min==null)return ''; const h=Math.floor(min/60),m=min%60; return h+'ש'+(m?' '+m+'ד':''); }
function isIsraeliCarrier(name){ return ISRAELI_CARRIERS.test(name||''); }
// every leg of the round trip flies an israeli carrier (El Al / Arkia / Israir / Sun d'or) —
// for the "only israeli" safety filter. A mixed itinerary (e.g. Air Europa out, El Al back) fails.
function isAllIsraeli(name){ const legs=String(name||'').split(' / '); return legs.length>0 && legs.every(l=>isIsraeliCarrier(l)); }
// when the user isolates a single carrier in the side panel, return that carrier; else null
function _isolatedCarrier(){
  const hid=STATE.hiddenCarriers||[]; if(!hid.length) return null;
  const all=carriersInResults().map(c=>c.name); const vis=all.filter(n=>!hid.includes(n));
  return vis.length===1 ? vis[0] : null;
}
function sortFlights(arr){
  const a=arr.slice(); const sb=STATE.sortBy||'price';
  // base comparator for the chosen sort mode
  let cmp;
  if(sb==='time') cmp=(x,y)=>{ const tx=x.outDep||'99:99', ty=y.outDep||'99:99'; return tx<ty?-1:(tx>ty?1:((x.price||0)-(y.price||0))); };
  else if(sb==='airline') cmp=(x,y)=>{ const ix=isIsraeliCarrier(x.carrier)?0:1, iy=isIsraeliCarrier(y.carrier)?0:1; if(ix!==iy)return ix-iy; const cx=x.carrier||'', cy=y.carrier||''; if(cx!==cy)return cx<cy?-1:1; return (x.price||0)-(y.price||0); };
  else if(sb==='lowcost') cmp=(x,y)=>{ const ix=isLowCost(x.carrier)?0:1, iy=isLowCost(y.carrier)?0:1; if(ix!==iy)return ix-iy; return (x.price||0)-(y.price||0); };
  else cmp=(x,y)=>(x.price||0)-(y.price||0);
  // when a carrier is isolated, surface FULL same-carrier round trips (that carrier on both legs)
  // first — e.g. isolating ITA shows ITA↔ITA before ITA+other-airline combinations.
  const iso=_isolatedCarrier();
  if(iso){ const pure=o=>{ const fs=carrierFamilies(o.carrier); return (fs.length>0 && fs.every(f=>f===iso))?0:1; };
    a.sort((x,y)=>{ const p=pure(x)-pure(y); return p||cmp(x,y); }); }
  else a.sort(cmp);
  return a;
}
// one card per flight
