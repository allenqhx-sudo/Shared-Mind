// App source and these checks run in one isolated test module, with fake storage.
const assert=(condition,message)=>{if(!condition)throw Error(message)};
const report=message=>parent.report('PASS · '+message);
const snapshot=()=>JSON.stringify(scene);
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const jsonEqual=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const pixelCanvas=document.createElement('canvas');pixelCanvas.width=1024;pixelCanvas.height=768;
const pc=pixelCanvas.getContext('2d');pc.fillStyle='#fe572a';pc.fillRect(30,30,950,650);
const testBlob=await new Promise(resolve=>pixelCanvas.toBlob(resolve,'image/png'));
let calls=[],fixture,hold;
window.fetch=async(url,options={})=>{
  calls.push({url,options});
  if(url===proxyUrl)return fixture(options);
  if(url==='https://mock.invalid/asset.png')return new Response(testBlob);
  if(url==='https://mock.invalid/cors.png')throw new TypeError('Mock CORS blocked');
  if(url==='https://mock.invalid/broken.png')return new Response('not an image',{headers:{'Content-Type':'image/png'}});
  if(url==='https://mock.invalid/http.png')return new Response('',{status:503});
  throw Error('Unexpected request blocked by test: '+url);
};
try {
  await init();
  if(parent.testPhase===1) {
    const original=snapshot(),oldCount=scene.items.length,oldHistory=history.length;
    $('prompt').value='   ';await $('generate').onclick();assert(calls.length===0,'Empty prompt sent a request');
    $('prompt').value='橘子与蓝色盘子';
    fixture=()=>new Promise(resolve=>{hold=resolve});
    const task=$('generate').onclick();
    assert($('generate').disabled&&$('generate').textContent==='Generating...','Missing busy state');
    await $('generate').onclick();assert(calls.length===1,'Duplicate POST');
    hold(response({status:'succeeded',output:[null,'invalid','javascript:bad','https://mock.invalid/asset.png','https://mock.invalid/ignored.png']}));
    await task;
    assert(calls.length===2&&calls[0].options.method==='POST','Expected exactly one POST and one image fetch');
    const body=JSON.parse(calls[0].options.body);
    assert(jsonEqual(Object.keys(body).sort(),['input','model'])&&jsonEqual(Object.keys(body.input),['prompt']),'Unexpected outbound fields');
    assert(body.model===imageModel&&body.input.prompt.startsWith('橘子与蓝色盘子'),'Prompt/model incorrect');
    assert(calls[0].options.headers.Authorization==='Bearer ','Auth must remain empty');
    assert(calls[1].options.mode==='cors'&&calls[1].options.credentials==='omit','Unsafe image download');
    assert(scene.items.length===oldCount+1&&history.length===oldHistory+1,'History or existing pieces replaced');
    assert(jsonEqual(scene.items.slice(0,oldCount),JSON.parse(original).items),'Existing pieces changed');
    const item=current(),asset=scene.assets[item.assetId];
    assert(asset.width===512&&asset.height===384&&asset.data.startsWith('data:image/'),'Image not compressed and embedded');
    assert(item.source.prompt==='橘子与蓝色盘子'&&item.source.model===imageModel,'Provenance missing');
    assert($('aiStatus').textContent==='Image added and saved locally.','Success state incorrect');
    assert(!generating&&!$('generate').disabled,'Busy state not reset');
    parent.testExpected=JSON.parse(snapshot());
    report('single POST, duplicate-click guard, request privacy, valid array URL, real decoding/compression, independent image, metadata, history, local save');
    parent.testPhase=2;
    parent.remount(); // Fresh document, actual app init, same in-memory archive.
  } else {
    assert(jsonEqual(scene,parent.testExpected),'Fresh document did not restore scene');
    const image=scene.items.at(-1);selected=image.id;sync();
    assert(images.has(image.assetId)&&image.source.prompt==='橘子与蓝色盘子','Restored image or metadata missing');
    report('fresh document restores complete scene, image pixels, prompt and model');
    const beforeEdit=snapshot();
    $('rotation').focus();$('rotation').value='25';$('rotation').dispatchEvent(new Event('input'));$('rotation').blur();
    assert(current().rotation===25,'Generated image not editable');
    $('undo').onclick();assert(snapshot()===beforeEdit,'Image edit Undo failed');
    const beforeDuplicate=Object.keys(scene.assets).length;$('duplicate').onclick();
    assert(Object.keys(scene.assets).length===beforeDuplicate&&current().source.prompt===image.source.prompt,'Duplicate image or metadata broken');
    $('undo').onclick();
    let exported=null;const realDownload=download;
    download=async blob=>{exported=blob};$('export').onclick();
    for(let n=0;!exported&&n<100;n++)await new Promise(resolve=>setTimeout(resolve,10));
    assert(exported?.type==='image/png','PNG export failed');
    const decoded=await decode(await readData(exported));assert(decoded.width===900&&decoded.height===1200,'PNG dimensions wrong');
    exported=null;await $('saveJson').onclick();
    const json=validate(JSON.parse(await exported.text()));await prepare(json);
    assert(jsonEqual(json,scene),'JSON roundtrip loses pixels or provenance');download=realDownload;
    report('generated image independently edits, duplicates and undoes; real Canvas exports PNG 900×1200; JSON roundtrip retains pixels/metadata');
    const errorCases=[
      ['HTTP 500 server error',()=>response({error:'Internal server error'},500),'学校代理返回服务端错误'],
      ['HTTP permission',()=>response({error:'School access denied'},403),'HTTP 403'],
      ['non-JSON HTTP',()=>new Response('Access denied',{status:401}),'HTTP 401'],
      ['malformed JSON',()=>new Response('{oops'),'invalid JSON'],
      ['null response',()=>response(null),'prediction object'],
      ['array response',()=>response([]),'prediction object'],
      ['proxy error',()=>response({error:{message:'proxy failure'}}),'proxy failure'],
      ['failed status',()=>response({status:'failed',output:'https://mock.invalid/asset.png'}),'failed'],
      ['canceled status',()=>response({status:'canceled',output:'https://mock.invalid/asset.png'}),'canceled'],
      ['processing status',()=>response({status:'processing',output:'https://mock.invalid/asset.png'}),'processing'],
      ['empty output',()=>response({status:'succeeded',output:[]}),'image URL'],
      ['CORS download',()=>response({output:'https://mock.invalid/cors.png'}),'图片生成成功，但还未保存到本地'],
      ['broken image',()=>response({output:'https://mock.invalid/broken.png'}),'图片生成成功，但还未保存到本地'],
      ['HTTP download',()=>response({output:'https://mock.invalid/http.png'}),'图片生成成功，但还未保存到本地']
    ];
    for(const [label,fn,message]of errorCases){
      const before=snapshot(),oldArchive=parent.testArchive,oldHistory=history.length;calls=[];fixture=fn;$('prompt').value='A paper bird';
      await $('generate').onclick();
      assert(snapshot()===before&&parent.testArchive===oldArchive&&history.length===oldHistory,label+' changed work');
      assert(calls.filter(c=>c.url===proxyUrl).length===1,label+' retried');
      assert($('aiStatus').textContent.includes(message),label+' wrong error');
      assert(!generating&&!$('generate').disabled,label+' stuck busy');
      if(label.includes('download')||label==='broken image')assert(!$('resultLink').hidden,'Missing recovery link');
    }
    report('HTTP 500/401/403, malformed JSON, invalid structure, proxy error, failed/canceled/processing, empty output, CORS/download/decode failures preserve scene, archive and history');
    const realTimer=window.setTimeout;
    window.setTimeout=(fn,ms,...args)=>realTimer(fn,ms===90000?5:ms,...args);
    fixture=options=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));
    calls=[];const timeoutBefore=snapshot();await $('generate').onclick();window.setTimeout=realTimer;
    assert(calls.length===1&&snapshot()===timeoutBefore&&$('aiStatus').textContent.includes('does not cancel'),'Timeout behavior incorrect');
    report('timer abort restores button, preserves scene, does not retry, warns that cloud task may still run');
    fixture=()=>response({status:'succeeded',output:'https://mock.invalid/asset.png'});
    const savedArchive=parent.testArchive,n=scene.items.length,h=history.length;window.failStorage=true;calls=[];
    await $('generate').onclick();window.failStorage=false;
    assert(scene.items.length===n+1&&history.length===h+1,'Quota failure discarded generated item');
    assert(parent.testArchive===savedArchive&&$('aiStatus').textContent.includes('本地存档保存失败'),'Quota failure overwrote old archive or reported saved');
    assert(!$('resultLink').hidden&&JSON.parse(JSON.stringify(scene)).items.at(-1).source,'No backup/recovery on quota failure');
    report('single-string output and quota failure: new image stays editable, old archive survives, JSON backup remains available');
    parent.report('ALL CHECKS PASSED · no real AI request, no user storage access');
  }
} catch(error) { parent.report('FAIL · '+error.stack);console.error(error); }
