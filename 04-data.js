function heToEn(q){
  const t=q.trim();
  if(HE_CITY[t]) return HE_CITY[t];
  // partial: if a dictionary key starts with the typed Hebrew, translate to allow live typing
  for(const k in HE_CITY){ if(k.indexOf(t)===0) return HE_CITY[k]; }
  return null;
}
const CITY={
  BUH:{he:'בוקרשט',cc:'רומניה',fresh:false}, SKG:{he:'סלוניקי',cc:'יוון',fresh:true},
  TBS:{he:'טביליסי',cc:'גאורגיה',fresh:true}, EVN:{he:'ירוואן',cc:'ארמניה',fresh:true},
  BUS:{he:'בטומי',cc:'גאורגיה',fresh:true}, TIA:{he:'טירנה',cc:'אלבניה',fresh:true},
  LJU:{he:'ליובליאנה',cc:'סלובניה',fresh:true}, OPO:{he:'פורטו',cc:'פורטוגל',fresh:true},
  KUT:{he:'קוטאיסי',cc:'גאורגיה',fresh:true}, SOF:{he:'סופיה',cc:'בולגריה',fresh:true},
  LON:{he:'לונדון',cc:'בריטניה',fresh:false}, PAR:{he:'פריז',cc:'צרפת',fresh:false},
  ROM:{he:'רומא',cc:'איטליה',fresh:false}, BCN:{he:'ברצלונה',cc:'ספרד',fresh:false},
  ATH:{he:'אתונה',cc:'יוון',fresh:false}, LCA:{he:'לרנקה',cc:'קפריסין',fresh:false},
  AMS:{he:'אמסטרדם',cc:'הולנד',fresh:false}, BUD:{he:'בודפשט',cc:'הונגריה',fresh:false},
  PRG:{he:'פראג',cc:'צ׳כיה',fresh:false}, VIE:{he:'וינה',cc:'אוסטריה',fresh:false},
  MIL:{he:'מילאנו',cc:'איטליה',fresh:false}, JFK:{he:'ניו יורק',cc:'ארה"ב',fresh:false},
  BER:{he:'ברלין',cc:'גרמניה',fresh:false},
};
const AIRLN={W4:'ויזאייר',W6:'ויזאייר',LY:'אל על',IZ:'ארקיע','6H':'ישראייר',PC:'פגסוס',FR:'ריינאייר',A3:'אגאן',TK:'טורקיש',AZ:'ITA',RO:'טארום',U2:'איזיג׳ט'};

/* ===== ski brick: destinations + season window ===== */
/* fallback list — used until Supabase loads, or if it's unavailable */
let SKI={
  GVA:{he:'ז׳נבה — שאמוני/ורבייה',cc:'שוויץ/צרפת'},
  INN:{he:'אינסברוק — טירול',cc:'אוסטריה'},
  SZG:{he:'זלצבורג — סקי אמאדה',cc:'אוסטריה'},
  TRN:{he:'טורינו — ויה לאטאה',cc:'איטליה'},
  MXP:{he:'מילאנו — אלפים',cc:'איטליה'},
  VRN:{he:'ורונה — דולומיטים',cc:'איטליה'},
  LYS:{he:'ליון — אלפים צרפתיים',cc:'צרפת'},
  ZRH:{he:'ציריך — אלפים שוויצריים',cc:'שוויץ'},
  MUC:{he:'מינכן — אלפים בוואריים',cc:'גרמניה'},
  SOF:{he:'סופיה — בנסקו/בורובץ',cc:'בולגריה'},
};
for(const k in SKI) CITY[k]={he:SKI[k].he,cc:SKI[k].cc,fresh:false,ski:true};
let SKI_DESTS=Object.keys(SKI);
let SKI_SOURCE='רשימה מקומית';
const SKI_MONTHS=['2027-01','2027-02']; // עונת השלג

