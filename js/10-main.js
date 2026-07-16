async function fetchOne(origin,dest,month){
  const r=await fetch(`${FUNC_URL}?from=${origin}&to=${dest}&depart=${month}&currency=eur`);
  if(!r.ok)throw new Error("func "+r.status);
  const d=await r.json(); return (d.flights||[]).map(adapt);
}
async function fetchCalOne(origin,dest,month,nights){
  const r=await fetch(`${FUNC_URL}?from=${origin}&to=${dest}&depart=${month}&duration=${nights}&mode=cal&currency=eur`);
  if(!r.ok)throw new Error("cal "+r.status);
  const d=await r.json(); return (d.flights||[]).map(adapt);
}
async function fetchSki(origin,nights){
  const tasks=[];
  for(const d of SKI_DESTS) for(const m of SKI_MONTHS) tasks.push(fetchCalOne(origin,d,m,nights));
  const res=await Promise.allSettled(tasks);
  let all=[],ok=0,firstErr=null;
  res.forEach(r=>{ if(r.status==="fulfilled"){ok++;all=all.concat(r.value);} else if(!firstErr)firstErr=r.reason; });
  if(ok===0 && firstErr) throw firstErr;
  return all;
}
async function fetchLive(I){
  const origin=I.origin||"TLV", month=I.departMonth||new Date().toISOString().slice(0,7);
  // ski mode: scan ski destinations across the season window (Jan–Feb), merge
  if(I.destination==="SKI"){
    const tasks=[];
    for(const d of SKI_DESTS) for(const m of SKI_MONTHS) tasks.push(fetchOne(origin,d,m));
    const res=await Promise.allSettled(tasks);
    let all=[],ok=0,firstErr=null;
    res.forEach(r=>{ if(r.status==="fulfilled"){ok++;all=all.concat(r.value);} else if(!firstErr)firstErr=r.reason; });
    if(ok===0 && firstErr) throw firstErr;
    const best={};
    for(const f of all){ if(!best[f.to]||f.price<best[f.to].price) best[f.to]=f; }
    return Object.values(best);
  }
  // specific destination -> single query
  if(I.destination && I.destination!=="-" && I.destination!=="variable"){
    return fetchOne(origin,I.destination,month);
  }
  // "explore" -> scan popular destinations in parallel and merge
  const res=await Promise.allSettled(EXPLORE_DESTS.map(d=>fetchOne(origin,d,month)));
  let all=[],ok=0,firstErr=null;
  res.forEach(r=>{ if(r.status==="fulfilled"){ok++;all=all.concat(r.value);} else if(!firstErr)firstErr=r.reason; });
  if(ok===0 && firstErr) throw firstErr;
  const best={};
  for(const f of all){ if(!best[f.to]||f.price<best[f.to].price) best[f.to]=f; }
  return Object.values(best);
}
function card(f,rank){
  const _yy=ms=>new Date(ms).toISOString().slice(2,10).replace(/-/g,'');
  const gLink = f.retUTC
    ? `https://www.skyscanner.net/transport/flights/${STATE.origin.toLowerCase()}/${(f.to||'').toLowerCase()}/${_yy(f.depUTC)}/${_yy(f.retUTC)}/`
    : `https://www.skyscanner.net/transport/flights/${STATE.origin.toLowerCase()}/${(f.to||'').toLowerCase()}/${_yy(f.depUTC)}/`;
  const TS=tripShabbat(f.depUTC,f.durTo,f.retUTC,f.durBack);
  const out=fmtLocal(f.depUTC);
  const back=f.retUTC?fmtLocal(f.retUTC):null;
  const tags=[]; if(f.fresh)tags.push('<span class="rtg fresh">מקום חדש</span>'); if(TS)tags.push(`<span class="rtg trip ${TS.k}">${TS.t}</span>`);
  const busy=busyLevel(ilAbs(f.depUTC), ilAbs(f.retUTC?f.retUTC+(f.durBack||180)*60000:f.depUTC));
  if(busy)tags.push(`<span class="rtg busy ${busy.k}">${busy.k==='peak'?'שבוע שיא עומס':'שבוע עמוס'}</span>`);
  const jw=jewishTagFor(f.cc);
  if(jw)tags.push(`<span class="rtg jewish">✡ ${jw.join(' · ')}</span>`);
  const times=`יציאה <b>${out}</b>`+(back?` &nbsp;·&nbsp; חזרה <b>${back}</b>`:'');
  return `<div class="res ${rank===1?'win':''}"><div class="rank">${rank}</div>
    <div class="rbody"><div class="rttl">${f.cityHe} <span class="sm">· ${f.cc} · ${f.alHe}</span></div>
    <div class="rtimes">${times}</div>
    <div class="rtags">${tags.join('')}</div></div>
    <div class="rprice"><div class="v">€${f.price}</div><div class="k">מחיר אמת (מטמון)</div><a class="book" href="${gLink}" target="_blank" rel="noopener">🔍 טיסות אמיתיות</a><a class="book2" href="${f.deep_link}" target="_blank" rel="noopener">הזמנה ←</a></div></div>`;
}
let runSeq=0;
let _directRetrySig=null; // ensures we auto-retry "no direct flights" at most once per unique search
/* ===== מתכנן תאריכים בלבד — חלונות מול הלוח העברי, בלי חיפוש טיסות ===== */
let plannerSeq=0;
async function runPlanner(){
  const my=++plannerSeq; runSeq++; // מבטל חיפוש טיסות שרץ ברקע
  _lastRunSig=searchSig();
  const sb=document.getElementById('stalebar'); if(sb) sb.innerHTML='';
  const out=document.getElementById('out');
  out.innerHTML='<div class="state"><div class="spin"></div>בונה חלונות תאריכים מול הלוח העברי…</div>';
  try{
    let windows;
    if(STATE.dateMode==='exact'){
      const nts=Math.max(1,Math.round((Date.parse(STATE.toDate)-Date.parse(STATE.fromDate))/864e5));
      windows=[{start:STATE.fromDate,ret:STATE.toDate,nights:nts,TS:windowShabbat(STATE.fromDate,STATE.toDate),price:null}];
      if(!STATE.allowShabbat && _dow(STATE.fromDate)===0){
        const sat=_jAddDays(STATE.fromDate,-1);
        windows.push({start:sat,ret:STATE.toDate,nights:nts+1,TS:windowShabbat(sat,STATE.toDate),price:null,_motzei:true});
      }
    }else{
      const nMin=STATE.flexNights==='any'?3:STATE.flexNights;
      const nMax=STATE.flexNights==='any'?9:STATE.flexNights;
      const startDows=(STATE.flexStartDows&&STATE.flexStartDows.length)?STATE.flexStartDows:(STATE.flexStartDow==null?null:[STATE.flexStartDow]);
      const endDows=(STATE.flexEndDows&&STATE.flexEndDows.length)?STATE.flexEndDows:null;
      if(STATE.dateMode==='month'){
        const ms=(STATE.months.length?STATE.months:[new Date().toISOString().slice(0,7)]).slice().sort();
        const fromISO=ms[0]+'-01';
        const [ly,lm]=ms[ms.length-1].split('-').map(Number);
        const toISO=new Date(Date.UTC(ly,lm,0)).toISOString().slice(0,10);
        windows=genValidWindows(fromISO,toISO,{nightsMin:nMin,nightsMax:nMax,startDows,endDows},STATE.flexShabbat).filter(w=>ms.includes(w.start.slice(0,7)));
      }else{
        windows=genValidWindows(STATE.fromDate,STATE.toDate,{nightsMin:nMin,nightsMax:nMax,startDows,endDows},STATE.flexShabbat);
      }
    }
    if(STATE.jewishMode!=='off' && windows.length){
      const minS=windows.reduce((a,w)=>w.start<a?w.start:a,windows[0].start);
      const maxR=windows.reduce((a,w)=>{const e=w.ret||w.start;return e>a?e:a;},windows[0].ret||windows[0].start);
      const jdata=await fetchJewishData(minS,maxR,STATE.profile);
      if(my!==plannerSeq)return;
      windows.forEach(w=>{const end=w.ret||w.start;const jr=windowJewish(w.start,end,jdata);w.jtags=jr.tags;w._jblock=jr.block;w.band=tripBand(w.start,end,jdata);});
      if(!STATE.allowShabbat) windows=windows.filter(w=>!w._jblock||w._motzei);
      const PR=periodRanges(jdata);
      windows.forEach(w=>{const end=w.ret||w.start;const ap=applyPeriodPrefs(periodHits(w.start,end,PR));w._periodDrop=ap.drop;w._prefer=ap.prefer;});
      windows=windows.filter(w=>!w._periodDrop);
    }
    if(my!==plannerSeq)return;
    windows.sort((a,b)=>((a._prefer?0:1)-(b._prefer?0:1))||(a.start<b.start?-1:(a.start>b.start?1:0)));
    paintPlanner(windows);
  }catch(e){ out.innerHTML='<div class="state">שגיאה בתכנון התאריכים: '+e+'</div>'; }
}
function plannerCard(w,i){
  const fmt=iso=>{const dt=new Date(iso+'T00:00:00Z');return DOW_FULL[dt.getUTCDay()]+' '+dt.getUTCDate()+'.'+(dt.getUTCMonth()+1);};
  const headTags=[];
  if(w._motzei) headTags.push('<span class="rtg crit motzei">🌙 יציאה במוצאי שבת</span>');
  if(w._prefer) headTags.push('<span class="rtg crit prefer">⭐ מועדף</span>');
  const calTags=[]; if(w.jtags&&w.jtags.length) for(const jt of w.jtags) calTags.push(`<span class="rtg j-${jt.cls}">${jt.t}</span>`);
  return `<div class="wgroup${w._motzei?' motzei':''}">
    <div class="wghead">
      <span class="wgrank">${w._motzei?'🌙':i+1}</span>
      <div class="wgttl"><b><bdi>${fmt(w.start)} ← ${fmt(w.ret||w.start)}</bdi></b> · ${w.nights} לילות</div>
      ${headTags.length?`<div class="rcrit wghtags">${headTags.join('')}</div>`:''}
    </div>
    ${calTags.length?`<div class="rtags">${calTags.join('')}</div>`:''}${w.band?bandHtml(w.band):''}
  </div>`;
}
function paintPlanner(ws){
  const out=document.getElementById('out');
  if(!ws.length){
    out.innerHTML='<div class="state">לא נמצאו חלונות מתאימים בטווח שנבחר.<br>אפשר להרחיב את הטווח, להוסיף ימי יציאה/חזרה, או לרכך העדפות תקופה ב״כיוונון הלכתי״.</div>';
    return;
  }
  out.innerHTML=`<div class="meta">📅 תכנון תאריכים בלבד — ${ws.length} חלונות · מועדפים תחילה, אחר כך לפי תאריך · בלי חיפוש טיסות</div>`
    + bandLegend()
    + ws.map((w,i)=>plannerCard(w,i)).join('');
}
async function run(){
  const my=++runSeq;
  _lastRunSig=searchSig(); // results about to reflect the current params — clear staleness
  const sb=document.getElementById('stalebar'); if(sb) sb.innerHTML='';
  const I=intentOf(STATE);
  const out=document.getElementById('out');
  if(out) out.classList.remove('stale-dim');
  const ski=I.destination==='SKI';
  const specific=I.destination && I.destination!=='-' && I.destination!=='SKI' && I.destination!=='variable';
  out.innerHTML = specific
    ? '<div class="state"><div class="pbar"></div><div class="pbar-txt" id="pbartxt">בודק מחירי אמת…</div></div>'
    : '<div class="state"><div class="spin"></div>'+(ski?'סורק יעדי סקי לאורך העונה…':'מושך מחירים אמיתיים…')+'</div>';
  try{
    let ranked, flexFallback=false, allWindows=null, lastPriceParams=null, zt=null, dgeo=null;
    if(ski){
      const flights=await fetchSki(I.origin||'TLV',STATE.skiNights);
      if(my!==runSeq)return;
      const noFly=I.constraints.some(c=>c.type==='noShabbat');
      ranked=skiSelect(flights,absISO(STATE.skiFromISO),[0,1,2,3,4],noFly).slice(0,12);
    }else if(specific){
      let windows;
      if(STATE.tripType==='oneway'){
        windows=onewayWindows();
      }else if(STATE.dateMode==='exact'){
        if(STATE.flexDays>0){
          windows=flexWindows(STATE.fromDate,STATE.toDate,STATE.flexDays);
        }else{
          const nts=Math.max(1,Math.round((Date.parse(STATE.toDate)-Date.parse(STATE.fromDate))/864e5));
          windows=[{start:STATE.fromDate,ret:STATE.toDate,nights:nts,TS:windowShabbat(STATE.fromDate,STATE.toDate),price:null}];
          // offer a Motzei-Shabbat departure (the Saturday night before a Sunday start): one extra night,
          // only post-havdalah flights survive (the Shabbat-aware layer drops daytime-Saturday ones)
          if(!STATE.allowShabbat && _dow(STATE.fromDate)===0){
            const sat=_jAddDays(STATE.fromDate,-1);
            windows.push({start:sat,ret:STATE.toDate,nights:nts+1,TS:windowShabbat(sat,STATE.toDate),price:null,_motzei:true});
          }
        }
      }else{
        const nMin=STATE.flexNights==='any'?3:STATE.flexNights;
        const nMax=STATE.flexNights==='any'?9:STATE.flexNights;
        const startDows=(STATE.flexStartDows&&STATE.flexStartDows.length)?STATE.flexStartDows:(STATE.flexStartDow==null?null:[STATE.flexStartDow]);
        const endDows=(STATE.flexEndDows&&STATE.flexEndDows.length)?STATE.flexEndDows:null;
        if(STATE.dateMode==='month'){
          const ms=(STATE.months.length?STATE.months:[(STATE.fromDate||new Date().toISOString().slice(0,10)).slice(0,7)]).slice().sort();
          const fromISO=ms[0]+'-01';
          const [ly,lm]=ms[ms.length-1].split('-').map(Number);
          const toISO=new Date(Date.UTC(ly,lm,0)).toISOString().slice(0,10);
          windows=genValidWindows(fromISO,toISO,{nightsMin:nMin,nightsMax:nMax,startDows,endDows},STATE.flexShabbat)
            .filter(w=>ms.includes(w.start.slice(0,7)));
        }else{
          windows=genValidWindows(STATE.fromDate,STATE.toDate,{nightsMin:nMin,nightsMax:nMax,startDows,endDows},STATE.flexShabbat);
        }
      }
      // Jewish availability layer: tag windows; Shabbat/Yom Tov travel is forbidden (always dropped)
      if(STATE.jewishMode!=='off' && windows.length){
        const minS=windows.reduce((a,w)=>w.start<a?w.start:a,windows[0].start);
        const maxR=windows.reduce((a,w)=>{const e=w.ret||w.start; return e>a?e:a;},windows[0].ret||windows[0].start);
        const jdata=await fetchJewishData(minS,maxR,STATE.profile);
        if(my!==runSeq)return;
        windows.forEach(w=>{ const end=w.ret||w.start; const jr=windowJewish(w.start,end,jdata); w.jtags=jr.tags; w._jblock=jr.block; w._fastTravel=jr.fastOnTravel; w.band=tripBand(w.start,end,jdata); });
        if(!STATE.allowShabbat) windows=windows.filter(w=>!w._jblock || w._motzei);
        // period preferences (hide / prefer, per travel-day vs whole-trip scope)
        const PR=periodRanges(jdata);
        windows.forEach(w=>{ const end=w.ret||w.start; const ap=applyPeriodPrefs(periodHits(w.start,end,PR)); w._periodDrop=ap.drop; w._prefer=ap.prefer; });
        windows=windows.filter(w=>!w._periodDrop);
      }
      const useOJ = STATE.openJaw && STATE.outAirport && STATE.outAirport.length>=3 && I.destination!=='-' && STATE.tripType!=='oneway';
      const priceParams={origin:I.origin||'TLV', dest:I.destination, useOJ, outAirport:STATE.outAirport, includeStops:true, adults:STATE.adults, children:STATE.children, infants:STATE.infants};
      _selZT=null; let dzt=null;
      if(shabAware() && windows.length){
        const zs=windows.reduce((a,w)=>w.start<a?w.start:a,windows[0].start);
        const ze=windows.reduce((a,w)=>{const e=w.ret||w.start; return e>a?e:a;},windows[0].ret||windows[0].start);
        zt=await fetchShabbatTimes(zs,ze); if(my!==runSeq)return;
        _selZT=zt;
        try{ dgeo=await geocodeDest(I.destination, STATE.destLabel); if(my!==runSeq)return; if(dgeo){ dzt=await fetchShabbatTimes(zs,ze,dgeo); if(my!==runSeq)return; } }catch(e){}
      }
      const first=windows.filter(w=>!w._priced).slice(0,6);
      const progressCb=(done,total)=>{ if(my!==runSeq)return; const txt=document.getElementById('pbartxt'); const msg='בודק מחירי אמת — '+done+' מתוך '+total+'…'; if(txt){ txt.textContent=msg; } else { out.innerHTML='<div class="state"><div class="pbar"></div><div class="pbar-txt" id="pbartxt">'+msg+'</div></div>'; } };
      const priceMap = await fetchPricesFor(first.map(w=>({departureDate:w.start,returnDate:w.ret})), priceParams, progressCb);
      if(my!==runSeq)return;
      first.forEach(w=>{ w._priced=true; const m=priceMap[w.start+'|'+w.ret]; if(m){ w.price=m.price; w.info=m; } if(zt&&w.info) w.shabV=shabbatVerdict(w,zt); if(dzt&&w.info){ w.destV=destVerdict(w,dzt); if(Array.isArray(w.info._options)) w.info._options.forEach(o=>{ o._destV=destVerdict({start:w.start,ret:w.ret,info:o},dzt); }); } });
      ranked=rankedWindows(windows);
      allWindows=windows; lastPriceParams=priceParams; LAST_DZT=dzt;
    }else{
      I.departMonth=STATE.dateMode==='month'?(STATE.months[0]||new Date().toISOString().slice(0,7)):(STATE.fromDate||new Date().toISOString().slice(0,10)).slice(0,7);
      const flights=await fetchLive(I);
      if(my!==runSeq)return;
      ranked=rankLive(flights,I).slice(0,10);
    }
    if(!ranked.length){
      let why='';
      const RD=RANK_DIAG;
      // Direct flights sometimes stream in only on a later poll. If we found priced flights but all
      // were dropped for having stops (and the user wants direct), auto-retry ONCE before giving up.
      if(specific && RD && RD.withPrice>0 && RD.droppedStops>0 && RD.kept===0 && _directRetrySig!==searchSig()){
        _directRetrySig=searchSig();
        out.innerHTML='<div class="state"><div class="pbar"></div><div class="pbar-txt">מאתר טיסות ישירות…</div></div>';
        setTimeout(()=>{ if(my===runSeq) run(); }, 150);
        return;
      }
      if(specific && RD && RD.withPrice>0 && RD.droppedStops>0 && RD.kept===0){
        why+=`<br><span style="color:var(--amber)">נמצאו טיסות לחלונות — אך כולן עם עצירות, ובחרת "ישיר".</span> <span class="c on" data-act="maxstops" data-v="2" style="margin-inline-start:6px">הצג גם עם עצירות</span>`;
      } else if(specific && RD && RD.droppedShab>0 && RD.kept===0 && RD.droppedStops===0){
        why+=`<br><span style="color:var(--amber)">כל הטיסות שנמצאו נוחתות/ממריאות סמוך מדי לשבת.</span> <span class="c on" data-act="allowshab" style="margin-inline-start:6px">הצג גם טיסות שבת</span>`;
      }
      if(RAPID_DIAG) why+=`<br><span style="color:var(--amber)">⚠ ${RAPID_DIAG}</span>`;
      if(specific && RD) why+=`<br><span class="note" style="opacity:.65;font-size:10px">אבחון: חלונות מתומחרים ${RD.total} · עם מחיר ${RD.withPrice} · נפלו עצירות ${RD.droppedStops} · נפלו שבת ${RD.droppedShab}${FLT_DIAG&&FLT_DIAG.max?` · edge: עד ${FLT_DIAG.max} טיסות/חלון${FLT_DIAG.hasOptions?' · edge חדש ✓':' · ⚠ edge ישן (טרם עודכן)'}`:''}${_carrierDiag()}</span>`;
      // store the priced windows even on the "empty" screen, so the show-with-stops / show-shabbat buttons can re-rank and reveal them
      if(specific && allWindows) LAST={meta:'', ranked:[], specific, dest:I.destination, oj:(STATE.openJaw&&STATE.outAirport)?STATE.outAirport:null, exitCmp:{}, exitState:{}, allWindows, priceParams:lastPriceParams, loadingMore:false, zt:zt, dgeo:dgeo};
      out.innerHTML=`<div class="err">אין נתון מתאים לחיפוש הזה כרגע.<br><b>נסה:</b> ${ski?'אורך טיול אחר, תאריך התחלה מוקדם יותר, או להסיר "בלי טיסה בשבת"':specific?'מספר לילות אחר, יום יציאה "כל יום", או חודש אחר':'יעד מסוים (בוקרשט/אתונה) או חודש אחר'}.${why}<div style="margin-top:10px"><span class="c on" data-act="rerun" style="padding:5px 14px">↻ נסה שוב</span></div></div>`;
    }else{
      const lbl=ski?'יעדי סקי':specific?'חלונות תאריך':(I.destination==='-')?'יעדים':'אופציות';
      const note=ski?` · ${STATE.skiNights} לילות · החל מ-${(+STATE.skiFromISO.slice(8))}.${(+STATE.skiFromISO.slice(5,7))}`:'';
      const rankNote=specific?'מחיר אמת מדורג למעלה · אחרים עם קישור חי · נקי משבת אלא אם סומן':'מדורג: נקי ולא-עמוס למעלה, שבת/עומס למטה';
      const noPrice = specific && !ranked.some(w=>w.price!=null);
      const diagNote = (noPrice && RAPID_DIAG) ? ` · <span style="color:var(--amber)">⚠ ${RAPID_DIAG}</span>` : '';
      const fltNote = (specific && FLT_DIAG && FLT_DIAG.max) ? ` · <span class="note" style="opacity:.6;font-size:10px">edge: עד ${FLT_DIAG.max} טיסות/חלון${FLT_DIAG.hasOptions?' · edge חדש ✓':' · ⚠ edge ישן (טרם עודכן)'}${_carrierDiag()}</span>` : '';
      let ojNote='';
      if(specific && STATE.openJaw && STATE.outAirport){
        const d=LAST_OJ_DIST;
        const drv=d?`כ-${d.km} ק״מ · ${Math.floor(d.mins/60)}ש׳${d.mins%60?(' '+(d.mins%60)+'ד׳'):''} נהיגה`:'מרחק נהיגה לא זמין לזוג זה';
        ojNote=` · <span style="color:var(--clear)">✈ טיסה פתוחה: ${I.destination}→${STATE.outAirport} · ${drv}</span>`;
      }
      const totalCount = specific && allWindows ? allWindows.length : ranked.length;
      LAST={meta:`<div class="meta">${totalCount} ${lbl}${note} · ${rankNote}${ojNote}${diagNote}${fltNote}</div>`, ranked, specific, dest:I.destination, oj:(specific&&STATE.openJaw&&STATE.outAirport)?STATE.outAirport:null, exitCmp:{}, exitState:{}, allWindows, priceParams:lastPriceParams, loadingMore:false, zt:zt, dgeo:dgeo};
      paintResults();
      // (exit-airport comparison runs on demand per window via the "השווה שדות חזרה" button)
    }
  }catch(e){
    if(my!==runSeq)return;
    out.innerHTML=`<div class="err"><b>לא הצלחתי למשוך מהפונקציה.</b> ${ski?'ודא שעדכנת את ה-edge function עם מצב calendar (mode=cal) ופרסת מחדש.':'ייתכן חסימת cross-origin.'}<br><code>(${e.message})</code></div>`;
  }
}

