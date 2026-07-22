function flightCard(w,fl,dest,kLink,oneway,isBest){
  const stopTxt = fl.stops===0?'ישיר':(fl.stops!=null?fl.stops+' עצירות':'');
  const carrName = fl.carrier||'';
  const carr = (carrName||'טיסה') + (isIsraeliCarrier(carrName)?' 🇮🇱':'') + (fl.operatedBy?` <span class="fc-stop">(מבצע: ${fl.operatedBy})</span>`:'');
  // prefer the edge's TRUE duration (timezone-correct); fall back to ISO subtraction (old provider)
  const _dOut=_durFmt(fl.durationToMin ?? _durMin(fl.outDepISO,fl.outArrISO)), _dBack=_durFmt(fl.durationBackMin ?? _durMin(fl.backDepISO,fl.backArrISO));
  // layover detail: airport code + wait time (e.g. "FCO 1ש55ד")
  const _loTxt=ls=>(Array.isArray(ls)&&ls.length)?ls.map(l=>`${l.code}${l.min?` ${_durFmt(l.min)}`:''}`).join(' · '):'';
  const _outLo=_loTxt(fl.outLayovers), _backLo=_loTxt(fl.backLayovers);
  const times = oneway ? (fl.outDep?`טיסה ${fl.outDep}–${fl.outArr}`:'') : ((fl.outDep&&fl.backDep)?`הלוך ${fl.outDep}–${fl.outArr} · חזור ${fl.backDep}–${fl.backArr}`:'');
  // readable, spaced detail line (duration + layover) — kept off the cramped times line
  const _leg=(label,dur,lo)=> (dur||lo) ? `<span class="fc-leg">${label?`<b>${label}</b> `:''}${dur?`⏱ ${dur}`:''}${dur&&lo?' · ':''}${lo?`עצירה ${lo}`:''}</span>` : '';
  const detail = oneway ? _leg('',_dOut,_outLo) : `${_leg('הלוך',_dOut,_outLo)}${_leg('חזור',_dBack,_backLo)}`;
  const _tlvTag = fl._shabV ? `<span class="rtg crit shabv-${fl._shabV.cls}">🕯️ ${fl._shabV.t}</span>` : '';
  const _destTag = fl._destV ? `<span class="rtg crit destv destv-${fl._destV.cls}">📍 ${fl._destV.t}</span>` : '';
  const verdict = (_tlvTag||_destTag) ? `<div class="rcrit">${_tlvTag}${_destTag}</div>` : '';
  const perEuro = fl.price!=null ? Math.round(fl.price/STATE.adults) : null;
  let conv='';
  if(perEuro!=null && STATE.altCurrency && RATES[STATE.altCurrency]){ const sym={USD:'$',ILS:'₪'}[STATE.altCurrency]||''; conv=` ≈ ${sym}${Math.round(perEuro*RATES[STATE.altCurrency]).toLocaleString()}`; }
  const priceBlock = perEuro!=null
    ? `<div class="v">€${perEuro}</div><div class="k">${STATE.adults>1?'לאחד':''}${conv.replace(/^ ≈ /,STATE.adults>1?' ≈ ':'≈ ')}${STATE.adults>1?` · סה״כ €${fl.price}`:''}</div>`
    : `<div class="v" style="font-size:16px;color:var(--mut-2)">—</div><div class="k">בקישור</div>`;
  return `<div class="fcard${isBest?' win':''}${fl._shabV&&fl._shabV.forbidden?' forb':''}">
    <div class="fc-main">
      <div class="fc-carrier">${carr}${stopTxt?` <span class="fc-stop">· ${stopTxt}</span>`:''}</div>
      ${times?`<div class="fc-times">${times}</div>`:''}
      ${detail?`<div class="fc-detail">${detail}</div>`:''}
      ${fl.altPrice!=null?`<div class="ralt">זול יותר עם עצירה: €${Math.round(fl.altPrice/STATE.adults)}${STATE.adults>1?' לאחד':''}</div>`:''}
      ${verdict}
    </div>
    <div class="fc-price">${priceBlock}<a class="book" href="${kLink}" target="_blank" rel="noopener">הזמן ←</a></div>
  </div>`;
}
// A CITY entry flagged .ski holds resort names (for ski discovery). For a regular flight
// result we want the city/airport name, not the resort — pull a clean label instead.
function cleanCityName(code){
  const o=CITY[code];
  if(o && !o.ski) return o.he;
  const pop=(typeof POPULAR!=='undefined') && POPULAR.find(p=>p[0]===code);
  if(pop) return pop[1];
  const pre=(typeof DEST_CHOICES!=='undefined') && DEST_CHOICES.find(p=>p[0]===code);
  if(pre) return pre[1];
  return (o&&o.he)||code;
}
function windowCard(w,rank,dest){
  const c=CITY[dest]||{he:dest,cc:''};
  const fmt=iso=>{const dt=new Date(iso+'T00:00:00Z');const g=DOW_FULL[dt.getUTCDay()]+' '+dt.getUTCDate()+'.'+(dt.getUTCMonth()+1);return STATE.showHebDates===false?g:g+' · '+hebDateStr(iso);};
  const _O=STATE.origin.toUpperCase();
  const oneway=w.oneway||!w.ret;
  const _book=((CITY[dest]&&CITY[dest]._book)||'').toUpperCase();
  const _iata = /^[A-Z]{3}$/.test(_book) ? _book : ((/^[A-Z]{3}$/.test(dest.toUpperCase())&&!_codeEntity(dest)) ? dest.toUpperCase() : null);
  let kLink;
  if(_iata){
    kLink = oneway
      ? `https://www.kayak.com/flights/${_O}-${_iata}/${w.start}`
      : (STATE.openJaw&&STATE.outAirport&&LAST&&LAST.oj)
      ? `https://www.kayak.com/flights/${_O}-${_iata}/${w.start}/${STATE.outAirport.toUpperCase()}-${_O}/${w.ret}`
      : `https://www.kayak.com/flights/${_O}-${_iata}/${w.start}/${w.ret}`;
  } else {
    const _lbl=(STATE.destLabel||(CITY[dest]&&CITY[dest].he)||dest).split(' · ')[0];
    kLink = `https://www.google.com/travel/flights?q=${encodeURIComponent('flights from '+_O+' to '+_lbl+' on '+w.start+(oneway?'':(' returning '+w.ret)))}`;
  }
  // header context tags (per window, not per flight)
  const headTags=[];
  if(w._motzei) headTags.push('<span class="rtg crit motzei">🌙 מוצאי שבת</span>');
  if(w._prefer) headTags.push('<span class="rtg crit prefer">⭐ מועדף</span>');
  const jw=jewishTagFor(c.cc); if(jw) headTags.push(`<span class="rtg crit poi">✡ ${jw.join(' · ')}</span>`);
  const calTags=[];
  if(w.jtags&&w.jtags.length) for(const jt of w.jtags) calTags.push(`<span class="rtg j-${jt.cls}">${jt.t}</span>`);
  // flights for this window
  const ms=maxStopsVal();
  const allOpts = (w.info && Array.isArray(w.info._options) && w.info._options.length) ? w.info._options : (w.info?[w.info]:[]);
  let vis = allOpts.filter(o=>o && o.price!=null).filter(o=>!(o.stops!=null && o.stops>ms));
  if(!STATE.allowShabbat) vis = vis.filter(o=>!(o._shabV && o._shabV.forbidden));
  if(STATE.onlyIsraeli) vis = vis.filter(o=>isAllIsraeli(o.carrier));
  if(STATE.hiddenCarriers && STATE.hiddenCarriers.length) vis = vis.filter(o=>carrierFamilies(o.carrier).some(f=>!STATE.hiddenCarriers.includes(f)));
  vis = dedupFlights(vis);          // collapse same-flight fare/codeshare duplicates
  vis = sortFlights(vis);
  const hiddenCount = (!STATE.allowShabbat) ? allOpts.filter(o=>o && o.price!=null && o._shabV && o._shabV.forbidden && !(o.stops!=null&&o.stops>ms)).length : 0;
  const wkey=w.start+'|'+(w.ret||'');
  const CAP=5, expanded=_expandedWins.has(wkey), extra=vis.length-CAP;
  const shown = expanded ? vis : vis.slice(0,CAP);
  let cards;
  if(vis.length){
    cards = shown.map((fl,idx)=>flightCard(w,fl,dest,kLink,oneway, rank===1&&idx===0)).join('');
    if(extra>0) cards += `<div class="wgmore"><span class="c on" data-act="expandwin" data-v="${wkey}" style="font-size:11.5px;padding:5px 13px">${expanded?'הצג פחות ▲':'הצג עוד '+extra+' '+(extra===1?'טיסה':'טיסות')+' ▼'}</span></div>`;
  } else if(STATE.onlyIsraeli && allOpts.some(o=>o&&o.price!=null && !(o.stops!=null&&o.stops>ms))){
    cards = `<div class="fcard"><div class="fc-main"><div class="fc-times" style="color:var(--mut-2)">🇮🇱 אין טיסה ישראלית מלאה בחלון זה</div><div style="margin-top:7px"><span class="c on" data-act="onlyisraeli" style="font-size:11px;padding:3px 11px">הצג גם לא-ישראליות</span></div></div><div class="fc-price"><div class="v" style="font-size:16px;color:var(--mut-2)">—</div><div class="k">—</div></div></div>`;
  } else {
    const fallbackV = w.shabV ? `<div class="rcrit"><span class="rtg crit shabv-${w.shabV.cls}">🕯️ ${w.shabV.t}</span></div>` : (w.TS?`<div class="fc-times" style="color:var(--mut-2)">${w.TS.t}</div>`:'');
    cards = `<div class="fcard"><div class="fc-main"><div class="fc-times" style="color:var(--mut-2)">לא נמצא מחיר כרגע — ייתכן תקלת רשת רגעית.</div>${fallbackV}<div style="margin-top:7px"><span class="c on" data-act="rerun" style="font-size:11px;padding:3px 11px">↻ נסה שוב</span></div></div><div class="fc-price"><div class="v" style="font-size:16px;color:var(--mut-2)">—</div><div class="k">בקישור</div><a class="book" href="${kLink}" target="_blank" rel="noopener">הזמן ←</a></div></div>`;
  }
  let hiddenLine='';
  if(hiddenCount>0) hiddenLine=`<div class="rhidden">🕯️ עוד ${hiddenCount} ${hiddenCount===1?'טיסה':'טיסות'} בחלון זה סמוכות מדי לשבת <span class="c on" data-act="allowshab" style="font-size:10px;padding:2px 8px;margin-inline-start:4px">הצג טיסות שבת</span></div>`;
  else if(STATE.allowShabbat){ const shabShown=vis.filter(o=>o._shabV&&o._shabV.forbidden).length; if(shabShown>0) hiddenLine=`<div class="rhidden">🕯️ ${shabShown} ${shabShown===1?'טיסה':'טיסות'} בשבת מוצגות <span class="c on" data-act="allowshab" style="font-size:10px;padding:2px 8px;margin-inline-start:4px">הסתר טיסות שבת</span></div>`; }
  const showCmp = !STATE.openJaw && exitsFor(dest) && w.price!=null;
  return `<div class="wgroup ${rank===1?'win':''}${w._motzei?' motzei':''}">
    <div class="wghead">
      <span class="wgrank">${w._motzei?'🌙':rank}</span>
      <div class="wgttl"><b>${(dest===STATE.destination?destDisplayName():cleanCityName(dest))}</b> <span class="sm">· ${c.cc}</span> · ${oneway?`${fmt(w.start)} · כיוון אחד →`:`${fmt(w.start)} ← ${fmt(w.ret)} · ${w.nights} לילות`}${seasonLabelHtml(c.cc,dest,w.start,w.ret)}</div>
      ${headTags.length?`<div class="rcrit wghtags">${headTags.join('')}</div>`:''}
    </div>
    ${calTags.length?`<div class="rtags">${calTags.join('')}</div>`:''}${w.band?bandHtml(w.band):''}
    <div class="wgtip" data-tipkey="${w.start}|${w.ret||''}"></div>
    <div class="wgflights">${cards}</div>
    ${hiddenLine}
    <div class="wgfoot">
      ${showCmp?`<span class="cmpbtn" data-cmp="${w.start}|${w.ret}">⇄ השווה שדות חזרה</span>`:''}
      <a class="allflights" href="${kLink}" target="_blank" rel="noopener" title="חלק מהטיסות (כמו Wizz ישיר במחיר בינוני) לא תמיד מוחזרות ע&quot;י ה-API — כאן תראה את כולן">🔎 כל הטיסות במסלול ←</a>
    </div>
  </div>`;
}

