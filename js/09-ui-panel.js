function freshDates(){ const t=new Date(); t.setDate(t.getDate()+21); const from=t.toISOString().slice(0,10); const e=new Date(t); e.setDate(e.getDate()+5); return {from, to:e.toISOString().slice(0,10)}; }
// Kayak-style staleness: if the search params changed since the last run, dim the results
// and show a "click search to refresh" banner — without forcing a reset.
let _lastRunSig=null;
function searchSig(){ return [STATE.origin,STATE.destination,STATE.tripType,STATE.dateMode,STATE.fromDate,STATE.toDate,(STATE.months||[]).join(','),STATE.flexDays,STATE.adults,STATE.children,STATE.infants,STATE.openJaw,STATE.outAirport].join('|'); }
function markStale(){
  const out=document.getElementById('out'); const bar=document.getElementById('stalebar');
  const stale = !!(LAST && _lastRunSig!==null && searchSig()!==_lastRunSig);
  if(out) out.classList.toggle('stale-dim', stale);
  if(bar) bar.innerHTML = stale ? `<div class="stalebanner" data-act="go">🔄 שינית את פרטי החיפוש — לחץ לעדכון התוצאות</div>` : '';
}
// reset the search to a clean slate (keeps halachic preferences: margins, candle, jewishMode, pax)
function newSearch(){
  const d=freshDates();
  Object.assign(STATE,{ destination:'-', destLabel:'', tripType:'round', dateMode:'exact', fromDate:d.from, toDate:d.to, months:[d.from.slice(0,7)], flexDays:0, maxStops:0, includeStops:false, sortBy:'price', hiddenCarriers:[], onlyIsraeli:false, allowShabbat:false, openJaw:false, outAirport:'', sbarPop:null, calOpen:false, paxOpen:false, panelOpen:false });
  LAST=null; _expandedWins.clear(); EDGE_DIAG=null; LAST_DZT=null; FLT_DIAG={max:0,maxPriced:0,hasOptions:false,carriers:new Set(),noprice:new Set()};
  const out=document.getElementById('out'); if(out) out.innerHTML='';
  renderPanel();
}

function applyIntent(I){
  STATE.origin=I.origin||"TLV";
  STATE.destination=(I.destination&&I.destination!=="variable")?I.destination:"-";
  STATE.departMonth=I.departMonth||(I.months&&I.months[0])||STATE.departMonth||new Date().toISOString().slice(0,7);
  if(I.months&&I.months.length){ STATE.dateMode='month'; STATE.months=I.months.slice().sort(); }
  if(I.startDays&&I.startDays.length){ STATE.flexStartDows=I.startDays.slice().sort(); STATE.flexStartDow=null; if(STATE.dateMode==='exact')STATE.dateMode='range'; }
  if(I.endDays&&I.endDays.length){ STATE.flexEndDows=I.endDays.slice().sort(); if(STATE.dateMode==='exact')STATE.dateMode='range'; }
  if(I.nights!=null&&/^\d+\s*[-–]\s*\d+$/.test(String(I.nights))){ const a=String(I.nights).split(/[-–]/); const lo=Math.max(1,Math.min(30,+a[0])); const hi=Math.max(lo,Math.min(30,+a[1])); STATE.flexNights=lo+'-'+hi; if(STATE.dateMode==='exact')STATE.dateMode='range'; }
  else if(I.nights!=null&&isFinite(+I.nights)&&+I.nights>0){ STATE.flexNights=Math.max(1,Math.min(30,+I.nights)); if(STATE.dateMode==='exact')STATE.dateMode='range'; }
  else if((I.startDays&&I.startDays.length)||(I.endDays&&I.endDays.length)){ STATE.flexNights='any'; }
  const _valid=['threeweeks','ninedays','tisha','omer','fast','beinhazmanim','chanuka','purim','cholhamoed','lag'];
  if((I.avoidPeriods&&I.avoidPeriods.length)||(I.preferPeriods&&I.preferPeriods.length)){
    if(!STATE.periodPrefs)STATE.periodPrefs=defaultPeriodPrefs();
    for(const k of (I.avoidPeriods||[])) if(_valid.includes(k)){ if(!STATE.periodPrefs[k])STATE.periodPrefs[k]={mode:'normal',scope:'travel'}; STATE.periodPrefs[k].mode='hide'; }
    for(const k of (I.preferPeriods||[])) if(_valid.includes(k)){ if(!STATE.periodPrefs[k])STATE.periodPrefs[k]={mode:'normal',scope:'travel'}; STATE.periodPrefs[k].mode='prefer'; }
  }
  STATE.noShabbat=(I.constraints||[]).some(c=>c.type==="noShabbat");
  const al=(I.constraints||[]).find(c=>c.type==="airline"); STATE.airline=al?al.value:null;
  STATE.scorers={price:0,novelty:0,comfort:0};
  (I.scorers||[]).forEach(s=>{if(s.name in STATE.scorers)STATE.scorers[s.name]=s.w||3;});
  if(!Object.values(STATE.scorers).some(w=>w>0))STATE.scorers.price=3;
  STATE.unsupported=I.unsupported||[];
  STATE.summary=I.summary||"";
}
function intentOf(S){
  const constraints=[];
  if(S.noShabbat)constraints.push({type:"noShabbat"});
  if(S.airline)constraints.push({type:"airline",value:S.airline});
  const scorers=Object.entries(S.scorers).filter(([k,w])=>w>0).map(([name,w])=>({name,w}));
  return {origin:S.origin,destination:S.destination,departMonth:S.departMonth,constraints,scorers,unsupported:S.unsupported};
}

/* ===== panel (editable intent) ===== */
const DEST_CHOICES=[["-","לגלות"],["SKI","⛷️ סקי"],["BUH","בוקרשט"],["ATH","אתונה"],["SKG","סלוניקי"],["TBS","טביליסי"],["LCA","לרנקה"],["BUD","בודפשט"],["BCN","ברצלונה"],["JFK","ניו יורק"]];
const HEB_MON=['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
function monthLabel(ym){ const a=ym.split('-'); const y=+a[0], m=+a[1]; const cy=new Date().getFullYear(); return HEB_MON[m-1]+(y!==cy?(' '+y):''); }
function monthsDisplay(){ if(!STATE.months.length) return 'בחר חודש';
  const by={}; for(const ym of STATE.months.slice().sort()){ const a=ym.split('-'); (by[a[0]]=by[a[0]]||[]).push(HEB_MON[+a[1]-1]); }
  return Object.keys(by).sort().map(y=>by[y].join(', ')+' '+y).join(' · ');
}
function monthsList(n){ const out=[]; const d=new Date(); d.setDate(1); for(let i=0;i<n;i++){ const ym=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); out.push([ym,monthLabel(ym)]); d.setMonth(d.getMonth()+1); } return out; }
const AIRLINES=[[null,"כל החברות"],["IZ","ארקיע"],["LY","אל על"],["W4","ויזאייר"]];
const SCORERS=[["price","מחיר"],["novelty","מקום חדש"],["comfort","נוחות"]];
const SKI_NIGHTS=[[5,"5 לילות"],[7,"7 לילות"]];
const SKI_FROMS=[["2027-01-01","כל העונה"],["2027-01-13","מ-13.1"],["2027-01-20","מ-20.1"],["2027-02-01","מ-1.2"]];

