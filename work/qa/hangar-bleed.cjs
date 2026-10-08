const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {chromium}=require('/Users/mana/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {createCanvas,loadImage}=require('/Users/mana/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
const root=path.resolve(__dirname,'../..');
const qaConfig={browser:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',opacityThreshold:32,leadingGuardSourcePx:6,leadingGuardRenderedPx:2,timeOffsetSeconds:.001,viewports:[['native',1672,941],['scaled',1180,720]],regressionFrames:[3,6]};
function opaqueInStrip(imageData,width,height,stripWidth){let count=0;for(let y=0;y<height;y++)for(let x=0;x<stripWidth;x++)if(imageData[(y*width+x)*4+3]>=qaConfig.opacityThreshold)count++;return count;}
async function alphaStrip(png,stripWidth){const img=await loadImage(png),canvas=createCanvas(img.width,img.height),ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);return opaqueInStrip(ctx.getImageData(0,0,img.width,img.height).data,img.width,img.height,stripWidth);}
(async()=>{
 const context=vm.createContext({window:{},Math,JSON,Number,console});vm.runInContext(fs.readFileSync(path.join(root,'js/settings.js'),'utf8'),context);const config=context.window.Starhound.settings.gfx.hangar;
 const sheets=await Promise.all(config.sprites.map(s=>loadImage(path.join(root,s.image))));
 for(const [i,sprite] of config.sprites.entries()){
  for(let frame=0;frame<config.frames;frame++){
   const source=config.spriteFrameRect(sprite,frame),canvas=createCanvas(Math.ceil(source[2]),Math.ceil(source[3])),ctx=canvas.getContext('2d');ctx.drawImage(sheets[i],...source,0,0,source[2],source[3]);
   assert.equal(opaqueInStrip(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height,qaConfig.leadingGuardSourcePx),0,`${sprite.id} frame ${frame}: clean leading edge`);
  }
 }
 const browser=await chromium.launch({executablePath:qaConfig.browser,headless:true});
 try{
  const page=await browser.newPage();
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=='starhound.test')return route.fulfill({body:url.pathname.endsWith('.js')?'window.THREE={REVISION:"160"};':'',contentType:'text/javascript'});
   if(url.pathname==='/js/game.js')return route.fulfill({body:'Starhound.Game={init(){}};',contentType:'text/javascript'});
   const file=path.join(root,url.pathname==='/'?'index.html':decodeURIComponent(url.pathname));
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf'}[path.extname(file)]||'text/plain';
   await route.fulfill({body:fs.readFileSync(file),contentType:type});
  });
  await page.goto('http://starhound.test/');await page.evaluate(()=>window.hangarQA=new Starhound.HangarTitle());
  await page.addStyleTag({content:'body,.hangar-title{background:transparent!important}.hangar-art,.hangar-menu,.hangar-status,.hangar-keys,.hangar-lights,#music-debug{visibility:hidden!important}.wind-sprite{visibility:hidden}'});
  const out=path.join(root,'output/qa/hangar-bleed');fs.mkdirSync(out,{recursive:true});
  for(const [name,width,height] of qaConfig.viewports){
   await page.setViewportSize({width,height});
   for(const sprite of config.sprites){
    await page.locator('.wind-sprite').evaluateAll(nodes=>nodes.forEach(n=>n.style.visibility='hidden'));
    await page.locator('#'+sprite.id).evaluate(n=>n.style.visibility='visible');
    for(let frame=0;frame<config.frames;frame++){
     await page.evaluate(({frame,offset})=>hangarQA.update(frame*Starhound.settings.gfx.hangar.frameSeconds+offset,true),{frame,offset:qaConfig.timeOffsetSeconds});
     const png=await page.locator('#'+sprite.id).screenshot({omitBackground:true});
     assert.equal(await alphaStrip(png,qaConfig.leadingGuardRenderedPx),0,`${name} ${sprite.id} ${frame}: no left-edge blip`);
     fs.writeFileSync(path.join(out,`${name}-${sprite.id}-${frame}.png`),png);
    }
   }
  }
  // Negative control: reproduce both visible tail blips using the original atlas viewport.
  for(const frame of qaConfig.regressionFrames){
   await page.locator('.wind-sprite').evaluateAll(nodes=>nodes.forEach(n=>n.style.visibility='hidden'));
   await page.locator('#hangar-tail').evaluate((node,frame)=>{
    const c=Starhound.settings.gfx.hangar,s=c.sprites.find(s=>s.id==='hangar-tail'),[x,y,w,h]=c.layerRect(s);
    Object.assign(node.style,{visibility:'visible',left:x/c.width*100+'%',top:y/c.height*100+'%',width:w/c.width*100+'%',height:h/c.height*100+'%',backgroundSize:c.sheet.columns*100+'% '+c.sheet.rows*100+'%',backgroundPosition:frame%c.sheet.columns/(c.sheet.columns-1)*100+'% '+Math.floor(frame/c.sheet.columns)/(c.sheet.rows-1)*100+'%'});
   },frame);
   assert(await alphaStrip(await page.locator('#hangar-tail').screenshot({omitBackground:true}),qaConfig.leadingGuardRenderedPx)>0,`Original frame ${frame} reproduces the left-edge artifact`);
  }
  console.log('Atlas bleed regression passed: all eight scarf/tail frames clean in native and fractional-scale browser rendering; original tail frames 3 and 6 reproduce the blip.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
