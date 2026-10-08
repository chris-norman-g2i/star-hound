const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('/Users/mana/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../..');
const allowAutoplay=process.argv.includes('--allow-autoplay');
const autoplayArgs=allowAutoplay?['--autoplay-policy=no-user-gesture-required']:[];
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader',...autoplayArgs]});
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
  const out=path.join(root,'output/qa/route');fs.mkdirSync(out,{recursive:true});
  await page.goto('http://starhound.test/');await page.waitForFunction(()=>qa?.state?.mode==='title');
  const snapshot=async name=>page.screenshot({path:path.join(out,name+'.png')});
  await snapshot('main-menu');
  assert.equal(await page.locator('.hangar-action').count(),5);
  assert(!await page.locator('#tuning-dialog').textContent().then(s=>s.includes('AUDIO MIX')));
  await page.click('#options-button');assert(await page.locator('#options-dialog').isVisible());
  await page.locator('#music-volume').evaluate(n=>{n.value='.7';n.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.mouse.click(4,4);assert(await page.locator('#options-dialog').isHidden());
  await page.click('#flight-manual');await page.mouse.click(4,4);assert(await page.locator('#manual').isHidden());
  await page.click('#tune-button');assert(await page.locator('#tuning-dialog').isVisible());
  const panel=await page.locator('#tuning-dialog').boundingBox();await page.mouse.click(panel.x+8,panel.y+50);assert(await page.locator('#tuning-dialog').isVisible());
  await page.locator('[aria-label="Wave distance"]').fill('1400');await page.locator('#seed-input').fill('ROUTE-QA');
  await page.click('#apply-tuning');assert.equal(await page.evaluate(()=>qa.state.mode),'title');
  assert.equal(await page.evaluate(()=>Starhound.settings.race.waveLength),1400);
  await page.locator('#tuning-dialog').evaluate(n=>n.scrollTop=0);await snapshot('developer-settings');await page.mouse.click(4,4);assert(await page.locator('#tuning-dialog').isHidden());
  await page.reload();await page.waitForFunction(()=>qa?.state?.mode==='title');
  assert.equal(await page.evaluate(()=>Starhound.settings.race.waveLength),1400);assert.equal(await page.evaluate(()=>Starhound.settings.tuning.seed),'ROUTE-QA');
  await page.click('#tune-button');await page.locator('#jump-wave').fill('7');await page.click('#jump-button');await page.waitForFunction(()=>qa.state.mode==='playing');
  assert(await page.locator('#tuning-dialog').isHidden());assert.equal(await page.evaluate(()=>qa.state.wave),7);
  assert.equal(await page.evaluate(()=>qa.WaveCheckpoints.current.wave),7);assert.equal(await page.evaluate(()=>qa.state.seed),'ROUTE-QA');
  assert.equal(await page.evaluate(()=>qa.SoundEngine.track),'game0');
  await page.evaluate(()=>document.getElementById('tune-button').click());assert(await page.locator('#tuning-dialog').isHidden());
  const wave=await page.evaluate(()=>qa.state.wave);await page.keyboard.press(']');assert.equal(await page.evaluate(()=>qa.state.wave),wave);
  await page.keyboard.press('Escape');await page.waitForFunction(()=>qa.state.mode==='paused');
  await page.mouse.click(4,4);assert.equal(await page.evaluate(()=>qa.state.mode),'paused');
  await page.click('#home');await page.waitForFunction(()=>qa.state.mode==='title');
  await page.click('#launch');assert(await page.locator('#new-run-dialog').isVisible());await page.mouse.click(4,4);assert(await page.locator('#new-run-dialog').isHidden());
  // Old checkpoint rules are rebased to the latest applied developer settings after reload.
  await page.evaluate(()=>{
    const c=qa.WaveCheckpoints.current;c.wave=3;c.bestWave=3;c.rules['race.waveLength']=1100;c.seed='OLD';
    localStorage.setItem(Starhound.settings.checkpoint.key,JSON.stringify(c));
  });
  await page.reload();await page.waitForFunction(()=>qa?.state?.mode==='title');
  await page.click('#checkpoint-resume');await page.waitForFunction(()=>qa.state.mode==='playing');
  assert.equal(await page.evaluate(()=>qa.state.wave),3);assert.equal(await page.evaluate(()=>qa.state.seed),'ROUTE-QA');
  assert(await page.evaluate(()=>qa.state.distance>=2800&&qa.state.distance<2850));
  await page.keyboard.press('Escape');await page.waitForFunction(()=>qa.state.mode==='paused');
  // Inspect the actual curved, pooled WebGL geometry at each route motif.
  const segments=await page.evaluate(()=>{qa.FlightScene.route.extend(90000);return qa.FlightScene.route.segments.filter(s=>s.kind!=='open');});
  const pose=async(segment,offset)=>{
    await page.waitForFunction(()=>qa.renderedMode==='paused');
    await page.evaluate(({segment,offset})=>{
      const s=qa.state,{race}=Starhound.settings;
      s.distance=segment.start+offset;s.previousDistance=s.distance;s.wave=race.waveAt(s.distance);s.sector=race.sectorAt(s.wave);
      s.player={x:0,y:0,vx:0,vy:0};s.speed=70;s.protection=0;s.noticeTime=0;document.getElementById('announcement').classList.remove('visible');s.toastTime=0;s.checkpointCelebration=0;
      document.getElementById('overlay').classList.add('hidden');
    },{segment,offset});await page.waitForTimeout(100);
  };
  const tunnel=segments.find(s=>s.kind==='tunnel');await pose(tunnel,80);await snapshot('tunnel');
  assert(await page.evaluate(()=>[...qa.FlightScene.environment.motifs.values()].some(g=>g.userData.segment?.kind==='tunnel')));
  await page.evaluate(distance=>{
    const env=qa.FlightScene.environment,{race,route}=Starhound.settings,oldLength=race.waveLength;
    race.waveLength=distance;const gate=env.makeGate(2);race.waveLength=oldLength;
    if(gate.scale.x*(route.geometry.trimRadius+route.geometry.trimTube)>=route.tunnel.radius)throw Error('gate obscured by tunnel');
    env.remove(gate);
  },tunnel.start+160);
  const station=segments.find(s=>s.kind==='station');await pose(station,-100);await snapshot('station-entrance');
  await pose(station,180);await snapshot('station-interior');
  for(const side of ['left','right','bottom']){const cruiser=segments.find(s=>s.kind==='cruiser'&&s.side===side);assert(cruiser);await pose(cruiser,80);await snapshot('cruiser-'+side);}
  const clustered=await page.evaluate(()=>[...qa.FlightScene.environment.objects.values()].filter(g=>g.userData.placement.kind==='rock').map(g=>({count:g.children.length,colors:g.children.map(m=>m.material.color.getHex())})));
  assert(clustered.length);for(const group of clustered){assert(group.count>=4&&group.count<=9);assert.equal(new Set(group.colors).size,1);}
  const ring=await page.evaluate(()=>qa.FlightScene.route.visibleRings(0,500).find(r=>qa.FlightScene.route.at(r.d).kind==='open'));
  assert(ring);await pose({start:ring.d},-70);await snapshot('speed-rings');
  await page.evaluate(ring=>{
    const s=qa.state;s.player={x:ring.x,y:ring.y,vx:0,vy:0};s.previousDistance=ring.d-1;s.distance=ring.d+1;
    qa.FlightScene.route.crossRings(s,s.player,qa.SoundEngine);
  },ring);
  await page.waitForTimeout(100);
  assert(await page.evaluate(id=>qa.FlightScene.environment.rings.get(id).material===qa.FlightScene.environment.ringMaterials.passed,ring.id));
  assert(await page.evaluate(()=>qa.state.motion.ringBonus>0));
  await snapshot('ring-passed');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('Route browser checks passed: background dismissal, pause stays paused, separated main-menu settings, saved overrides/reload/old checkpoints, Play Now, removed in-flight tuning, tunnel/window banks, station entry/interior, all cruiser sides, group-colored rocks, hexagonal ring feedback; screenshots in output/qa/route.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