/* ===== free-text entry ===== */
const EXAMPLES=[
  "חופשת סקי בינואר–פברואר, בלי טיסה בשבת",
  "לאן זול לטוס מתל אביב באוגוסט, מקום חדש שלא היינו בו",
  "טיסה זולה לבוקרשט ביולי",
  "משהו זול עם ארקיע, בלי שבת",
];
document.getElementById('exs').innerHTML=EXAMPLES.map((e,i)=>`<span class="ex" data-i="${i}">${e.length>38?e.slice(0,38)+'…':e}</span>`).join('');
document.querySelectorAll('.ex').forEach(el=>el.onclick=()=>{document.getElementById('q').value=EXAMPLES[+el.dataset.i];});

async function translateAndRun(){
  const text=document.getElementById('q').value.trim();
  if(!text){document.getElementById('q').focus();return;}
  const btn=document.getElementById('run'); btn.disabled=true;
  document.getElementById('panel').innerHTML='<div class="state"><div class="spin"></div>מתרגם את הבקשה לאינטנט…</div>';
  let I;
  try{ I=await translateLive(text); }catch(e){ I=translateLocal(text); }
  applyIntent(I); renderPanel(); run(); btn.disabled=false;
}
document.getElementById('run').onclick=translateAndRun;
document.getElementById('out').addEventListener('click',e=>{ const t=e.target; if(!t||!t.closest)return; const ab=t.closest('[data-act]'); if(ab){ onAct(ab.dataset.act, ab.dataset.v!=null?ab.dataset.v:''); return; } const mb=t.closest('[data-more]'); if(mb){ loadMoreWindows(); return; } const cl=t.closest('[data-cmpclose]'); if(cl){ const k=cl.dataset.cmpclose; if(LAST&&LAST.exitCmp){ delete LAST.exitCmp[k]; } paintResults(); return; } const el=t.closest('[data-cmp]'); if(el){ const p=el.dataset.cmp.split('|'); onExitCompare(p[0],p[1]); } });
document.getElementById('stalebar').addEventListener('click',e=>{ const ab=e.target&&e.target.closest&&e.target.closest('[data-act]'); if(ab) onAct(ab.dataset.act, ab.dataset.v||''); });
document.getElementById('q').addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter')translateAndRun();});
document.addEventListener('keydown',e=>{ if(e.key==='Escape' && (STATE.sbarPop||STATE.calOpen||STATE.paxOpen)){ STATE.sbarPop=null; STATE.calOpen=false; STATE.paxOpen=false; renderPanel(); } });
document.addEventListener('click',e=>{ if(!STATE.sbarPop) return; const t=e.target; if(t&&t.closest&&(t.closest('.sbar')||t.closest('.spop')||t.closest('.ttmenu')||t.closest('.popcities'))) return; STATE.sbarPop=null; renderPanel(); });
(function(){ const qb=document.getElementById('qbox'), q=document.getElementById('q');
  q.addEventListener('focus',()=>qb.classList.remove('collapsed'));
  q.addEventListener('blur',()=>{ if(!q.value.trim()) qb.classList.add('collapsed'); });
})();
/* Hebcal מחזיר שמות אירועים באנגלית — תרגום לעברית, עם fallback לאנגלית אם לא מוכר */
const HEBCAL_MONTHS={"Nisan":"ניסן","Iyyar":"אייר","Sivan":"סיוון","Tamuz":"תמוז","Av":"אב","Elul":"אלול","Tishrei":"תשרי","Cheshvan":"חשוון","Kislev":"כסלו","Tevet":"טבת","Sh'vat":"שבט","Adar":"אדר","Adar I":"אדר א׳","Adar II":"אדר ב׳"};
const HEBCAL_ROMAN={"I":"א׳","II":"ב׳","III":"ג׳","IV":"ד׳","V":"ה׳","VI":"ו׳","VII":"ז׳","VIII":"ח׳"};
const HEBCAL_EVENTS={"Rosh Hashana":"ראש השנה","Erev Rosh Hashana":"ערב ראש השנה","Yom Kippur":"יום כיפור","Erev Yom Kippur":"ערב יום כיפור","Sukkot":"סוכות","Erev Sukkot":"ערב סוכות","Shmini Atzeret":"שמיני עצרת","Simchat Torah":"שמחת תורה","Chanukah":"חנוכה","Tu BiShvat":"ט״ו בשבט","Purim":"פורים","Shushan Purim":"שושן פורים","Erev Purim":"ערב פורים","Pesach":"פסח","Erev Pesach":"ערב פסח","Pesach Sheni":"פסח שני","Lag BaOmer":"ל״ג בעומר","Shavuot":"שבועות","Erev Shavuot":"ערב שבועות","Tish'a B'Av":"תשעה באב","Erev Tish'a B'Av":"ערב תשעה באב","Tzom Tammuz":"צום שבעה עשר בתמוז","Tzom Gedaliah":"צום גדליה","Asara B'Tevet":"עשרה בטבת","Ta'anit Esther":"תענית אסתר","Ta'anit Bechorot":"תענית בכורות","Yom HaShoah":"יום השואה","Yom HaZikaron":"יום הזיכרון","Yom HaAtzma'ut":"יום העצמאות","Yom Yerushalayim":"יום ירושלים","Sigd":"סיגד","Yom HaAliyah":"יום העלייה","Rosh Hashana LaBehemot":"ראש השנה לבהמות","Shabbat Shuva":"שבת שובה","Shabbat Shekalim":"שבת שקלים","Shabbat Zachor":"שבת זכור","Shabbat Parah":"שבת פרה","Shabbat HaChodesh":"שבת החודש","Shabbat HaGadol":"שבת הגדול","Shabbat Chazon":"שבת חזון","Shabbat Nachamu":"שבת נחמו","Shabbat Shirah":"שבת שירה","Hoshana Raba":"הושענא רבה","Yom Kippur Katan":"יום כיפור קטן"};
function hebEvName(t){
  if(!t) return t;
  let m=/^Rosh Chodesh (.+)$/.exec(t); if(m) return 'ראש חודש '+(HEBCAL_MONTHS[m[1]]||m[1]);
  m=/^Chanukah: (\d+) Candles?$/.exec(t); if(m) return 'חנוכה · נר '+(HEBCAL_ROMAN[['','I','II','III','IV','V','VI','VII','VIII'][+m[1]]]||m[1]);
  if(/^Chanukah: 8th Day$/.test(t)) return 'זאת חנוכה';
  m=/^(.+?)\s+([IVX]+)\s*\(CH['’]{2}M\)$/.exec(t); if(m) return 'חול המועד '+(HEBCAL_EVENTS[m[1]]||m[1]);
  m=/^(.+?)\s*\(CH['’]{2}M\)$/.exec(t); if(m) return 'חול המועד '+(HEBCAL_EVENTS[m[1]]||m[1]);
  m=/^(.+?)\s+VII\s*\(Hoshana Raba\)$/.exec(t); if(m) return 'הושענא רבה';
  m=/^(.+?) \(observed\)$/.exec(t); if(m) return (HEBCAL_EVENTS[m[1]]||m[1])+' (נדחה)';
  m=/^(.+?)\s+([IVX]+)$/.exec(t); if(m&&HEBCAL_EVENTS[m[1]]) return HEBCAL_EVENTS[m[1]]+' '+(HEBCAL_ROMAN[m[2]]||m[2]);
  return HEBCAL_EVENTS[t]||t;
}
async function loadHebDate(){
  const el=document.getElementById('hebdate'); if(!el)return;
  try{
    const [rc,rp]=await Promise.all([
      fetch(`${JCAL_URL}?convert=1&_=${Date.now()}`,{cache:'no-store'}),
      fetch(`${JCAL_URL}?parsha=1&_=${Date.now()}`,{cache:'no-store'})
    ]);
    let s='';
    if(rc.ok){ const j=await rc.json(); if(j&&j.ok&&j.hebrew){ s=j.hebrew; const ev=(j.events||[]).filter(x=>!/Parashat|Parashas/i.test(x)).map(hebEvName); if(ev.length) s+=' · '+ev.join(' · '); } }
    if(rp.ok){ const p=await rp.json(); if(p&&p.ok&&p.il&&p.il.he){
      const norm=s=>s.replace('פרשת ','').replace(/\s*[-\u05BE]\s*/g,'\u05BE');
      const ilName=norm(p.il.he);
      let pstr='פרשת השבוע: '+ilName;
      if(!p.same && p.diaspora && p.diaspora.he){ pstr+=' · בחו״ל: '+norm(p.diaspora.he); }
      s = s ? (s+'  ·  '+pstr) : pstr;
    }}
    el.textContent=s;
  }catch(e){ el.textContent=''; }
}

/* initial: load ski POIs from Supabase (if configured), then show panel + run */
(async function(){ _loadEntIds(); fetchRates(); loadHebDate(); try{ await Promise.allSettled([loadSki(), loadJewish()]); }catch(e){} renderPanel();
  document.getElementById('out').innerHTML='<div class="state">כוונן את החיפוש למעלה (יעד, חודש, ימים), ואז לחץ 🔍 חפש</div>'; })();