const HEB_MONTHS=['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const _fmtHe=iso=>{ if(!iso)return '—'; const p=iso.split('-'); return (+p[2])+'.'+(+p[1])+'.'+p[0]; };
function rangeCalendarHtml(){
  const oneway=STATE.tripType==='oneway';
  const todayISO=new Date().toISOString().slice(0,10);
  const range= oneway
    ? `<div class="daterange" data-cal="toggle"><span class="drlab">יציאה</span><b>${_fmtHe(STATE.fromDate)}</b><span class="caledit">📅 ${STATE.calOpen?'סגור':'בחר בלוח'}</span></div>`
    : `<div class="daterange" data-cal="toggle"><span class="drlab">יציאה</span><b>${_fmtHe(STATE.fromDate)}</b><span class="arr">←</span><span class="drlab">חזרה</span><b>${_fmtHe(STATE.toDate)}</b><span class="caledit">📅 ${STATE.calOpen?'סגור':'בחר בלוח'}</span></div>`;
  if(!STATE.calOpen) return range;
  const view=STATE.calView||(STATE.fromDate?STATE.fromDate.slice(0,7):todayISO.slice(0,7));
  const y=+view.slice(0,4), m=+view.slice(5,7);
  const first=new Date(Date.UTC(y,m-1,1)), dim=new Date(Date.UTC(y,m,0)).getUTCDate(), startDow=first.getUTCDay();
  let cells='';
  for(let i=0;i<startDow;i++) cells+='<span class="calday empty"></span>';
  for(let d=1;d<=dim;d++){
    const iso=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const past=iso<todayISO;
    let cls='';
    if(iso===STATE.fromDate) cls+=' selstart';
    if(!oneway && iso===STATE.toDate) cls+=' selend';
    if(!oneway && STATE.fromDate&&STATE.toDate&&iso>STATE.fromDate&&iso<STATE.toDate) cls+=' inrange';
    if(past) cls+=' past';
    cells+=`<span class="calday${cls}" ${past?'':`data-calday="${iso}"`}>${d}</span>`;
  }
  const prevDis = (view<=todayISO.slice(0,7));
  const hint = oneway ? 'בחר תאריך יציאה' : ((STATE.calPick==='end'?'בחר תאריך חזרה':'בחר תאריך יציאה') + ' · ' + (STATE.fromDate&&STATE.toDate?_nightsBetween(STATE.fromDate,STATE.toDate)+' לילות':''));
  const cal=`<div class="calwrap">
    <div class="calhead"><button class="calnav" ${prevDis?'disabled':'data-cal="prev"'}>‹</button><span class="caltitle">${HEB_MONTHS[m-1]} ${y}</span><button class="calnav" data-cal="next">›</button></div>
    <div class="calgrid">${['א','ב','ג','ד','ה','ו','ש'].map(x=>`<span class="caldow">${x}</span>`).join('')}${cells}</div>
    <div class="calhint">${hint}</div>
  </div>`;
  return range+cal;
}
function _nightsBetween(a,b){ return Math.round((Date.parse(b)-Date.parse(a))/864e5); }
function calPickDay(iso){
  if(STATE.tripType==='oneway'){ STATE.fromDate=iso; STATE.calOpen=false; STATE.calPick=null; return; }
  if(STATE.calPick==='end' && iso>STATE.fromDate){ STATE.toDate=iso; STATE.calPick=null; STATE.calOpen=false; }
  else { STATE.fromDate=iso; STATE.toDate=_jAddDays(iso,1); STATE.calPick='end'; }
}
function paxSummary(){
  const a=+STATE.adults,c=+STATE.children,i=+STATE.infants;
  const parts=[a+' '+(a===1?'מבוגר':'מבוגרים')];
  if(c)parts.push(c+' '+(c===1?'ילד':'ילדים'));
  if(i)parts.push(i+' '+(i===1?'תינוק':'תינוקות'));
  return parts.join(' · ');
}
function _paxRow(key,label,sub,min,max){
  const v=+STATE[key];
  return `<div class="paxr"><div class="paxlbl"><b>${label}</b><span>${sub}</span></div><div class="paxctrl"><button class="paxbtn" ${v<=min?'disabled':`data-act="pax_dec" data-v="${key}"`}>−</button><span class="paxn"><bdi>${v}</bdi></span><button class="paxbtn" ${v>=max?'disabled':`data-act="pax_inc" data-v="${key}"`}>+</button></div></div>`;
}
function paxField(){
  const pop = STATE.paxOpen ? `<div class="paxpop">${_paxRow('adults','מבוגרים','16+',1,9)}${_paxRow('children','ילדים','2–15',0,8)}${_paxRow('infants','תינוקות','0–2',0,Math.max(1,+STATE.adults))}<div class="paxdone" data-act="paxtoggle">סגור</div></div>` : '';
  return `<div class="fld paxfld"><label>נוסעים</label><div class="paxsel" data-act="paxtoggle"><bdi>${paxSummary()}</bdi> <span class="cv">▾</span></div>${pop}</div>`;
}
function destDisplayName(){
  if(STATE.destination==='-') return 'לגלות';
  if(STATE.destination==='SKI') return '⛷️ סקי';
  const preset=DEST_CHOICES.find(x=>x[0]===STATE.destination);
  if(preset) return preset[1];
  if(STATE.destLabel) return STATE.destLabel;
  return cleanCityName(STATE.destination);
}
const POPULAR=[['BUH','בוקרשט'],['ATH','אתונה'],['SKG','סלוניקי'],['LCA','לרנקה'],['TBS','טביליסי'],['BCN','ברצלונה'],['BUD','בודפשט'],['JFK','ניו יורק'],['MXP','מילאנו'],['CDG','פריז'],['FCO','רומא'],['PRG','פראג']];
function tripTypeLabel(){ return ({round:'⇄ הלוך-חזור',oneway:'→ כיוון אחד',openjaw:'↩ חזרה מעיר אחרת'})[STATE.openJaw?'openjaw':STATE.tripType]; }
function _dateFieldVal(){
  if(STATE.tripType==='oneway') return _fmtHe(STATE.fromDate);
  if(STATE.dateMode==='month') return monthsDisplay();
  if(STATE.dateMode==='range') return `${_fmtHe(STATE.fromDate)} – ${_fmtHe(STATE.toDate)}`;
  return `${_fmtHe(STATE.fromDate)} ← ${_fmtHe(STATE.toDate)}`;
}
function flexChipsHtml(){
  return [['0','מדויק'],['1','±1 יום'],['2','±2 ימים'],['3','±3 ימים']]
    .map(f=>`<span class="c ${STATE.flexDays==+f[0]?'on':''}" data-act="flexdays" data-v="${f[0]}">${f[1]}</span>`).join('');
}
function monthChipsHtml(){
  const list=monthsList(STATE.monthsShown||6);
  return list.map(([v,l])=>`<span class="c anchor ${STATE.months.includes(v)?'on':''}" data-act="monthtoggle" data-v="${v}">${l}</span>`).join('')
    +`<span class="c moremonths" data-act="moremonths">+ עוד חודשים</span>`;
}
function _dowSel(){ return (STATE.flexStartDows&&STATE.flexStartDows.length)?STATE.flexStartDows:(STATE.flexStartDow!=null?[STATE.flexStartDow]:null); }
function dayChipsHtml(act,arr){
  const DN=['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
  const on=arr&&arr.length?arr:null;
  return `<span class="c ${!on?'on':''}" data-act="${act}" data-v="">כל יום</span>`+DN.map((l,d)=>`<span class="c ${on&&on.includes(d)?'on':''}" data-act="${act}" data-v="${d}">${l}</span>`).join('');
}
function lenRowHtml(){
  const sb=(act,opts,cur)=>`<select data-actsel="${act}" class="sel">${opts.map(([v,l])=>`<option value="${v}" ${String(cur)===String(v)?'selected':''}>${l}</option>`).join('')}</select>`;
  const N=[['any','כל אורך'],['3','3 לילות'],['4','4 לילות'],['5','5 לילות'],['6','6 לילות'],['7','7 לילות'],['8','8 לילות'],['9','9 לילות'],['10','10 לילות'],['4-5','4–5 לילות'],['5-7','5–7 לילות'],['7-10','7–10 לילות'],['10-14','10–14 לילות']];
  const S=[['any','לא משנה'],['none','בלי שבת'],['away','שבת ביעד']];
  return `<div class="t" style="margin-top:8px">אורך · יחס לשבת</div><div class="selrow">${sb('fnights',N,STATE.flexNights)} ${sb('fshab',S,STATE.flexShabbat)}</div>`
    +`<div class="t" style="margin-top:8px">ימי יציאה (אפשר כמה)</div><div class="chips">${dayChipsHtml('fstartd',_dowSel())}</div>`
    +`<div class="t" style="margin-top:8px">ימי חזרה (אפשר כמה)</div><div class="chips">${dayChipsHtml('fendd',STATE.flexEndDows)}</div>`;
}
function datePopBody(){
  if(STATE.tripType==='oneway'){
    return `<div class="t">תאריך יציאה</div>${rangeCalendarHtml()}<div class="flexinline" style="margin-top:8px">${flexChipsHtml()}</div>`;
  }
  const modeBtns=[['exact','תאריך מדויק'],['month','חודשים'],['range','טווח + אורך']]
    .map(([v,l])=>`<span class="c ${STATE.dateMode===v?'on':''}" data-act="datemode" data-v="${v}">${l}</span>`).join('');
  let body='';
  if(STATE.dateMode==='month') body=`<div class="t" style="margin-top:8px">חודשים</div><div class="chips">${monthChipsHtml()}</div>${lenRowHtml()}`;
  else if(STATE.dateMode==='exact') body=`<div class="t" style="margin-top:8px">בחר תאריכים</div>${rangeCalendarHtml()}<div class="flexinline" style="margin-top:8px">${flexChipsHtml()}</div>`;
  else body=`<div class="t" style="margin-top:8px">טווח יציאה</div>${rangeCalendarHtml()}${lenRowHtml()}`;
  return `<div class="chips">${modeBtns}</div>${body}<div class="paxdone" data-act="sbclose" style="margin-top:10px">סיום</div>`;
}
function searchBarHtml(){
  const p=STATE.sbarPop;
  const destVal = STATE.destination==='-'?'<span class="sval ph">לאן טסים?</span>':`<span class="sval">${destDisplayName()}</span>`;
  // trip-type dropdown (in-bar)
  const ttField=`<div class="sfield ttfield ${p==='tt'?'active':''}" data-act="sbpop" data-v="tt"><label>סוג</label><span class="sval">${tripTypeLabel()} ▾</span>${p==='tt'?`<div class="ttmenu" onclick="event.stopPropagation()">${[['round','⇄ הלוך-חזור'],['oneway','→ כיוון אחד'],['openjaw','↩ חזרה מעיר אחרת']].map(o=>`<div class="ttopt ${((o[0]==='openjaw'&&STATE.openJaw)||(o[0]!=='openjaw'&&!STATE.openJaw&&STATE.tripType===o[0]))?'on':''}" data-act="setttype" data-v="${o[0]}">${o[1]}</div>`).join('')}</div>`:''}</div>`;
  // return-airport field (open-jaw)
  const ojField = (STATE.openJaw && STATE.destination!=='-' && STATE.destination!=='SKI') ? `<div class="sfield ${p==='oj'?'active':''}" data-act="sbpop" data-v="oj"><label>חזרה מ</label><span class="sval ${STATE.outAirport?'':'ph'}">${STATE.outAirport||'שדה חזרה'}</span>${p==='oj'?`<div class="spop wide" onclick="event.stopPropagation()"><div class="t">שדה חזרה (עיר אחרת)</div><input type="text" id="ojq" autocomplete="off" value="${OJAC.q||''}" placeholder="הקלד (Cluj / קלוז׳)" class="din" style="width:100%" ><span class="note" id="ojstatus">${OJAC.loading?'מחפש…':''}</span><div id="ojresults">${ojResultsHtml()}</div><div class="note" style="margin-top:4px">מחיר = שתי טיסות כיוון-אחד · נראה גם מרחק נהיגה</div></div>`:''}</div>` : '';
  // origin
  const oField=`<div class="sfield ofield ${p==='origin'?'active':''}" data-act="sbpop" data-v="origin"><label>מוצא</label><span class="sval"><bdi>${(CITY[STATE.origin]&&CITY[STATE.origin].he)?CITY[STATE.origin].he.split(' — ')[0]:'תל אביב'} · ${STATE.origin}</bdi></span>${p==='origin'?`<div class="spop" onclick="event.stopPropagation()"><div class="t">עיר מוצא</div><div class="origin-edit"><input type="text" id="origq" autocomplete="off" placeholder="קוד/עיר (TLV / ETM)" class="din" style="width:160px" value="${STATE.origin}"><button class="c on" data-act="setorigin">קבע</button></div><div class="note" style="margin-top:6px">בד״כ תל אביב (TLV)</div></div>`:''}</div>`;
  // swap
  const swap=`<button class="swapbtn" data-act="swapod" title="החלף מוצא/יעד">⇄</button>`;
  // destination
  const dField=`<div class="sfield grow ${p==='dest'?'active':''}" data-act="sbpop" data-v="dest"><label>יעד</label>${destVal}${p==='dest'?`<div class="spop wide" onclick="event.stopPropagation()"><input type="text" id="acq" autocomplete="off" placeholder="התחל להקליד (Miami / מיאמי)" class="din" style="width:100%" value="${AC.q||''}"><span class="note" id="acstatus">${AC.loading?'מחפש…':''}</span><div id="acresults">${acResultsHtml()}</div><div class="spop-cities"><div class="popcities"><span class="c ${STATE.destination==='-'?'on':''}" data-act="dest" data-v="-">✨ לא החלטתי — גלה יעדים</span></div><div class="popcities" style="margin-top:6px"><span class="plabel">פופולרי:</span>${POPULAR.slice(0,8).map(c=>`<span class="c" data-act="poppick" data-v="${c[0]}">${c[1]}</span>`).join('')}</div></div></div>`:''}</div>`;
  // dates
  const dtField=`<div class="sfield grow ${p==='dates'?'active':''}" data-act="sbpop" data-v="dates"><label>${STATE.tripType==='oneway'?'תאריך יציאה':'תאריכים'}</label><span class="sval"><bdi>${_dateFieldVal()}</bdi></span>${p==='dates'?`<div class="spop wide" onclick="event.stopPropagation()">${datePopBody()}</div>`:''}</div>`;
  // passengers
  const pxField=`<div class="sfield paxfld ${p==='pax'?'active':''}" data-act="sbpop" data-v="pax"><label>נוסעים</label><span class="sval"><bdi>${paxSummary()}</bdi></span>${p==='pax'?`<div class="spop" onclick="event.stopPropagation()">${_paxRow('adults','מבוגרים','16+',1,9)}${_paxRow('children','ילדים','2–15',0,8)}${_paxRow('infants','תינוקות','0–2',0,Math.max(1,+STATE.adults))}<div class="paxdone" data-act="sbclose">סיום</div></div>`:''}</div>`;
  const go=`<button class="sgo" data-act="go">🔍 חפש</button>`;
  const plan=`<button class="sgo ghost" data-act="goplan" title="בדיקת חלונות תאריכים מול הלוח העברי — חגים, צומות, שבתות, בין הזמנים — בלי חיפוש טיסות">📅 תאריכים בלבד</button>`;
  const reset=`<button class="sgo ghost" data-act="newsearch" title="חיפוש חדש — מאפס יעד, תאריכים וסינונים">↺ חדש</button>`;
  return `<div class="sbar"><div class="sbar-row">${ttField}${oField}${swap}${dField}${ojField}${dtField}${pxField}${reset}${plan}${go}</div></div>
    <div class="popcities"><span class="plabel">יעדים פופולריים:</span>${POPULAR.map(c=>`<span class="c" data-act="poppick" data-v="${c[0]}">${c[1]}</span>`).join('')}</div>`;
}
function renderPanel(){
  const dest=DEST_CHOICES.map(([v,l])=>`<span class="c anchor ${STATE.destination===v?'on':''}" data-act="dest" data-v="${v}">${l}</span>`).join('');
  const mon=monthsList(STATE.monthsShown||6).map(([v,l])=>`<span class="c anchor ${STATE.departMonth===v?'on':''}" data-act="month" data-v="${v}">${l}</span>`).join('');
  const air=AIRLINES.map(([v,l])=>`<span class="c hard ${STATE.airline===v?'on':''}" data-act="air" data-v="${v===null?'':v}">${l}</span>`).join('');
  const shab=`<span class="c hard ${STATE.noShabbat?'on':''}" data-act="shab">בלי טיסה בשבת</span>`;
  const sc=SCORERS.map(([name,l])=>{
    const w=STATE.scorers[name],on=w>0;
    return `<span class="sc ${on?'on':''}"><span class="lbl" data-act="sctoggle" data-v="${name}">${on?'':'+ '}${l}</span><span class="w"><button data-act="wdn" data-v="${name}">−</button><b>${w}</b><button data-act="wup" data-v="${name}">+</button></span></span>`;
  }).join('');
  const uns=(STATE.unsupported&&STATE.unsupported.length)?`<div class="unsupp"><b>קריטריון בלי לבנה:</b> ${STATE.unsupported.join(' · ')} — לא הומצא, התעלמנו. הסימן להוסיף פונקציה אחת לספרייה.</div>`:'';
  const ski = STATE.destination==="SKI";
  const nightsChips=SKI_NIGHTS.map(([v,l])=>`<span class="c ${STATE.skiNights===v?'on':''}" data-act="nights" data-v="${v}">${l}</span>`).join('');
  const fromChips=SKI_FROMS.map(([v,l])=>`<span class="c ${STATE.skiFromISO===v?'on':''}" data-act="from" data-v="${v}">${l}</span>`).join('');
  const specificDest = STATE.destination!=="-" && STATE.destination!=="SKI";
  const monGroup = ski
    ? `<div class="grp"><div class="t">עונה · אורך · התחלה</div><div class="chips"><span class="c anchor on">⛷️ ינו׳–פבר׳ 2027</span> ${nightsChips} ${fromChips}</div>
       <div class="t" style="margin-top:8px">התחלה בימי חול · שבוע עם שבת ביעד יורד למטה כאופציה · שבועות עומס מסומנים · מקור יעדים: ${SKI_SOURCE}</div></div>`
    : '';
  const NIGHTS_OPTS=[['any','כל אורך'],['3','3 לילות'],['4','4 לילות'],['5','5 לילות'],['6','6 לילות'],['7','7 לילות'],['8','8 לילות'],['9','9 לילות'],['10','10 לילות'],['4-5','4–5 לילות'],['5-7','5–7 לילות'],['7-10','7–10 לילות'],['10-14','10–14 לילות']];
  const SHAB_OPTS=[['any','לא משנה'],['none','בלי שבת'],['away','שבת ביעד']];
  const selBox=(act,opts,cur)=>`<select data-actsel="${act}" class="sel">${opts.map(([v,l])=>`<option value="${v}" ${String(cur)===String(v)?'selected':''}>${l}</option>`).join('')}</select>`;
  const modeBtns=[['month','חודשים'],['exact','תאריך מדויק'],['range','טווח + אורך']]
    .map(([v,l])=>`<span class="c ${STATE.dateMode===v?'on':''}" data-act="datemode" data-v="${v}">${l}</span>`).join('');
  const monthChips=monthChipsHtml();
  const nightsSel=selBox('fnights',NIGHTS_OPTS,STATE.flexNights);
  const shabSel=selBox('fshab',SHAB_OPTS,STATE.flexShabbat);
  const _today=new Date().toISOString().slice(0,10);
  const dateInputs=rangeCalendarHtml();
  const ADULTS_OPTS=[['1','נוסע 1'],['2','2 נוסעים'],['3','3 נוסעים'],['4','4 נוסעים'],['5','5 נוסעים'],['6','6 נוסעים']];
  const adultsSel=selBox('adults',ADULTS_OPTS,STATE.adults);
  const lenRow=`<div class="t" style="margin-top:10px">אורך · יחס לשבת</div><div class="selrow">${nightsSel} ${shabSel}</div>`
    +`<div class="t" style="margin-top:8px">ימי יציאה (אפשר כמה)</div><div class="chips">${dayChipsHtml('fstartd',_dowSel())}</div>`
    +`<div class="t" style="margin-top:8px">ימי חזרה (אפשר כמה)</div><div class="chips">${dayChipsHtml('fendd',STATE.flexEndDows)}</div>`;
  const flexChips=[['0','מדויק'],['1','±1 יום'],['2','±2 ימים'],['3','±3 ימים']]
    .map(f=>`<span class="c ${STATE.flexDays==+f[0]?'on':''}" data-act="flexdays" data-v="${f[0]}">${f[1]}</span>`).join('');
  let timeBody='';
  if(STATE.dateMode==='month')
    timeBody=`<div class="t">חודשים (אפשר לבחור כמה)</div><div class="chips">${monthChips}</div>${lenRow}`;
  else if(STATE.dateMode==='exact')
    timeBody=`<div class="t">נסיעה מדויקת · מ – עד · גמישות</div><div class="dateflexrow">${dateInputs}<span class="flexinline">${flexChips}</span></div>${STATE.flexDays>0?`<div class="t" style="margin-top:6px;color:var(--mut-2)">נבדקים כל הצירופים עד ±${STATE.flexDays} ימים סביב התאריכים · הזולים יוצגו ראשונים</div>`:''}`;
  else
    timeBody=`<div class="t">טווח יציאה — בין</div>${dateInputs}${lenRow}`;
  const tripTypeBtns=[['round','⇄ הלוך-חזור'],['oneway','→ כיוון אחד']].map(([v,l])=>`<span class="c ${STATE.tripType===v?'on':''}" data-act="triptype" data-v="${v}">${l}</span>`).join('');
  const flexGroup = !ski
    ? `<div class="grp"><div class="t">מתי</div><div class="chips" style="margin-bottom:8px">${tripTypeBtns}</div><div class="chips">${modeBtns}</div><div style="margin-top:10px">${timeBody}</div>
        <div class="t" style="margin-top:6px">${STATE.tripType==='oneway'?'כיוון אחד — בחר תאריך יציאה בלבד · מתומחר כטיסת כיוון אחד':(specificDest?'"שבת ביעד" = טיול שכולל שבת · "בלי שבת" = חוזר לפני שבת · לעולם לא טיסה בשבת':'ב"לגלות" נסרקות ערים · בחר עיר לחלונות מדויקים עם מחיר אמת')}</div></div>`
    : '';
  const destName = destDisplayName();
  const _sd=_dowSel();
  const dowName = (!_sd?'כל יום':_sd.map(d=>DOW_FULL[d]).join('/'))+(STATE.flexEndDows&&STATE.flexEndDows.length?' ← '+STATE.flexEndDows.map(d=>DOW_FULL[d]).join('/'):'');
  const shabName = ({any:'שבת: לא משנה',none:'בלי שבת',away:'שבת ביעד'})[STATE.flexShabbat];
  const lenName = STATE.flexNights==='any'?'כל אורך':String(STATE.flexNights).replace('-','–')+' לילות';
  let timeName='';
  if(ski) timeName='עונת סקי';
  else if(STATE.dateMode==='month') timeName=monthsDisplay()+` · ${lenName} · ${dowName}`;
  else if(STATE.dateMode==='exact') timeName=`<bdi>${_fmtHe(STATE.fromDate)} ← ${_fmtHe(STATE.toDate)}</bdi>${STATE.flexDays>0?` · ±${STATE.flexDays}`:''}`;
  else timeName=`${STATE.fromDate}–${STATE.toDate} · ${lenName} · ${dowName}`;
  const summaryLine=`<b>${destName}</b> · ${STATE.tripType==='oneway'?'<bdi>'+_fmtHe(STATE.fromDate)+'</bdi> · כיוון אחד':timeName} · <bdi>${STATE.adults} נוסעים</bdi>${ski?'':' · '+shabName}${maxStopsVal()===0?' · ישיר':(maxStopsVal()===1?' · עד 1 עצירה':' · עד 2 עצירות')}`;
  document.getElementById('panel').innerHTML=`<div class="panel">
    ${SAVED.length?`<div class="savedstrip">${SAVED.map((s,i)=>`<span class="savedchip"><span class="ld" data-act="load" data-v="${i}">${s.name}</span><span class="del" data-act="del" data-v="${i}">×</span></span>`).join('')}</div>`:''}
    ${ski?'':searchBarHtml()}
    <div class="barhead">
      <div class="barsum">${summaryLine}</div>
      <div class="baract"><button class="adjust" data-act="toggle">${STATE.panelOpen?'סגור כוונון ▲':'⚙ כוונון הלכתי ▾'}</button></div>
    </div>
    ${STATE.panelOpen?`<div class="detail">
      ${STATE.summary?`<div class="summary">${STATE.summary}</div>`:''}
      <div class="grp"><div class="t">לוח עברי — שבת וחג ${STATE.allowShabbat?'מסומנים (מותר לטוס)':'חסומים כברירת מחדל'} · השאר מסומן לשיקולך</div><div class="chips">${[['off','כבוי'],['mark','מופעל']].map(([v,l])=>`<span class="c ${STATE.jewishMode===v?'on':''}" data-act="jmode" data-v="${v}">${l}</span>`).join('')}<span class="c ${STATE.hideFasts?'on':''}" data-act="hfast">${STATE.hideFasts?'צומות מוסתרים ✓':'הסתר צומות'}</span><span class="c hard ${STATE.allowShabbat?'on':''}" data-act="allowshab">${STATE.allowShabbat?'טיסות שבת/חג: מוצגות ✓':'טיסות שבת/חג: ללא'}</span><span class="note">ירוק=חופשה טובה · ענבר=זהירות</span></div></div>

      <div class="advtoggle" data-act="advtoggle">${STATE.advOpen?'פחות אפשרויות ▲':'אפשרויות נוספות ▼'}</div>
      ${STATE.advOpen?`
      <div class="grp"><div class="t">אילוצים קשיחים</div><div class="chips">${shab} ${air} ${[[0,'ישיר'],[1,'עד 1 עצירה'],[2,'עד 2 עצירות']].map(o=>`<span class="c hard ${maxStopsVal()===o[0]?'on':''}" data-act="maxstops" data-v="${o[0]}">${o[1]}</span>`).join('')}</div></div>
      <div class="grp"><div class="t">זמני שבת — בדיקת ערב שבת ומוצ״ש מול שעות הטיסה (צד תל אביב)</div><div class="chips"><span class="c hard ${STATE.shabbatTime?'on':''}" data-act="shabtime">${STATE.shabbatTime?'בדיקת זמנים: פעילה ✓':'בדיקת זמנים: כבויה'}</span></div>${STATE.shabbatTime?`
        <div class="t" style="margin-top:8px">מרווח לפני כניסת שבת (חזרה בשישי) · שעות</div><div class="chips">${[2,3,4].map(h=>`<span class="c ${(+STATE.marginBefore===h)?'on':''}" data-act="mbefore" data-v="${h}">${h}</span>`).join('')}<input type="text" data-acttext="mbeforefree" value="${[2,3,4].includes(+STATE.marginBefore)?'':STATE.marginBefore}" placeholder="חופשי" class="din" style="width:70px"></div>
        <div class="t" style="margin-top:8px">מרווח אחרי צאת שבת (יציאה במוצ״ש) · שעות</div><div class="chips">${[2,3,4].map(h=>`<span class="c ${(+STATE.marginAfter===h)?'on':''}" data-act="mafter" data-v="${h}">${h}</span>`).join('')}<input type="text" data-acttext="mafterfree" value="${[2,3,4].includes(+STATE.marginAfter)?'':STATE.marginAfter}" placeholder="חופשי" class="din" style="width:70px"></div>
        <div class="t" style="margin-top:8px">כניסת נרות (דקות לפני שקיעה) · צאת שבת</div><div class="chips">${[[20,'20 (מרכז)'],[30,'30 (חיפה/צפון)'],[40,'40 (ירושלים)']].map(c=>`<span class="c ${(+STATE.candleMin===c[0])?'on':''}" data-act="candle" data-v="${c[0]}">${c[1]}</span>`).join('')}<span class="c ${STATE.havdalah==='deg85'?'on':''}" data-act="havd" data-v="deg85">צאת רגיל 8.5°</span><span class="c ${STATE.havdalah==='rt72'?'on':''}" data-act="havd" data-v="rt72">רבנו תם 72ד׳</span></div>
        <div class="t" style="margin-top:8px">סף התראת נחיתת שישי · נחיתה אחרי הסף = התראה מלאה · לפניו = תווית רכה</div><div class="chips">${[['sunrise','🌅 זריחה'],['06:00','עד 06:00'],['08:00','עד 08:00']].map(o=>`<span class="c ${STATE.friThreshold===o[0]?'on':''}" data-act="frithr" data-v="${o[0]}">${o[1]}</span>`).join('')}</div>
        <div class="t" style="margin-top:6px;color:var(--mut-2)">נחיתה בשישי חייבת להיות לפני כניסת שבת פחות המרווח · המראה במוצ״ש אחרי צאת שבת פלוס המרווח · אסור לסמוך על המינימום</div>`:''}</div>
      <div class="grp"><div class="t">ניקוד רך (משקל)</div><div class="chips">${sc}</div></div>
      <div class="grp"><div class="t">פרופיל (לחלונות מומלצים)</div><div class="chips">${[['teacher','עובד הוראה (קיץ)'],['yeshiva','ישיבה (בין הזמנים)'],['general','כללי']].map(([v,l])=>`<span class="c ${STATE.profile===v?'on':''}" data-act="prof" data-v="${v}">${l}</span>`).join('')}</div></div>
      <div class="grp"><div class="t">מטבע להמרה (תצוגה מקורבת)</div><div class="chips">${[['ILS','₪ שקל'],['USD','$ דולר'],['','€ יורו בלבד']].map(([v,l])=>`<span class="c ${STATE.altCurrency===v?'on':''}" data-act="cur" data-v="${v}">${l}</span>`).join('')}</div></div>
      `:''}
      ${uns}
      <div class="detailfoot"><button class="adjust" data-act="jdiag">בדיקת לוח</button><button class="save" data-act="save">שמור חיפוש · v92</button></div>
      <div id="savebox"></div>
    </div>`:''}
  </div>`;
  document.querySelectorAll('#panel [data-act]').forEach(el=>el.onclick=()=>onAct(el.dataset.act,el.dataset.v));
  document.querySelectorAll('#panel [data-actsel]').forEach(el=>el.onchange=()=>onAct(el.dataset.actsel,el.value));
  document.querySelectorAll('#panel [data-actdate]').forEach(el=>el.onchange=()=>onAct('date_'+el.dataset.actdate,el.value));
  document.querySelectorAll('#panel [data-cal]').forEach(el=>el.onclick=()=>onAct('cal_'+el.dataset.cal,''));
  document.querySelectorAll('#panel [data-calday]').forEach(el=>el.onclick=()=>onAct('calpick',el.dataset.calday));
  document.querySelectorAll('#panel [data-acttext]').forEach(el=>el.oninput=()=>onAct('text_'+el.dataset.acttext,el.value));
  const acq=document.getElementById('acq');
  if(acq){ acq.oninput=()=>onAcType(acq.value); renderACResults(); }
  const ojq=document.getElementById('ojq');
  if(ojq){ ojq.oninput=()=>onOjType(ojq.value); renderOJResults(); }
  markStale();
}
const LIVE_TUNE=new Set(['mbefore','mafter','candle','havd','shabtime','jmode','hfast','allowshab','stops','prof','flexdays','air','shab','datemode','monthtoggle','triptype','sctoggle','wup','wdn','periodmode','periodscope','periodall']);
let _liveT=null;
const CHEAP_TUNE=new Set(['mbefore','mafter','candle','havd','shabtime']);
function onAct(act,v){
  _onAct(act,v);
  if(LAST && LAST.specific!==undefined && LIVE_TUNE.has(act)){
    paintResults();
    clearTimeout(_liveT);
    if(CHEAP_TUNE.has(act)) _liveT=setTimeout(()=>retune(),250);
    else _liveT=setTimeout(()=>{ if(typeof run==='function') run(); },350);
  }
}
function _onAct(act,v){
  if(act==='sbpop'){ STATE.sbarPop=(STATE.sbarPop===v?null:v); renderPanel(); return; }
  else if(act==='sbclose'){ STATE.sbarPop=null; renderPanel(); return; }
  else if(act==='setttype'){ if(v==='openjaw'){ STATE.openJaw=true; STATE.tripType='round'; STATE.sbarPop=(STATE.destination==='-'||STATE.destination==='SKI')?'dest':'oj'; } else { STATE.openJaw=false; STATE.tripType=v; STATE.sbarPop=null; } renderPanel(); return; }
  else if(act==='swapod'){ const o=STATE.origin,d=STATE.destination; if(d==='-'||d==='SKI'||d==='variable'){ renderPanel(); return; } STATE.origin=d; STATE.destination=o; STATE.destLabel=(CITY[o]&&CITY[o].he)?CITY[o].he:(o==='TLV'?'תל אביב · ישראל':o); if(!CITY[o])CITY[o]={he:(o==='TLV'?'תל אביב · ישראל':o),cc:''}; renderPanel(); return; }
  else if(act==='setorigin'){ const el=document.getElementById('origq'); if(el&&el.value.trim()){ STATE.origin=el.value.trim().toUpperCase(); } STATE.sbarPop=null; renderPanel(); return; }
  else if(act==='poppick'){ const item=POPULAR.find(x=>x[0]===v); STATE.destination=v; STATE.destLabel=item?item[1]:''; if(!CITY[v])CITY[v]={he:(item?item[1]:v),cc:''}; else if(item)CITY[v].he=item[1]; AC.matches=[]; AC.q=''; STATE.sbarPop=(STATE.openJaw&&!STATE.outAirport)?'oj':'dates'; renderPanel(); return; }
  if(act==='dest'){STATE.destination=v; STATE.destLabel=''; if(STATE.sbarPop==='dest')STATE.sbarPop=(v==='-'?null:'dates');}
  else if(act==='acpick'){
    const m=AC.matches[+v]; if(!m)return;
    const code=m.iata||('E'+m.entityId);
    CITY[code]={he:m.name+(m.sub?(' · '+m.sub):''), cc:'', _entityId:m.entityId, _book:(m.iata||(m.name||'').replace(/\s+/g,'-'))};
    STATE.destination=code; STATE.destLabel=m.name+(m.sub?(' · '+m.sub):''); AC.matches=[]; AC.q=''; AC.err='';
    STATE.sbarPop=(STATE.openJaw&&!STATE.outAirport)?'oj':'dates';
    renderPanel(); return;
  }
  else if(act==='ojpick'){
    const m=OJAC.matches[+v]; if(!m||!m.iata)return;
    STATE.outAirport=m.iata; OJAC.matches=[]; OJAC.q=''; OJAC.err='';
    if(STATE.sbarPop==='oj') STATE.sbarPop='dates';
    renderPanel(); return;
  }
  else if(act==='month')STATE.departMonth=v;
  else if(act==='nights')STATE.skiNights=+v;
  else if(act==='from')STATE.skiFromISO=v;
  else if(act==='fnights')STATE.flexNights=(v==='any'?'any':(String(v).indexOf('-')>0?v:+v));
  else if(act==='fstartd'){ if(v===''){STATE.flexStartDows=null;} else {let a=(_dowSel()||[]).slice(); const d=+v; a=a.includes(d)?a.filter(x=>x!==d):a.concat(d).sort(); STATE.flexStartDows=a.length?a:null;} STATE.flexStartDow=null; }
  else if(act==='fendd'){ if(v===''){STATE.flexEndDows=null;} else {let a=(STATE.flexEndDows||[]).slice(); const d=+v; a=a.includes(d)?a.filter(x=>x!==d):a.concat(d).sort(); STATE.flexEndDows=a.length?a:null;} }
  else if(act==='skisort'){
    STATE.skiSort=v;
    if(LAST&&LAST.baseRanked){
      let r=LAST.baseRanked.slice();
      if(v==='price') r.sort((a,b)=>((a.price??1e12)-(b.price??1e12))||(a.depUTC-b.depUTC));
      else if(v==='date') r.sort((a,b)=>(a.depUTC-b.depUTC));
      LAST.ranked=r;
      LAST.meta=`<div class="meta">${LAST.metaBase}${skiSortChips()}</div>`;
      paintResults();
    }
    return;
  }
  else if(act==='plansort'){ STATE.planSort=v; if(typeof LAST_PLAN!=='undefined'&&LAST_PLAN) paintPlanner(null); return; }
  else if(act==='fshab')STATE.flexShabbat=v;
  else if(act==='jdiag'){
    const out=document.getElementById('out');
    const raw=window.__hebcalRaw||[]; const per=window.__jPeriods||[];
    out.innerHTML='<div class="meta">בדיקת לוח — תקופות שזוהו</div><div style="font-size:12px;line-height:1.7;padding:12px;white-space:pre-wrap;color:var(--mut)">'+
      'תקופות:\n'+(per.length?per.join('\n'):'(לא זוהו תקופות)')+
      '\n\nפריטי Hebcal ('+raw.length+'):\n'+(raw.length?raw.slice(0,80).join('\n'):'(ריק — ייתכן שהקריאה נכשלה)')+
      (window.__jErr?('\n\nשגיאה: '+window.__jErr):'')+'</div>';
    return;
  }
  else if(act==='load'){ loadSearch(+v); return; }
  else if(act==='del'){ deleteSearch(+v); return; }
  else if(act==='ojaw'){ STATE.openJaw=!STATE.openJaw; renderPanel(); return; }
  else if(act==='text_ojout'){ STATE.outAirport=(v||'').toUpperCase().trim(); return; }
  else if(act==='hfast'){ STATE.hideFasts=!STATE.hideFasts; renderPanel(); return; }
  else if(act==='prof')STATE.profile=v;
  else if(act==='jmode')STATE.jewishMode=v;
  else if(act==='cur'){ STATE.altCurrency=v; renderPanel(); paintResults(); return; }
  else if(act==='sortby'){ STATE.sortBy=v; paintResults(); return; }
  else if(act==='expandwin'){ if(_expandedWins.has(v))_expandedWins.delete(v); else _expandedWins.add(v); paintResults(); return; }
  else if(act==='carrierfilt'){
    const cs=carriersInResults().map(c=>c.name);
    const hid=STATE.hiddenCarriers||[];
    const visible=cs.filter(n=>!hid.includes(n));
    if(visible.length===1 && visible[0]===v) STATE.hiddenCarriers=[];          // already isolated → show all
    else STATE.hiddenCarriers=cs.filter(n=>n!==v);                              // isolate: show only this carrier
    paintResults(); return;
  }
  else if(act==='carrieronly'){ const cs=carriersInResults().map(c=>c.name); STATE.hiddenCarriers=cs.filter(n=>n!==v); paintResults(); return; }
  else if(act==='carriertoggle'){ const f=STATE.hiddenCarriers||(STATE.hiddenCarriers=[]); const i=f.indexOf(v); if(i>=0)f.splice(i,1); else f.push(v); paintResults(); return; }
  else if(act==='onlyisraeli'){ STATE.onlyIsraeli=!STATE.onlyIsraeli; paintResults(); return; }
  else if(act==='carrierall'){ STATE.hiddenCarriers=[]; STATE.onlyIsraeli=false; paintResults(); return; }
  else if(act==='rerun'){ if(typeof run==='function') run(); return; }
  else if(act==='toggle'){ STATE.panelOpen=!STATE.panelOpen; renderPanel(); return; }
  else if(act==='advtoggle'){ STATE.advOpen=!STATE.advOpen; renderPanel(); return; }
  else if(act==='adults')STATE.adults=+v;
  else if(act==='stops')STATE.includeStops=!STATE.includeStops;
  else if(act==='maxstops'){ STATE.maxStops=+v; STATE.includeStops=(+v>0); if(LAST&&LAST.allWindows){ LAST.ranked=rankedWindows(LAST.allWindows); } paintResults(); return; }
  else if(act==='moremonths'){ STATE.monthsShown=(STATE.monthsShown||6)+6; renderPanel(); return; }
  else if(act==='periodmode'){ const [k,m]=v.split('|'); if(!STATE.periodPrefs)STATE.periodPrefs=defaultPeriodPrefs(); if(!STATE.periodPrefs[k])STATE.periodPrefs[k]={mode:'normal',scope:'travel'}; STATE.periodPrefs[k].mode=m; }
  else if(act==='periodscope'){ const [k,s]=v.split('|'); if(!STATE.periodPrefs)STATE.periodPrefs=defaultPeriodPrefs(); if(!STATE.periodPrefs[k])STATE.periodPrefs[k]={mode:'normal',scope:'travel'}; STATE.periodPrefs[k].scope=s; }
  else if(act==='periodall'){ const [g,m]=v.split('|'); if(!STATE.periodPrefs)STATE.periodPrefs=defaultPeriodPrefs(); TUNE_PERIODS.filter(p=>p.grp===g).forEach(p=>{ if(!STATE.periodPrefs[p.key])STATE.periodPrefs[p.key]={mode:'normal',scope:'travel'}; STATE.periodPrefs[p.key].mode=m; }); }
  else if(act==='datemode')STATE.dateMode=v;
  else if(act==='flexdays')STATE.flexDays=+v;
  else if(act==='allowshab')STATE.allowShabbat=!STATE.allowShabbat;
  else if(act==='shabtime')STATE.shabbatTime=!STATE.shabbatTime;
  else if(act==='mbefore')STATE.marginBefore=+v;  else if(act==='mafter')STATE.marginAfter=+v;
  else if(act==='candle')STATE.candleMin=+v;
  else if(act==='havd')STATE.havdalah=v;
  else if(act==='frithr')STATE.friThreshold=v;
  else if(act==='text_mbeforefree'){ const n=parseFloat(v); if(!isNaN(n)&&n>0)STATE.marginBefore=n; return; }
  else if(act==='text_mafterfree'){ const n=parseFloat(v); if(!isNaN(n)&&n>0)STATE.marginAfter=n; return; }
  else if(act==='monthtoggle'){ const i=STATE.months.indexOf(v); if(i>=0){ if(STATE.months.length>1)STATE.months.splice(i,1); } else STATE.months.push(v); }
  else if(act==='date_from'){ STATE.fromDate=v; if(!STATE.toDate||STATE.toDate<=v){ STATE.toDate=_jAddDays(v,1); } renderPanel(); return; }
  else if(act==='date_to'){ if(v>STATE.fromDate){ STATE.toDate=v; } else { STATE.toDate=_jAddDays(STATE.fromDate,1); } renderPanel(); return; }
  else if(act==='cal_toggle'){ STATE.calOpen=!STATE.calOpen; if(STATE.calOpen){ STATE.calView=(STATE.fromDate||new Date().toISOString().slice(0,10)).slice(0,7); STATE.calPick='start'; } renderPanel(); return; }
  else if(act==='triptype'){ STATE.tripType=v; if(v==='oneway'){ STATE.openJaw=false; STATE.calPick=null; } renderPanel(); return; }
  else if(act==='paxtoggle'){ STATE.paxOpen=!STATE.paxOpen; renderPanel(); return; }
  else if(act==='pax_inc'){ const cap={adults:9,children:8,infants:Math.max(1,+STATE.adults)}; STATE[v]=Math.min(cap[v],(+STATE[v])+1); if(+STATE.infants>+STATE.adults)STATE.infants=+STATE.adults; renderPanel(); return; }
  else if(act==='pax_dec'){ const flo={adults:1,children:0,infants:0}; STATE[v]=Math.max(flo[v],(+STATE[v])-1); if(+STATE.infants>+STATE.adults)STATE.infants=+STATE.adults; renderPanel(); return; }
  else if(act==='cal_prev'){ const v=STATE.calView; let y=+v.slice(0,4),m=+v.slice(5,7)-1; if(m<1){m=12;y--;} STATE.calView=y+'-'+String(m).padStart(2,'0'); renderPanel(); return; }
  else if(act==='cal_next'){ const v=STATE.calView; let y=+v.slice(0,4),m=+v.slice(5,7)+1; if(m>12){m=1;y++;} STATE.calView=y+'-'+String(m).padStart(2,'0'); renderPanel(); return; }
  else if(act==='calpick'){ calPickDay(v); if(!STATE.calOpen && STATE.sbarPop==='dates' && (STATE.tripType==='oneway' || STATE.dateMode==='exact')){ STATE.sbarPop='pax'; } renderPanel(); return; }
  else if(act==='air')STATE.airline=v||null;
  else if(act==='shab')STATE.noShabbat=!STATE.noShabbat;
  else if(act==='sctoggle')STATE.scorers[v]=STATE.scorers[v]>0?0:3;
  else if(act==='wup')STATE.scorers[v]=Math.min(5,(STATE.scorers[v]||0)+1);
  else if(act==='wdn')STATE.scorers[v]=Math.max(0,(STATE.scorers[v]||0)-1);
  else if(act==='go'){ STATE.panelOpen=false; STATE.calOpen=false; STATE.sbarPop=null; STATE.paxOpen=false; renderPanel(); run(); return; }
  else if(act==='goplan'){ STATE.panelOpen=false; STATE.calOpen=false; STATE.sbarPop=null; STATE.paxOpen=false; renderPanel(); runPlanner(); return; }
  else if(act==='newsearch'){ newSearch(); return; }
  else if(act==='save'){ doSave(); return; }
  renderPanel();
}
/* ===== live fetch + render results ===== */
const EXPLORE_DESTS=['BUH','ATH','SKG','TBS','BUS','EVN','LCA','BUD','BCN','PRG','TIA','SOF','VIE','OPO','LON','ROM'];
