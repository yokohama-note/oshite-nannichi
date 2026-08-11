const DAY=86400000;
export function parseDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return null;const [y,m,d]=s.split('-').map(Number);const x=new Date(Date.UTC(y,m-1,d));return x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d?x:null}
export function key(d){return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`}
export function todayKey(now=new Date()){return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`}
export function diff(a,b){return Math.round((parseDate(b)-parseDate(a))/DAY)}
export function dayNumber(start,today=todayKey()){return diff(start,today)+1}
export function addDays(start,n){const d=parseDate(start);if(!d||!Number.isSafeInteger(n))return null;d.setUTCDate(d.getUTCDate()+n);return Number.isFinite(d.getTime())?key(d):null}
export function nthDay(start,n){return addDays(start,n-1)}
export function anniversaryDate(start,year){const d=parseDate(start);if(!d)return null;const m=d.getUTCMonth(),day=d.getUTCDate();if(m===1&&day===29&&!isLeap(year))return `${year}-02-28`;return `${year}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`}
export function isLeap(y){return y%4===0&&(y%100!==0||y%400===0)}
export function fmt(s){const d=parseDate(s);return d?`${d.getUTCFullYear()}年${d.getUTCMonth()+1}月${d.getUTCDate()}日`:''}
export function autoMilestones(start,today=todayKey()){const n=dayNumber(start,today),out=[];const next100=Math.ceil(n/100)*100;for(let x=Math.max(100,next100);x<=next100;x++){const date=nthDay(start,x),left=diff(today,date);if(left>=0&&left<=10)out.push({date,left,label:`${x}日目`})}const t=parseDate(today),s=parseDate(start);for(let y=Math.max(s.getUTCFullYear()+1,t.getUTCFullYear());y<=t.getUTCFullYear()+1;y++){const date=anniversaryDate(start,y),years=y-s.getUTCFullYear();const left=diff(today,date);if(years>0&&left>=0&&left<=10)out.push({date,left,label:`${years}年目`})}return out}
export function occurrence(a,today=todayKey()){const t=parseDate(today),base=parseDate(a.date);if(!t||!base)return null;if(!a.repeat)return a.date;let y=t.getUTCFullYear(),date=anniversaryDate(a.date,y);if(diff(today,date)>=0)return date;return anniversaryDate(a.date,y+1)}
