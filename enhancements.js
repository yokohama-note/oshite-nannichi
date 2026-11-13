(()=>{
'use strict';
const MAX_PHOTOS=3;
const MAX_IMAGE_BYTES=20*1024*1024;
let draftItems=[];
let selectedId=null;
let pendingAssetIds=[];
let removedAssetIds=[];
let editorSaved=false;
const stageUrls=new WeakMap();

const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const uid=()=>crypto.randomUUID?.()||`item-${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function withAssetStore(mode,work){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('assets',mode);
    const store=tx.objectStore('assets');
    let result;
    try{result=work(store,tx)}catch(error){db.close();reject(error);return}
    tx.oncomplete=()=>{db.close();resolve(result)};
    tx.onerror=()=>{db.close();reject(tx.error)};
    tx.onabort=()=>{db.close();reject(tx.error||new Error('画像の保存を中止しました。'))};
  });
}
function putAsset(record){return withAssetStore('readwrite',store=>store.put(record))}
function deleteAsset(id){return withAssetStore('readwrite',store=>store.delete(id))}
async function getAsset(id){
  const db=await openDB();
  return new Promise((resolve,reject)=>{const tx=db.transaction('assets');const q=tx.objectStore('assets').get(id);q.onsuccess=()=>resolve(q.result||null);q.onerror=()=>reject(q.error);tx.oncomplete=()=>db.close()});
}

function clearStageUrls(stage){const urls=stageUrls.get(stage)||[];urls.forEach(url=>URL.revokeObjectURL(url));stageUrls.delete(stage)}
function decorElement(stage,item,editable=false,urlBucket=[]){
  const el=document.createElement(editable?'button':'div');
  if(editable)el.type='button';
  el.className=`decor-item decor-${item.type}${editable&&item.id===selectedId?' selected':''}`;
  el.dataset.id=item.id;
  el.style.left=`${clamp(Number(item.x)||.5,.03,.97)*100}%`;
  el.style.top=`${clamp(Number(item.y)||.5,.03,.97)*100}%`;
  el.style.zIndex=String(Number(item.z)||1);
  el.style.setProperty('--decor-scale',String(clamp(Number(item.scale)||1,.45,2.2)));
  el.style.setProperty('--decor-rotation',`${clamp(Number(item.rotation)||0,-25,25)}deg`);
  if(item.type==='emoji'){
    const span=document.createElement('span');span.textContent=String(item.text||'♡').slice(0,12);el.append(span);
  }else{
    const img=document.createElement('img');img.alt=editable?'配置する写真':'ホームに飾った写真';img.draggable=false;el.append(img);
    getAsset(item.assetId).then(asset=>{if(!asset?.blob||stageUrls.get(stage)!==urlBucket||!img.isConnected)return;const url=URL.createObjectURL(asset.blob);urlBucket.push(url);img.src=url}).catch(()=>{});
  }
  if(editable){
    el.setAttribute('aria-label',item.type==='photo'?'写真を選ぶ':'絵文字を選ぶ');
    el.addEventListener('pointerdown',startDrag);
    el.addEventListener('click',()=>selectItem(item.id));
  }
  return el;
}
function renderDecorStage(stage,items,editable=false){
  clearStageUrls(stage);const urls=[];stageUrls.set(stage,urls);
  stage.replaceChildren();
  items.slice().sort((a,b)=>(a.z||0)-(b.z||0)).forEach(item=>stage.append(decorElement(stage,item,editable,urls)));
}
function renderHomeDecor(){
  const items=state.homeDecor?.items||[];
  const stage=document.querySelector('#scrapbook-stage');
  renderDecorStage(stage,items,false);
  const empty=document.createElement('p');empty.id='scrapbook-empty';empty.className='scrapbook-empty';empty.innerHTML='好きな写真と絵文字で<br>ホームを飾れます';
  if(!items.length)stage.append(empty);
}
function renderEditor(){renderDecorStage(document.querySelector('#scrapbook-editor-stage'),draftItems,true);syncControls()}
function selectItem(id){selectedId=id;const item=draftItems.find(x=>x.id===id);if(item){item.z=Math.max(0,...draftItems.map(x=>Number(x.z)||0))+1}renderEditor()}
function syncControls(){
  const item=draftItems.find(x=>x.id===selectedId);const controls=document.querySelector('#item-controls');controls.hidden=!item;
  if(item){document.querySelector('#item-scale').value=String(item.scale||1);document.querySelector('#item-rotation').value=String(item.rotation||0)}
}
function startDrag(event){
  event.preventDefault();
  const el=event.currentTarget,id=el.dataset.id;selectedId=id;const selected=draftItems.find(x=>x.id===id);if(selected)selected.z=Math.max(0,...draftItems.map(x=>Number(x.z)||0))+1;document.querySelectorAll('#scrapbook-editor-stage .decor-item').forEach(node=>node.classList.toggle('selected',node.dataset.id===id));syncControls();
  const stage=document.querySelector('#scrapbook-editor-stage');
  const move=e=>{const rect=stage.getBoundingClientRect();const item=draftItems.find(x=>x.id===id);if(!item)return;item.x=clamp((e.clientX-rect.left)/rect.width,.04,.96);item.y=clamp((e.clientY-rect.top)/rect.height,.06,.94);el.style.left=`${item.x*100}%`;el.style.top=`${item.y*100}%`};
  el.setPointerCapture?.(event.pointerId);el.onpointermove=move;el.onpointerup=el.onpointercancel=()=>{el.onpointermove=null;el.onpointerup=null;el.onpointercancel=null};
}
async function imageSource(file){
  if('createImageBitmap'in window){try{return await createImageBitmap(file,{imageOrientation:'from-image'})}catch{}}
  return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('写真を開けませんでした。'))};img.src=url});
}
async function resizePhoto(file,maxEdge=900){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('JPEG、PNG、WebPの写真を選んでください。');
  if(file.size>MAX_IMAGE_BYTES)throw new Error('写真が大きすぎます。20MBより小さい写真を選んでください。');
  const source=await imageSource(file);if(source.width*source.height>60000000){source.close?.();throw new Error('写真の縦横サイズが大きすぎます。別の写真を選んでください。')}
  const ratio=Math.min(1,maxEdge/Math.max(source.width,source.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(source.width*ratio));canvas.height=Math.max(1,Math.round(source.height*ratio));canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);source.close?.();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.82))||await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.82));
  if(!blob)throw new Error('写真を小さくできませんでした。');return blob;
}
async function addPhoto(file){
  const error=document.querySelector('#scrapbook-error');error.textContent='';
  if(draftItems.filter(x=>x.type==='photo').length>=MAX_PHOTOS){error.textContent='写真は3枚までです。使わない写真を削除してから追加してください。';return}
  try{const blob=await resizePhoto(file),assetId=uid(),id=uid();await putAsset({id:assetId,blob,type:blob.type,createdAt:new Date().toISOString()});pendingAssetIds.push(assetId);const photoIndex=draftItems.filter(x=>x.type==='photo').length;const positions=[[.27,.34],[.7,.44],[.46,.7]];draftItems.push({id,type:'photo',assetId,x:positions[photoIndex][0],y:positions[photoIndex][1],scale:1,rotation:[-6,5,-2][photoIndex],z:draftItems.length+1});selectedId=id;renderEditor()}catch(e){error.textContent=e.message||'写真を追加できませんでした。'}
}
function addEmoji(){
  const input=document.querySelector('#emoji-input'),text=input.value.trim();
  if(!text){document.querySelector('#scrapbook-error').textContent='キーボードから絵文字を入力してください。';return}
  const id=uid();draftItems.push({id,type:'emoji',text:text.slice(0,12),x:.52,y:.5,scale:1,rotation:0,z:draftItems.length+1});selectedId=id;input.value='';document.querySelector('#scrapbook-error').textContent='';renderEditor();
}
function openEditor(){draftItems=structuredClone(state.homeDecor?.items||[]);selectedId=null;pendingAssetIds=[];removedAssetIds=[];editorSaved=false;renderEditor();document.querySelector('#scrapbook-dialog').showModal()}
async function closeEditor(){if(!editorSaved){await Promise.allSettled(pendingAssetIds.map(deleteAsset))}clearStageUrls(document.querySelector('#scrapbook-editor-stage'));document.querySelector('#scrapbook-dialog').close()}
async function saveEditor(){
  const before=state.homeDecor;state.homeDecor={items:draftItems};
  try{await save();editorSaved=true;await Promise.allSettled(removedAssetIds.map(deleteAsset));renderHomeDecor();clearStageUrls(document.querySelector('#scrapbook-editor-stage'));document.querySelector('#scrapbook-dialog').close();toast('ホームの飾りつけを保存しました')}catch{state.homeDecor=before;document.querySelector('#scrapbook-error').textContent='保存できませんでした。空き容量を確認して、もう一度試してください。'}
}

function bytesText(bytes){if(!Number.isFinite(bytes))return'';if(bytes<1024*1024)return`${Math.max(1,Math.round(bytes/1024))}KB`;return`${(bytes/1024/1024).toFixed(1)}MB`}
async function updateStorageStatus(){
  const status=document.querySelector('#storage-status'),usage=document.querySelector('#storage-usage'),button=document.querySelector('#request-persistent-storage');
  if(!navigator.storage){status.textContent='このブラウザでは保存状態を確認できません。ブラウザデータを削除しないよう注意してください。';button.hidden=true;return}
  const persisted=await navigator.storage.persisted?.().catch(()=>false);status.textContent=persisted?'✓ このブラウザは、消えにくい保存を許可しています。':'このブラウザでは、端末の空き容量不足などでデータが整理される可能性があります。';button.hidden=Boolean(persisted)||typeof navigator.storage.persist!=='function';
  const estimate=await navigator.storage.estimate?.().catch(()=>null);if(estimate)usage.textContent=`このサイトの使用量：約${bytesText(estimate.usage)}（利用可能な保存枠：約${bytesText(estimate.quota)}）`;
}
async function requestPersistence(){
  const message=document.querySelector('#storage-message');
  if(location.protocol!=='https:'&&location.hostname!=='localhost'){message.textContent='この機能はGitHub PagesのHTTPS版をホーム画面から開いたときに利用してください。';return}
  try{const granted=await navigator.storage.persist();message.textContent=granted?'保存が整理されにくい設定になりました。':'ブラウザから許可されませんでした。空き容量を保ち、同じブラウザとURLから利用してください。';await updateStorageStatus()}catch{message.textContent='保存設定を変更できませんでした。ブラウザデータを削除しないよう注意してください。'}
}
async function deleteOnlyAppData(){
  const first=confirm('「推して何日？」に保存した名前、写真、推し色、テーマ、予定、記念日をすべて削除します。\n\n端末の写真、ほかのサイトのデータ、書き出したファイルは削除しません。');
  if(!first)return;
  if(!confirm('削除すると元に戻せません。本当に最初からやり直しますか？'))return;
  const button=document.querySelector('#delete-all');button.disabled=true;button.textContent='削除しています…';
  try{
    const db=await openDB();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(['data','assets'],'readwrite');
      tx.objectStore('data').delete('state');
      tx.objectStore('assets').clear();
      tx.oncomplete=()=>{db.close();resolve()};
      tx.onerror=()=>{db.close();reject(tx.error)};
      tx.onabort=()=>{db.close();reject(tx.error||new Error('削除を中止しました。'))};
    });
    location.reload();
  }catch{
    button.disabled=false;button.textContent='保存データを全て削除する';
    alert('削除できませんでした。データは残っています。ほかの画面でアプリを開いている場合は閉じて、もう一度試してください。');
  }
}

function fixCropper(){
  const area=document.querySelector('#crop-area'),zoom=document.querySelector('#zoom'),saveButton=document.querySelector('#crop-save'),wrap=document.querySelector('#crop-dialog .crop-wrap');
  const reset=document.createElement('button');reset.type='button';reset.className='secondary crop-reset';reset.textContent='中央に戻す';zoom.insertAdjacentElement('afterend',reset);
  const previewWrap=document.createElement('div');previewWrap.className='crop-preview-wrap';previewWrap.innerHTML='<span>保存される見え方</span><canvas id="crop-preview" width="96" height="96"></canvas>';area.insertAdjacentElement('afterend',previewWrap);
  const ringStart=21,ringSize=258;
  const constrain=()=>{if(!crop.img)return;const w=crop.img.width*crop.scale,h=crop.img.height*crop.scale;crop.x=clamp(crop.x,-Math.max(0,w/2-ringSize/2),Math.max(0,w/2-ringSize/2));crop.y=clamp(crop.y,-Math.max(0,h/2-ringSize/2),Math.max(0,h/2-ringSize/2))};
  const output=size=>{const out=document.createElement('canvas');out.width=out.height=size;const ctx=out.getContext('2d'),ratio=size/ringSize,w=crop.img.width*crop.scale,h=crop.img.height*crop.scale;ctx.drawImage(crop.img,(150-w/2+crop.x-ringStart)*ratio,(150-h/2+crop.y-ringStart)*ratio,w*ratio,h*ratio);return out};
  drawCrop=function(){const canvas=document.querySelector('#crop-canvas'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,300,300);if(!crop.img)return;constrain();const w=crop.img.width*crop.scale,h=crop.img.height*crop.scale;ctx.drawImage(crop.img,150-w/2+crop.x,150-h/2+crop.y,w,h);const preview=document.querySelector('#crop-preview'),pctx=preview.getContext('2d');pctx.clearRect(0,0,96,96);pctx.save();pctx.beginPath();pctx.arc(48,48,48,0,Math.PI*2);pctx.clip();pctx.drawImage(output(96),0,0);pctx.restore()};
  loadPhoto=async function(file){if(!file)return;if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type))return alert('JPEG、PNG、WebP、GIFの写真を選んでください。');if(file.size>MAX_IMAGE_BYTES)return alert('写真が大きすぎます。20MBより小さい写真を選んでください。');try{const img=await imageSource(file);if(img.width*img.height>60000000){img.close?.();throw new Error('写真の縦横サイズが大きすぎます。')}crop={img,x:0,y:0,scale:Math.max(ringSize/img.width,ringSize/img.height),drag:false,lx:0,ly:0};zoom.min=String(crop.scale);zoom.max=String(crop.scale*4);zoom.value=String(crop.scale);drawCrop();document.querySelector('#crop-dialog').showModal()}catch(e){alert(`${e.message||'写真を開けませんでした。'} 別の写真を選んでください。`)}};
  area.onpointerdown=e=>{crop.drag=true;crop.lx=e.clientX;crop.ly=e.clientY;area.setPointerCapture(e.pointerId)};
  area.onpointermove=e=>{if(!crop.drag)return;const ratio=300/area.getBoundingClientRect().width;crop.x+=(e.clientX-crop.lx)*ratio;crop.y+=(e.clientY-crop.ly)*ratio;crop.lx=e.clientX;crop.ly=e.clientY;drawCrop()};
  area.onpointerup=area.onpointercancel=()=>crop.drag=false;
  zoom.oninput=e=>{crop.scale=Number(e.target.value);drawCrop()};reset.onclick=()=>{crop.x=0;crop.y=0;drawCrop()};
  saveButton.onclick=async()=>{if(!crop.img)return;const previousAvatar=state.avatar,out=output(256);photoCandidate=out.toDataURL('image/jpeg',.84);state.avatar=photoCandidate;document.querySelector('#crop-dialog').close();crop.img.close?.();if(photoDestination==='settings'){try{await save();renderSettings();if(screen==='home')renderHome();toast('推しの写真を入れ替えました')}catch{state.avatar=previousAvatar;photoCandidate=previousAvatar;renderSettings();alert('写真を保存できませんでした。空き容量を確認してください。')}}else{renderSetup();toast('アイコンを決めました')}};
}

function bindEnhancements(){
  document.querySelector('#decorate-home').onclick=openEditor;
  document.querySelector('#close-scrapbook').onclick=closeEditor;
  document.querySelector('#scrapbook-dialog').addEventListener('cancel',e=>{e.preventDefault();closeEditor()});
  document.querySelector('#add-scrapbook-photo').onclick=()=>{const input=document.querySelector('#scrapbook-photo-input');input.value='';input.click()};
  document.querySelector('#scrapbook-photo-input').onchange=e=>addPhoto(e.target.files[0]);
  document.querySelector('#add-emoji').onclick=addEmoji;
  document.querySelector('#emoji-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addEmoji()}});
  document.querySelector('#item-scale').oninput=e=>{const item=draftItems.find(x=>x.id===selectedId);if(item){item.scale=Number(e.target.value);renderEditor()}};
  document.querySelector('#item-rotation').oninput=e=>{const item=draftItems.find(x=>x.id===selectedId);if(item){item.rotation=Number(e.target.value);renderEditor()}};
  document.querySelector('#delete-decor-item').onclick=()=>{const item=draftItems.find(x=>x.id===selectedId);if(!item)return;if(item.type==='photo'){if(pendingAssetIds.includes(item.assetId)){deleteAsset(item.assetId);pendingAssetIds=pendingAssetIds.filter(id=>id!==item.assetId)}else removedAssetIds.push(item.assetId)}draftItems=draftItems.filter(x=>x.id!==selectedId);selectedId=null;renderEditor()};
  document.querySelector('#save-scrapbook').onclick=saveEditor;
  document.querySelector('#request-persistent-storage').onclick=requestPersistence;
  document.querySelector('#delete-all').onclick=deleteOnlyAppData;
  fixCropper();renderHomeDecor();updateStorageStatus();
  const baseRenderHome=renderHome;renderHome=function(){baseRenderHome();renderHomeDecor()};
}
document.addEventListener('oshite-ready',bindEnhancements,{once:true});
})();
