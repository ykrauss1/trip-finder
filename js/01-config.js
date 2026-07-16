const FUNC_URL="https://cdgqodtbdhsqkvcgcdlm.functions.supabase.co/flights-search";
const RAPID_OLD_URL="https://cdgqodtbdhsqkvcgcdlm.functions.supabase.co/flights-rapid";
const RAPID_GF_URL ="https://cdgqodtbdhsqkvcgcdlm.functions.supabase.co/Flights-gflights";
// ספק נתוני הטיסות הפעיל — נשמר ב-localStorage. 'gf'=Google Flights (חדש) · 'old'=Skyscanner (ישן). ברירת מחדל: ישן (ללא שינוי התנהגות עד החלפה ידנית).
let FLIGHT_PROVIDER=(localStorage.getItem('tf_provider')||'old');
let RAPID_URL=(FLIGHT_PROVIDER==='gf')?RAPID_GF_URL:RAPID_OLD_URL;
function tfSyncProviderBtn(){const b=document.getElementById('provBtn');if(!b)return;const gf=(FLIGHT_PROVIDER==='gf');b.textContent=gf?'מקור: Google Flights ✈️':'מקור: Skyscanner (ישן)';b.style.background=gf?'#1f6f5c':'#3a3f55';}
function tfToggleProvider(){FLIGHT_PROVIDER=(FLIGHT_PROVIDER==='gf')?'old':'gf';RAPID_URL=(FLIGHT_PROVIDER==='gf')?RAPID_GF_URL:RAPID_OLD_URL;localStorage.setItem('tf_provider',FLIGHT_PROVIDER);tfSyncProviderBtn();}
if(document.readyState==='loading'){ window.addEventListener('DOMContentLoaded',tfSyncProviderBtn); } else { tfSyncProviderBtn(); }
const JCAL_URL="https://cdgqodtbdhsqkvcgcdlm.functions.supabase.co/jcal";
let RAPID_DIAG="";
let RANK_DIAG=null;
let RATES={USD:1.08, ILS:3.9}; // sensible fallback so a conversion always shows; refreshed live below
let RATES_LIVE=false;
let LAST=null;
const _expandedWins=new Set(); // windows the user expanded to show all flights
