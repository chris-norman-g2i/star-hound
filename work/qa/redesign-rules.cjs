const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'../..');process.chdir(root);
function context(folder='js',storage={getItem(){return null},setItem(){},removeItem(){}}){
 const ctx=vm.createContext({window:{localStorage:storage},console});
 for(const name of (folder==='js'?['settings','route','systems','checkpoints']:['settings','systems','checkpoints']))vm.runInContext(fs.readFileSync(`${folder}/${name}.js`,'utf8'),ctx);
 return ctx.window.Starhound;
}
const ns=context(),cfg=ns.settings,{race,propulsion,crash,weapon,pickups,encounters,checkpoint,tuning,music,scenery,tunnel,speedEffects}=cfg;
const old=context('archives/starhound-before-redesign-2026-10-07/js').settings;
const events=[],scene={clear(){},burst(){},celebrate(){events.push('checkpoint')},startCrash(){events.push('crash')}},sound={play(){},voice(){},crash(){},ring(){}};
const sys=new ns.FlightSystems(scene,sound),store=new ns.WaveCheckpoints();
const close=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
// All compounded speed bonuses lose exactly 33%, including during invincibility.
for(const powered of [false,true]){
 const s=race.state();s.mode='playing';s.charge=90;s.speed=160;if(powered)propulsion.turbo(s);
 race.advance(s,.01,new Set(['ShiftLeft']));s.speed=propulsion.target(s);const bonus=propulsion.bonus(s),speed=s.speed;
 propulsion.impact(s,'enemy');close(propulsion.bonus(s),bonus*.67);close(s.speed,speed*.55);
 const recoverStart=s.speed;for(let i=0;i<120;i++)race.advance(s,.01,new Set(['ShiftLeft']));
 close(s.speed,propulsion.target(s));assert(s.speed>recoverStart);assert.equal(s.motion.recovery,null);
}
for(const type of ['rock','barrier']){
 const s=race.state();s.mode='playing';s.charge=100;propulsion.turbo(s);race.advance(s,.01,new Set(['ShiftLeft']));
 propulsion.impact(s,type);assert.equal(s.speed,0);assert.equal(propulsion.bonus(s),0);assert.equal(s.charge,0);assert.equal(s.turbo,0);assert(!s.boosting);
 let first,half;for(let i=0;i<120;i++){race.advance(s,.01,new Set(['ShiftLeft']));if(i===0)first=s.speed;if(i===59)half=s.speed;}
 close(s.speed,race.baseSpeed(s.wave));assert(first<half*.01);close(half,race.baseSpeed(s.wave)*.25);assert.equal(s.motion.recovery,null);
 pickups.collect(pickups.make('charge',0,0,0),s);race.advance(s,.01,new Set(['ShiftLeft']));assert(!s.boosting);
 race.advance(s,.01,new Set());race.advance(s,.01,new Set(['ShiftLeft']));assert(s.boosting);
}
// Invincibility blocks hull damage, not collision momentum. Outer boundaries only constrain.
for(const type of ['rock','enemy','barrier']){
 sys.reset();const s=race.state();s.mode='playing';s.invincible=7;s.charge=100;s.speed=110;
 sys.entities=[{type,x:0,y:0,d:0,rx:1,ry:1,rz:1,hp:Infinity,age:0,phase:0}];sys.collide(s);
 assert.equal(s.hull,100);assert(s.speed<110);assert(s.motion.recovery);
}
const outside=race.state();outside.player.x=200;cfg.flight.step(outside.player,new Set(),.01);assert.equal(outside.hull,100);assert.equal(outside.speed,race.startSpeed);
// Half firing intervals, unchanged heat and full overheat recovery across all upgrades/timesteps.
for(let fire=0;fire<4;fire++)close(weapon.interval({...weapon.state(),fireLevel:fire}),old.weapon.interval({...old.weapon.state(),fireLevel:fire})*.5);
assert.equal(weapon.heatPerVolley,old.weapon.heatPerVolley);assert.equal(weapon.coolingPerSecond,old.weapon.coolingPerSecond);
for(const dt of [.01,.025,.05])for(let fireLevel=0;fireLevel<4;fireLevel++)for(let coolLevel=0;coolLevel<4;coolLevel++){
 const w={...weapon.state(),fireLevel,coolLevel,heat:100,overheated:true,lock:.5};let t=0;
 while(w.overheated&&t<15){weapon.tick(w,dt);t+=dt;}assert(Math.abs(t-(100/weapon.cooling(w)+.5))<=dt+1e-7);
}
// Gates save once at a wave boundary, regardless of lateral position. Crashes consume one life.
let s=race.state();s.mode='playing';s.nextSpawn=Infinity;s.nextPickup=Infinity;store.begin(s);
s.distance=race.waveLength-.1;s.player.x=9;s.player.y=5;sys.step(s,.01,new Set());s=store.afterStep(s,sys);
assert.equal(s.wave,2);assert.equal(store.current.wave,2);assert(s.checkpointCelebration>0);assert.equal(events.filter(e=>e==='checkpoint').length,1);
s.weapon.tier=3;s.weapon.fireLevel=2;store.begin(s);
for(const lives of [2,1,0]){
 s.hull=0;sys.step(s,.01,new Set());s=store.afterStep(s,sys);
 assert.equal(s.mode,'crashing');assert.equal(s.lives,lives);const distance=s.distance;
 for(let i=0;i<51;i++){sys.step(s,.05,new Set(['Space']));s=store.afterStep(s,sys);assert.equal(s.mode,'crashing');assert.equal(s.distance,distance);assert.equal(s.lives,lives);}
 sys.step(s,.05,new Set());s=store.afterStep(s,sys);
 if(lives){assert.equal(s.mode,'playing');assert.equal(s.hull,100);assert.equal(s.protection,3);assert.equal(s.weapon.tier,3);assert.equal(s.weapon.fireLevel,2);assert.equal(s.distance,race.checkpointDistance(2));}
 else{assert.equal(s.mode,'defeat');assert.equal(store.current,null);}
}
assert.equal(events.filter(e=>e==='crash').length,3);
// Frequency reduction applies to both generated paths and enemy drops; totals are preserved.
for(const source of ['path','drop']){
 let before=0,after=0;const newRun=race.state('FREQUENCY'),oldRun=old.race.state('FREQUENCY');
 for(let i=0;i<30000;i++){
  const e={x:0,y:0,d:i*173,phase:i};
  const n=source==='path'?pickups.scheduled(newRun):pickups.drop(e,newRun);
  const o=source==='path'?old.pickups.scheduled(oldRun):old.pickups.drop(e,oldRun);
  after+=n.pickup==='invincible';before+=o.pickup==='invincible';
 }
 assert(Math.abs(after/before-.25)<.035,`${source} invincibility ratio ${after/before}`);
 console.log(`${source} invincibility frequency: ${(after/before*100).toFixed(1)}% of original`);
}
assert.equal(Object.keys(cfg.assets.pickupParts).length,7);assert.equal(new Set(Object.values(pickups.food)).size,7);
for(const parts of Object.values(cfg.assets.pickupParts))for(const [shape,color,position,scale] of parts){assert(cfg.assets.shapes[shape]);assert(Number.isFinite(color));assert(position.every(Number.isFinite));assert(scale.every(n=>Number.isFinite(n)&&n>0));}
// Speed effects depend only on absolute speed and remain finite. Tempo growth is halved.
for(const speed of [0,56,100,200,300,1000]){
 const state={speed};close(music.tempo('game0',state)/music.tracks.game0.bpm-1,(old.music.tempo('game0',state)/old.music.tracks.game0.bpm-1)*.5);
 assert(Number.isFinite(speedEffects.hudBlur(speed)));assert(Number.isFinite(speedEffects.blur(speed)));
}
assert(speedEffects.intensity(56)>0);assert.equal(speedEffects.hudBlur(180),0);assert(speedEffects.hudBlur(400)>0);
for(const id of Object.keys(music.tracks))for(let step=0;step<256;step++)for(const note of music.events(id,step,music.tracks[id].bpm??music.oneShotBpm))assert(Number.isFinite(note.frequency)&&Number.isFinite(note.duration));
// Seed replay, decorative separation, checkpoint export and blocked persistence.
const layout=()=>{const s=race.state('REPLAY');race.jump(s,8);const result=[];for(let i=0;i<20;i++){result.push(encounters.make(s));for(let j=0;j<100;j++)scenery.placement(j);result.push(pickups.scheduled(s));}return JSON.stringify(result);};assert.equal(layout(),layout());
for(let i=0;i<10000;i++){const p=scenery.placement(i);if(scenery.clearsPath(p)){const c=tunnel.center(p.d);for(let o=-p.radius;o<=p.radius;o+=.5){const path=tunnel.center(p.d+o);assert(Math.hypot(c.x+p.x-path.x,c.y+p.y-path.y)>scenery.corridorRadius+p.radius+scenery.clearance-.2);}}}
const exported=vm.createContext({window:{}});vm.runInContext(tuning.exportSource(),exported);assert.equal(exported.window.Starhound.settings.weapon.baseInterval,.11);assert(checkpoint.valid(checkpoint.capture(race.state())));
const blocked=context('js',{getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}});const memory=new blocked.WaveCheckpoints();memory.begin(blocked.settings.race.state());assert(memory.resume());assert(memory.warning);
assert(encounters.interval(1)<old.encounters.interval(1));assert(encounters.interval(8)<old.encounters.interval(8));
console.log('Redesign rules passed: collisions, immunity, recovery, firing/heat, gates, 3 timed crashes, rollback, rarity, food models, tempo, scenery clearance, seeds, persistence and complete export.');

// Legacy progress is imported once, adjusted for new firing/density rules, and never resurrected after defeat.
const disk=new Map([[checkpoint.legacyKey,JSON.stringify(old.checkpoint.capture(old.race.state('LEGACY')))]]);
const migrated=context('js',{getItem:k=>disk.get(k),setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)});
let migratedStore=new migrated.WaveCheckpoints();assert.equal(migratedStore.current.seed,'LEGACY');assert.equal(migratedStore.current.rules['weapon.baseInterval'],.11);migratedStore.write(null);migratedStore=new migrated.WaveCheckpoints();assert.equal(migratedStore.current,null);
console.log('Legacy checkpoint migration, archive storage isolation and exhausted-life clearing passed.');
