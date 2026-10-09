const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const RUNTIME=process.env.PLAYWRIGHT_PATH||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {chromium}=require(RUNTIME),ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/qa/motifs');
const BROWSER=process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
(async()=>{
  const browser=await chromium.launch({executablePath:BROWSER,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];let runGame=false;
    page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.route('**/*',async request=>{
      const url=new URL(request.request().url());
      if(url.hostname==='cdn.jsdelivr.net')return request.fulfill({path:process.env.THREE_PATH||'/tmp/starhound-three-r160.min.js',contentType:'text/javascript'});
      if(url.hostname!=='starhound.test')return request.fulfill({body:''});
      const file=path.join(ROOT,url.pathname==='/'?'index.html':decodeURIComponent(url.pathname));
      if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file))return request.fulfill({status:404,body:''});
      if(url.pathname==='/js/game.js'){
        if(!runGame)return request.fulfill({body:'Starhound.Game={init(){}};',contentType:'text/javascript'});
        const prefix=`window.gameQA={};
          const Scene=Starhound.FlightScene;Starhound.FlightScene=class extends Scene{constructor(...args){super(...args);gameQA.scene=this;}};
          const Systems=Starhound.FlightSystems;Starhound.FlightSystems=class extends Systems{constructor(...args){super(...args);gameQA.systems=this;}};
          const render=Starhound.FlightScene.prototype.render;Starhound.FlightScene.prototype.render=function(s,...args){gameQA.state=s;return render.call(this,s,...args);};`;
        return request.fulfill({body:prefix+fs.readFileSync(file,'utf8'),contentType:'text/javascript'});
      }
      return request.fulfill({path:file,contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf','.mp3':'audio/mpeg'}[path.extname(file)]||'application/octet-stream'});
    });
    await page.goto('http://starhound.test/');fs.mkdirSync(OUT,{recursive:true});
    await page.evaluate(()=>{
      const ns=Starhound,{race,tuning}=ns.settings;window.qa={};qa.state=race.state('VISUAL');qa.state.mode='playing';qa.state.protection=0;
      qa.plan=new ns.RoutePlan('VISUAL');qa.scene=new ns.FlightScene(document.getElementById('world'),qa.plan);
      qa.sound=new ns.SoundEngine();qa.sim=new ns.InteractiveMotifs(qa.plan,qa.scene,qa.sound);
      qa.view=new ns.FlightInterface();qa.view.update(qa.state,0,0,qa.scene.playerHudAnchor());
      qa.controls=new ns.FlightControls({state:()=>qa.state,opened(){},closed(){},applied(){qa.scene.applyTuning()},playNow(){}});
      qa.pose=(kind,position)=>{
        const {route}=ns.settings;for(const [id,spec] of Object.entries(route.motifs)){route[spec.weight]=id===kind?1:0;spec.enabled=true;}
        qa.scene.clear();qa.plan.reset('VISUAL');qa.plan.extend(25000);qa.segment=qa.plan.segments.find(s=>s.kind===kind);
        qa.state=race.state('VISUAL');qa.state.mode='playing';qa.state.protection=0;qa.state.speed=100;
        qa.state.distance=position==='inside'?qa.segment.start+180:qa.segment.start-60;qa.state.previousDistance=qa.state.distance;
        qa.state.wave=race.waveAt(qa.state.distance);qa.state.sector=race.sectorAt(qa.state.wave);
        qa.view.update(qa.state,0,0,qa.scene.playerHudAnchor());qa.scene.render(qa.state,0,0,[],[]);
      };
    });
    const snapshot=async name=>{await page.waitForTimeout(120);await page.screenshot({path:path.join(OUT,name+'.png')});};
    // Both station families share portal geometry, while only the standard centerline is linear.
    for(const kind of ['station','curvedStation']){
      await page.evaluate(kind=>qa.pose(kind,'entry'),kind);await snapshot(kind+'-entrance');
      await page.evaluate(kind=>qa.pose(kind,'inside'),kind);await snapshot(kind+'-interior');
      assert(await page.evaluate(()=>[...qa.scene.environment.motifs.values()].some(g=>g.userData.segment?.kind===qa.segment.kind)));
    }
    for(const direction of [1,-1]){
      await page.evaluate(direction=>{
        qa.pose('traffic','inside');qa.segment.direction=direction;
        qa.state.distance=qa.segment.mergeStart-100;qa.state.previousDistance=qa.state.distance;qa.state.player.y=0;
        for(let frame=0;frame<25;frame++){qa.state.elapsed+=.025;qa.state.previousDistance=qa.state.distance;qa.state.distance+=qa.state.speed*.025;qa.sim.step(qa.state,.025,qa.state.player);qa.scene.render(qa.state,.025,0,[],[]);}
      },direction);
      await snapshot(direction===1?'traffic-with':'traffic-oncoming');
      const report=await page.evaluate(()=>({count:qa.scene.motifView.vehicles.size,
        kinds:[...new Set(qa.state.motifRuntime.vehicles.map(v=>v.kind))],
        noCones:!qa.scene.engines,plasma:qa.scene.exhaust.layers.plasma.geometry.instanceCount,
        smoke:qa.scene.exhaust.layers.smoke.geometry.instanceCount,drawCalls:qa.scene.renderer.info.render.calls}));
      assert(report.count>50);assert.equal(report.kinds.length,4);assert(report.noCones);assert(report.plasma>0&&report.smoke>0);
      console.log('Traffic render',direction,report);
    }
    for(const kind of ['glass','cart','clothes','boxes']){
      await page.evaluate(kind=>{
        qa.pose('tropes','inside');const stage=qa.segment.stages.find(s=>s.kind===kind);qa.stage=stage;
        qa.state.distance=stage.d-30;qa.state.previousDistance=qa.state.distance;
        qa.sim.step(qa.state,.025,qa.state.player);qa.scene.render(qa.state,.025,0,[],[]);
      },kind);
      await snapshot('trope-'+kind);
      if(kind==='glass'){
        const polygons=await page.evaluate(()=>{
          const stage=qa.scene.motifView.stages.get(qa.stage.id);return stage.userData.movers.map(group=>group.children.reduce((sum,mesh)=>sum+(mesh.geometry.index?mesh.geometry.index.count:mesh.geometry.attributes.position.count)/3,0));
        });assert.deepEqual(polygons,[50,50]);
      }
      if(kind==='boxes')assert(await page.evaluate(()=>qa.scene.motifView.boxMaterials.every(material=>material.map.image?.complete)));
      await page.evaluate(()=>{
        const r=qa.state.motifRuntime,stage=r.stages.find(stage=>stage.id===qa.stage.id),prop=stage.props[0];
        qa.state.distance=qa.stage.d;qa.state.previousDistance=qa.stage.d-1;qa.state.player.x=prop.x;qa.state.player.y=prop.y;
        qa.sim.collide(qa.state,r,qa.state.player,[]);
        for(let i=0;i<10;i++){qa.state.elapsed+=.025;qa.sim.move(qa.state,r,.025);qa.scene.render(qa.state,.025,0,[],[]);}
      });await snapshot('trope-'+kind+'-hit');
      if(kind==='clothes'){
        assert(await page.evaluate(()=>qa.scene.motifView.attached?.parent===qa.scene.dog));
        const before=await page.evaluate(()=>JSON.stringify(qa.scene.motifView.attached.geometry.attributes.position.array));
        await page.evaluate(()=>{qa.state.mode='paused';qa.scene.render(qa.state,0,0,[],[]);});
        assert.equal(await page.evaluate(()=>JSON.stringify(qa.scene.motifView.attached.geometry.attributes.position.array)),before);
      }
    }
    // Exhaust remains smooth at close range and resizes independently of point-size limits.
    await page.evaluate(()=>{qa.pose('traffic','inside');qa.state.distance=qa.segment.mergeStart;qa.state.previousDistance=qa.state.distance;
      qa.state.boosting=true;for(let i=0;i<25;i++){qa.state.elapsed+=.025;qa.state.previousDistance=qa.state.distance;qa.state.distance+=qa.state.speed*.025;qa.scene.render(qa.state,.025,0,[],[]);}});
    await snapshot('player-exhaust');
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>{qa.scene.resize();qa.scene.render(qa.state,0,0,[],[]);});await snapshot('mobile-exhaust');
    // Form-generated controls save all new tuning values and survive a reload.
    await page.setViewportSize({width:1440,height:900});
    await page.evaluate(()=>{qa.state.mode='title';qa.controls.open();});
    for(const label of ['Curved space station frequency weight','Traffic frequency weight','Movie tropes frequency weight'])assert.equal(await page.getByRole('spinbutton',{name:label,exact:true}).count(),1);
    await page.getByRole('spinbutton',{name:'Traffic frequency weight',exact:true}).fill('3');await page.click('#apply-tuning');
    assert((await page.locator('#tuning-status').innerText()).includes('Settings saved'));
    await page.reload();assert.equal(await page.evaluate(()=>Starhound.settings.route.trafficWeight),3);
    runGame=true;await page.reload();await page.waitForFunction(()=>gameQA.state?.mode==='title');
    await page.click('#launch');await page.waitForFunction(()=>gameQA.state?.mode==='playing');
    await page.evaluate(()=>{
      const {route}=Starhound.settings;for(const spec of Object.values(route.motifs))route[spec.weight]=spec.family==='traffic'?1:0;
      const s=gameQA.state;gameQA.systems.reset();gameQA.scene.route.reset(s.seed);gameQA.scene.route.extend(6000);
      const segment=gameQA.scene.route.segments.find(segment=>segment.kind==='traffic');s.distance=segment.mergeStart-40;s.previousDistance=s.distance;
      s.motifRuntime=null;s.player={x:0,y:9,vx:0,vy:0};s.invincible=99;s.nextSpawn=Infinity;s.nextPickup=Infinity;
    });
    await page.waitForFunction(()=>gameQA.scene.motifView.vehicles.size>20);
    await page.keyboard.press('Escape');await page.waitForFunction(()=>gameQA.state.mode==='paused');
    const paused=await page.evaluate(()=>({time:gameQA.state.elapsed,runtime:JSON.stringify(gameQA.state.motifRuntime),particles:gameQA.scene.exhaust.layers.smoke.particles.map(p=>p.age)}));
    await page.waitForTimeout(150);
    assert.deepEqual(await page.evaluate(()=>({time:gameQA.state.elapsed,runtime:JSON.stringify(gameQA.state.motifRuntime),particles:gameQA.scene.exhaust.layers.smoke.particles.map(p=>p.age)})),paused);
    await page.keyboard.press('Escape');await page.waitForFunction(()=>gameQA.state.mode==='playing');
    await page.waitForFunction(time=>gameQA.state.elapsed>time,paused.time);
    await page.keyboard.press('Escape');await page.waitForFunction(()=>gameQA.state.mode==='paused');
    // Direct disk launches retain functional embedded textures without a local server.
    const local=await browser.newPage();local.on('pageerror',error=>errors.push(error.message));
    local.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await local.route('**/three.min.js',request=>request.fulfill({path:process.env.THREE_PATH||'/tmp/starhound-three-r160.min.js',contentType:'text/javascript'}));
    await local.goto('file://'+path.join(ROOT,'index.html'));
    await local.waitForFunction(()=>Starhound.Game&&document.querySelector('#world'));
    await local.waitForFunction(()=>Object.values(Starhound.MotifTextures).every(source=>source.startsWith('data:image/svg+xml;base64,')));
    assert(await local.evaluate(async()=>{
      const loader=new THREE.TextureLoader();
      const textures=await Promise.all(Object.values(Starhound.MotifTextures).map(source=>loader.loadAsync(source)));
      const loaded=textures.every(texture=>texture.image.complete);textures.forEach(texture=>texture.dispose());return loaded;
    }));
    await local.click('#launch');await local.locator('#world').waitFor({state:'visible'});await local.close();
    assert.deepEqual(errors,[]);console.log('Browser checks passed: all motifs and reactions, actual spaceman triangles, logo textures, shared smoke/plasma, cloth attachment/pause, mobile resize, controls/persistence, actual gameplay pause/resume, and direct disk launch. Screenshots:',OUT);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
