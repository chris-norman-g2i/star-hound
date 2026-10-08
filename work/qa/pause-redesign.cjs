const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('/Users/mana/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../..');
const qaConfig={
 browser:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',engine:'/tmp/starhound-three-r160.min.js',
 viewports:[['desktop',1440,900],['mobile',390,844],['landscape',844,390]],
 freezeMs:250,centerTolerancePx:2,timeoutMs:15000,
};
(async()=>{
 const browser=await chromium.launch({executablePath:qaConfig.browser,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:qaConfig.viewports[0][1],height:qaConfig.viewports[0][2]}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({body:fs.readFileSync(qaConfig.engine),contentType:'text/javascript'});
   if(url.hostname!=='starhound.test')return route.fulfill({body:'',contentType:'text/plain'});
   const file=path.join(root,url.pathname==='/'?'index.html':decodeURIComponent(url.pathname));
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   let body=fs.readFileSync(file);
   if(url.pathname==='/js/game.js')body=Buffer.from(`window.qa={};
    for(const key of ['FlightScene','SoundEngine','FlightInterface','WaveCheckpoints']){
     const Original=Starhound[key];Starhound[key]=class extends Original{constructor(...args){super(...args);qa[key]=this;}};
    }
    const render=Object.getPrototypeOf(Starhound.FlightScene.prototype).render;
    Starhound.FlightScene.prototype.render=function(s,...args){qa.state=s;return render.call(this,s,...args);};
   `+body.toString());
   const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf','.mp3':'audio/mpeg'}[path.extname(file)]||'text/plain';
   await route.fulfill({body,contentType:type});
  });
  const out=path.join(root,'output/qa/menus');fs.mkdirSync(out,{recursive:true});
  await page.goto('http://starhound.test/');await page.waitForFunction(()=>qa?.state?.mode==='title');
  await page.evaluate(()=>document.fonts.ready);
  for(const [name,width,height] of qaConfig.viewports){
   await page.setViewportSize({width,height});await page.locator('#flight-manual').evaluate(n=>n.click());
   assert.deepEqual(await page.locator('.control-row dd').allTextContents(),['STEER','FIRE WEAPON','PAUSE']);
   assert.equal(await page.locator('.steering-keys>div').count(),2);
   const layout=await page.locator('#manual').evaluate(n=>{
    const rect=n.getBoundingClientRect();
    return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,scroll:n.scrollHeight,client:n.clientHeight,
     labels:[...n.querySelectorAll('dd')].map(e=>({width:e.clientWidth,scroll:e.scrollWidth})),keys:[...n.querySelectorAll('.steering-keys>div')].map(e=>e.getBoundingClientRect().left)};
   });
   assert(layout.left>=0&&layout.right<=width&&layout.top>=0&&layout.bottom<=height,`${name}: manual fits viewport`);
   assert(layout.scroll<=layout.client,`${name}: no manual scrolling`);
   for(const label of layout.labels)assert(label.scroll<=label.width,`${name}: label fits`);
   assert.equal(layout.keys[0],layout.keys[1]);
   await page.screenshot({path:path.join(out,`manual-${name}.png`)});
   await page.keyboard.press('Escape');assert(await page.locator('#manual').isHidden());
  }
  await page.setViewportSize({width:qaConfig.viewports[0][1],height:qaConfig.viewports[0][2]});
  await page.locator('#launch').evaluate(n=>n.click());await page.waitForFunction(()=>qa.state.mode==='playing');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>qa.state.mode==='paused');
  const frozen=await page.evaluate(()=>({distance:qa.state.distance,time:qa.state.elapsed}));
  await page.waitForTimeout(qaConfig.freezeMs);
  assert.deepEqual(await page.evaluate(()=>({distance:qa.state.distance,time:qa.state.elapsed})),frozen);
  assert.deepEqual(await page.locator('#pause-menu button').allTextContents(),['RESUME FLIGHT','RETURN TO HANGAR']);
  assert.equal((await page.locator('#pause-menu').innerText()).trim(),'RESUME FLIGHT\nRETURN TO HANGAR');
  assert(await page.locator('#flight-results').isHidden());assert(await page.locator('#restart').isHidden());
  assert.equal(await page.evaluate(()=>document.activeElement.id),'resume');
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'home');
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'resume');
  await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'home');
  await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.id),'resume');
  for(const [name,width,height] of qaConfig.viewports){
   await page.setViewportSize({width,height});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const layout=await page.locator('#pause-menu').evaluate(n=>{
    const rect=n.getBoundingClientRect(),buttons=[...n.querySelectorAll('button')].map(e=>{const r=e.getBoundingClientRect();return {center:r.left+r.width/2,height:r.height,width:e.clientWidth,scroll:e.scrollWidth};});
    return {centerX:rect.left+rect.width/2,centerY:rect.top+rect.height/2,top:rect.top,bottom:rect.bottom,buttons,
     world:getComputedStyle(document.getElementById('world')).visibility,backdrop:getComputedStyle(document.getElementById('overlay')).backdropFilter};
   });
   assert(Math.abs(layout.centerX-width/2)<=qaConfig.centerTolerancePx&&Math.abs(layout.centerY-height/2)<=qaConfig.centerTolerancePx,`${name}: menu centered`);
   assert(layout.top>=0&&layout.bottom<=height,`${name}: pause fits viewport`);
   assert(layout.buttons[0].height>layout.buttons[1].height,`${name}: resume more prominent`);
   for(const button of layout.buttons){assert(Math.abs(button.center-width/2)<=qaConfig.centerTolerancePx);assert(button.scroll<=button.width);}
   assert.equal(layout.world,'visible');assert.equal(layout.backdrop,'none');
   await page.screenshot({path:path.join(out,`pause-${name}.png`)});
  }
  await page.keyboard.press('Enter');await page.waitForFunction(()=>qa.state.mode==='playing');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>qa.state.mode==='paused');
  await page.click('#home');await page.waitForFunction(()=>qa.state.mode==='title');
  assert(await page.locator('#checkpoint-resume').isEnabled());
  await page.locator('#checkpoint-resume').evaluate(n=>n.click());await page.waitForFunction(()=>qa.state.mode==='playing');
  await page.evaluate(()=>{qa.state.mode='crashing';document.getElementById('pause-button').click();});
  await page.waitForFunction(()=>qa.state.mode==='paused'&&qa.state.resumeMode==='crashing');
  await page.click('#resume');await page.waitForFunction(()=>qa.state.mode==='crashing');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>qa.state.mode==='paused');
  await page.evaluate(()=>{qa.state.mode='defeat';qa.state.lives=0;});await page.waitForFunction(()=>qa.FlightInterface.lastMode==='defeat');
  assert(await page.locator('#pause-menu').isHidden());assert(await page.locator('#flight-results').isVisible());
  assert.equal(await page.evaluate(()=>document.activeElement.id),'restart');
  await page.setViewportSize({width:1280,height:720});await page.screenshot({path:path.join(out,'results-desktop.png')});
  await page.click('#results-home');await page.waitForFunction(()=>qa.state.mode==='title');
  assert.deepEqual(errors,[]);
  console.log('Real browser checks passed: three-control manual, stacked keys, responsive layouts, compact centered pause, visible gameplay, frozen session, keyboard focus/activation, resume including crash, checkpoint return and separate defeat results.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
