const $=id=>document.getElementById(id);
const KEY='sharedmind-collage-playground-v1', W=900,H=1200,MAX_ITEMS=30,MAX_ASSETS=8;
const proxyUrl='https://itp-ima-replicate-proxy.web.app/api/create_n_get';
const imageModel='black-forest-labs/flux-schnell';
const authToken=''; // Course example: no personal credentials.
const fonts={sans:'Arial, Helvetica, sans-serif',serif:'Georgia, "Times New Roman", serif',mono:'"Courier New", monospace'};
const clone=o=>JSON.parse(JSON.stringify(o)),uid=()=>crypto.randomUUID();
const canvas=$('canvas'),ctx=canvas.getContext('2d'),images=new Map();
let scene,selected=null,history=[],gesture=null,saveTimer,toastTimer,playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,time=0,last=performance.now(),generating=false,propertySession=null,storageBlocked=false;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
function notify(s){$('toast').textContent=s;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500)}
function base(type,x,y,width,height,extra={}){return {id:uid(),type,x,y,width,height,rotation:0,z:0,locked:false,style:{color:'#161616'},crop:'rect',animation:'none',seed:Math.floor(Math.random()*1e9),...extra}}
function textItem(text,x,y,width,height,fontSize,color='#161616',extra={}){return base('text',x,y,width,height,{text,style:{color,fontSize,fontFamily:'sans',fontWeight:'900',align:'left'},...extra})}
function demo(){return {schemaVersion:1,canvas:{width:W,height:H,background:'#f4efdf'},assets:{},items:[base('shape',730,310,340,340,{shape:'circle',style:{color:'#ed512d'}}),base('shape',440,840,750,240,{shape:'strip',rotation:-9,style:{color:'#bce44b'}}),base('shape',665,690,280,280,{shape:'star',rotation:12,style:{color:'#214fe4'},animation:'wiggle'}),base('shape',175,744,220,80,{shape:'arrow',rotation:-30,style:{color:'#ed512d'}}),textItem('CUT.\nPASTE.\nPLAY.',440,390,740,530,160),textItem('GOOD THINGS\nTAKE SHAPE.',414,869,610,170,71,'#161616',{rotation:-9}),textItem('想象，不必整齐。',328,1050,510,65,42),textItem('01 / DEMO — ALL PIECES EDITABLE',367,100,610,35,20),textItem('AN EXPERIMENT IN MAKING THINGS YOURS.',451,1142,746,30,17)]}}
function normalizeZ(){scene.items.forEach((i,n)=>i.z=n)}
function current(){return scene.items.find(i=>i.id===selected)}
function checkpoint(snapshot=scene){history.push(clone(snapshot));if(history.length>40)history.shift();$('undo').disabled=false}
function persist(){clearTimeout(saveTimer);if(storageBlocked){$('saveStatus').textContent='Existing archive could not be restored. Export JSON before replacing it.';$('saveStatus').classList.add('error');return false}try{localStorage.setItem(KEY,JSON.stringify(scene));$('saveStatus').textContent='Saved locally · this browser';$('saveStatus').classList.remove('error');return true}catch(e){$('saveStatus').textContent='Local save failed (storage full or disabled). Use Save JSON to back up.';$('saveStatus').classList.add('error');return false}}
function changed(debounce=false){normalizeZ();$('count').textContent=`${scene.items.length} / 30 PIECES · ${Object.keys(scene.assets).length} / 8 IMAGES`;if(debounce){clearTimeout(saveTimer);saveTimer=setTimeout(persist,450)}else return persist()}
function keepVisible(i){i.x=Math.max(20,Math.min(W-20,i.x));i.y=Math.max(20,Math.min(H-20,i.y))}
function add(i){if(scene.items.length>=MAX_ITEMS)return notify('Your poster has 30 pieces. Delete a piece to add another.');checkpoint();scene.items.push(i);selected=i.id;changed();sync()}
function sync(){const i=current();$('properties').hidden=!i;$('emptyHint').hidden=!!i;$('selectionTitle').textContent=i?`${i.type==='text'?'Text':i.type==='image'?'Image':'Shape'} / ${String(i.z+1).padStart(2,'0')}`:'The details.';$('undo').disabled=!history.length;$('play').textContent=playing?'Pause':'Play';$('background').value=scene.canvas.background;if(!i)return;for(const k of ['x','y','width','height','rotation'])$(k).value=Math.round(i[k]);$('angle').textContent=`${Math.round(i.rotation)}°`;$('lock').textContent=i.locked?'Unlock':'Lock';$('textProps').hidden=i.type!=='text';$('imageProps').hidden=i.type!=='image';$('colorLabel').hidden=i.type==='image';$('color').value=i.style.color;$('animation').value=i.animation;$('crop').value=i.crop;$('imageSource').hidden=!i.source;$('imageSource').textContent=i.source?`${i.source.model} · ${i.source.prompt}`:'';if(i.type==='text'){for(const k of ['fontSize','fontWeight','fontFamily','align'])$(k).value=i.style[k];$('text').value=i.text}for(const el of $('properties').querySelectorAll('input,textarea,select'))el.disabled=i.locked}
function animation(i,t){if(reduced.matches||gesture?.id===i.id||propertySession===i.id)return {dy:0,dr:0};return {dy:i.animation==='float'?Math.sin(t*1.8+i.seed)*9:0,dr:i.animation==='wiggle'?Math.sin(t*2+i.seed)*3:0}}
function transform(i,t){const a=animation(i,t);return {x:i.x,y:i.y+a.dy,r:(i.rotation+a.dr)*Math.PI/180}}
function path(c,i){const w=i.width,h=i.height;c.beginPath();if(i.crop==='circle'&&i.type==='image'||i.shape==='circle'){c.ellipse(0,0,w/2,h/2,0,0,Math.PI*2)}else if(i.shape==='star'){for(let n=0;n<20;n++){const a=n*Math.PI/10-Math.PI/2,r=n%2?.43:1;const x=Math.cos(a)*w/2*r,y=Math.sin(a)*h/2*r;n?c.lineTo(x,y):c.moveTo(x,y)}c.closePath()}else if(i.shape==='arrow'){const pts=[[-.5,-.18],[.12,-.18],[.12,-.5],[.5,0],[.12,.5],[.12,.18],[-.5,.18]];pts.forEach(([x,y],n)=>n?c.lineTo(x*w,y*h):c.moveTo(x*w,y*h));c.closePath()}else if(i.crop==='torn'&&i.type==='image'){let s=i.seed;const rand=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296};const N=22;c.moveTo(-w/2,-h/2);for(let n=1;n<=N;n++)c.lineTo(-w/2+n*w/N,-h/2+rand()*12);for(let n=1;n<=N;n++)c.lineTo(w/2-rand()*12,-h/2+n*h/N);for(let n=1;n<=N;n++)c.lineTo(w/2-n*w/N,h/2-rand()*12);for(let n=1;n<=N;n++)c.lineTo(-w/2+rand()*12,h/2-n*h/N);c.closePath()}else c.rect(-w/2,-h/2,w,h)}
function drawScene(c,t){c.fillStyle=scene.canvas.background;c.fillRect(0,0,W,H);for(const i of scene.items){const tr=transform(i,t);c.save();c.translate(tr.x,tr.y);c.rotate(tr.r);if(i.type==='text'){c.scale(i.width/(i.textBoxWidth||i.width),i.height/(i.textBoxHeight||i.height));const w=i.textBoxWidth||i.width,h=i.textBoxHeight||i.height;c.fillStyle=i.style.color;c.font=`${i.style.fontWeight} ${i.style.fontSize}px ${fonts[i.style.fontFamily]}`;c.textAlign=i.style.align;c.textBaseline='top';const x=i.style.align==='left'?-w/2:i.style.align==='right'?w/2:0;i.text.split('\n').forEach((line,n)=>c.fillText(line,x,-h/2+n*i.style.fontSize*1.08,w))}else{path(c,i);if(i.type==='image'){c.clip();const im=images.get(i.assetId);if(im){const scale=Math.max(i.width/im.width,i.height/im.height);c.drawImage(im,-im.width*scale/2,-im.height*scale/2,im.width*scale,im.height*scale)}}else{c.fillStyle=i.style.color;c.fill()}}c.restore()}}
function local(p,i,t=time){const tr=transform(i,t),dx=p.x-tr.x,dy=p.y-tr.y;return {x:dx*Math.cos(tr.r)+dy*Math.sin(tr.r),y:-dx*Math.sin(tr.r)+dy*Math.cos(tr.r)}}
function point(e){const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height}}
function scaleDisplay(){return canvas.getBoundingClientRect().width/W}
function selection(){const i=current();if(!i)return;const tr=transform(i,time),s=scaleDisplay(),handle=8/s;ctx.save();ctx.translate(tr.x,tr.y);ctx.rotate(tr.r);ctx.strokeStyle=i.locked?'#777':'#2153e7';ctx.fillStyle='#fff';ctx.lineWidth=1.3/s;ctx.setLineDash(i.locked?[5/s,4/s]:[]);ctx.strokeRect(-i.width/2,-i.height/2,i.width,i.height);if(!i.locked){ctx.setLineDash([]);for(const x of [-i.width/2,i.width/2])for(const y of [-i.height/2,i.height/2]){ctx.fillRect(x-handle/2,y-handle/2,handle,handle);ctx.strokeRect(x-handle/2,y-handle/2,handle,handle)}ctx.beginPath();ctx.moveTo(0,-i.height/2);ctx.lineTo(0,-i.height/2-26/s);ctx.stroke();ctx.beginPath();ctx.arc(0,-i.height/2-26/s,5/s,0,Math.PI*2);ctx.fill();ctx.stroke()}ctx.restore()}
function fit(){const r=canvas.parentElement.getBoundingClientRect(),s=Math.min(r.width/W,(r.height-36)/H);canvas.style.width=`${W*s}px`;canvas.style.height=`${H*s}px`;canvas.width=Math.round(W*s*devicePixelRatio);canvas.height=Math.round(H*s*devicePixelRatio)}
function frame(now){if(playing)time+=(now-last)/1000;last=now;ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);drawScene(ctx,time);selection();requestAnimationFrame(frame)}
canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;document.activeElement?.blur();propertySession=null;const p=point(e);let i=current(),mode='move';if(i&&!i.locked){const l=local(p,i),t=13/scaleDisplay();if(Math.hypot(l.x,l.y+i.height/2+26/scaleDisplay())<t)mode='rotate';else if(Math.abs(Math.abs(l.x)-i.width/2)<t&&Math.abs(Math.abs(l.y)-i.height/2)<t)mode='resize';else i=null}else i=null;if(!i){i=[...scene.items].reverse().find(a=>{const l=local(p,a);return Math.abs(l.x)<=a.width/2&&Math.abs(l.y)<=a.height/2});}selected=i?.id||null;sync();if(!i||i.locked)return;gesture={id:i.id,pointerId:e.pointerId,mode,start:p,original:clone(i),before:clone(scene),moved:false};canvas.setPointerCapture(e.pointerId);e.preventDefault()});
canvas.addEventListener('pointermove',e=>{if(!gesture)return;const i=current(),p=point(e),g=gesture,o=g.original;if(Math.hypot(p.x-g.start.x,p.y-g.start.y)<2&&!g.moved)return;g.moved=true;if(g.mode==='move'){i.x=o.x+p.x-g.start.x;i.y=o.y+p.y-g.start.y;keepVisible(i)}else if(g.mode==='rotate'){const a=Math.atan2(p.y-o.y,p.x-o.x)-Math.atan2(g.start.y-o.y,g.start.x-o.x);i.rotation=((o.rotation+a*180/Math.PI+540)%360)-180}else{const ratio=Math.hypot(p.x-o.x,p.y-o.y)/Math.max(1,Math.hypot(g.start.x-o.x,g.start.y-o.y));resize(i,Math.max(20/o.width,20/o.height,Math.min(ratio,1800/o.width,2400/o.height)));keepVisible(i)}sync()});
function resize(i,ratio){const o=gesture?.original||clone(i);if(i.type==='text'){i.textBoxWidth=o.textBoxWidth||o.width;i.textBoxHeight=o.textBoxHeight||o.height}i.width=o.width*ratio;i.height=o.height*ratio}
function endGesture(e){if(!gesture)return;if(gesture.moved){checkpoint(gesture.before);changed()}gesture=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);sync()}
canvas.addEventListener('pointerup',endGesture);canvas.addEventListener('pointercancel',endGesture);
$('undo').onclick=()=>{if(!history.length)return;scene=history.pop();selected=scene.items.some(i=>i.id===selected)?selected:null;changed();sync()};
$('addText').onclick=()=>add(textItem('YOUR NEXT\nBIG IDEA',450,550,600,190,80));
document.querySelectorAll('[data-shape]').forEach(b=>b.onclick=()=>add(base('shape',450,600,b.dataset.shape==='strip'?440:240,b.dataset.shape==='strip'?100:240,{shape:b.dataset.shape,style:{color:['#ed512d','#214fe4','#bce44b'][Math.floor(Math.random()*3)]}})));
$('duplicate').onclick=()=>{const i=current();if(!i)return;const copy=clone(i);copy.id=uid();copy.x+=25;copy.y+=25;copy.locked=false;keepVisible(copy);add(copy)};
$('delete').onclick=()=>{const i=current();if(!i)return;if(i.locked)return notify('Unlock this piece before deleting it.');checkpoint();scene.items=scene.items.filter(a=>a!==i);prune();selected=null;changed();sync()};
function prune(){const used=new Set(scene.items.filter(i=>i.type==='image').map(i=>i.assetId));for(const id of Object.keys(scene.assets))if(!used.has(id))delete scene.assets[id]}
$('lock').onclick=()=>{const i=current();if(i){checkpoint();i.locked=!i.locked;changed();sync()}};
for(const [id,d] of [['forward',1],['backward',-1]])$(id).onclick=()=>{const i=current();if(!i||i.locked)return;const n=scene.items.indexOf(i),next=n+d;if(next<0||next>=scene.items.length)return;checkpoint();[scene.items[n],scene.items[next]]=[scene.items[next],scene.items[n]];changed();sync()};
for(const k of ['x','y','width','height','rotation','text','fontSize','fontWeight','fontFamily','align','color','crop','animation']){const el=$(k);el.addEventListener('focus',()=>{if(current()&&!current().locked){propertySession=selected;el.dataset.recorded=''}});el.addEventListener('blur',()=>{propertySession=null;el.dataset.recorded='';persist()});el.addEventListener('input',()=>{const i=current();if(!i||i.locked)return;if(!el.dataset.recorded){checkpoint();el.dataset.recorded='yes'}if(['x','y','rotation'].includes(k)){if(!Number.isFinite(el.valueAsNumber))return;i[k]=k==='rotation'?Math.max(-180,Math.min(180,el.valueAsNumber)):el.valueAsNumber;keepVisible(i)}else if(k==='width'||k==='height'){const n=el.valueAsNumber;if(!Number.isFinite(n))return;const ratio=Math.max(20/i.width,20/i.height,Math.min(n/i[k],1800/i.width,2400/i.height));resize(i,ratio);keepVisible(i);$(k==='width'?'height':'width').value=Math.round(i[k==='width'?'height':'width'])}else if(k==='text')i.text=el.value;else if(['crop','animation'].includes(k))i[k]=el.value;else i.style[k]=k==='fontSize'?Math.max(8,Math.min(300,Number(el.value)||8)):el.value;$('angle').textContent=`${Math.round(i.rotation)}°`;changed(true)})}
$('background').addEventListener('focus',()=>{$('background').dataset.recorded=''});$('background').oninput=()=>{if(!$('background').dataset.recorded){checkpoint();$('background').dataset.recorded='yes'}scene.canvas.background=$('background').value;changed(true)};
$('play').onclick=()=>{playing=!playing;if(playing&&reduced.matches)notify('Reduced motion is enabled; animation remains still.');sync()};reduced.addEventListener('change',e=>{if(e.matches)playing=false;sync()});
let arrangement=0;$('shuffle').onclick=()=>{const unlocked=scene.items.filter(i=>!i.locked);if(!unlocked.length)return notify('Unlock a piece to Shuffle.');checkpoint();const mode=arrangement++%3;unlocked.forEach((i,n)=>{const f=(n+.5)/unlocked.length;resize(i,.8+Math.random()*.35);i.width=Math.min(i.width,1200);i.height=Math.min(i.height,1600);if(mode===0){const a=n*2.4;i.x=450+Math.cos(a)*230;i.y=240+f*740}else if(mode===1){i.x=200+f*500;i.y=180+f*850}else{const cols=3,rows=Math.ceil(unlocked.length/cols);i.x=155+n%cols*295+(Math.random()-.5)*80;i.y=130+(Math.floor(n/cols)+.5)*(940/rows)}i.rotation=(Math.random()-.5)*30;keepVisible(i)});changed();sync();notify(['Center focus','Diagonal rhythm','Scattered collage'][mode]+' · local Shuffle')};
document.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,[contenteditable]'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$('undo').click()}else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();$('delete').click()}else if(e.key==='Escape'){selected=null;sync()}});
function readData(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Could not read image.'));r.readAsDataURL(blob)})}
function decode(src){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Could not decode image.'));im.src=src})}
async function compress(blob){if(blob.size>20*1024*1024)throw Error('Please choose an image smaller than 20 MB.');if(!['image/png','image/jpeg','image/webp'].includes(blob.type))throw Error('Use a PNG, JPEG, or WebP image.');const im=await decode(await readData(blob));if(im.width*im.height>60000000)throw Error('Image dimensions are too large.');const s=Math.min(1,512/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*s));c.height=Math.max(1,Math.round(im.height*s));c.getContext('2d').drawImage(im,0,0,c.width,c.height);const data=c.toDataURL('image/webp',.84);return {data,width:c.width,height:c.height}}
async function insertImage(blob, source=null, signal=null) {
  const asset=await compress(blob);
  const im=await decode(asset.data);
  // Recheck after async image processing: the user may still be editing.
  signal?.throwIfAborted();
  if(scene.items.length>=MAX_ITEMS)throw Error('The poster has 30 pieces. Delete one before adding an image.');
  const existing=Object.entries(scene.assets).find(([,a])=>a.data===asset.data);
  if(!existing&&Object.keys(scene.assets).length>=MAX_ASSETS)throw Error('The project holds 8 different images. Delete an unused image first.');
  const id=existing?.[0]||uid();
  if(gesture)endGesture({pointerId:gesture.pointerId});
  checkpoint();
  if(!existing)scene.assets[id]=asset;
  images.set(id,im);
  const w=Math.max(20,Math.min(430,asset.width)),h=Math.max(20,Math.min(800,w*asset.height/asset.width));
  const item=base('image',450,600,w,h,{assetId:id});
  // Provenance belongs to the editable item, so shared pixels need no duplication.
  if(source)item.source={kind:'ai',prompt:source.prompt,model:source.model};
  scene.items.push(item);
  selected=item.id;
  const saved=changed();
  sync();
  return {item,saved};
}
$('upload').onclick=()=>$('fileInput').click();$('fileInput').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{await insertImage(f);notify('Image added · processed locally')}catch(err){notify(err.message)}};
async function download(blob,name){try{const data=await readData(blob),a=$('exportDownload');a.href=data;a.download=name;const png=blob.type==='image/png';$('exportTitle').textContent=png?'Your poster.':'Your editable scene.';$('exportPreview').hidden=!png;$('exportJsonPreview').hidden=png;if(png)$('exportPreview').src=data;else $('exportJsonPreview').value=await blob.text();$('exportDialog').showModal();a.click()}catch{notify('Could not prepare the download. Your scene is unchanged.')}}
$('closeExport').onclick=()=>$('exportDialog').close();
$('saveJson').onclick=()=>download(new Blob([JSON.stringify(scene,null,2)],{type:'application/json'}),'collage-playground.json');
$('export').onclick=()=>{try{const c=document.createElement('canvas');c.width=W;c.height=H;drawScene(c.getContext('2d'),time);c.toBlob(b=>{if(b)download(b,'collage-playground.png');else notify('PNG export failed. Your scene is unchanged.')},'image/png')}catch(e){notify('PNG export failed. Your editable scene is unchanged.')}};
function validate(raw){const fail=()=>{throw Error('Invalid or unsupported collage JSON. Current work is unchanged.')};const obj=o=>o&&typeof o==='object'&&!Array.isArray(o);const num=(n,a,b)=>typeof n==='number'&&Number.isFinite(n)&&n>=a&&n<=b;const color=s=>typeof s==='string'&&/^#[0-9a-f]{6}$/i.test(s);const identifier=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(s)&&!['__proto__','constructor','prototype'].includes(s);if(!obj(raw)||raw.schemaVersion!==1||!obj(raw.canvas)||raw.canvas.width!==W||raw.canvas.height!==H||!color(raw.canvas.background)||!obj(raw.assets)||!Array.isArray(raw.items)||raw.items.length>MAX_ITEMS||Object.keys(raw.assets).length>MAX_ASSETS)fail();const assets={};for(const [id,a]of Object.entries(raw.assets)){if(!identifier(id)||!obj(a)||typeof a.data!=='string'||a.data.length>2000000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(a.data)||!num(a.width,1,512)||!num(a.height,1,512)||!Number.isInteger(a.width)||!Number.isInteger(a.height))fail();assets[id]={data:a.data,width:a.width,height:a.height}}
const ids=new Set();const items=raw.items.map((i,n)=>{if(!obj(i)||!identifier(i.id)||ids.has(i.id)||!['text','shape','image'].includes(i.type)||!num(i.x,-1800,2700)||!num(i.y,-2400,3600)||!num(i.width,20,1800)||!num(i.height,20,2400)||!num(i.rotation,-180,180)||!num(i.z,0,29)||typeof i.locked!=='boolean'||!obj(i.style)||!color(i.style.color)||!['rect','circle','torn'].includes(i.crop)||!['none','float','wiggle'].includes(i.animation)||!num(i.seed,0,4294967295))fail();ids.add(i.id);const out=base(i.type,i.x,i.y,i.width,i.height,{id:i.id,rotation:i.rotation,z:i.z,locked:i.locked,crop:i.crop,animation:i.animation,seed:i.seed,style:{color:i.style.color}});if(i.type==='text'){if(typeof i.text!=='string'||i.text.length>2000||!num(i.style.fontSize,8,300)||!['400','700','900'].includes(i.style.fontWeight)||!Object.hasOwn(fonts,i.style.fontFamily)||!['left','center','right'].includes(i.style.align))fail();out.text=i.text;out.style={color:i.style.color,fontSize:i.style.fontSize,fontWeight:i.style.fontWeight,fontFamily:i.style.fontFamily,align:i.style.align};if(i.textBoxWidth!==undefined||i.textBoxHeight!==undefined){if(!num(i.textBoxWidth,20,1800)||!num(i.textBoxHeight,20,2400))fail();out.textBoxWidth=i.textBoxWidth;out.textBoxHeight=i.textBoxHeight}}else if(i.type==='image'){if(!identifier(i.assetId)||!Object.hasOwn(assets,i.assetId))fail();out.assetId=i.assetId;if(i.source!==undefined){if(!obj(i.source)||i.source.kind!=='ai'||typeof i.source.prompt!=='string'||i.source.prompt.length>1500||typeof i.source.model!=='string'||!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/.test(i.source.model)||i.source.model.length>200)fail();out.source={kind:'ai',prompt:i.source.prompt,model:i.source.model}}}else{if(!['circle','star','arrow','strip'].includes(i.shape))fail();out.shape=i.shape}keepVisible(out);return out});items.sort((a,b)=>a.z-b.z);items.forEach((i,n)=>i.z=n);return {schemaVersion:1,canvas:{width:W,height:H,background:raw.canvas.background},assets,items}}
async function prepare(s){const loaded=new Map();await Promise.all(Object.entries(s.assets).map(async([id,a])=>{const im=await decode(a.data);if(im.width!==a.width||im.height!==a.height||Math.max(im.width,im.height)>512)throw Error('Image dimensions do not match the saved asset.');loaded.set(id,im)}));return loaded}
$('loadJson').onclick=()=>$('jsonInput').click();$('jsonInput').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{if(f.size>12*1024*1024)throw Error('JSON must be smaller than 12 MB.');const next=validate(JSON.parse(await f.text()));const loaded=await prepare(next);if(!confirm('Replace the current poster with this JSON? You can Undo this import.'))return;checkpoint();scene=next;for(const [id,im]of loaded)images.set(id,im);storageBlocked=false;selected=null;changed();sync();notify('Editable scene imported.')}catch(err){notify(err instanceof SyntaxError?'This file is not valid JSON. Current work is unchanged.':err.message)}};
function proxyErrorText(value) {
  if(typeof value==='string')return value.slice(0,300);
  if(value&&typeof value==='object')return JSON.stringify(value).slice(0,300);
  return '';
}
function imageOutputUrl(output) {
  for(const candidate of Array.isArray(output)?output:[output]) {
    if(typeof candidate!=='string')continue;
    try {
      const url=new URL(candidate);
      if(url.protocol==='https:'&&!url.username&&!url.password)return url.href;
    } catch { /* Skip invalid array entries; never concatenate URLs. */ }
  }
  return null;
}
// Exactly one binding and one POST per explicit click. No retry or polling.
$('generate').onclick=async()=>{
  if(generating)return;
  const originalPrompt=$('prompt').value;
  const prompt=originalPrompt.trim();
  if(!prompt)return notify('Describe one image you would like to add.');
  if(originalPrompt.length>1500)return notify('Please keep the prompt within 1,500 characters.');
  if(scene.items.length>=MAX_ITEMS||Object.keys(scene.assets).length>=MAX_ASSETS)return notify('This project is full. Remove a piece or image before generating.');
  generating=true;
  const button=$('generate'),buttonLabel=button.textContent;
  button.disabled=true;
  button.textContent='Generating...';
  $('resultLink').hidden=true;
  $('aiStatus').classList.remove('error');
  $('aiStatus').textContent='Generating...';
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),90000);
  let resultUrl=null,stage='proxy',httpStatus=null,predictionStatus=null;
  const requestedAt=new Date().toISOString();
  try {
    const finalPrompt=`${prompt}\n\nCreate a single standalone image asset for a magazine collage: one clearly defined subject, simple background and composition. No text, lettering, logos, or watermarks. Do not create a complete poster or a collage layout.`;
    const response=await fetch(proxyUrl,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${authToken}`},
      body:JSON.stringify({model:imageModel,input:{prompt:finalPrompt}}),
      signal:controller.signal
    });
    httpStatus=response.status;
    let prediction;
    try { prediction=await response.json(); }
    catch(error) {
      if(error.name==='AbortError')throw error;
      throw Error(response.ok?'School proxy returned invalid JSON.':`School proxy HTTP ${response.status} — non-JSON error response.`);
    }
    const isRecord=prediction&&typeof prediction==='object'&&!Array.isArray(prediction);
    const detail=isRecord?proxyErrorText(prediction.error||prediction.detail||prediction.message):'';
    if(!response.ok)throw Error(`School proxy HTTP ${response.status}${detail?`: ${detail}`:[401,403].includes(response.status)?' — permission denied.':''}`);
    if(!isRecord)throw Error('Unexpected proxy response: expected a prediction object.');
    predictionStatus=typeof prediction.status==='string'?prediction.status.slice(0,80):null;
    if(prediction.error)throw Error(`School proxy: ${proxyErrorText(prediction.error)||'Unknown error'}`);
    if(prediction.status!==undefined&&prediction.status!=='succeeded')throw Error(`Model status: ${predictionStatus||'invalid'}. No finished image was added. No automatic retry.`);
    resultUrl=imageOutputUrl(prediction.output);
    if(!resultUrl)throw Error('The proxy returned no valid finished image URL.');
    stage='image-download';
    $('aiStatus').textContent='Image generated. Downloading image content...';
    const downloaded=await fetch(resultUrl,{signal:controller.signal,mode:'cors',credentials:'omit'});
    if(!downloaded.ok)throw Error(`Image download HTTP ${downloaded.status}`);
    const blob=await downloaded.blob();
    stage='image-import';
    const {saved}=await insertImage(blob,{prompt:originalPrompt,model:imageModel},controller.signal);
    if(saved)$('aiStatus').textContent='Image added and saved locally.';
    else {
      $('aiStatus').classList.add('error');
      $('aiStatus').textContent='图片生成成功，已加入画布，但本地存档保存失败。Use Save JSON now; the previous archive is preserved.';
      $('resultLink').href=resultUrl;
      $('resultLink').hidden=false;
    }
  } catch(error) {
    const timedOut=error.name==='AbortError';
    // No prompts, image data, signed image URLs, or complete responses in logs.
    console.warn('[Collage AI]',{requestedAt,proxyUrl,model:imageModel,stage,httpStatus,predictionStatus,error:timedOut?'Timed out':error.message});
    $('aiStatus').classList.add('error');
    if(resultUrl) {
      $('aiStatus').textContent='图片生成成功，但还未保存到本地。Open the image, download it, then use Upload. '+(timedOut?'Image transfer timed out; no new generation was requested.':error.message);
      $('resultLink').href=resultUrl;
      $('resultLink').hidden=false;
    } else if(httpStatus>=500&&stage==='proxy') {
      $('aiStatus').textContent=`${error.message} — 学校代理返回服务端错误，未取得图片。仅凭此响应无法确定原因；请将错误、模型 ${imageModel} 和请求时间 ${requestedAt} 提供给课程代理维护者检查服务端日志。不会自动重试，你的海报保持不变。`;
    } else {
      $('aiStatus').textContent=timedOut?'Request timed out. The cloud task may still be running; timeout does not cancel it. No automatic retry. Your poster is unchanged.':`Generation failed: ${error.message} Your poster is unchanged.`;
    }
  } finally {
    clearTimeout(timer);
    generating=false;
    button.disabled=false;
    button.textContent=buttonLabel;
  }
};
async function init(){let raw=null;try{raw=localStorage.getItem(KEY)}catch{$('saveStatus').textContent='Local storage unavailable. Use Save JSON.';$('saveStatus').classList.add('error')}if(raw){try{scene=validate(JSON.parse(raw));const loaded=await prepare(scene);for(const [id,im]of loaded)images.set(id,im)}catch{storageBlocked=true;scene={schemaVersion:1,canvas:{width:W,height:H,background:'#f4efdf'},assets:{},items:[]};notify('Saved work could not be restored. The existing archive has been preserved.')}}else scene=demo();normalizeZ();changed();sync();new ResizeObserver(fit).observe(canvas.parentElement);fit();requestAnimationFrame(frame)}
window.addEventListener('pagehide',()=>{if(scene)persist()});init();
