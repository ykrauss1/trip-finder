function gregLeap(y){return (y%4===0&&y%100!==0)||y%400===0;}
function ldm(m,y){return [31,(gregLeap(y)?29:28),31,30,31,30,31,31,30,31,30,31][m-1];}
function gregToAbs(y,m,d){let n=d;for(let i=1;i<m;i++)n+=ldm(i,y);n+=365*(y-1)+Math.floor((y-1)/4)-Math.floor((y-1)/100)+Math.floor((y-1)/400);return n;}
function dow(a){return ((a%7)+7)%7;}
function lastSunAbs(y,m){let a=gregToAbs(y,m,ldm(m,y));return a-dow(a);}
function isSummer(a,y){return a>=lastSunAbs(y,3)&&a<lastSunAbs(y,10);}
function sunsetUTCmin(a,lat,lon){let yy=Math.floor(a/366);while(a>=gregToAbs(yy+1,1,1))yy++;let m=1;while(a>gregToAbs(yy,m,ldm(m,yy)))m++;let D=a-gregToAbs(yy,m,1)+1,Y=yy,M=m;let q=Math.floor((14-M)/12),y=Y+4800-q,mo=M+12*q-3;let JDN=D+Math.floor((153*mo+2)/5)+365*y+Math.floor(y/4)-Math.floor(y/100)+Math.floor(y/400)-32045;let n=JDN-2451545.0+0.0008,Js=n-lon/360.0;let Ms=(357.5291+0.98560028*Js)%360,Mr=Ms*Math.PI/180;let C=1.9148*Math.sin(Mr)+0.0200*Math.sin(2*Mr)+0.0003*Math.sin(3*Mr);let lam=(Ms+C+180+102.9372)%360,lr=lam*Math.PI/180;let Jt=2451545.0+Js+0.0053*Math.sin(Mr)-0.0069*Math.sin(2*lr);let dec=Math.asin(Math.sin(lr)*Math.sin(23.44*Math.PI/180)),la=lat*Math.PI/180;let cH=(Math.sin(-0.833*Math.PI/180)-Math.sin(la)*Math.sin(dec))/(Math.cos(la)*Math.cos(dec));if(cH>1||cH<-1)return null;let H=Math.acos(cH)*180/Math.PI;let mins=(((Jt+H/360.0)-(JDN-0.5))*1440);return ((mins%1440)+1440)%1440;}
const LAT=32.0809,LON=34.7806;
function sunsetLocalMin(a){const off=israelOffset(a);const ss=sunsetUTCmin(a,LAT,LON);return ss==null?null:ss+off;}
function israelOffset(a){let yy=Math.floor(a/366);while(a>=gregToAbs(yy+1,1,1))yy++;return isSummer(a,yy)?180:120;}
const RDUNIX=719163;
function shabbatWindowUTC(absDay){
  const sat=absDay+((6-dow(absDay)+7)%7), fri=sat-1;
  const offFri=israelOffset(fri), offSat=israelOffset(sat);
  const candleUTC=(fri*1440+(sunsetLocalMin(fri)-18)-offFri-RDUNIX*1440)*60000;
  const havdalahUTC=(sat*1440+(sunsetLocalMin(sat)+50)-offSat-RDUNIX*1440)*60000;
  return {candleUTC,havdalahUTC};
}
function shabbatLens(depUTCms,durToMin){
  const arr=depUTCms+(durToMin||180)*60000;
  const dd=new Date(depUTCms);
  const localMs=depUTCms+israelOffset(gregToAbs(dd.getUTCFullYear(),dd.getUTCMonth()+1,dd.getUTCDate()))*60000;
  const ld=new Date(localMs);
  const absDay=gregToAbs(ld.getUTCFullYear(),ld.getUTCMonth()+1,ld.getUTCDate());
  const {candleUTC,havdalahUTC}=shabbatWindowUTC(absDay);
  if(depUTCms<havdalahUTC && arr>candleUTC){
    if(depUTCms>=candleUTC) return {k:'during',t:'ממריא בשבת'};
    if(depUTCms<candleUTC)  return {k:'airborne',t:'באוויר בכניסת שבת'};
    return {k:'during',t:'חופף לשבת'};
  }
  if(arr<candleUTC && (candleUTC-arr)<=120*60000) return {k:'close',t:'נוחת קרוב לכניסת שבת'};
  if(depUTCms>havdalahUTC && (depUTCms-havdalahUTC)<=240*60000) return {k:'motzaei',t:'מוצאי שבת ✓'};
  return null;
}
/* full-trip classification: flies-on-Shabbat (forbidden) / Shabbat-abroad (needs arrangements) / clean */
function ilAbs(ms){const g=new Date(ms);const off=israelOffset(gregToAbs(g.getUTCFullYear(),g.getUTCMonth()+1,g.getUTCDate()));const d=new Date(ms+off*60000);return gregToAbs(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate());}
function inShabbat(ms){const ab=ilAbs(ms);const w=shabbatWindowUTC(ab);return ms>=w.candleUTC&&ms<=w.havdalahUTC;}
function legFlies(depMs,durMin){const arr=depMs+(durMin||180)*60000;const ab=ilAbs(depMs);const w=shabbatWindowUTC(ab);return (depMs<w.havdalahUTC&&arr>w.candleUTC);}
function tripShabbat(depUTC,durTo,retUTC,durBack){
  const outFly=legFlies(depUTC,durTo);
  let retFly=false,landUTC=null;
  if(retUTC){ landUTC=retUTC+(durBack||180)*60000; retFly=inShabbat(retUTC)||inShabbat(landUTC)||dow(ilAbs(retUTC))===6; }
  if(outFly||retFly) return {k:'fly',t:'טס/באוויר בשבת'};
  if(retUTC){ const d0=ilAbs(depUTC),d1=ilAbs(landUTC); let away=0; for(let a=d0+1;a<d1;a++) if(dow(a)===6) away++; if(away>0) return {k:'away',t:'שבת ביעד — צריך הסדרי שבת'}; }
  return {k:'clean',t:'נקי משבת'};
}

