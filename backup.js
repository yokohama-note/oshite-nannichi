(()=>{
'use strict';
const BACKUP_APP='oshite-nannichi';
const BACKUP_VERSION=1;
const MAX_BACKUP_BYTES=2*1024*1024;

function backupMessage(text,isError=false){
  const message=document.querySelector('#backup-message');
  message.textContent=text;
  message.classList.toggle('error',isError);
}

function photoFreeDecor(){
  return (state.homeDecor?.items||[]).filter(item=>item?.type==='emoji').slice(0,30).map(item=>({
    type:'emoji',text:String(item.text||'').slice(0,12),x:Number(item.x)||.5,y:Number(item.y)||.5,
    scale:Number(item.scale)||1,rotation:Number(item.rotation)||0,z:Number(item.z)||1
  }));
}

function createBackup(){
  return {app:BACKUP_APP,formatVersion:BACKUP_VERSION,exportedAt:new Date().toISOString(),containsPhotos:false,data:{
    oshi:state.oshi,user:state.user,start:state.start,color:state.color,theme:state.theme,
    events:(state.events||[]).map(item=>({name:item.name,date:item.date,time:item.time||'',memo:item.memo||'',notice:String(item.notice??'0')})),
    anniversaries:(state.anniversaries||[]).map(item=>({name:item.name,date:item.date,repeat:Boolean(item.repeat),yearCount:Boolean(item.yearCount),countdown:Boolean(item.countdown)})),
    homeDecor:{items:photoFreeDecor()}
  }};
}

function downloadBackup(){
  try{
    const blob=new Blob([JSON.stringify(createBackup(),null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=`oshite-nannichi-backup-${todayKey()}.json`;
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    backupMessage('写真を含まないバックアップを保存しました。ダウンロードフォルダなどで大切に保管してください。');
  }catch{backupMessage('バックアップを保存できませんでした。端末の空き容量を確認してください。',true)}
}

function requiredString(value,label,max){
  if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error(`${label}が正しくありません。`);
  return value;
}
function optionalString(value,label,max){
  if(value===undefined||value===null)return'';
  if(typeof value!=='string'||value.length>max)throw new Error(`${label}が長すぎるか、正しくありません。`);
  return value;
}
function validDate(value,label){if(typeof value!=='string'||!parseDate(value))throw new Error(`${label}の日付が正しくありません。`);return value}
function validArray(value,label,max=500){if(!Array.isArray(value)||value.length>max)throw new Error(`${label}の数が多すぎるか、正しくありません。`);return value}

function readEvents(value){
  return validArray(value,'予定').map((item,index)=>{
    if(!item||typeof item!=='object')throw new Error(`${index+1}件目の予定が正しくありません。`);
    const time=optionalString(item.time,'予定の時間',5),notice=String(item.notice??'0');
    if(time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error(`${index+1}件目の予定の時間が正しくありません。`);
    if(!['0','5','7'].includes(notice))throw new Error(`${index+1}件目の予定のお知らせが正しくありません。`);
    return {id:crypto.randomUUID(),name:requiredString(item.name,'予定名',80),date:validDate(item.date,'予定'),time,memo:optionalString(item.memo,'予定のメモ',500),notice};
  });
}
function readAnniversaries(value){
  return validArray(value,'記念日').map((item,index)=>{
    if(!item||typeof item!=='object')throw new Error(`${index+1}件目の記念日が正しくありません。`);
    return {id:crypto.randomUUID(),name:requiredString(item.name,'記念日の名前',80),date:validDate(item.date,'記念日'),repeat:Boolean(item.repeat),yearCount:Boolean(item.yearCount),countdown:Boolean(item.countdown)};
  });
}
function readEmojiItems(value){
  if(value===undefined)return[];
  return validArray(value,'絵文字の飾り',30).map((item,index)=>{
    if(!item||item.type!=='emoji')throw new Error(`${index+1}件目の飾りが正しくありません。`);
    const number=(input,fallback,min,max)=>Number.isFinite(Number(input))?Math.min(max,Math.max(min,Number(input))):fallback;
    return {id:crypto.randomUUID(),type:'emoji',text:requiredString(item.text,'絵文字',12),x:number(item.x,.5,.03,.97),y:number(item.y,.5,.03,.97),scale:number(item.scale,1,.45,2.2),rotation:number(item.rotation,0,-25,25),z:number(item.z,index+1,1,100)};
  });
}

function validateBackup(value){
  if(!value||typeof value!=='object'||value.app!==BACKUP_APP||value.formatVersion!==BACKUP_VERSION||!value.data||typeof value.data!=='object')throw new Error('「推して何日？」のバックアップファイルではありません。');
  if(value.containsPhotos!==false)throw new Error('写真を含む形式には対応していません。');
  const data=value.data,start=validDate(data.start,'推し始めた日');
  if(diff(start,todayKey())<0)throw new Error('推し始めた日が未来の日付になっています。');
  if(typeof data.color!=='string'||!Object.prototype.hasOwnProperty.call(COLORS,data.color))throw new Error('推し色が正しくありません。');
  if(!['cute','cool'].includes(data.theme))throw new Error('デザインテーマが正しくありません。');
  return {oshi:requiredString(data.oshi,'推しの名前',40),user:requiredString(data.user,'自分の名前',40),start,color:data.color,theme:data.theme,events:readEvents(data.events),anniversaries:readAnniversaries(data.anniversaries),emojiItems:readEmojiItems(data.homeDecor?.items)};
}

async function restoreBackup(file){
  if(!file)return;backupMessage('');
  if(file.size>MAX_BACKUP_BYTES){backupMessage('ファイルが大きすぎます。2MB以下のバックアップを選んでください。',true);return}
  try{
    const restored=validateBackup(JSON.parse(await file.text()));
    if(!confirm('現在の名前、日付、推し色、テーマ、予定、記念日、絵文字を、バックアップの内容に置き換えます。\n\n現在のアイコン写真とホームに貼った写真は残します。続けますか？')){backupMessage('復元を取りやめました。');return}
    const before=structuredClone(state),photos=(state.homeDecor?.items||[]).filter(item=>item?.type==='photo');
    Object.assign(state,{oshi:restored.oshi,user:restored.user,start:restored.start,color:restored.color,theme:restored.theme,events:restored.events,anniversaries:restored.anniversaries,homeDecor:{items:[...photos,...restored.emojiItems]},ready:true});
    try{await save()}catch(error){Object.keys(state).forEach(key=>delete state[key]);Object.assign(state,before);throw error}
    applyTheme();renderSettings();backupMessage('バックアップから戻しました。写真は変更していません。');toast('バックアップから戻しました');
  }catch(error){backupMessage(`${error?.message||'ファイルを読み込めませんでした。'} データは変更していません。`,true)}
}

function bindBackup(){
  const input=document.querySelector('#backup-file');
  document.querySelector('#download-backup').onclick=downloadBackup;
  document.querySelector('#choose-backup').onclick=()=>{input.value='';input.click()};
  input.onchange=()=>restoreBackup(input.files[0]);
}
document.addEventListener('oshite-ready',bindBackup,{once:true});
})();