function buildPrompt(text){
  const today=new Date().toISOString().slice(0,10);
  return `תרגם בקשת חיפוש טיסות/תכנון חופשה חופשית ל-JSON. החזר אך ורק JSON תקין — בלי טקסט, בלי markdown.
התאריך היום: ${today}. כשמזוהה חודש/עונה בלי שנה — בחר את המופע העתידי הקרוב. אם צוינה שנה מפורשת ("2027", "שנת 2027") או "שנה הבאה", וגם שנה דו-ספרתית ("אוגוסט 27"→2027) — החל אותה על כל החודשים.
שדות:
- origin: IATA מוצא (ברירת מחדל "TLV")
- destination: IATA יעד, או "-" אם רוצה "לאן שהוא"/יעד חדש/לא צוין יעד, או "SKI" אם הבקשה על סקי/גלישה
- months: מערך "YYYY-MM" של כל החודשים הרלוונטיים. עונות: חורף=דצמבר+ינואר+פברואר+מרץ (עונת הסקי), אביב=מרץ+אפריל+מאי, קיץ=יוני+יולי+אוגוסט, סתיו=ספטמבר+אוקטובר+נובמבר. חלקי עונה: "תחילת/ראשית X"=החודש הראשון, "אמצע X"=החודש האמצעי, "סוף/שלהי X"=החודשיים האחרונים (למשל "סוף הקיץ"→יולי+אוגוסט, "סוף החורף"→פברואר+מרץ, "תחילת החורף"→דצמבר). אם לא צוין זמן — []
- startDays: מערך ימי יציאה אפשריים כמספרים (ראשון=0, שני=1, שלישי=2, רביעי=3, חמישי=4, שישי=5, שבת=6). "מראשון"→[0], "יציאה בראשון"→[0]. אם לא צוין — []
- endDays: מערך ימי חזרה אפשריים באותו קידוד. "עד חמישי או שישי"→[4,5]. אם לא צוין — []
- nights: מספר לילות ("5 לילות"→5, "שבוע"→7) או טווח כמחרוזת ("שבוע עד 10 ימים"→"7-10", "בין 5 ל-8 לילות"→"5-8"), אחרת null. אם צוינו ימי יציאה וחזרה בלבד — השאר null
- mode: "dates" אם מבקשים רק לבדוק תאריכים/מתי כדאי/בלי טיסות/תכנון מול חגים; אחרת "flights"
- avoidPeriods: מערך תקופות להימנע מהן, מתוך: threeweeks (שלושת השבועות/בין המצרים), ninedays (תשעת הימים), tisha (תשעה באב), omer (ספירת העומר), fast (צומות), beinhazmanim (בין הזמנים), chanuka, purim, cholhamoed (חול המועד), lag (ל"ג בעומר). "בלי צומות"→["fast"], "לא בבין הזמנים"→["beinhazmanim"]. אם לא צוין — []
- preferPeriods: מערך תקופות שדווקא רוצים (אותם ערכים). "דווקא בחול המועד"→["cholhamoed"]. אם לא צוין — []
- constraints: {"type":"airline","value":"IZ|LY|W4"} או {"type":"noShabbat"}
- scorers: {"name":"price|novelty|comfort","w":1-5}
- unsupported: קריטריונים בלי לבנה (חב״ד/ים/כשרות/מלון) — אל תמציא
- summary: תקציר עברי קצר של מה שהובן
יעדים: בוקרשט=BUH אתונה=ATH סלוניקי=SKG טביליסי=TBS ירוואן=EVN לרנקה=LCA בודפשט=BUD פראג=PRG ברצלונה=BCN "ניו יורק"=JFK מילאנו=MIL רומא=ROM פריז=PAR לונדון=LON.
דוגמה — "מחפש חופשה מראשון עד חמישי במהלך חודשי החורף" ⇒ {"origin":"TLV","destination":"-","months":["2026-12","2027-01","2027-02"],"startDays":[0],"endDays":[4],"nights":null,"mode":"flights","constraints":[],"scorers":[{"name":"price","w":3}],"unsupported":[],"summary":"חופשה ראשון–חמישי בחורף, לפי מחיר"}
פלט: {"origin":"TLV","destination":"-","months":[],"startDays":[],"endDays":[],"nights":null,"mode":"flights","avoidPeriods":[],"preferPeriods":[],"constraints":[],"scorers":[],"unsupported":[],"summary":""}
הבקשה: "${text}"`;
}
// התרגום החכם עובר דרך פונקציית edge שמחזיקה את המפתח בצד השרת.
// (בעבר נקרא כאן ה-API של אנתרופיק ישירות מהדפדפן — בלי מפתח ועם חסימת CORS,
//  ולכן האתר החי נפל *תמיד* לתרגום המקומי.)
let LAST_TRANSLATE_ERR=null;
async function translateLive(text){
  LAST_TRANSLATE_ERR=null;
  const ctrl=new AbortController(); const to=setTimeout(()=>ctrl.abort(),22000);
  let r;
  try{ r=await fetch(TRANSLATE_URL,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({prompt:buildPrompt(text)}),signal:ctrl.signal}); }
  finally{ clearTimeout(to); }
  const d=await r.json().catch(()=>null);
  if(!r.ok||!d||!d.ok){ LAST_TRANSLATE_ERR=(d&&(d.error||d.detail))||("http "+r.status); throw new Error(LAST_TRANSLATE_ERR); }
  const I=d.intent;
  if(I&&typeof I==="object"){ I.summary=(I.summary||text); }
  return I;
}
function translateLocal(text){
  const t=text.toLowerCase(),I={origin:"TLV",destination:"-",months:[],startDays:[],endDays:[],nights:null,mode:"flights",avoidPeriods:[],preferPeriods:[],constraints:[],scorers:[],unsupported:[],summary:"(תרגום מקומי) "+text};
  const has=w=>t.includes(w);
  if(has("ארקיע"))I.constraints.push({type:"airline",value:"IZ"});
  if(has("בלי שבת")||has("ימי חול"))I.constraints.push({type:"noShabbat"});
  if(has("חדש")||has("לא היינו"))I.scorers.push({name:"novelty",w:4});
  if(has("זול")||has("מחיר"))I.scorers.push({name:"price",w:3});
  if(has("נוח"))I.scorers.push({name:"comfort",w:2});
  if(has("בלי טיסות")||has("רק תאריכים")||has("תאריכים בלבד")||has("מתי כדאי")||has("מתי שווה"))I.mode="dates";
  const AV=[["fast",["צום","צומות","תענית"]],["threeweeks",["שלושת השבועות","שלשת השבועות","בין המצרים"]],["ninedays",["תשעת הימים"]],["tisha",["תשעה באב"]],["omer",["ספירת העומר","ספירה"]],["beinhazmanim",["בין הזמנים"]],["cholhamoed",["חול המועד","חוה\"מ"]],["chanuka",["חנוכה"]],["purim",["פורים"]],["lag",["ל\"ג בעומר"]]];
  const _avoidCue=has("ללא")||has("הימנע")||has("בלי ")||has("לא ב")||has("להימנע")||has("שלא יהיה");
  for(const [k,words] of AV){ for(const w of words){ if(has(w)){ if(has("דווקא ב"+w)||has("רוצים "+w)||has("כן "+w)){ if(!I.preferPeriods.includes(k))I.preferPeriods.push(k); } else if(_avoidCue){ if(!I.avoidPeriods.includes(k))I.avoidPeriods.push(k); } } } }
  for(const [iata,o] of Object.entries(CITY)){ if(o.ski) continue; if(has(o.he)) I.destination=iata; }
  if(has("סקי")||has("גלישה")||has("שלג"))I.destination="SKI";
  // שנה מפורשת ("2027" / "שנת 2027") או "שנה הבאה" גוברות; אחרת — המופע העתידי הקרוב
  const _yrM=t.match(/20\d\d/); let _forcedY=_yrM?+_yrM[0]:null;
  if(!_forcedY){ // שנה דו-ספרתית: "אוגוסט 27" / "אוגוסט, 27" / "שנת 27" / "קיץ 27" — לא "ב-27 ליולי" (יום בחודש)
    const _y2=t.match(/שנת\s*(2[5-9])\b/)
      ||t.match(/(?:ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר|קיץ|חורף|אביב|סתיו)[\s,]+(2[5-9])\b/)
      ||t.match(/(?<![בלהמ]־?-?\s?\d?)\b(2[5-9])\s*(?:,|$)/);
    if(_y2)_forcedY=2000+ +_y2[1]; }
  if(!_forcedY&&(has("שנה הבאה")||has("בשנה הבאה")))_forcedY=new Date().getFullYear()+1;
  if(_forcedY&&_forcedY<new Date().getFullYear())_forcedY=null;
  const _futureYM=mm=>{const now=new Date();const y=now.getFullYear();if(_forcedY)return _forcedY+"-"+String(mm).padStart(2,"0");return (mm>=now.getMonth()+1?y:y+1)+"-"+String(mm).padStart(2,"0");};
  const M={ינואר:1,פברואר:2,מרץ:3,אפריל:4,מאי:5,יוני:6,יולי:7,אוגוסט:8,ספטמבר:9,אוקטובר:10,נובמבר:11,דצמבר:12};
  for(const [he,mm] of Object.entries(M)){ if(has(he)) I.months.push(_futureYM(mm)); }
  const SEASONS={"חורף":[12,1,2,3],"קיץ":[6,7,8],"אביב":[3,4,5],"סתיו":[9,10,11]}; // חורף עד מרץ (עונת הסקי)
  const _seasonPart=(name,arr)=>{ // "סוף הקיץ" → אוגוסט בלבד
    const pre=w=>t.includes(w+" "+name)||t.includes(w+" ה"+name);
    if(pre("סוף")||pre("שלהי")) return arr.slice(-2); // שני החודשים האחרונים של העונה
    if(pre("אמצע")) return [arr[Math.floor((arr.length-1)/2)]];
    if(pre("תחילת")||pre("ראשית")||pre("בתחילת")) return [arr[0]];
    return arr;
  };
  for(const [he,list] of Object.entries(SEASONS)){ if(has(he)){
    const part=_seasonPart(he,list), crosses=list.includes(12)&&list.includes(1);
    part.forEach(mm=>{
      let ym=_futureYM(mm);
      // עונה חוצת-שנה: דצמבר שייך לשנה שלפני ינואר-מרץ של אותו חורף
      if(crosses&&mm===12&&part.length>1&&_forcedY) ym=(_forcedY-1)+"-12";
      I.months.push(ym);
    });
  } }
  I.months=[...new Set(I.months)].sort();
  // ימי שבוע: "מ<יום>" → יציאה, "עד <יום>" → חזרה, "או <יום>" מצטרף לאחרון שזוהה
  const DAYS={"ראשון":0,"שני":1,"שלישי":2,"רביעי":3,"חמישי":4,"שישי":5,"שבת":6,"מוצ\"ש":6,"מוצאי שבת":6};
  let lastList=null;
  for(const [he,d] of Object.entries(DAYS)){
    if(t.includes("מיום "+he)||t.includes("מ"+he)||t.includes("יציאה ב"+he)||t.includes("יציאה ביום "+he)||t.includes("יציאה "+he)||t.includes("יוצאים ב"+he)||t.includes("יוצאים "+he)||t.includes("לצאת ב"+he)){ if(!I.startDays.includes(d))I.startDays.push(d); lastList=I.startDays; }
    if(t.includes("עד יום "+he)||t.includes("עד "+he)||t.includes("ל"+he)||t.includes("חזרה ב"+he)||t.includes("לחזור ב"+he)){ if(!I.endDays.includes(d))I.endDays.push(d); lastList=I.endDays; }
  }
  // המשך רשימה: "ראשון שני או שלישי" — כל יום שמופיע ברצף אחרי היום הראשון שזוהה
  if(lastList) for(const [he,d] of Object.entries(DAYS)){ if((t.includes("או "+he)||t.includes(", "+he)||t.includes(" "+he+" ")||t.includes(" "+he+",")||t.endsWith(" "+he))&&!lastList.includes(d)&&(I.startDays.length||I.endDays.length)) lastList.push(d); }
  I.startDays.sort(); I.endDays.sort();
  // מספרי-מילים → ספרות (עותק לניתוח לילות בלבד)
  let tn=t; const WORDNUM={"שלושה":"3","ארבעה":"4","חמישה":"5","שישה":"6","שבעה":"7","שמונה":"8","תשעה":"9","עשרה":"10","שבועיים":"14 לילות","שבוע":"7"};
  for(const w in WORDNUM) tn=tn.split(w).join(WORDNUM[w]);
  const nr=tn.match(/(\d+)\s*(?:עד|-|–|ל)\s*-?(\d+)\s*(?:לילות|ימים)/); const nm=tn.match(/(\d+)\s*(?:לילות|ימים)/);
  if(nr)I.nights=nr[1]+"-"+nr[2]; else if(has("שבוע עד עשרה ימים")||has("שבוע עד 10"))I.nights="7-10"; else if(nm)I.nights=+nm[1]; else if(has("שבוע")&&!has("שבועיים"))I.nights=7; else if(has("שבועיים"))I.nights=14;
  if(has("חב"))I.unsupported.push('קרבה לחב"ד'); if(has("כשר"))I.unsupported.push("כשרות");
  if(!I.scorers.length)I.scorers.push({name:"price",w:3});
  return I;
}

