function bandLegend(){
  const items=[['normal','רגיל'],['three','שלושת השבועות'],['nine','תשעת הימים'],['tisha','תשעה באב'],['fast','צום'],['good','חופשה/חג'],['bein','בין הזמנים'],['chm','חוה״מ'],['elul','אלול']];
  return '<div class="bandkey">'+items.map(it=>`<span class="ki"><span class="ks bc-${it[0]}"></span>${it[1]}</span>`).join('')+'<span class="ki"><span class="ks bc-normal bc-shab"></span>שבת</span></div>';
}
function periodsTuneHtml(){
  const row=(p)=>{
    const pr=(STATE.periodPrefs&&STATE.periodPrefs[p.key])||{mode:'normal',scope:'travel'};
    const modes=[['hide','🚫'],['normal','⚪'],['prefer','⭐']].map(m=>`<span class="c pmode ${pr.mode===m[0]?'on':''}" data-act="periodmode" data-v="${p.key}|${m[0]}">${m[1]}</span>`).join('');
    const scope = pr.mode!=='normal' ? `<div class="chips pscope">${[['travel','ביום טיסה'],['trip','גם בחופשה']].map(s=>`<span class="c ${pr.scope===s[0]?'on':''}" data-act="periodscope" data-v="${p.key}|${s[0]}">${s[1]}</span>`).join('')}</div>` : '';
    return `<div class="prow"><span class="plabel2">${p.label}</span><span class="chips pmodes">${modes}</span></div>${scope}`;
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
  return `<div class="sgrp"><div class="st">חברות תעופה <span style="font-weight:400;color:var(--mut-2);font-size:10px">· לחץ להצגת חברה אחת בלבד</span></div><div class="chips">${onlyIl}${chips}${(hid.length||STATE.onlyIsraeli)?`<span class="c" data-act="carrierall">↺ הצג הכל</span>`:''}</div></div>`;
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
    <div class="sgrp"><div class="st">לוח עברי</div>
      <div class="chips"><span class="c ${STATE.jewishMode!=='off'?'on':''}" data-act="jmode" data-v="${STATE.jewishMode!=='off'?'off':'mark'}">${STATE.jewishMode!=='off'?'מופעל ✓':'כבוי'}</span><span class="c hard ${STATE.allowShabbat?'on':''}" data-act="allowshab">${STATE.allowShabbat?'טיסות שבת מוצגות ✓':'בלי טיסות שבת'}</span></div>
    </div>
    <div class="sgrp"><div class="st">תקופות · 🚫 לא · ⚪ רגיל · ⭐ להעדיף</div>
      ${periodsTuneHtml()}
    </div>
    <div class="sgrp"><div class="st">פרופיל · מטבע</div>
      <div class="chips">${[['teacher','הוראה'],['yeshiva','ישיבה'],['general','כללי']].map(o=>`<span class="c ${STATE.profile===o[0]?'on':''}" data-act="prof" data-v="${o[0]}">${o[1]}</span>`).join('')}</div>
      <div class="chips" style="margin-top:5px">${[['ILS','₪'],['USD','$'],['','€']].map(o=>`<span class="c ${STATE.altCurrency===o[0]?'on':''}" data-act="cur" data-v="${o[0]}">${o[1]}</span>`).join('')}</div>
    </div>
  </div>`;
}
// מיון החלונות עצמם (לא הטיסות בתוכם): התאמה / מחיר / תאריך / אורך
function _winPrice(w){ const p=(w.info&&w.info.price!=null)?w.info.price:(w.price!=null?w.price:null); return p==null?Infinity:p; }
function winSortChips(){
  const cur=STATE.winSort||'rank';
  const chip=(v,l)=>`<span class="c ${cur===v?'on':''}" data-act="winsort" data-v="${v}">${l}</span>`;
  return `<div class="sortbar" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">סדר החלונות: ${chip('rank','התאמה')}${chip('price','מחיר')}${chip('date','תאריך')}${chip('nights','אורך')}<span style="flex:1"></span><button class="sgo ghost" data-act="save" style="border-radius:8px;padding:6px 16px;font-size:13px">💾 שמור חיפוש</button></div>`;
}
function sortWindows(arr){
  const mode=STATE.winSort||'rank';
  if(mode==='rank') return arr;
  const a=arr.slice();
  if(mode==='price') a.sort((x,y)=>_winPrice(x)-_winPrice(y)||(x.start<y.start?-1:1));
  else if(mode==='date') a.sort((x,y)=>(x.start<y.start?-1:(x.start>y.start?1:0))||((x.nights||0)-(y.nights||0)));
  else if(mode==='nights') a.sort((x,y)=>((x.nights||0)-(y.nights||0))||_winPrice(x)-_winPrice(y));
  return a;
}
function paintResults(){
  if(!LAST) return;
  const out=document.getElementById('out');
  let body='';
  if(LAST.specific){
    const _list=sortWindows(LAST.ranked);
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
  out.innerHTML=`<div class="resultsgrid"><aside class="sidecol${STATE.sideCollapsed?' collapsed':''}">${sidePanelHtml()}</aside><div class="rescol">${LAST.meta}${LAST.specific?winSortChips():''}${LAST.specific?sortBarHtml():''}${LAST.specific?coverageNote():''}${hasBand?bandLegend():''}${body}${moreBtn}</div></div>`;
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
    const r=await fetch('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD,ILS');
    if(r.ok){ const j=await r.json(); if(j&&j.rates&&j.rates.ILS){ RATES=j.rates; RATES_LIVE=true; return; } }
  }catch(e){}
  try{
    const r=await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json');
    if(r.ok){ const j=await r.json(); if(j&&j.eur){ RATES={USD:j.eur.usd, ILS:j.eur.ils}; RATES_LIVE=true; } }
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