/* ===== reference tables ===== */
const DW=["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","שבת"];
function fmtLocal(utcMs){
  const g=new Date(utcMs);
  const off=israelOffset(gregToAbs(g.getUTCFullYear(),g.getUTCMonth()+1,g.getUTCDate()));
  const d=new Date(utcMs+off*60000);
  const abs=gregToAbs(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate());
  return DW[dow(abs)]+" "+d.getUTCDate()+"."+(d.getUTCMonth()+1)+" "+String(d.getUTCHours()).padStart(2,"0")+":"+String(d.getUTCMinutes()).padStart(2,"0");
}
// Hebrew -> English city names, so autocomplete works in Hebrew (Skyscanner dropped he-IL locale)
const HE_CITY={
  'תל אביב':'Tel Aviv','אילת':'Eilat','חיפה':'Haifa',
  'בוקרשט':'Bucharest','קלוז':'Cluj','יאשי':'Iasi','טימישוארה':'Timisoara','סוצאבה':'Suceava','סיביו':'Sibiu',
  'אתונה':'Athens','סלוניקי':'Thessaloniki','סלוניקיה':'Thessaloniki','רודוס':'Rhodes','כרתים':'Heraklion','הרקליון':'Heraklion','קורפו':'Corfu','סנטוריני':'Santorini','מיקונוס':'Mykonos','קוס':'Kos','קרפתוס':'Karpathos',
  'לרנקה':'Larnaca','פאפוס':'Paphos','קפריסין':'Larnaca',
  'רומא':'Rome','מילאנו':'Milan','מילנו':'Milan','ונציה':'Venice','נאפולי':'Naples','פירנצה':'Florence','בולוניה':'Bologna','קטניה':'Catania','פלרמו':'Palermo','בארי':'Bari',
  'ברצלונה':'Barcelona','מדריד':'Madrid','מלאגה':'Malaga','ולנסיה':'Valencia','אליקנטה':'Alicante','איביזה':'Ibiza','פלמה':'Palma','סביליה':'Seville',
  'פריז':'Paris','פריס':'Paris','ניס':'Nice','מרסיי':'Marseille','ליון':'Lyon',
  'לונדון':'London','מנצסטר':'Manchester',
  'אמסטרדם':'Amsterdam','בריסל':'Brussels','בריסלס':'Brussels',
  'ברלין':'Berlin','מינכן':'Munich','פרנקפורט':'Frankfurt','המבורג':'Hamburg','דיסלדורף':'Dusseldorf','קלן':'Cologne',
  'וינה':'Vienna','ציריך':'Zurich','ז\u05f3נבה':'Geneva','גנבה':'Geneva',
  'פראג':'Prague','בודפשט':'Budapest','ורשה':'Warsaw','קרקוב':'Krakow','סופיה':'Sofia','בלגרד':'Belgrade','זאגרב':'Zagreb','ליובליאנה':'Ljubljana','בוקובינה':'Suceava',
  'קופנהגן':'Copenhagen','שטוקהולם':'Stockholm','אוסלו':'Oslo','הלסינקי':'Helsinki','ריקיאוויק':'Reykjavik','רייקיאוויק':'Reykjavik',
  'ליסבון':'Lisbon','פורטו':'Porto','מדיירה':'Funchal','פונשל':'Funchal',
  'דבלין':'Dublin','אדינבורו':'Edinburgh',
  'מלטה':'Malta','ולטה':'Malta',
  'איסטנבול':'Istanbul','אנטליה':'Antalya','טביליסי':'Tbilisi','באטומי':'Batumi','קוטאיסי':'Kutaisi','ירוואן':'Yerevan','באקו':'Baku',
  'דובאי':'Dubai','אבו דאבי':'Abu Dhabi','דוחא':'Doha',
  'ניו יורק':'New York','נ.יורק':'New York','לוס אנגלס':'Los Angeles','מיאמי':'Miami','בוסטון':'Boston','שיקגו':'Chicago','אורלנדו':'Orlando','לאס וגאס':'Las Vegas','וושינגטון':'Washington','סן פרנסיסקו':'San Francisco','אטלנטה':'Atlanta','טורונטו':'Toronto','מונטריאול':'Montreal',
  'בנגקוק':'Bangkok','פוקט':'Phuket','טוקיו':'Tokyo','דלהי':'Delhi','מומבאי':'Mumbai','גואה':'Goa','קייפטאון':'Cape Town','זנזיבר':'Zanzibar','סיישל':'Seychelles','מלדיביים':'Male','קולומבו':'Colombo',
  'מומבסה':'Mombasa','נאירובי':'Nairobi','קזבלנקה':'Casablanca','מרקש':'Marrakech'
};