/* ===== Supabase: load ski_area POIs from the base (public read) ===== */
const SUPA_URL="https://cdgqodtbdhsqkvcgcdlm.supabase.co";
const SUPA_ANON="sb_publishable_B4HOCQF3IxN_6Ojz1_ctnA_k6JEAR4g"; // מפתח ציבורי — RLS מגן
function buildSkiFromRows(rows){
  const byIata={};
  for(const r of rows){
    if(!r.nearest_iata) continue;
    const k=r.nearest_iata;
    if(!byIata[k]) byIata[k]={resorts:[],countries:new Set(),pl:[]};
    byIata[k].resorts.push(r.name_he||r.name); if(r.country)byIata[k].countries.add(r.country);
    if(r.price_level) byIata[k].pl.push(r.price_level);
  }
  const out={};
  for(const k in byIata){ const b=byIata[k];
    out[k]={he:b.resorts.join(' / '), cc:[...b.countries].join('/'),
      price_level:b.pl.length?Math.min(...b.pl):null, resorts:b.resorts};
  }
  return out;
}
async function loadSki(){
  if(!SUPA_ANON || SUPA_ANON.indexOf('PASTE_')>=0) return false; // לא הוגדר מפתח — נשאר עם הרשימה המקומית
  try{
    const url=`${SUPA_URL}/rest/v1/pois?select=name,name_he,country,nearest_iata,price_level,attributes&kind=eq.ski_area&active=eq.true`;
    const r=await fetch(url,{headers:{apikey:SUPA_ANON}});
    if(!r.ok) return false;
    const rows=await r.json();
    if(!rows || !rows.length) return false;
    const built=buildSkiFromRows(rows);
    if(!Object.keys(built).length) return false;
    SKI=built; SKI_DESTS=Object.keys(built); SKI_SOURCE='Supabase ('+rows.length+' אתרים)';
    for(const k in built) CITY[k]={he:built[k].he,cc:built[k].cc,fresh:false,ski:true};
    return true;
  }catch(e){ return false; }
}

/* ===== Jewish POIs: load from base, index by country ===== */
const JEWISH_KINDS={synagogue:'בית כנסת',chabad:'חב״ד',mikveh:'מקווה',shabbat_lodging:'לינה לשבת',shabbat_meals:'סעודות שבת',kosher_food:'אוכל כשר',tzadik:'קבר צדיק'};
let POI_BY_COUNTRY={};
async function loadJewish(){
  if(!SUPA_ANON || SUPA_ANON.indexOf('PASTE_')>=0) return false;
  try{
    const kinds=Object.keys(JEWISH_KINDS).join(',');
    const r=await fetch(`${SUPA_URL}/rest/v1/pois?select=kind,country,nearest_iata&kind=in.(${kinds})&active=eq.true`,{headers:{apikey:SUPA_ANON}});
    if(!r.ok) return false;
    const rows=await r.json();
    const idx={};
    for(const p of rows){ if(!p.country)continue; const c=p.country.toLowerCase(); (idx[c]=idx[c]||new Set()).add(p.kind); }
    POI_BY_COUNTRY=idx; return true;
  }catch(e){ return false; }
}
const COUNTRY_HE2EN={'רומניה':'romania','יוון':'greece','גאורגיה':'georgia','ארמניה':'armenia','אלבניה':'albania','סלובניה':'slovenia','פורטוגל':'portugal','מונטנגרו':'montenegro','בריטניה':'united kingdom','צרפת':'france','איטליה':'italy','ספרד':'spain','קפריסין':'cyprus','הולנד':'netherlands','הונגריה':'hungary','צ׳כיה':'czechia','אוסטריה':'austria','גרמניה':'germany','בולגריה':'bulgaria','שוויץ':'switzerland','סלובקיה':'slovakia','ארה"ב':'united states'};
function normCountry(c){ c=(c||'').trim(); return (COUNTRY_HE2EN[c]||c).toLowerCase(); }
function jewishTagFor(cc){
  const countries=(cc||'').split('/').map(s=>normCountry(s)).filter(Boolean);
  const kinds=new Set();
  countries.forEach(c=>{ if(POI_BY_COUNTRY[c]) POI_BY_COUNTRY[c].forEach(k=>kinds.add(k)); });
  if(!kinds.size) return null;
  return [...kinds].map(k=>JEWISH_KINDS[k]).filter(Boolean);
}
