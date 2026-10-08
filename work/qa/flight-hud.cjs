const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('/Users/mana/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ROOT=path.resolve(__dirname,'../..');
const QA={browser:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',engine:'/tmp/starhound-three-r160.min.js',
  viewports:[['desktop',1440,900],['mobile',390,844],['landscape',844,390]],settleMs:900,frameSeconds:1/60,tolerancePx:1};
const OUT=path.join(ROOT,'output/qa/flight-hud');
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const browser=await chromium.launch({executablePath:QA.browser,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({body:fs.readFileSync(QA.engine),contentType:'text/javascript'});
      if(url.hostname!=='starhound.test')return route.fulfill({body:'',contentType:'text/plain'});
      const file=path.join(ROOT,url.pathname==='/'?'index.html':decodeURIComponent(url.pathname));
      if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
      let body=fs.readFileSync(file);
      if(url.pathname==='/js/game.js')body=Buffer.from(`window.qa={freeze:false};
        for(const key of ['FlightScene','FlightInterface','FlightSystems','WaveCheckpoints']){
          const Original=Starhound[key];Starhound[key]=class extends Original{constructor(...args){super(...args);qa[key]=this;}};
        }
        const sceneRender=Object.getPrototypeOf(Starhound.FlightScene.prototype).render;
        Starhound.FlightScene.prototype.render=function(s,...args){qa.state=s;return sceneRender.call(this,s,...args);};
        const step=Object.getPrototypeOf(Starhound.FlightSystems.prototype).step;
        Starhound.FlightSystems.prototype.step=function(...args){if(!qa.freeze)return step.apply(this,args);};
      `+body.toString());
      const contentType={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf','.mp3':'audio/mpeg'}[path.extname(file)]||'text/plain';
      await route.fulfill({body,contentType});
    });
    await page.goto('http://starhound.test/');await page.waitForFunction(()=>window.qa?.state?.mode==='title');
    await page.evaluate(()=>document.fonts.ready);
    await page.locator('#launch').evaluate(node=>node.click());await page.waitForFunction(()=>qa.state.mode==='playing');
    // Exercise actual steering and firing before freezing the simulation for visual checks.
    const before=await page.evaluate(()=>qa.state.player.x);
    await page.keyboard.down('ArrowRight');await page.keyboard.down('Space');
    await page.waitForFunction(value=>qa.state.player.x>value&&qa.state.weapon.shots>0,before);
    await page.keyboard.up('ArrowRight');await page.keyboard.up('Space');
    assert(await page.evaluate(value=>qa.state.player.x>value&&qa.state.weapon.shots>0,before));
    await page.evaluate(()=>{qa.freeze=true;qa.state.player={x:0,y:0,vx:0,vy:0};qa.state.speed=75;qa.state.protection=0;qa.state.weapon.heat=0;qa.state.toastTime=0;});
    await page.waitForTimeout(100);
    // Actual entity collision path: fixed maximum-hull damage, immunity and fatal second hit.
    const collisions=await page.evaluate(()=>{
      const result={};const {race}=Starhound.settings,systems=qa.FlightSystems;
      for(const type of ['rock','barrier','enemy','hostile']){
        const s=race.state();s.mode='playing';s.protection=0;
        const collide=()=>{systems.entities=[{type,x:0,y:0,d:s.distance,previousD:s.distance,rx:1,ry:1,rz:1}];systems.bullets=[];systems.collide(s);};
        collide();const first=s.hull;collide();const immune=s.hull;s.hurt=0;collide();result[type]={first,immune,second:s.hull};
      }
      for(const field of ['protection','invincible']){
        const s=race.state();s.mode='playing';s[field]=3;
        systems.entities=[{type:'rock',x:0,y:0,d:0,rx:1,ry:1,rz:1}];systems.collide(s);result[field]=s.hull;
      }
      systems.entities=[];systems.bullets=[];return result;
    });
    assert.deepEqual(collisions.rock,{first:40,immune:40,second:0});assert.deepEqual(collisions.barrier,collisions.rock);
    assert.equal(collisions.enemy.first,84);assert.equal(collisions.hostile.first,88);
    assert.equal(collisions.protection,100);assert.equal(collisions.invincible,100);
    for(const id of ['sector','sector-name','wave','wave-dots','track-name','heat-fill','weapon-status','cannon-name','upgrade-status','announcement','effect-label'])assert.equal(await page.locator('#'+id).count(),0,id+' removed');
    for(const selector of ['.hud-hints','.flight-audio','.weapon'])assert.equal(await page.locator(selector).count(),0);
    assert.equal(await page.locator('#lives-text').innerText(),'3');assert.equal(await page.locator('#lives svg').count(),1);
    for(const [speed,label] of [[7,'007 KM/S'],[999,'999 KM/S'],[1000,'1000 KM/S']]){
      await page.evaluate(value=>{qa.state.speed=value;},speed);await page.waitForFunction(value=>document.getElementById('speed').textContent===value,label);
    }
    await page.evaluate(()=>{qa.state.speed=75;});
    for(const [heat,level] of [[0,'normal'],[60,'normal'],[61,'warning'],[90,'warning'],[91,'critical'],[100,'critical'],[59,'normal']]){
      await page.evaluate(value=>{qa.state.weapon.heat=value;},heat);
      await page.waitForFunction(({heat,level})=>{const node=document.getElementById('ship-heat');return node.dataset.level===level&&Number(node.getAttribute('aria-valuenow'))===heat;},{heat,level});
      const paths=await page.locator('.heat-fill').evaluateAll(nodes=>nodes.map(n=>({dash:parseFloat(n.style.strokeDasharray),length:n.getTotalLength(),start:n.getPointAtLength(0).y,end:n.getPointAtLength(n.getTotalLength()).y})));
      for(const arc of paths){assert.equal(arc.dash,heat);assert(arc.start>arc.end,'Both arcs fill upward');assert(Math.abs(arc.length/44*180/Math.PI-100)<.1,'100 degree arc');}
    }
    // Hull loss and repairs must interpolate, while thresholds reflect current integrity.
    const lerp=await page.evaluate(dt=>{
      const view=qa.FlightInterface,s=qa.state;s.hull=100;view.updateHull(s,0);view.displayHull=100;s.hull=40;view.updateHull(s,dt);
      const damaged={width:parseFloat(view.nodes['hull-fill'].style.width),flash:parseFloat(view.nodes['hull-instrument'].style.getPropertyValue('--hit-flash')),level:view.nodes['hull-instrument'].dataset.level};
      s.hull=70;view.updateHull(s,dt);return {damaged,repaired:view.nodes['hull-instrument'].dataset.level};
    },QA.frameSeconds);
    assert(lerp.damaged.width>40&&lerp.damaged.width<100);assert(lerp.damaged.flash>0);assert.equal(lerp.damaged.level,'warning');assert.equal(lerp.repaired,'normal');
    for(const [integrity,level] of [[40,'warning'],[12,'critical'],[13,'warning'],[41,'normal']]){
      await page.evaluate(value=>{qa.state.hull=value;},integrity);await page.waitForFunction(value=>document.getElementById('hull-instrument').dataset.level===value,level);
    }
    for(const [name,width,height] of QA.viewports){
      await page.setViewportSize({width,height});
      await page.evaluate(()=>{qa.state.hull=100;qa.state.weapon.heat=35;qa.state.player={x:0,y:0,vx:0,vy:0};});
      await page.waitForTimeout(QA.settleMs);
      const layout=await page.evaluate(()=>{
        const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,cx:r.left+r.width/2,cy:r.top+r.height/2};};
        const projected=qa.FlightScene.playerHudAnchor();return {hull:rect('hull-instrument'),meter:rect('hull-meter'),speed:rect('speed'),lives:rect('lives'),heat:rect('ship-heat'),projected};
      });
      assert(layout.hull.width>width*.85);assert(layout.meter.height>=24);
      for(const key of ['hull','speed','lives']){const r=layout[key];assert(r.left>=0&&r.right<=width&&r.top>=0&&r.bottom<=height,`${name}: ${key} fits viewport`);}
      assert(layout.speed.bottom<layout.hull.top);assert(layout.lives.top<height*.1&&layout.lives.left<width*.1);
      assert(Math.abs(layout.heat.cx-layout.projected.x)<QA.tolerancePx&&Math.abs(layout.heat.cy-layout.projected.y)<QA.tolerancePx);
      await page.screenshot({path:path.join(OUT,`hud-${name}.png`)});
      await page.evaluate(()=>{qa.state.player.x=8;qa.state.player.y=4;qa.state.weapon.heat=95;qa.state.hull=12;});
      await page.waitForTimeout(QA.settleMs);
      const moved=await page.locator('#ship-heat').evaluate(node=>{const r=node.getBoundingClientRect();const p=qa.FlightScene.playerHudAnchor();return {x:r.left+r.width/2,y:r.top+r.height/2,p};});
      assert(Math.abs(moved.x-moved.p.x)<QA.tolerancePx&&Math.abs(moved.y-moved.p.y)<QA.tolerancePx);
      assert(Math.abs(moved.x-layout.heat.cx)>QA.tolerancePx&&Math.abs(moved.y-layout.heat.cy)>QA.tolerancePx,'Heat follows steering on both axes');
      await page.screenshot({path:path.join(OUT,`critical-${name}.png`)});
      await page.keyboard.press('Escape');await page.waitForFunction(()=>qa.state.mode==='paused'&&qa.FlightInterface.lastMode==='paused');
      const pause=await page.locator('#overlay').evaluate(node=>({texture:getComputedStyle(node).backgroundImage,world:getComputedStyle(document.getElementById('world')).visibility,debug:getComputedStyle(document.getElementById('music-debug')).display}));
      assert(pause.texture.includes('repeating-linear-gradient'));assert.equal(pause.world,'visible');assert.notEqual(pause.debug,'none');
      const frozen=await page.evaluate(()=>({time:qa.state.elapsed,distance:qa.state.distance,heat:qa.state.weapon.heat}));
      await page.waitForTimeout(100);assert.deepEqual(await page.evaluate(()=>({time:qa.state.elapsed,distance:qa.state.distance,heat:qa.state.weapon.heat})),frozen);
      await page.screenshot({path:path.join(OUT,`pause-${name}.png`)});
      await page.click('#resume');await page.waitForFunction(()=>qa.state.mode==='playing');
    }
    // Full loss still consumes a life, presents the crash, and restores hull at the checkpoint.
    await page.evaluate(()=>{qa.freeze=false;qa.state.hull=0;qa.state.nextSpawn=Infinity;qa.state.nextPickup=Infinity;});
    await page.waitForFunction(()=>qa.state.mode==='crashing'&&qa.FlightInterface.lastMode==='crashing');assert.equal(await page.locator('#lives-text').innerText(),'2');assert(await page.locator('#ship-heat').isHidden());
    await page.waitForFunction(()=>qa.state.mode==='playing'&&qa.state.hull===100&&qa.FlightInterface.hullState===qa.state);assert.equal(await page.locator('#lives-text').innerText(),'2');
    assert(await page.evaluate(()=>qa.FlightInterface.displayHull>0&&qa.FlightInterface.displayHull<100),'Hull interpolates on respawn too');
    assert.deepEqual(errors,[]);
    console.log('Flight HUD browser checks passed: 60% obstacle damage, immunity/fatal hits, unchanged enemy damage, real steering/fire, clean HUD, speed formatting, 100-degree upward heat arcs and cooling colors, hull interpolation/flash/thresholds, three viewport layouts, projected following, translucent pause, preserved debug, and crash/respawn.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
