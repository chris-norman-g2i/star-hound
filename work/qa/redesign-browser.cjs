const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('/Users/mana/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='cdn.jsdelivr.net'){if(fs.existsSync('/tmp/starhound-three-r160.min.js'))return route.fulfill({body:fs.readFileSync('/tmp/starhound-three-r160.min.js'),contentType:'text/javascript'});return route.continue();}
   if(url.hostname!=='starhound.test')return route.fulfill({body:'',contentType:'text/plain'});
   const file=path.join(root,url.pathname==='/'?'index.html':decodeURIComponent(url.pathname));
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   let body=fs.readFileSync(file);
   if(url.pathname==='/js/game.js')body=Buffer.from(`window.qa={};
    for(const key of ['FlightScene','SoundEngine','FlightSystems','WaveCheckpoints']){
      const Original=Starhound[key];Starhound[key]=class extends Original{
        constructor(...args){super(...args);qa[key]=this;}
        ${''}
      };
    }
    const render=Starhound.FlightScene.prototype.render||Object.getPrototypeOf(Starhound.FlightScene.prototype).render;
    Starhound.FlightScene.prototype.render=function(s,...args){qa.state=s;qa.renderedMode=s.mode;return render.call(this,s,...args);};
    `+body.toString());
   const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf','.mp3':'audio/mpeg'}[path.extname(file)]||'text/plain';
   return route.fulfill({body,contentType:type});
  });
  await page.goto('http://starhound.test/');await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>window.qa?.state?.mode==='title');
  assert.equal(errors.length,0,errors.join('\n'));
  assert(await page.evaluate(()=>document.fonts.check('20px "Lilita One"')));
  await page.click('#launch');await page.waitForFunction(()=>qa.renderedMode==='playing');
  assert.equal(await page.locator('.race-progress').count(),0);
  const hud=await page.evaluate(()=>{const h=document.querySelector('.health').getBoundingClientRect(),s=document.querySelector('.speed-instrument').getBoundingClientRect();return {h:[h.x,h.y,h.width],s:[s.x,s.y,s.width],width:innerWidth};});
  assert(hud.h[1]>hud.s[1]);assert(Math.abs(hud.h[0]+hud.h[2]/2-hud.width/2)<2);
  const track=await page.evaluate(()=>qa.SoundEngine.track);await page.keyboard.press('m');
  await page.waitForFunction(old=>qa.SoundEngine.track!==old,track);assert.equal(await page.evaluate(()=>qa.SoundEngine.gameplayIndex),1);
  assert(await page.evaluate(()=>qa.SoundEngine.step<16));
  for(const expected of [2,3,0]){await page.keyboard.press('m');assert.equal(await page.evaluate(()=>qa.SoundEngine.gameplayIndex),expected);}
  await page.evaluate(()=>{Starhound.settings.race.jump(qa.state,5);qa.WaveCheckpoints.begin(qa.state);});await page.waitForFunction(()=>qa.SoundEngine.gameplayIndex===1);
  await page.evaluate(()=>{Starhound.settings.race.jump(qa.state,1);qa.WaveCheckpoints.begin(qa.state);});await page.waitForFunction(()=>qa.SoundEngine.gameplayIndex===0);
  // Returning to the hangar and choosing Resume in Start Fresh must launch immediately.
  await page.keyboard.press('p');await page.waitForFunction(()=>qa.renderedMode==='paused');await page.click('#home');
  await page.waitForFunction(()=>qa.renderedMode==='title');await page.click('#launch');assert(await page.locator('#new-run-dialog').isVisible());
  const buttons=await page.locator('.choice-action').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
  assert.equal(buttons[0].w,buttons[1].w);assert.equal(buttons[0].h,buttons[1].h);assert(buttons[1].y>buttons[0].y+buttons[0].h);
  fs.mkdirSync(path.join(root,'output/qa/redesign'),{recursive:true});
  await page.screenshot({path:path.join(root,'output/qa/redesign/start-fresh.png')});
  await page.click('#resume-checkpoint-dialog');await page.waitForFunction(()=>qa.renderedMode==='playing');assert(await page.locator('#new-run-dialog').isHidden());
  // Options channel controls don't restart the wave; M never mutes.
  await page.keyboard.press('F2');await page.waitForFunction(()=>qa.renderedMode==='paused');
  for(const [channel,value] of [['music','.6'],['effects','.8'],['voice','.4']]){
   await page.locator('#'+channel+'-volume').evaluate((n,v)=>{n.value=v;n.dispatchEvent(new Event('input',{bubbles:true}));},value);
   assert.equal(await page.evaluate(c=>qa.SoundEngine.volumes[c],channel),Number(value));
  }
  await page.click('#audio-button');assert(await page.evaluate(()=>qa.SoundEngine.muted));await page.click('#audio-button');assert(!await page.evaluate(()=>qa.SoundEngine.muted));
  await page.screenshot({path:path.join(root,'output/qa/redesign/options.png')});
  await page.keyboard.press('F2');assert(await page.locator('#tuning-dialog').isHidden());await page.keyboard.press('p');
  await page.waitForFunction(()=>qa.renderedMode==='playing');
  // Real WebGL rendering: rainbow restores materials, shield stays respawn-only, checkpoint celebration.
  await page.evaluate(()=>{
   const {race,pickups}=Starhound.settings;s=qa.state;qa.FlightSystems.reset();race.jump(s,2);
   qa.WaveCheckpoints.begin(s);s.protection=0;s.invincible=7;s.nextSpawn=Infinity;s.nextPickup=Infinity;
   qa.FlightSystems.entities=pickups.types.map((type,i)=>pickups.make(type,-7+i*2,0,s.distance+22));
  });
  await page.waitForTimeout(250);assert(!await page.evaluate(()=>qa.FlightScene.shield.visible));
  const rainbow=await page.evaluate(()=>[...qa.FlightScene.shipMaterials.keys()][0].color.getHex());
  await page.waitForTimeout(250);assert.notEqual(await page.evaluate(()=>[...qa.FlightScene.shipMaterials.keys()][0].color.getHex()),rainbow);
  await page.evaluate(()=>{qa.state.invincible=0;qa.state.speed=110;});
  await page.waitForTimeout(100);
  assert(await page.evaluate(()=>[...qa.FlightScene.shipMaterials].every(([m,o])=>m.color.equals(o.color))));
  await page.keyboard.press('p');await page.waitForFunction(()=>qa.renderedMode==='paused'&&!document.getElementById('overlay').classList.contains('hidden'));
  await page.evaluate(()=>{
    qa.FlightSystems.reset();qa.state.speed=70;qa.state.noticeTime=0;qa.state.toastTime=0;
    const {pickups}=Starhound.settings;
    qa.FlightSystems.entities=pickups.types.map((type,i)=>pickups.make(type,-9+i*3,2,qa.state.distance+24));
    document.getElementById('overlay').classList.add('hidden');
  });
  await page.waitForTimeout(150);await page.screenshot({path:path.join(root,'output/qa/redesign/pickups.png')});
  await page.keyboard.press('p');await page.waitForFunction(()=>qa.renderedMode==='playing');
  await page.evaluate(()=>{
   qa.FlightSystems.reset();const s=qa.state;s.distance=Starhound.settings.race.checkpointDistance(3)-.1;s.speed=100;s.protection=0;s.nextSpawn=Infinity;s.nextPickup=Infinity;
  });
  await page.waitForFunction(()=>qa.state.wave===3);
  assert(await page.evaluate(()=>qa.state.checkpointCelebration>0));assert(await page.locator('#checkpoint-success').evaluate(n=>n.classList.contains('visible')));
  await page.waitForTimeout(200);await page.screenshot({path:path.join(root,'output/qa/redesign/checkpoint.png')});
  await page.keyboard.press('p');await page.waitForFunction(()=>qa.renderedMode==='paused'&&!document.getElementById('overlay').classList.contains('hidden'));
  await page.evaluate(()=>{
   qa.FlightSystems.reset();qa.state.distance=Starhound.settings.race.checkpointDistance(4)-100;qa.state.noticeTime=0;qa.state.toastTime=0;qa.state.checkpointCelebration=0;
   document.getElementById('overlay').classList.add('hidden');
  });
  await page.waitForTimeout(150);assert(await page.evaluate(()=>qa.FlightScene.environment.gates.size>0));
  await page.screenshot({path:path.join(root,'output/qa/redesign/checkpoint-gate.png')});
  await page.keyboard.press('p');await page.waitForFunction(()=>qa.renderedMode==='playing');
  // Force high speed while paused to exercise shader passes and HUD blur without changing simulation.
  await page.keyboard.press('p');await page.waitForFunction(()=>qa.renderedMode==='paused'&&!document.getElementById('overlay').classList.contains('hidden'));
  await page.evaluate(()=>{qa.state.speed=320;document.getElementById('overlay').classList.add('hidden');});
  await page.waitForTimeout(200);assert(await page.evaluate(()=>qa.FlightScene.speedEffects.historyValid));
  assert(await page.locator('#hud').evaluate(n=>parseFloat(n.style.filter.slice(5))>0));
  await page.screenshot({path:path.join(root,'output/qa/redesign/extreme-speed.png')});
  await page.keyboard.press('p');await page.waitForFunction(()=>qa.renderedMode==='playing');
  // Render the new effects through real Web Audio, checking audible bass and distinct profiles.
  const explosions=await page.evaluate(async()=>{
    const results={},Original=window.AudioContext;
    for(const id of ['explosion','enemyExplosion','rockExplosion','crashExplosion']){
      const offline=new OfflineAudioContext(2,120000,48000);
      window.AudioContext=function(){return offline;};
      const engine=new Starhound.SoundEngine();engine.initialize();engine.enabled=true;engine.master.gain.value=.58;
      engine.play(id);clearInterval(engine.timer);window.AudioContext=Original;
      const buffer=await offline.startRendering(),data=buffer.getChannelData(0);
      let rms=0,peak=0;for(const value of data){rms+=value*value;peak=Math.max(peak,Math.abs(value));}
      let bass=0;const count=4096,start=480;
      for(let frequency=30;frequency<=150;frequency+=10){let re=0,im=0;for(let i=0;i<count;i++){const phase=2*Math.PI*frequency*i/48000;re+=data[start+i]*Math.cos(phase);im+=data[start+i]*Math.sin(phase);}bass+=Math.hypot(re,im)/count;}
      results[id]={rms:Math.sqrt(rms/data.length),peak,bass};engine.voices.dispose();
    }
    window.AudioContext=Original;return results;
  });
  console.log('Offline audio explosion measurements:',JSON.stringify(explosions));
  for(const id of ['enemyExplosion','rockExplosion','crashExplosion']){const profile=explosions[id];assert(profile.rms>explosions.explosion.rms*1.3);assert(profile.peak>explosions.explosion.peak);assert(profile.bass>explosions.explosion.bass*1.3);}
  assert.notEqual(explosions.enemyExplosion.rms,explosions.rockExplosion.rms);
  // Each life visibly ejects the dog and delays respawn/results for 2.6 simulated seconds.
  for(const lives of [2,1,0]){
   await page.evaluate(()=>{qa.state.hull=0;qa.state.protection=0;qa.state.invincible=0;});
   await page.waitForFunction(()=>qa.renderedMode==='crashing');
   assert.equal(await page.evaluate(()=>qa.state.lives),lives);
   assert(await page.locator('#overlay').isHidden());assert(!await page.evaluate(()=>qa.FlightScene.ship.visible));
   assert(await page.evaluate(()=>qa.FlightScene.crashPresentation.dog.visible));
   assert.equal(await page.evaluate(()=>qa.SoundEngine.track),null);
   await page.waitForFunction(()=>qa.renderedMode==='crashing'&&qa.state.crashTime>.7);
   if(lives===2){
    await page.keyboard.press('p');await page.waitForFunction(()=>qa.renderedMode==='paused');
    const t=await page.evaluate(()=>qa.state.crashTime);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>qa.state.crashTime),t);
    await page.keyboard.press('p');await page.waitForFunction(()=>qa.renderedMode==='crashing');
    await page.screenshot({path:path.join(root,'output/qa/redesign/crash-ejection.png')});
   }
   await page.waitForFunction(expected=>qa.renderedMode===(expected?'playing':'defeat'),lives,{timeout:15000});
   if(lives){assert.equal(await page.evaluate(()=>qa.state.hull),100);assert(await page.evaluate(()=>qa.state.protection>2));assert(await page.evaluate(()=>qa.FlightScene.ship.visible));}
  }
  assert(await page.locator('#overlay').isVisible());assert.equal(await page.evaluate(()=>qa.WaveCheckpoints.current),null);
  await page.screenshot({path:path.join(root,'output/qa/redesign/defeat.png')});
  const local=await browser.newPage({viewport:{width:1280,height:720}});
  local.on('pageerror',e=>errors.push(e.message));local.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  await local.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({body:fs.readFileSync('/tmp/starhound-three-r160.min.js'),contentType:'text/javascript'}));
  await local.goto('file://'+path.join(root,'index.html'));
  await local.click('#launch');await local.waitForFunction(()=>!document.getElementById('hud').classList.contains('hidden'));
  assert(await local.locator('#load-error').isHidden());
  await local.screenshot({path:path.join(root,'output/qa/redesign/local-desktop-720.png')});
  await local.close();
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('Desktop browser checks passed: full Three.js/WebGL/audio, new-flight dialog resume, stacked equal buttons, HUD, Options mix, M switching, rainbow reset, seven foods, checkpoint gate/fireworks, blur shaders, timed dog ejection, pause and all lives.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
