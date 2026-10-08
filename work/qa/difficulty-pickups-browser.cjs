const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('/Users/mana/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ROOT=path.resolve(__dirname,'../..');
const BROWSER={width:1440,height:900,spacing:900,samples:500};
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:BROWSER.width,height:BROWSER.height}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='cdn.jsdelivr.net'){if(fs.existsSync('/tmp/starhound-three-r160.min.js'))return route.fulfill({body:fs.readFileSync('/tmp/starhound-three-r160.min.js'),contentType:'text/javascript'});return route.continue();}
   if(url.hostname!=='starhound.test')return route.fulfill({body:''});
   const file=path.join(ROOT,url.pathname==='/'?'index.html':decodeURIComponent(url.pathname));
   if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   let body=fs.readFileSync(file);
   if(url.pathname==='/js/game.js')body=Buffer.from(`window.qa={};
    for(const name of ['FlightScene','SoundEngine','FlightSystems','WaveCheckpoints']){
     const Original=Starhound[name];Starhound[name]=class extends Original{constructor(...args){super(...args);qa[name]=this;}};
    }
    const render=Starhound.FlightScene.prototype.render;
    Starhound.FlightScene.prototype.render=function(s,...args){qa.state=s;return render.call(this,s,...args);};
    `+body.toString());
   return route.fulfill({body,contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf','.mp3':'audio/mpeg'}[path.extname(file)]||'application/octet-stream'});
  });
  await page.goto('http://starhound.test/');await page.waitForFunction(()=>window.qa?.state?.mode==='title');
  await page.click('#tune-button');
  assert(!/Wave 16|Pickup spacing/.test(await page.locator('#tuning-fields').innerText()));
  assert.equal(await page.locator('#tuning-fields input:invalid').count(),0);
  await page.getByRole('spinbutton',{name:'Minimum space between pickups / distance',exact:true}).fill(String(BROWSER.spacing));
  await page.getByRole('spinbutton',{name:'Pickup frequency (0–1)',exact:true}).fill('0');
  await page.getByRole('spinbutton',{name:'Difficulty growth multiplier',exact:true}).fill('0');
  await page.getByRole('spinbutton',{name:'Minimum obstacle spacing',exact:true}).fill('151');
  await page.click('#apply-tuning');assert((await page.locator('#tuning-status').innerText()).includes('cannot exceed'));
  await page.getByRole('spinbutton',{name:'Minimum obstacle spacing',exact:true}).fill('38');
  await page.click('#apply-tuning');assert((await page.locator('#tuning-status').innerText()).includes('Settings saved'));
  await page.reload();await page.waitForFunction(()=>qa.state?.mode==='title');
  assert.deepEqual(await page.evaluate(()=>[Starhound.settings.pickups.minimumSpacing,Starhound.settings.pickups.frequency,Starhound.settings.difficulty.growth]),[BROWSER.spacing,0,0]);
  await page.click('#launch');await page.waitForFunction(()=>qa.state?.mode==='playing');
  assert.equal(await page.evaluate(()=>qa.FlightSystems.entities.filter(e=>e.type==='pickup').length),0);
  assert.equal(await page.evaluate(()=>{
   const {pickups,race,encounters}=Starhound.settings,s=race.state('ZERO');
   for(let i=0;i<100;i++){s.distance=s.nextPickup-encounters.spawnAhead;if(pickups.scheduled(s))return false;}
   return pickups.drop({x:0,y:0,d:10000,phase:0},s)===null;
  }),true);
  await page.keyboard.press('Escape');await page.waitForFunction(()=>qa.state.mode==='paused');
  await page.click('#home');await page.waitForFunction(()=>qa.state.mode==='title');
  await page.click('#tune-button');await page.getByRole('spinbutton',{name:'Pickup frequency (0–1)',exact:true}).fill('1');
  await page.getByRole('spinbutton',{name:'Difficulty growth multiplier',exact:true}).fill('2');
  await page.click('#apply-tuning');assert((await page.locator('#tuning-status').innerText()).includes('Settings saved'));
  const result=await page.evaluate(({samples,spacing})=>{
   const {pickups,race,encounters,difficulty,tuning,checkpoint}=Starhound.settings,s=race.state('FULL'),positions=[];
   for(let i=0;i<samples;i++){s.distance=Math.max(0,s.nextPickup-encounters.spawnAhead);const p=pickups.scheduled(s);if(p)positions.push(p.d);}
   const gaps=positions.slice(1).map((d,i)=>d-positions[i]);
   const restored=checkpoint.restore(checkpoint.capture(race.state()));
   return {count:positions.length,minGap:Math.min(...gaps),maxGap:Math.max(...gaps),growth:difficulty.growth,
    valid:tuning.valid(tuning.values()),restored:!!restored,frequency:pickups.frequency};
  },BROWSER);
  assert.deepEqual(result,{count:BROWSER.samples,minGap:BROWSER.spacing,maxGap:BROWSER.spacing,growth:2,valid:true,restored:true,frequency:1});
  await page.locator('#jump-wave').fill('3');await page.click('#jump-button');await page.waitForFunction(()=>qa.state?.mode==='playing');
  assert.equal(await page.evaluate(()=>qa.state.wave),3);
  assert.equal(await page.evaluate(()=>Starhound.settings.pickups.minimumSpacing),BROWSER.spacing);
  assert.equal(await page.evaluate(()=>Starhound.settings.checkpoint.valid(qa.WaveCheckpoints.current)),true);
  assert.deepEqual(errors,[]);
  console.log('Browser checks passed: valid generated fields, obsolete labels removed, related-limit errors, Apply/reload persistence, frequency 0/1 spawning, exact minimum gaps, and Play Now/checkpoints in the real renderer.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