/* ===== STATE (the single intent, edited by both entries) ===== */
const STATE={origin:"TLV",destination:"-",departMonth:"2026-07",noShabbat:false,airline:null,
  scorers:{price:3,novelty:0,comfort:0},unsupported:[],summary:"",
  skiNights:7, skiFromISO:"2027-01-01", flexNights:7, flexStartDow:null, flexShabbat:"any",
  fromDate:"2026-07-05", toDate:"2026-07-10", dateMode:"exact", months:["2026-07"], includeStops:false, maxStops:0, sortBy:"price", adults:2, children:0, infants:0, panelOpen:false, altCurrency:"ILS", jewishMode:"mark", profile:"teacher", hideFasts:false, openJaw:false, outAirport:"", flexDays:0, allowShabbat:false, shabbatTime:true, marginBefore:3, marginAfter:3, candleMin:20, havdalah:"deg85", friThreshold:"sunrise", advOpen:false, calOpen:false, calView:"", calPick:null, destLabel:"", paxOpen:false, tripType:"round", sbarPop:null, originEdit:false, monthsShown:6, periodPrefs:defaultPeriodPrefs(), hiddenCarriers:[], onlyIsraeli:false};
const SAVE_KEY='tripfinder_saved_v1';
const SAVE_FIELDS=['origin','destination','destLabel','tripType','dateMode','months','fromDate','toDate','flexNights','flexStartDow','flexShabbat','includeStops','maxStops','sortBy','adults','children','infants','altCurrency','jewishMode','profile','hideFasts','openJaw','outAirport','flexDays','allowShabbat','shabbatTime','marginBefore','marginAfter','candleMin','havdalah','friThreshold','periodPrefs','lastSummary','pesachPrepDays','showHebDates','flexStartDows','flexEndDows','winSort'];
function loadSaved(){ try{ return JSON.parse(localStorage.getItem(SAVE_KEY)||'[]'); }catch(e){ return []; } }
function persistSaved(arr){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(arr)); }catch(e){} }
let SAVED=loadSaved();
let AC={q:'',matches:[],loading:false,err:''};
let _acTimer=null, _acSeq=0;
function customDestChip(){
  const d=STATE.destination;
  if(!d||d==='-'||d==='SKI'||d==='variable') return '';
  if(DEST_CHOICES.some(x=>x[0]===d)) return '';
  const c=CITY[d]; if(!c&&!STATE.destLabel) return '';
  const nm=STATE.destLabel||(c&&c.he)||d;
  return `<span class="c anchor on" data-act="dest" data-v="${d}">${nm}${/^[A-Z]{3}$/.test(d)?` (${d})`:''}</span>`;
}
function acResultsHtml(){
  let h='';
  if(AC.matches&&AC.matches.length) h+='<div class="aclist">'+AC.matches.map((m,i)=>`<span class="acitem" data-acpick="${i}">${m.name}${m.iata?` (${m.iata})`:''}${m.sub?` · ${m.sub}`:''}</span>`).join('')+'</div>';
  if(AC.err) h+=`<div class="note" style="color:var(--amber)">${AC.err}</div>`;
  return h;
}
function renderACResults(){
  const box=document.getElementById('acresults'); if(box) box.innerHTML=acResultsHtml();
  const st=document.getElementById('acstatus'); if(st) st.textContent=AC.loading?'מחפש…':'';
  document.querySelectorAll('#acresults [data-acpick]').forEach(el=>el.onclick=()=>onAct('acpick',el.dataset.acpick));
}
function onAcType(val){
  AC.q=val;
  if(_acTimer) clearTimeout(_acTimer);
  const q=val.trim();
  if(q.length<2){ AC.matches=[]; AC.err=''; AC.loading=false; renderACResults(); return; }
  AC.loading=true; renderACResults();
  _acTimer=setTimeout(()=>{ liveSuggest(q); }, 400);
}
async function liveSuggest(q){
  const my=++_acSeq; AC.err='';
  let sendQ=q;
  if(/[\u0590-\u05FF]/.test(q)){ const en=heToEn(q); if(en) sendQ=en; }
  try{
    const r=await fetch(RAPID_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({suggest:true,q:sendQ})});
    if(my!==_acSeq) return;
    if(r.ok){ const j=await r.json(); AC.matches=(j&&j.ok&&j.matches)?j.matches:[]; if(!AC.matches.length)AC.err='לא נמצאו התאמות. נסה באנגלית או קוד IATA.'; }
    else { AC.matches=[]; AC.err='החיפוש נכשל כרגע (עומס). נסה שוב.'; }
  }catch(e){ if(my!==_acSeq) return; AC.matches=[]; AC.err='שגיאת רשת. נסה שוב.'; }
  AC.loading=false; renderACResults();
}
// ---- open-jaw exit-airport autocomplete (second instance) ----
let OJAC={q:'',matches:[],loading:false,err:''};
let _ojTimer=null, _ojSeq=0;
function ojResultsHtml(){
  let h='';
  if(OJAC.matches&&OJAC.matches.length) h+='<div class="aclist">'+OJAC.matches.map((m,i)=>`<span class="acitem" data-ojpick="${i}">${m.name}${m.iata?` (${m.iata})`:''}${m.sub?` · ${m.sub}`:''}</span>`).join('')+'</div>';
  if(OJAC.err) h+=`<div class="note" style="color:var(--amber)">${OJAC.err}</div>`;
  return h;
}
function renderOJResults(){
  const box=document.getElementById('ojresults'); if(box) box.innerHTML=ojResultsHtml();
  const st=document.getElementById('ojstatus'); if(st) st.textContent=OJAC.loading?'מחפש…':'';
  document.querySelectorAll('#ojresults [data-ojpick]').forEach(el=>el.onclick=()=>onAct('ojpick',el.dataset.ojpick));
}
function onOjType(val){
  OJAC.q=val;
  if(_ojTimer) clearTimeout(_ojTimer);
  const q=val.trim();
  if(q.length<2){ OJAC.matches=[]; OJAC.err=''; OJAC.loading=false; renderOJResults(); return; }
  OJAC.loading=true; renderOJResults();
  _ojTimer=setTimeout(()=>{ liveSuggestOJ(q); }, 400);
}
async function liveSuggestOJ(q){
  const my=++_ojSeq; OJAC.err='';
  let sendQ=q;
  if(/[\u0590-\u05FF]/.test(q)){ const en=heToEn(q); if(en) sendQ=en; }
  try{
    const r=await fetch(RAPID_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({suggest:true,q:sendQ})});
    if(my!==_ojSeq) return;
    if(r.ok){ const j=await r.json(); OJAC.matches=(j&&j.ok&&j.matches)?j.matches.filter(m=>m.iata):[]; if(!OJAC.matches.length)OJAC.err='לא נמצא שדה מתאים. נסה באנגלית או קוד IATA.'; }
    else { OJAC.matches=[]; OJAC.err='החיפוש נכשל כרגע (עומס). נסה שוב.'; }
  }catch(e){ if(my!==_ojSeq) return; OJAC.matches=[]; OJAC.err='שגיאת רשת. נסה שוב.'; }
  OJAC.loading=false; renderOJResults();
}
function saveName(){
  if(STATE.lastSummary) return STATE.lastSummary.slice(0,90); // שאילתה חופשית — שומרים את ה"הבנתי"
  const d=destDisplayName();
  const when=STATE.dateMode==='month'?STATE.months.map(m=>monthLabel(m)).join(','):STATE.dateMode==='exact'?STATE.fromDate:(STATE.fromDate+'–'+STATE.toDate);
  return d+' · '+when+(STATE.openJaw&&STATE.outAirport?(' →'+STATE.outAirport):'');
}
function doSave(){
  const snap={name:saveName()};
  SAVE_FIELDS.forEach(f=>snap[f]=STATE[f]);
  // persist the city mappings so entityId/_book/label survive a reload
  if(CITY[STATE.destination]) snap._destCity=CITY[STATE.destination];
  if(STATE.outAirport && CITY[STATE.outAirport]) snap._outCity=CITY[STATE.outAirport];
  SAVED.push(snap); persistSaved(SAVED); renderPanel();
}
function loadSearch(i){
  const s=SAVED[i]; if(!s)return;
  SAVE_FIELDS.forEach(f=>{ if(s[f]!==undefined) STATE[f]=s[f]; });
  // heal any save that carries a nonsensical date span (e.g. the old 5.7→31.8 / 57-night default),
  // regardless of dateMode — month-mode saves kept those stale fromDate/toDate and the calendar shows them
  if(STATE.fromDate && STATE.toDate){
    const n=Math.round((Date.parse(STATE.toDate)-Date.parse(STATE.fromDate))/864e5);
    if(!(n>0) || n>30) STATE.toDate=_jAddDays(STATE.fromDate,5);
  }
  if(s._destCity && s.destination) CITY[s.destination]=s._destCity;
  if(s._outCity && s.outAirport) CITY[s.outAirport]=s._outCity;
  // legacy saves (entityId dest, no label/city stored): recover a readable label from the saved name
  if(!STATE.destLabel && _codeEntity(STATE.destination) && s.name){
    const lbl=s.name.split(' · ').slice(0,-1).join(' · ').replace(/\s*→.*$/,'').trim();
    if(lbl) STATE.destLabel=lbl;
  }
  STATE.panelOpen=false; renderPanel();
}
function deleteSearch(i){ SAVED.splice(i,1); persistSaved(SAVED); renderPanel(); }
// a clean near-future date range, so "new search" never lands on stale/odd defaults
