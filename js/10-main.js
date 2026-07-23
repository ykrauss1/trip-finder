function skiSortChips(){
  const s=STATE.skiSort||'rank';
  const chip=(v,l)=>`<span class="c ${s===v?'on':''}" data-act="skisort" data-v="${v}" style="padding:2px 10px;margin-inline-start:4px">${l}</span>`;
  return ` · מיון: ${chip('rank','התאמה')}${chip('price','מחיר')}${chip('date','תאריך')}`;
}
/* ===== העשרת סקי במחירים חיים: המטמון מגלה, Google Flights מאמת את המובילים ===== */
async function skiLivePrice(f){
  const dep=new Date(f.depUTC).toISOString().slice(0,10);
  const ret=f.retUTC?new Date(f.retUTC).toISOString().slice(0,10):null;
  const nights=(dep&&ret)?Math.round((Date.parse(ret)-Date.parse(dep))/864e5):7;
  // לוח מחירים לחודש כולו: מחזיר גם לואו-קוסט (וויז וכו') שהמטמון מפספס,
  // ומאתר את היום הזול ביותר סביב התאריך במקום תאריך בודד.
  const mFrom=dep.slice(0,7)+'-01';
  const [yy,mm]=mFrom.split('-').map(Number);
  const mTo=new Date(Date.UTC(yy,mm,0)).toISOString().slice(0,10);
  const cal=await fetchPriceCalendar(STATE.origin||'TLV',f.to,mFrom,mTo,nights);
  if(cal){
    // מדויק ליום שנבחר, אחרת הזול ביותר בחודש
    if(cal[dep]!=null) return {price:cal[dep], _cal:true, date:dep, ret:(cal._ret&&cal._ret[dep])||ret};
    let best=null; for(const k in cal){ if(k==='_ret'||typeof cal[k]!=='number')continue; if(!best||cal[k]<best.price)best={date:k,price:cal[k],ret:(cal._ret&&cal._ret[k])||null}; }
    if(best) return {price:best.price, _cal:true, date:best.date, ret:best.ret, _shifted:true};
  }
  // גיבוי: תמחור נקודתי כמו קודם
  const m=await fetchRapidPrices(STATE.origin||'TLV',f.to,[{departureDate:dep,returnDate:ret}],null,STATE.includeStops,STATE.adults,STATE.children,STATE.infants);
  return m[dep+'|'+ret]||null;
}
async function skiAutoLive(list,seq){
  for(let t=0;t<10 && !document.querySelector("[data-skip]");t++) await _sleep(500); // ממתין שהכרטיסים ייצבעו
  // פס התקדמות קטן מתחת לשורת הכותרת
  let prog=document.getElementById('skiprog');
  if(!prog){ prog=document.createElement('div'); prog.id='skiprog'; prog.className='meta'; const m=document.querySelector('#out .meta'); if(m) m.insertAdjacentElement('afterend',prog); }
  let done=0, found=0;
  const upd=()=>{ if(prog) prog.innerHTML=done<list.length?`⏳ אימות מחירים חיים מול Google Flights… ${done}/${list.length}`:`✓ אימות חי הושלם · נמצאו ${found}/${list.length}`; };
  upd();
  for(const f of list){
    if(seq!==runSeq)return; // חיפוש חדש התחיל — עוצרים
    const sel=`[data-skip="${f.to}|${f.depUTC}"]`;
    try{
      const live=await skiLivePrice(f);
      if(seq!==runSeq)return;
      const box=document.querySelector(sel); if(!box){done++;upd();continue;}
      const vEl=box.querySelector('.v'), kEl=box.querySelector('.k');
      if(live&&live.price!=null){
        found++;
        const per=Math.round(live.price/Math.max(1,STATE.adults));
        if(vEl)vEl.textContent='€'+per;
        let tag = live._cal ? 'מחיר חי (לוח) ✓' : 'מחיר חי ✓';
        if(STATE.adults>1) tag=`לאחד · סה״כ €${live.price} · ${tag}`;
        if(live._shifted && live.date){ const d=new Date(live.date+'T00:00:00Z'); tag+=` · הזול ביותר: ${d.getUTCDate()}.${d.getUTCMonth()+1}`; }
        if(kEl)kEl.textContent=tag;
      }else if(kEl){ kEl.textContent='מטמון · אימות חי לא נמצא'; }
    }catch(e){ const box=document.querySelector(sel); const kEl=box&&box.querySelector('.k'); if(kEl)kEl.textContent='מטמון · אימות חי נכשל'; }
    done++; upd();
  }
}
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
function _skiMonths(){ return (STATE.dateMode==='month'&&STATE.months&&STATE.months.length)?STATE.months:SKI_MONTHS; } // חודשי הסריקה: מהבקשה אם ניתנו, אחרת עונת ברירת המחדל
async function fetchSki(origin,nights){
  const tasks=[];
  for(const d of SKI_DESTS) for(const m of _skiMonths()) tasks.push(fetchCalOne(origin,d,m,nights));
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
    for(const d of SKI_DESTS) for(const m of _skiMonths()) tasks.push(fetchOne(origin,d,m));
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
    ? `https://www.skyscanner.co.il/transport/flights/${STATE.origin.toLowerCase()}/${(f.to||'').toLowerCase()}/${_yy(f.depUTC)}/${_yy(f.retUTC)}/?adultsv2=${STATE.adults||1}`
    : `https://www.skyscanner.co.il/transport/flights/${STATE.origin.toLowerCase()}/${(f.to||'').toLowerCase()}/${_yy(f.depUTC)}/?adultsv2=${STATE.adults||1}`;
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
    <div class="rprice" data-skip="${f.to}|${f.depUTC}"><div class="v">€${f.price}</div><div class="k">מחיר אמת (מטמון)</div><a class="book" href="${gLink}" target="_blank" rel="noopener">הזמן ← סקייסקנר</a></div></div>`;
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
      const _tod=new Date().toISOString().slice(0,10);
      if(STATE.toDate<_tod){ out.innerHTML='<div class="state">התאריכים שנבחרו כבר עברו ('+STATE.fromDate+' – '+STATE.toDate+').<br>בחר תאריכים עתידיים או עבור למצב חודשים.</div>'; return; }
      const nts=Math.max(1,Math.round((Date.parse(STATE.toDate)-Date.parse(STATE.fromDate))/864e5));
      windows=[{start:STATE.fromDate,ret:STATE.toDate,nights:nts,TS:windowShabbat(STATE.fromDate,STATE.toDate),price:null}];
      if(!STATE.allowShabbat && _dow(STATE.fromDate)===0){
        const sat=_jAddDays(STATE.fromDate,-1);
        windows.push({start:sat,ret:STATE.toDate,nights:nts+1,TS:windowShabbat(sat,STATE.toDate),price:null,_motzei:true});
      }
    }else{
      const [nMin,nMax]=nightsRange();
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
  const fmt=iso=>{const dt=new Date(iso+'T00:00:00Z');const g=DOW_FULL[dt.getUTCDay()]+' '+dt.getUTCDate()+'.'+(dt.getUTCMonth()+1);return STATE.showHebDates===false?g:g+' · '+hebDateStr(iso);};
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
let LAST_PLAN=null;
function _satsIn(w){ let n=0; let d=new Date(w.start+'T00:00:00Z'); const e=new Date((w.ret||w.start)+'T00:00:00Z'); while(d<=e){ if(d.getUTCDay()===6)n++; d=new Date(d.getTime()+864e5);} return n; }
function planSortChips(){
  const cur=STATE.planSort||'nights';
  const chip=(v,l)=>`<span class="c ${cur===v?'on':''}" data-act="plansort" data-v="${v}" style="padding:2px 10px;margin-inline-start:4px">${l}</span>`;
  return ` · מיון: ${chip('nights','לפי אורך')}${chip('date','תאריך')}${chip('dow','יום יציאה')}${chip('shab','שבתות ביעד')}`;
}
function summaryStrip(){
  if(!STATE.lastSummary) return '';
  return `<div class="meta" style="opacity:.95">🗒️ ${STATE.lastSummaryLocal?'⚠️ ':''}הבנתי: ${STATE.lastSummary}</div>`;
}
function paintPlanner(ws){
  const out=document.getElementById('out');
  if(ws) LAST_PLAN=ws; else ws=LAST_PLAN||[];
  if(!ws.length){
    out.innerHTML='<div class="state">לא נמצאו חלונות מתאימים בטווח שנבחר.<br>אפשר להרחיב את הטווח, להוסיף ימי יציאה/חזרה, או לרכך העדפות תקופה ב״כיוונון הלכתי״.</div>';
    return;
  }
  const byDate=(a,b)=>((a._prefer?0:1)-(b._prefer?0:1))||(a.start<b.start?-1:(a.start>b.start?1:0));
  const mode=STATE.planSort||'nights';
  let body=''; let idx=0;
  const groupOut=(title,list)=>{ if(!list.length)return; body+=`<div class="meta" style="margin-top:14px">${title} · ${list.length} חלונות</div>`+list.map(w=>plannerCard(w,idx++)).join(''); };
  if(mode==='date'){ body=[...ws].sort(byDate).map((w,i)=>plannerCard(w,i)).join(''); }
  else if(mode==='dow'){ const DN=['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
    for(let d=0;d<7;d++){ groupOut('יציאה ביום '+DN[d], ws.filter(w=>new Date(w.start+'T00:00:00Z').getUTCDay()===d).sort(byDate)); } }
  else if(mode==='shab'){ const withN=ws.map(w=>({w,n:_satsIn(w)})); const ns=[...new Set(withN.map(x=>x.n))].sort((a,b)=>a-b);
    for(const n of ns){ groupOut(n===0?'ללא שבת ביעד':(n===1?'🕯️ שבת אחת ביעד':'🕯️ '+n+' שבתות ביעד'), withN.filter(x=>x.n===n).map(x=>x.w).sort(byDate)); } }
  else { const ns=[...new Set(ws.map(w=>w.nights))].sort((a,b)=>a-b);
    for(const n of ns){ groupOut('🛏 '+n+' לילות', ws.filter(w=>w.nights===n).sort(byDate)); } }
  const inner=summaryStrip()
    + `<div class="meta" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:flex-end"><button class="sgo" data-act="go" style="border-radius:8px;padding:8px 20px">🔍 הצג טיסות</button><button class="sgo ghost" data-act="save" style="border-radius:8px;padding:8px 20px">💾 שמור חיפוש</button></div>`
    + `<div class="meta">📅 תכנון תאריכים בלבד — ${ws.length} חלונות · בלי חיפוש טיסות${planSortChips()}</div>`
    + bandLegend() + body;
  out.innerHTML=`<div class="resultsgrid"><aside class="sidecol${STATE.sideCollapsed?' collapsed':''}">${sidePanelHtml()}</aside><div class="rescol">${inner}</div></div>`;
}
/* ===== שכבת ה-💡 "יום זול יותר" — לוח מחירים משלים חיפוש חלונות ===== */
function _dowOf(iso){ return new Date(iso+"T00:00:00Z").getUTCDay(); }
function _allowedStart(iso){
  // מכבד את מסנני ימי היציאה שנבחרו
  const dows=(STATE.flexStartDows&&STATE.flexStartDows.length)?STATE.flexStartDows:(STATE.flexStartDow==null?null:[STATE.flexStartDow]);
  if(dows&&!dows.includes(_dowOf(iso))) return false;
  if(!STATE.allowShabbat){ const d=_dowOf(iso); if(d===6) return false; } // אין יציאה בשבת
  const today=new Date().toISOString().slice(0,10); if(iso<today) return false;
  return true;
}
async function enrichCheaperDays(seq){
  if(!LAST||!LAST.specific||!LAST.ranked||!LAST.ranked.length) return;
  const dest=LAST.dest; if(!dest) return;
  // טווח הסריקה: מהחלון המוקדם ביותר עד המאוחר, לפי אורך הלילות השכיח
  const starts=LAST.ranked.map(w=>w.start).sort();
  const fromISO=starts[0], toISO=starts[starts.length-1];
  const nightsMode=(()=>{ const c={}; LAST.ranked.forEach(w=>{c[w.nights]=(c[w.nights]||0)+1;}); return +Object.keys(c).sort((a,b)=>c[b]-c[a])[0]||7; })();
  let cal;
  if(STATE._calCache && STATE._calCache.dest===dest){ cal=STATE._calCache.map; } // שימוש חוזר בלוח מנדבך 2
  else { cal=await fetchPriceCalendar(STATE.origin,dest,fromISO,toISO,nightsMode); }
  if(seq!==runSeq||!cal) return;
  // לכל חלון: מצא יום-יציאה מותר וזול יותר בטווח ±6 ימים
  for(const w of LAST.ranked){
    const cur=(w.info&&w.info.price!=null)?w.info.price:(cal[w.start]!=null?cal[w.start]:null);
    if(cur==null) continue;
    let best=null;
    for(const iso in cal){
      if(iso==='_ret' || typeof cal[iso]!=='number') continue; // דילוג על שדות-עזר
      if(iso===w.start) continue;
      const gap=Math.abs((Date.parse(iso)-Date.parse(w.start))/864e5);
      // חלון השוואה: עד אורך-נסיעה מלא לכל צד (כך שגם יציאות-ראשון-בלבד, שמרוחקות 7 ימים, נכללות)
      if(gap>Math.max(8,(w.nights||7)+1)) continue;
      if(!_allowedStart(iso)) continue;   // מכבד ימי-יציאה ושבת
      const p=cal[iso];
      if(p!=null && p < cur-25 && (!best||p<best.price)) best={date:iso,price:p};
    }
    const slot=document.querySelector(`.wgtip[data-tipkey="${w.start}|${w.ret||''}"]`);
    if(slot && best){
      const save=Math.round(cur-best.price);
      // החזרה בלוח שומרת על אורך הנסיעה (getPriceGraph מחזיר return תואם דרך nights)
      const bestRet=cal._ret&&cal._ret[best.date] ? cal._ret[best.date]
        : new Date(Date.parse(best.date)+(w.nights||7)*864e5).toISOString().slice(0,10);
      const dt=new Date(best.date+"T00:00:00Z"), rt=new Date(bestRet+"T00:00:00Z");
      const lbl=DOW_FULL[dt.getUTCDay()]+' '+dt.getUTCDate()+'.'+(dt.getUTCMonth()+1);
      const rlbl=DOW_FULL[rt.getUTCDay()]+' '+rt.getUTCDate()+'.'+(rt.getUTCMonth()+1);
      const bestNights=Math.round((Date.parse(bestRet)-Date.parse(best.date))/864e5);
      const nightsNote=(bestNights && bestNights!==w.nights)?` · <b>${bestNights} לילות</b> (במקום ${w.nights})`:'';
      const _O=(STATE.origin||'TLV').toUpperCase();
      const _book=((CITY[dest]&&CITY[dest]._book)||'').toUpperCase();
      const _iata=/^[A-Z]{3}$/.test(_book)?_book:((/^[A-Z]{3}$/.test(dest.toUpperCase()))?dest.toUpperCase():null);
      const bookUrl=_iata?`https://www.kayak.com/flights/${_O}-${_iata}/${best.date}/${bestRet}`
        :`https://www.google.com/travel/flights?q=${encodeURIComponent('flights from '+_O+' to '+((STATE.destLabel||dest).split(' · ')[0])+' on '+best.date+' returning '+bestRet)}`;
      slot.innerHTML=`<div class="tipbox">💡 יציאה ב<b>${lbl}</b> (חזרה ${rlbl})${nightsNote} זולה ב-<b>€${save}</b> — €${best.price} במקום €${cur}<a class="tipbook" href="${bookUrl}" target="_blank" rel="noopener">הזמן ←</a></div>`;
    }
  }
}
// תמחור מדויק של חלון בודד לפי דרישה (מכרטיס-הערכה)
async function priceOneWindow(key){
  if(!LAST||!LAST.allWindows) return;
  const [st,rt]=String(key).split('|');
  const w=LAST.allWindows.find(x=>x.start===st&&(x.ret||'')===rt);
  if(!w||w._priced) return;
  const slot=document.querySelector(`.wgtip[data-tipkey="${st}|${rt}"]`);
  if(slot) slot.innerHTML='<div class="tipbox">⏳ מתמחר…</div>';
  const priceMap=await fetchPricesFor([{departureDate:w.start,returnDate:w.ret}], LAST.priceParams, null);
  w._priced=true;
  const m=priceMap[w.start+'|'+w.ret];
  if(m){ w.price=m.price; w.info=m; }
  if(LAST.zt&&w.info) w.shabV=shabbatVerdict(w,LAST.zt);
  LAST.ranked=rankedWindows(LAST.allWindows);
  paintResults();
}
let RUN_BUSY=false;
// עטיפה: מסמנת שחיפוש רץ, כדי שהרצה אוטומטית מהכיוונון לא תתחיל חיפוש שני במקביל
async function run(){ RUN_BUSY=true; try{ return await _runSearch(); } finally{ RUN_BUSY=false; } }
async function _runSearch(){
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
      const noFly=I.constraints.some(c=>c.type==='noShabbat') || !STATE.allowShabbat; // מכבד גם את הכיוונון ההלכתי הגלובלי
      ranked=skiSelect(flights,absISO(STATE.skiFromISO),[0,1,2,3,4],noFly).slice(0,12);
      const _seq=runSeq; setTimeout(()=>skiAutoLive(ranked.slice(0,6),_seq),700); // אחרי הצביעה: אימות חי ל-6 המובילים
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
        const [nMin,nMax]=nightsRange();
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
        // מקבילים: זמני שבת במוצא + גיאוקוד היעד — בלתי-תלויים זה בזה
        const _geoP=geocodeDest(I.destination, STATE.destLabel).catch(()=>null);
        zt=await fetchShabbatTimes(zs,ze); if(my!==runSeq)return;
        _selZT=zt;
        try{ dgeo=await _geoP; if(my!==runSeq)return; if(dgeo){ dzt=await fetchShabbatTimes(zs,ze,dgeo); if(my!==runSeq)return; } }catch(e){}
      }
      // === נדבך 2: דירוג מקדים בלוח מחירים ===
      // קריאת לוח אחת (או אחת לכל חודש) מדרגת את כל החלונות לפי מחיר, כדי שהתמחור
      // המלא — היקר — ירוץ רק על החלונות שבאמת מובילים, לא על 6 המוקדמים כרונולוגית.
      if(windows.length>8 && I.destination && I.destination!=='-' && !useOJ && STATE.tripType!=='oneway'){
        const txt0=document.getElementById('pbartxt'); if(txt0)txt0.textContent='סורק לוח מחירים…';
        const nMode=(()=>{ const c={}; windows.forEach(w=>{c[w.nights]=(c[w.nights]||0)+1;}); return +Object.keys(c).sort((a,b)=>c[b]-c[a])[0]||7; })();
        const months=[...new Set(windows.map(w=>w.start.slice(0,7)))].sort();
        const calAll={};
        const _tomorrow=new Date(Date.now()+864e5).toISOString().slice(0,10);
        for(const m of months){
          const [yy,mm]=m.split('-').map(Number);
          // תחילת הטווח לא יכולה להיות בעבר — ה-API מחזיר ריק לתאריך שחלף (וכך כל החודש הנוכחי אבד)
          let mFrom=m+'-01'; if(mFrom<_tomorrow) mFrom=_tomorrow;
          const mTo=new Date(Date.UTC(yy,mm,0)).toISOString().slice(0,10);
          if(mFrom>mTo) continue;
          const cal=await fetchPriceCalendar(STATE.origin,I.destination,mFrom,mTo,nMode);
          if(my!==runSeq)return;
          if(cal) for(const k in cal){ if(k!=='_ret'&&typeof cal[k]==='number') calAll[k]=cal[k]; }
        }
        if(Object.keys(calAll).length){
          STATE._calCache={dest:I.destination, map:calAll}; // שמירה ל-💡 כדי לא למשוך את הלוח פעמיים
          // דירוג: מחיר-לוח ליום היציאה; מועדפים עדיין קודמים; מי שאין לו מחיר-לוח יורד לסוף אך נשמר
          windows.forEach(w=>{ w._calPrice=(calAll[w.start]!=null)?calAll[w.start]:null; });
          windows.sort((a,b)=>{
            if((a._prefer?0:1)!==(b._prefer?0:1)) return (a._prefer?0:1)-(b._prefer?0:1);
            const pa=a._calPrice==null?Infinity:a._calPrice, pb=b._calPrice==null?Infinity:b._calPrice;
            if(pa!==pb) return pa-pb;
            return a.start<b.start?-1:1;
          });
        }
      }
      // דורג לפי לוח. מתמחרים במלואם רק את 5 המובילים — השאר מוצגים מיד עם הערכת-לוח
      // וכפתור תמחור לפי דרישה, כך שהחיפוש מהיר בלי לאבד אף תאריך מהתצוגה.
      const _batch=(windows.some(w=>w._calPrice!=null))?5:8;
      const first=windows.filter(w=>!w._priced).slice(0,_batch);
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
      // ריצה חוזרת רק אם המקור הוא הישן שמזרים תוצאות בהדרגה; google-flights2 מחזיר סט מלא
      // בקריאה אחת, ולכן סבב שני רק מכפיל את זמן החיפוש בלי להוסיף דבר.
      if(specific && FLIGHT_PROVIDER!=='gf' && RD && RD.withPrice>0 && RD.droppedStops>0 && RD.kept===0 && _directRetrySig!==searchSig()){
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
      const _foundN=(allWindows&&allWindows.filter(w=>w.price!=null).length)||0;
      out.innerHTML=`<div class="err">${_foundN?`נמצאו ${_foundN} אפשרויות — אך כולן נפסלו לפי המסננים הנוכחיים.`:'אין נתון מתאים לחיפוש הזה כרגע.'}<br><b>נסה:</b> ${ski?'אורך טיול אחר, תאריך התחלה מוקדם יותר, או להסיר "בלי טיסה בשבת"':specific?'מספר לילות אחר, יום יציאה "כל יום", או חודש אחר':'יעד מסוים (בוקרשט/אתונה) או חודש אחר'}.${why}<div style="margin-top:10px"><span class="c on" data-act="rerun" style="padding:5px 14px">↻ נסה שוב</span></div>${(!ski&&I.destination&&I.destination!=='-'&&allWindows&&allWindows.length)?airlineDirectLinks(I.destination,allWindows[0].start,allWindows[0].ret):''}</div>`;
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
      const metaBase=`${totalCount} ${lbl}${note} · ${rankNote}${ojNote}${diagNote}${fltNote}`;
      LAST={meta:summaryStrip()+`<div class="meta">${metaBase}${ski?skiSortChips():''}</div>`, metaBase:(ski?metaBase:null), baseRanked:(ski?ranked.slice():null), ranked, specific, dest:I.destination, oj:(specific&&STATE.openJaw&&STATE.outAirport)?STATE.outAirport:null, exitCmp:{}, exitState:{}, allWindows, priceParams:lastPriceParams, loadingMore:false, zt:zt, dgeo:dgeo};
      paintResults();
      if(specific && !ski && I.destination && I.destination!=='-'){ const _sq=runSeq; setTimeout(()=>enrichCheaperDays(_sq),300); } // 💡 שכבת יום-זול-יותר
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
  try{ I=await translateLive(text); }
  catch(e){ I=translateLocal(text); I._fallback=(typeof LAST_TRANSLATE_ERR!=='undefined'&&LAST_TRANSLATE_ERR)||String(e&&e.message||e); }
  // שאילתה חופשית = אמת שלמה: שדות-שאילתה מתאפסים, והעדפות-תקופה מהשאילתה הקודמת משוחזרות לבסיס הידני
  STATE.flexStartDows=null; STATE.flexEndDows=null; STATE.flexStartDow=null; STATE.flexNights='any'; STATE.months=[];
  STATE.dateMode='month'; // שאילתה חופשית חושבת בחודשים — לעולם לא יורשת תאריך-מדויק ישן
  if(!(I.months&&I.months.length)){ const now=new Date(); const m1=now.toISOString().slice(0,7); now.setMonth(now.getMonth()+1); const m2=now.toISOString().slice(0,7); I.months=[m1,m2]; if(I.summary)I.summary+=' · (לא צוין זמן — נבדקים החודשיים הקרובים)'; }
  if(STATE._periodPrefsBase){ STATE.periodPrefs=STATE._periodPrefsBase; STATE._periodPrefsBase=null; }
  STATE.lastSummary=I.summary||''; STATE.lastSummaryLocal=!!I._fallback;
  applyIntent(I); renderPanel();
  if(I.mode==='dates'){ runPlanner(); }
  else{
    // נותנים לבחור: טיסות או תאריכים בלבד — במקום לרוץ אוטומטית
    const out=document.getElementById('out');
    out.innerHTML=`<div class="state" style="text-align:center"><div style="margin-bottom:14px">הבנתי: ${I.summary||'החיפוש הוגדר'}</div>${I._fallback?`<div style="margin-bottom:12px;color:#f0b429;font-size:13px">⚠️ תרגום מקומי (מוגבל) — השירות החכם לא זמין כרגע<br><span style="opacity:.7;font-size:11px">${String(I._fallback).slice(0,120)}</span></div>`:''}<div style="display:flex;justify-content:center;gap:14px;flex-wrap:wrap"><button class="sgo" data-act="go" style="border-radius:8px;font-size:15px;padding:10px 26px">🔍 חפש טיסות</button><button class="sgo ghost" data-act="goplan" style="border-radius:8px;font-size:15px;padding:10px 26px">📅 תאריכים בלבד</button></div></div>`;
  }
  btn.disabled=false;
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
function _normApos(x){ return String(x).replace(/[\u2018\u2019\u02BC\u05F3]/g,"'").replace(/[\u2013\u2014]/g,'-'); }
function hebEvName(t){
  if(!t) return t;
  t=_normApos(t); // נרמול גרשים ומקפים כדי שהמפתחות במילון יתאימו (Erev Tish'a B'Av וכו')
  let m=/^Rosh Chodesh (.+)$/.exec(t); if(m) return 'ראש חודש '+(HEBCAL_MONTHS[m[1]]||m[1]);
  m=/^Chanukah: (\d+) Candles?$/.exec(t); if(m) return 'חנוכה · נר '+(HEBCAL_ROMAN[['','I','II','III','IV','V','VI','VII','VIII'][+m[1]]]||m[1]);
  if(/^Chanukah: 8th Day$/.test(t)) return 'זאת חנוכה';
  m=/^(.+?)\s+([IVX]+)\s*\(CH['’]{2}M\)$/.exec(t); if(m) return 'חול המועד '+(HEBCAL_EVENTS[m[1]]||m[1]);
  m=/^(.+?)\s*\(CH['’]{2}M\)$/.exec(t); if(m) return 'חול המועד '+(HEBCAL_EVENTS[m[1]]||m[1]);
  m=/^(.+?)\s+VII\s*\(Hoshana Raba\)$/.exec(t); if(m) return 'הושענא רבה';
  m=/^(.+?) \(observed\)$/.exec(t); if(m) return (HEBCAL_EVENTS[m[1]]||m[1])+' (נדחה)';
  m=/^(.+?)\s+([IVX]+)$/.exec(t); if(m&&HEBCAL_EVENTS[m[1]]) return HEBCAL_EVENTS[m[1]]+' '+(HEBCAL_ROMAN[m[2]]||m[2]);
  if(HEBCAL_EVENTS[t]) return HEBCAL_EVENTS[t];
  // חיפוש סובלני: התאמה לפי מפתח מנורמל
  for(const k in HEBCAL_EVENTS){ if(_normApos(k)===t) return HEBCAL_EVENTS[k]; }
  return t;
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
