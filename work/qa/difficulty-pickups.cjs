const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'../..');
const TEST={distance:100000,samples:3000,spacing:100,frequency:.35,tolerance:.04};
function setup(storage,folder='js'){
 const window={localStorage:storage},context=vm.createContext({window,console});
 for(const name of folder==='js'?['settings','route','systems','checkpoints']:['settings'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,folder,name+'.js'),'utf8'),context);
 return window.Starhound;
}
const plain=value=>JSON.parse(JSON.stringify(value));
const ns=setup(),{difficulty,race,encounters,pickups,tuning,checkpoint,propulsion}=ns.settings;
const close=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
assert(tuning.valid(tuning.values()));
assert(tuning.fields.every(field=>!Array.isArray(field)));
assert(!tuning.fields.some(({path,label})=>path==='pickups.interval'||path==='encounters.hardInterval'||/wave \d/i.test(label)));
// Continuous progression has no checkpoint or wave-length dependency.
close(difficulty.progress(0),0);close(difficulty.progress(difficulty.distanceScale),1);
close(race.cruiseSpeed(0),race.startSpeed);close(encounters.interval(0),encounters.startInterval);
assert.equal(encounters.count(0),encounters.startCount);
for(let d=0;d<=TEST.distance;d+=100){
 assert(difficulty.progress(d+1)>=difficulty.progress(d));
 assert(race.cruiseSpeed(d+1)>=race.cruiseSpeed(d));
 assert(encounters.interval(d+1)<=encounters.interval(d));
 assert(encounters.fireInterval(d+1)<=encounters.fireInterval(d));
 assert(race.cruiseSpeed(d)<=race.maxSpeed);assert(encounters.interval(d)>=encounters.minInterval);
 assert(encounters.count(d)<=encounters.maxCount);assert(encounters.fireInterval(d)>=encounters.minFireInterval);
}
const d=difficulty.distanceScale,reference=[difficulty.progress(d),race.cruiseSpeed(d),encounters.interval(d),encounters.enemy(0,0,d,2,0)];
race.waveLength*=2;
assert.deepEqual(plain([difficulty.progress(d),race.cruiseSpeed(d),encounters.interval(d),encounters.enemy(0,0,d,99,0)]).slice(0,3),plain(reference).slice(0,3));
const twin=encounters.enemy(0,0,d,99,0);assert.equal(twin.hp,reference[3].hp);assert.equal(twin.drift,reference[3].drift);assert.equal(twin.fire,reference[3].fire);
difficulty.growth=0;
assert.equal(race.cruiseSpeed(TEST.distance),race.startSpeed);assert.equal(encounters.interval(TEST.distance),encounters.startInterval);
assert.equal(encounters.count(TEST.distance),encounters.startCount);
assert.equal(encounters.enemy(0,0,TEST.distance,999,0).hp,encounters.startEnemyHp);
assert.equal(encounters.rock(0,0,TEST.distance,999,0).hp,encounters.startRockHp);
assert.equal(encounters.fireInterval(TEST.distance),encounters.startFireInterval);
assert(!encounters.shouldShoot({...encounters.enemy(0,0,TEST.distance,999,0),fire:0},{distance:TEST.distance-100}));
// Each ramp component supports a configurable flat curve independently.
tuning.apply(tuning.defaults);encounters.spacingDecay=0;assert.equal(encounters.interval(TEST.distance),encounters.startInterval);
tuning.apply(tuning.defaults);encounters.countGrowth=0;assert.equal(encounters.count(TEST.distance),encounters.startCount);
tuning.apply(tuning.defaults);encounters.enemyHpGrowth=0;assert.equal(encounters.enemy(0,0,TEST.distance,1,0).hp,encounters.startEnemyHp);
tuning.apply(tuning.defaults);encounters.rockHpGrowth=0;assert.equal(encounters.rock(0,0,TEST.distance,1,0).hp,encounters.startRockHp);
tuning.apply(tuning.defaults);encounters.driftGrowth=0;assert.equal(encounters.enemy(0,0,TEST.distance,1,0).drift,encounters.startDrift);
tuning.apply(tuning.defaults);encounters.fireDecay=0;assert.equal(encounters.fireInterval(TEST.distance),encounters.startFireInterval);
tuning.apply(tuning.defaults);race.speedGrowth=0;assert.equal(race.cruiseSpeed(TEST.distance),race.startSpeed);
tuning.apply(tuning.defaults);
// Recovery targets continuous cruise, and checkpoints/jumps initialize at their distance.
const state=race.state();race.jump(state,5);close(state.speed,race.cruiseSpeed(state.distance));
propulsion.impact(state,'rock');for(let i=0;i<120;i++)race.advance(state,.01,new Set());
close(state.speed,race.cruiseSpeed(state.previousDistance));assert.equal(state.motion.recovery,null);
// Spacing is identical in bonus stretches, across checkpoints, and for enemy drops.
function layout(frequency,spacing=TEST.spacing){
 pickups.frequency=frequency;pickups.minimumSpacing=spacing;
 const s=race.state('PICKUP-QA'),result=[];
 for(let i=0;i<TEST.samples;i++){
  s.distance=Math.max(0,s.nextPickup-encounters.spawnAhead);
  const p=pickups.scheduled(s);if(p)result.push(p);
 }
 return result;
}
assert.equal(layout(0).length,0);
const full=layout(1);assert.equal(full.length,TEST.samples);
for(let i=1;i<full.length;i++)assert.equal(full[i].d-full[i-1].d,TEST.spacing);
const sparse=layout(TEST.frequency);assert(Math.abs(sparse.length/TEST.samples-TEST.frequency)<TEST.tolerance);
assert.deepEqual(plain(layout(TEST.frequency)),plain(sparse));
const wide=layout(1,5000);for(let i=1;i<wide.length;i++)assert.equal(wide[i].d-wide[i-1].d,5000);
const seedState=race.state();pickups.minimumSpacing=TEST.spacing;pickups.frequency=1;
const first=pickups.scheduled(seedState);assert(first);
assert.equal(pickups.drop({x:0,y:0,d:first.d+TEST.spacing-1,phase:0},seedState),null);
assert(pickups.drop({x:0,y:0,d:first.d+TEST.spacing,phase:1},seedState));
assert.equal(pickups.scheduled(seedState),null); // The enemy drop reserved the next path slot.
pickups.frequency=0;assert.equal(pickups.drop({x:0,y:0,d:10000,phase:2},seedState),null);
// Both spawn loops and the actual enemy destruction path handle rejected pickups.
const scene={clear(){},burst(){},celebrate(){},startCrash(){}},sound={play(){},voice(){},ring(){},crash(){}};
const systems=new ns.FlightSystems(scene,sound);
const run=race.state();run.mode='playing';run.nextSpawn=Infinity;run.protection=10;systems.spawn(run);
assert(!systems.entities.some(e=>e.type==='pickup'));
function kill(distance){
 const e=encounters.enemy(0,0,distance,race.waveAt(distance),0);e.hp=1;
 systems.entities=[e];systems.bullets=[{x:0,y:0,d:distance,previousD:distance,radius:1}];systems.collide(run);
 return systems.entities.filter(e=>e.type==='pickup');
}
assert.equal(kill(1000).length,0);pickups.frequency=1;assert.equal(kill(1000).length,1);
assert.equal(kill(1000+TEST.spacing-1).length,0);assert.equal(kill(1000+TEST.spacing).length,1);
// Save/reload, export, checkpoint history and resume all use the same new parameters.
tuning.apply(tuning.defaults);
const disk=new Map(),storage={getItem:k=>disk.get(k),setItem:(k,v)=>disk.set(k,v)};
const saved=setup(storage);const values={...saved.settings.tuning.values(),'pickups.minimumSpacing':800,'pickups.frequency':.4,'difficulty.growth':.5};
assert(saved.settings.tuning.save(values,'SAVED'));
const reloaded=setup(storage);assert.equal(reloaded.settings.pickups.minimumSpacing,800);assert.equal(reloaded.settings.pickups.frequency,.4);assert.equal(reloaded.settings.difficulty.growth,.5);
const snapshotState=reloaded.settings.race.state();reloaded.settings.race.jump(snapshotState,3);
snapshotState.pickupDistances=[snapshotState.distance-100,snapshotState.distance+200];
const captured=reloaded.settings.checkpoint.capture(snapshotState);assert(reloaded.settings.checkpoint.valid(captured));
const resumed=reloaded.settings.checkpoint.restore(captured);
assert.deepEqual(plain(resumed.pickupDistances),[snapshotState.distance-100]);
assert(resumed.nextPickup>=resumed.distance);
assert.equal(reloaded.settings.pickups.drop({x:0,y:0,d:resumed.distance,phase:0},resumed),null);
const exported={window:{}};vm.runInNewContext(reloaded.settings.tuning.exportSource(),exported);
assert.deepEqual(plain(exported.window.Starhound.settings.tuning.values()),plain(reloaded.settings.tuning.values()));
assert(!tuning.valid({...tuning.values(),'encounters.minInterval':encounters.startInterval+1}));
assert(!tuning.valid({...tuning.values(),'race.maxSpeed':race.startSpeed-1}));
assert(!tuning.valid({...tuning.values(),'pickups.frequency':1.1}));
// Existing developer settings and both checkpoint generations migrate without lost progress.
const original=setup(undefined,'archives/starhound-before-redesign-2026-10-07/js').settings;
const legacyRules={...plain(original.tuning.values()),'race.waveLength':2200,'race.startSpeed':75,'race.speedPerWave':1,'race.endlessAcceleration':1,'encounters.easyInterval':150,'encounters.hardInterval':55,'pickups.interval':500};
const legacyDisk=new Map([[tuning.persistence.key,JSON.stringify({version:1,values:legacyRules,seed:'LEGACY'})]]);
const legacyStorage={getItem:k=>legacyDisk.get(k),setItem:(k,v)=>legacyDisk.set(k,v)};
const migrated=setup(legacyStorage).settings;
assert.equal(migrated.tuning.seed,'LEGACY');assert.equal(migrated.race.speedGrowth,15);
assert.equal(migrated.difficulty.distanceScale,33000);assert.equal(migrated.pickups.minimumSpacing,500);
assert(!('pickups.interval' in migrated.tuning.values()));
assert(tuning.migrateValues({...legacyRules,'encounters.easyInterval':400,'encounters.hardInterval':1}));
const oldCheckpoint={...plain(original.checkpoint.capture(original.race.state())),version:3,rules:legacyRules,wave:4,bestWave:4};
const updated=checkpoint.migrate(oldCheckpoint);assert(updated);assert.equal(updated.version,checkpoint.version);assert.equal(updated.wave,4);
assert.equal(checkpoint.restore(updated).wave,4);
legacyDisk.set(checkpoint.key,JSON.stringify(oldCheckpoint));const legacyNs=setup(legacyStorage),store=new legacyNs.WaveCheckpoints();
assert.equal(store.current.wave,4);assert.equal(store.current.version,checkpoint.version);assert(store.resume());
assert(checkpoint.migrate(plain(original.checkpoint.capture(original.race.state()))));
assert.equal(checkpoint.migrate({...oldCheckpoint,rules:{}}),null);
assert(!checkpoint.valid({...captured,rules:{}}));
console.log('Difficulty/pickup checks passed: continuous shared ramps, flat growth, limits, collision recovery, seeded frequency, universal spacing, actual enemy drops, persistence/export, checkpoint history, and legacy migration.');
