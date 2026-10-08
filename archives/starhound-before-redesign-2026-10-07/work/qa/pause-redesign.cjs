const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('/Users/mana/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
  const page=await browser.newPage();
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=='starhound.test')return route.fulfill({body:url.pathname.endsWith('.js')?'window.THREE={REVISION:"160"};':'',contentType:url.pathname.endsWith('.js')?'text/javascript':'text/css'});
   if(url.pathname==='/js/game.js')return route.fulfill({body:'window.Starhound.Game={init(){}};',contentType:'text/javascript'});
   const file=path.join(root,url.pathname==='/'?'index.html':url.pathname);
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf'}[path.extname(file)]||'text/plain';
   await route.fulfill({body:fs.readFileSync(file),contentType:type});
  });
  await page.goto('http://starhound.test/');
  await page.evaluate(()=>{
   const ns=window.Starhound;window.pauseView=new ns.FlightInterface();
   window.pauseState=ns.settings.race.state();Object.assign(pauseState,{mode:'paused',lives:3,checkpointWave:13,elapsed:154,kills:65,score:12660,bestWave:13});
   pauseView.mode(pauseState);
  });
  await page.evaluate(()=>document.fonts.ready);
  assert(await page.evaluate(()=>document.fonts.check('20px "Lilita One"')),'Local display font loads');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'resume');
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'restart');
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'home');
  fs.mkdirSync(path.join(root,'output/qa'),{recursive:true});
  for(const [name,width,height] of [['desktop',1440,900],['mobile',390,844],['landscape',844,390]]){
   await page.setViewportSize({width,height});await page.locator('#resume').focus();
   const layout=await page.evaluate(()=>{
    const panel=document.querySelector('.pause-panel').getBoundingClientRect(),content=document.querySelector('.pause-content').getBoundingClientRect();
    return {viewport:innerWidth,panelRight:panel.right,panelLeft:panel.left,contentBottom:content.bottom,panelBottom:panel.bottom,actions:[...document.querySelectorAll('.pause-action')].map(e=>({width:e.clientWidth,scrollWidth:e.scrollWidth,height:e.clientHeight}))};
   });
   assert(layout.panelLeft>=0&&layout.panelRight<=width,`${name}: panel fits width`);
   assert(layout.contentBottom<=layout.panelBottom+1,`${name}: content fits panel`);
   assert(layout.panelBottom<=height,`${name}: actions fit viewport ${JSON.stringify(layout)}`);
   for(const action of layout.actions){assert(action.width>=action.scrollWidth,`${name}: button text fits`);assert(action.height>=43,`${name}: usable targets`);}
   await page.screenshot({path:path.join(root,`output/qa/pause-${name}.png`),fullPage:true});
  }
  await page.setViewportSize({width:1280,height:720});
  await page.evaluate(()=>{pauseState.mode='defeat';pauseView.mode(pauseState);});
  assert(await page.locator('#resume').isHidden());assert.equal(await page.evaluate(()=>document.activeElement.id),'restart');
  await page.screenshot({path:path.join(root,'output/qa/pause-defeat.png'),fullPage:true});
  console.log('Pause layout passed at desktop, mobile and short landscape sizes; local font, keyboard focus, text fit and shared defeat menu verified.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
