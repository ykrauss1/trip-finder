function bandLegend(){
  const items=[['normal','רגיל'],['three','שלושת השבועות'],['nine','תשעת הימים'],['tisha','תשעה באב'],['fast','צום'],['good','חופשה/חג'],['bein','בין הזמנים'],['chm','חוה״מ'],['elul','אלול']];
  return '<div class="bandkey">'+items.map(it=>`<span class="ki"><span class="ks bc-${it[0]}"></span>${it[1]}</span>`).join('')+'<span class="ki"><span class="ks bc-normal bc-shab"></span>שבת</span></div>';
}
// מיפוי מפתח-כיוונון → kind(s) בפלט המנוע, לצורך הצגת התאריכים
const _PKINDS={ threeweeks:['threeweeks'], ninedays:['ninedays'], tisha:['tisha'], omer:['omer'],
  fast:['fast'], beinhazmanim:['beinhazmanim'], chanuka:['chanuka'], purim:['purim'],
  cholhamoed:['cholhamoed'], lag:['lag'] };
function _fmtHeb2(iso){ const dt=new Date(iso+'T00:00:00Z'); const g=dt.getUTCDate()+'.'+(dt.getUTCMonth()+1); return (typeof hebDateStr==='function'?hebDateStr(iso):'')+' · '+g; }
// מאתר את התקופה בפלט המנוע השמור (STATE._panelPeriods) לפי label/kind
function _periodDates(p){
  const pp=STATE._panelPeriods; if(!pp) return null;
  const all=pp; const lab=p.label;
  const kinds=_PKINDS[p.key]||[];
  // התאמה לפי kind (מדויק — כפי שהמנוע פולט), עם נפילה לתווית
  let hit=all.find(x=>kinds.includes(x.kind))
    || all.find(x=>x.label===lab)
    || all.find(x=>x.label&&lab&&x.label.indexOf(lab)>=0);
  return hit&&hit.start&&hit.end?hit:null;
}
function periodsTuneHtml(){
  const row=(p)=>{
    const pr=(STATE.periodPrefs&&STATE.periodPrefs[p.key])||{mode:'normal',scope:'travel'};
    const modes=[['hide','🚫'],['normal','⚪'],['prefer','⭐']].map(m=>`<span class="c pmode ${pr.mode===m[0]?'on':''}" data-act="periodmode" data-v="${p.key}|${m[0]}">${m[1]}</span>`).join('');
    const scope = pr.mode!=='normal' ? `<div class="chips pscope">${[['travel','ביום טיסה'],['trip','גם בחופשה']].map(s=>`<span class="c ${pr.scope===s[0]?'on':''}" data-act="periodscope" data-v="${p.key}|${s[0]}">${s[1]}</span>`).join('')}</div>` : '';
    const dr=_periodDates(p);
    const dates = dr ? `<div class="pdates">${dr.start===dr.end?_fmtHeb2(dr.start):(_fmtHeb2(dr.start)+' – '+_fmtHeb2(dr.end))}${dr.note?`<span class="pnote" title="${dr.note.replace(/"/g,'&quot;')}"> ⓘ</span>`:''}</div>` : '';
    return `<div class="prow"><span class="plabel2">${p.label}${dates}</span><span class="chips pmodes">${modes}</span></div>${scope}`;
  };
  const m=TUNE_PERIODS.filter(p=>p.grp==='m').map(row).join('');
  const o=TUNE_PERIODS.filter(p=>p.grp==='o').map(row).join('');
  const allBtns=(grp)=>`<span class="pall">${[['hide','הכל 🚫'],['normal','הכל ⚪'],['prefer','הכל ⭐']].map(b=>`<span class="c pallc" data-act="periodall" data-v="${grp}|${b[0]}">${b[1]}</span>`).join('')}</span>`;
  return `<div class="sl">מיעוט / אבלות ${allBtns('m')}</div>${m}<div class="sl" style="margin-top:9px">הזדמנות / חיובי ${allBtns('o')}</div>${o}`;
}
function carriersInResults(){
  const set=new Map();
  if(LAST&&LAST.allWindows) for(const w of LAST.allWindows){ const opts=(w.info&&Array.isArray(w.info._options))?w.info._options:(w.info?[w.info]:[]); for(const o of opts){ if(!o||o.price==null)continue; for(const f of carrierFamilies(o.carrier)){ if(!f)continue; if(!set.has(f)) set.set(f,{n:0,lc:isLowCost(f),il:isIsraeliCarrier(f)}); set.get(f).n++; } } }
  return [...set.entries()].sort((a,b)=>b[1].n-a[1].n).map(([name,m])=>({name,...m}));
}
function carrierFilterHtml(){
  const cs=carriersInResults(); if(cs.length<2) return '';
  const hid=STATE.hiddenCarriers||[];
  const anyIl=cs.some(c=>c.il);
  const chips=cs.map(c=>{ const esc=c.name.replace(/"/g,'&quot;'); return `<span class="c ${hid.includes(c.name)?'':'on'}" data-act="carrierfilt" data-v="${esc}">${c.il?'🇮🇱 ':''}${c.lc?'💸 ':''}${c.name}</span>`; }).join('');
  const onlyIl = anyIl ? `<span class="c ${STATE.onlyIsraeli?'on':''}" data-act="onlyisraeli" title="הצג רק טיסות שכל הקטעים בהן בחברה ישראלית — בטוח יותר בתקופות מתוחות">🇮🇱 רק ישראליות</span>` : '';
  return `<div class="sgrp"><div class="st">חברות תעופה <span style="font-weight:400;color:var(--mut-2);font-size:10px">· לחץ להצגת חברה אחת בלבד — שילובים יופיעו בנפרד</span></div><div class="chips">${onlyIl}${chips}${(hid.length||STATE.onlyIsraeli)?`<span class="c" data-act="carrierall">↺ הצג הכל</span>`:''}</div></div>`;
}
// טבלת "טיסה בשבת" בלוח הצד — המשתמש קובע, כי המצב בשטח משתנה
function shabCarriersHtml(){
  const st=[['no','אינה טסה 🕯️'],['yes','טסה'],['','לא ידוע']];
  const rows=(SHAB_CAR||[]).map((c,i)=>{
    const he=String(c.he||c.k||'').replace(/[<>&]/g,'');
    return `<div class="sl">${he}</div><div class="chips">${st.map(o=>`<span class="c ${((c.s||'')===o[0])?'on':''}" data-act="shabcar" data-v="${i}|${o[0]}">${o[1]}</span>`).join('')}<span class="c" data-act="shabcardel" data-v="${i}" title="הסר מהרשימה">✕</span></div>`;
  }).join('');
  return `<div class="sgrp"><div class="st">🕯️ טיסה בשבת <span style="font-weight:400;color:var(--mut-2);font-size:10px">· לפי החברה — ניתן לעדכן</span></div>${rows}<div class="chips" style="margin-top:7px"><span class="c" data-act="shabcaradd">➕ הוסף חברה</span><span class="c" data-act="shabcarreset">↺ ברירת מחדל</span></div></div>`;
}
function sidePanelHtml(){
  const ck=(act,opts,cur,attr)=>opts.map(o=>`<span class="c ${String(cur)===String(o[0])?'on':''}" data-act="${act}"${attr?` data-v="${o[0]}"`:''}>${o[1]}</span>`).join('');
  if(STATE.sideCollapsed) return `<div class="sidecard" style="padding:8px"><div class="sidettl" style="margin:0;cursor:pointer" data-act="sidetoggle" title="הצג כיוונון">⚙ ▸</div></div>`;
  return `<div class="sidecard">
    <div class="sidettl" style="display:flex;justify-content:space-between;align-items:center">⚙ כיוונון אונליין<span class="c" data-act="sidetoggle" title="צמצם" style="padding:1px 9px">▾ צמצם</span></div>
    <div class="sgrp"><div class="st">זמני שבת</div>
      <div class="chips"><span class="c hard ${STATE.shabbatTime?'on':''}" data-act="shabtime">${STATE.shabbatTime?'בדיקת זמנים ✓':'בדיקת זמנים'}</span></div>
      ${STATE.shabbatTime?`
      <div class="sl">מרווח ערב שבת (שעות)</div><div class="chips">${[2,3,4].map(h=>`<span class="c ${(+STATE.marginBefore===h)?'on':''}" data-act="mbefore" data-v="${h}">${h}</span>`).join('')}</div>
      <div class="sl">מרווח מוצ״ש (שעות)</div><div class="chips">${[2,3,4].map(h=>`<span class="c ${(+STATE.marginAfter===h)?'on':''}" data-act="mafter" data-v="${h}">${h}</span>`).join('')}</div>
      <div class="sl">כניסת נרות (דק׳)</div><div class="chips">${[20,30,40].map(c=>`<span class="c ${(+STATE.candleMin===c)?'on':''}" data-act="candle" data-v="${c}">${c}</span>`).join('')}</div>
      <div class="sl">צאת שבת</div><div class="chips"><span class="c ${STATE.havdalah==='deg85'?'on':''}" data-act="havd" data-v="deg85">8.5°</span><span class="c ${STATE.havdalah==='rt72'?'on':''}" data-act="havd" data-v="rt72">ר״ת</span></div>`:''}
    </div>
    <div class="sgrp"><div class="st">טיסה</div>
      <div class="chips">${[[0,'ישיר'],[1,'עד 1 עצירה'],[2,'עד 2 עצירות']].map(o=>`<span class="c hard ${maxStopsVal()===o[0]?'on':''}" data-act="maxstops" data-v="${o[0]}">${o[1]}</span>`).join('')}</div>
      <div class="sl">גמישות ±ימים</div><div class="chips">${[0,1,2,3].map(f=>`<span class="c ${STATE.flexDays==f?'on':''}" data-act="flexdays" data-v="${f}">${f===0?'מדויק':'±'+f}</span>`).join('')}</div>
    </div>
    ${carrierFilterHtml()}
    ${shabCarriersHtml()}
    <div class="sgrp"><div class="st">לוח עברי</div>
      <div class="chips"><span class="c ${STATE.jewishMode!=='off'?'on':''}" data-act="jmode" data-v="${STATE.jewishMode!=='off'?'off':'mark'}">${STATE.jewishMode!=='off'?'מופעל ✓':'כבוי'}</span><span class="c hard ${STATE.allowShabbat?'on':''}" data-act="allowshab">${STATE.allowShabbat?'טיסות שבת מוצגות ✓':'בלי טיסות שבת'}</span></div>
    </div>
    <div class="sgrp"><div class="st">תקופות · 🚫 לא · ⚪ רגיל · ⭐ להעדיף</div>
      ${periodsTuneHtml()}
    </div>
    <div class="sgrp"><div class="st">פרופיל · מטבע</div>
      <div class="chips">${[['teacher','הוראה'],['yeshiva','ישיבה'],['general','כללי']].map(o=>`<span class="c ${STATE.profile===o[0]?'on':''}" data-act="prof" data-v="${o[0]}">${o[1]}</span>`).join('')}</div>
      <div class="chips" style="margin-top:5px">${[['','$'],['ILS','₪'],['EUR','€']].map(o=>`<span class="c ${STATE.altCurrency===o[0]?'on':''}" data-act="cur" data-v="${o[0]}">${o[1]}</span>`).join('')}</div>
    </div>
  </div>`;
}
// מיון החלונות עצמם (לא הטיסות בתוכם): התאמה / מחיר / תאריך / אורך
// המחיר הזול ביותר בחלון מבין המסלולים שכולם בחברה המבודדת (null אם אין כזה)
function _winPurePrice(w,fam){
  const opts=(w.info&&Array.isArray(w.info._options))?w.info._options:(w.info?[w.info]:[]);
  let m=Infinity, anyPriced=false;
  for(const o of opts){ if(!o||o.price==null)continue; anyPriced=true; if(isPureCarrier(o.carrier,fam)&&o.price<m)m=o.price; }
  return anyPriced?m:null;   // null = החלון עדיין לא תומחר, אין להסיק ממנו כלום
}
// כשהמשתמש מבודד חברה, סדר החלונות חייב לשקף את המחיר של אותה חברה — אחרת החלון הראשון
// עדיין ידורג לפי שילוב זול שכלל לא מוצג. חלון בלי מסלול טהור יורד לתחתית.
function _winPrice(w){
  const fam=(typeof _isolatedCarrier==='function')?_isolatedCarrier():null;
  if(fam){ const pp=_winPurePrice(w,fam); if(pp!==null) return pp; }
  const p=(w.info&&w.info.price!=null)?w.info.price:(w.price!=null?w.price:(w._calPrice!=null?w._calPrice:null)); return p==null?Infinity:p;
}
/* שורת כלים אחת לתוצאות: שני תפריטים נפתחים במקום שתי שורות צ'יפים, ועוד מתג מוצ״ש.
   כפתור "שמור חיפוש" הוסר מכאן — הוא כבר קיים בשורת הסיכום שמעל, וזו הייתה כפילות. */
function resultsToolbar(){
  const wcur=STATE.winSort||'rank';
  const wopts=[['rank','התאמה'],['price','מחיר'],['date','תאריך'],['nights','אורך']];
  const cp=_catPrices();
  const band=isFinite(cp.cheapest)?cp.cheapest*1.6:Infinity;
  const hasIsraeli=isFinite(cp.il)&&cp.il<=band&&cp.il>cp.cheapest, hasLowCost=isFinite(cp.lc)&&cp.lc<=band&&cp.lc>cp.cheapest;
  const fopts=[['price','מחיר'],['time','מוקדם']];
  if(hasIsraeli) fopts.push(['airline','חברה ישראלית']);
  if(hasLowCost) fopts.push(['lowcost','לואו-קוסט']);
  let fcur=STATE.sortBy||'price';
  if(!fopts.some(o=>o[0]===fcur)){ fcur='price'; STATE.sortBy='price'; }
  const sel=(act,opts,val)=>`<select class="selmini" data-actsel="${act}">${opts.map(o=>`<option value="${o[0]}"${o[0]===val?' selected':''}>${o[1]}</option>`).join('')}</select>`;
  const hasMotz=!!(LAST&&Array.isArray(LAST.ranked)&&LAST.ranked.some(w=>w&&w._motzei));
  const motz=hasMotz?`<span class="c hard ${STATE.noMotzash?'on':''}" data-act="nomotzash" title="הסתרת חלונות שהיציאה בהם במוצאי שבת">🌙 ${STATE.noMotzash?'בלי מוצ״ש ✓':'בלי מוצ״ש'}</span>`:'';
  return `<div class="rtoolbar"><label>סדר החלונות</label>${sel('winsort',wopts,wcur)}<label>מיון טיסות</label>${sel('sortby',fopts,fcur)}${motz}</div>`;
}
function winSortChips(){ return resultsToolbar(); }
function sortWindows(arr){
  const mode=STATE.winSort||'rank';
  const _iso=(typeof _isolatedCarrier==='function')?_isolatedCarrier():null;
  // במצב "התאמה" הסדר הוא זה שנקבע בחיפוש — אבל בבידוד חברה הוא כבר לא רלוונטי, כי הוא
  // נקבע לפי מחירים שאינם מוצגים. לכן ממיינים מחדש לפי המחיר של החברה המבודדת.
  if(mode==='rank'){
    if(!_iso) return arr;
    const r=arr.slice(); r.sort((x,y)=>_winPrice(x)-_winPrice(y)||(x.start<y.start?-1:1)); return r;
  }
  const a=arr.slice();
  if(mode==='price') a.sort((x,y)=>_winPrice(x)-_winPrice(y)||(x.start<y.start?-1:1));
  else if(mode==='date') a.sort((x,y)=>(x.start<y.start?-1:(x.start>y.start?1:0))||((x.nights||0)-(y.nights||0)));
  else if(mode==='nights') a.sort((x,y)=>((x.nights||0)-(y.nights||0))||_winPrice(x)-_winPrice(y));
  return a;
}
// עיצוב מחיר: הסכומים מגיעים בדולר (מטבע המקור). המטבע הנבחר ראשי; אם אינו הבסיס — מציג גם ≈$ כמקור
function curFmt(base){
  if(base==null) return '';
  const c=STATE.altCurrency; // '' = בסיס (USD), אחרת 'ILS'/'EUR'
  const sym = c ? ({ILS:'₪',EUR:'€'}[c]||BASE_SYM) : BASE_SYM;
  const rate = (c&&RATES[c])?RATES[c]:1;
  return sym+(Math.round(base*rate)).toLocaleString();
}
function curRef(base){
  if(base==null) return '';
  if(!STATE.altCurrency){ const r=RATES.ILS||3.6; return ` ≈ ₪${Math.round(base*r).toLocaleString()}`; } // דולר ראשי → שקל משוער מתחת
  return ` ≈ ${BASE_SYM}${base.toLocaleString()}`; // מטבע אחר ראשי → דולר המקור מתחת
}
function paintResults(){
  if(!LAST) return;
  const out=document.getElementById('out');
  let body='';
  if(LAST.specific){
    let _list=sortWindows(LAST.ranked);
    if(STATE.noMotzash) _list=_list.filter(w=>!(w&&w._motzei));   // מתג מהיר: בלי יציאה במוצאי שבת
    let _lastN=null;
    body=_list.map((w,i)=>{
      let head='';
      if((STATE.winSort||'rank')==='nights' && w.nights!==_lastN){ _lastN=w.nights; head=`<div class="meta" style="margin-top:12px">🛏 ${w.nights} לילות</div>`; }
      const key=w.start+'|'+w.ret;
      let extra='';
      if(LAST.exitState && LAST.exitState[key]==='loading') extra='<div class="excmp exload"><div class="spin"></div> משווה שדות חזרה…</div>';
      else if(LAST.exitCmp && LAST.exitCmp[key]) extra=LAST.exitCmp[key];
      return head+windowCard(w,i+1,LAST.dest)+(extra?`<div class="exwrap">${extra}</div>`:'');
    }).join('');
  } else {
    body=LAST.ranked.map((f,i)=>card(f,i+1)).join('');
  }
  const hasBand=LAST.specific && LAST.ranked.some(w=>w.band);
  let moreBtn='';
  if(LAST.specific && LAST.allWindows){
    const remaining=LAST.allWindows.filter(w=>!w._priced).length;
    if(LAST.loadingMore) moreBtn='<div class="morewrap"><div class="state"><div class="spin"></div>מתמחר עוד…</div></div>';
    else if(remaining>0) moreBtn=`<div class="morewrap"><button class="morebtn" data-more="1">הצג עוד תוצאות · ${remaining} נותרו</button></div>`;
  }
  out.innerHTML=`<div class="resultsgrid"><aside class="sidecol${STATE.sideCollapsed?' collapsed':''}">${sidePanelHtml()}</aside><div class="rescol">${LAST.meta}${LAST.specific?resultsToolbar():''}${LAST.specific?coverageNote():''}${hasBand?bandLegend():''}${body}${moreBtn}</div></div>`;
}
// a fixed, always-on transparency note: no single flight source is exhaustive (small / low-cost
// carriers like HiSky are sometimes missing), so point the user to the full list per result.
function coverageNote(){
  return `<div class="covnote">ℹ️ ייתכן שקיימות טיסות נוספות שאינן מוחזרות ע"י המקור — במיוחד חברות קטנות או לואו-קוסט (כמו HiSky). בכל תוצאה, «🔎 כל הטיסות במסלול» מוביל לרשימה המלאה.</div>`;
}
// cheapest overall price, and cheapest israeli / low-cost price, across all results
function _catPrices(){
  let cheapest=Infinity, il=Infinity, lc=Infinity;
  if(LAST&&LAST.allWindows) for(const w of LAST.allWindows){
    const opts=(w.info&&Array.isArray(w.info._options))?w.info._options:(w.info?[w.info]:[]);
    for(const o of opts){ if(!o||o.price==null)continue;
      if(o.price<cheapest)cheapest=o.price;
      if(isIsraeliCarrier(o.carrier)&&o.price<il)il=o.price;
      if(isLowCost(o.carrier)&&o.price<lc)lc=o.price;
    }
  }
  return {cheapest,il,lc};
}
function sortBarHtml(){
  const cp=_catPrices();
  // an israeli / low-cost sort only makes sense when such a flight is competitively priced — not
  // when (e.g. on New York) the only israeli option is El Al at 4× the cheapest fare.
  const band=isFinite(cp.cheapest)?cp.cheapest*1.6:Infinity;
  // a category sort is only useful when that category is competitive (within band) AND not already
  // the very cheapest — if the cheapest flight is itself low-cost (e.g. flydubai to NY), sorting by
  // low-cost just repeats the price sort, so hide the chip.
  const hasIsraeli=isFinite(cp.il)&&cp.il<=band&&cp.il>cp.cheapest, hasLowCost=isFinite(cp.lc)&&cp.lc<=band&&cp.lc>cp.cheapest;
  const opts=[['price','מחיר'],['time','מוקדם']];
  if(hasIsraeli) opts.push(['airline','חברה ישראלית']);
  if(hasLowCost) opts.push(['lowcost','לואו-קוסט']);
  let cur=STATE.sortBy||'price';
  if(!opts.some(o=>o[0]===cur)){ cur='price'; STATE.sortBy='price'; } // current sort no longer applies -> reset
  return `<div class="sortbar">מיון: ${opts.map(o=>`<span class="c ${cur===o[0]?'on':''}" data-act="sortby" data-v="${o[0]}">${o[1]}</span>`).join('')}</div>`;
}
async function fetchRates(){
  // try Frankfurter (ECB), then fawazahmed0 CDN as a backup
  try{
    const r=await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=ILS,EUR');
    if(r.ok){ const j=await r.json(); if(j&&j.rates&&j.rates.ILS){ RATES={ILS:j.rates.ILS, EUR:j.rates.EUR}; RATES_LIVE=true; return; } }
  }catch(e){}
  try{
    const r=await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json');
    if(r.ok){ const j=await r.json(); if(j&&j.usd){ RATES={ILS:j.usd.ils, EUR:j.usd.eur}; RATES_LIVE=true; } }
  }catch(e){}
}
function _sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

/* ===== calendar + sunset + envelope Shabbat lens (verified) ===== */

// אורך שהייה: מספר בודד, 'any', או טווח "7-10" — מוחזר תמיד כ-[מינימום, מקסימום]
function nightsRange(){ const v=STATE.flexNights;
  if(v==='any') return [3,9];
  if(typeof v==='string'&&v.indexOf('-')>0){ const a=v.split('-'); const lo=Math.max(1,+a[0]||3), hi=Math.max(lo,+a[1]||lo); return [lo,hi]; }
  const n=Math.max(1,+v||7); return [n,n];
}
