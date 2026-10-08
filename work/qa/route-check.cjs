const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function setup(storage){
 const window={localStorage:storage},context=vm.createContext({window,console});
 for(const name of ['settings','route','systems','checkpoints'])vm.runInContext(fs.readFileSync(`js/${name}.js`,'utf8'),context);
 return window.Starhound;
}
const disk=new Map(),storage={getItem:k=>disk.get(k)||null,setItem:(k,v)=>disk.set(k,v)};
const ns=setup(storage),{race,tuning,checkpoint,route,speedRings,random,propulsion}=ns.settings;
const close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
// Applied values and seed survive reload and take priority over old checkpoint rules.
const old=race.state('OLD'),saved=checkpoint.capture(old),values=tuning.values();
values['race.waveLength']=1500;values['route.cruiserLength']=1700;
assert(tuning.save(values,'NEW-SEED'));const reloaded=setup(storage);
assert.equal(reloaded.settings.race.waveLength,1500);assert.equal(reloaded.settings.route.cruiserLength,1700);
const restored=reloaded.settings.checkpoint.restore({...saved,wave:3,bestWave:3});
assert.equal(restored.seed,'NEW-SEED');assert.equal(restored.distance,3000);assert.equal(reloaded.settings.race.waveLength,1500);
assert(reloaded.settings.checkpoint.valid(saved));assert(!reloaded.settings.checkpoint.valid({...saved,rules:{}}));
const malformed=setup({getItem(){return '{broken'},setItem(){}});assert.equal(malformed.settings.race.waveLength,malformed.settings.tuning.defaults['race.waveLength']);
const blocked=setup({getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}});
assert.equal(blocked.settings.tuning.save({...blocked.settings.tuning.values(),'race.waveLength':1400},'SESSION'),false);
blocked.settings.tuning.load();assert.equal(blocked.settings.race.waveLength,1400);
// Seeding, exact per-cycle open distance share, and independence from encounter RNG.
const plan=new ns.RoutePlan('MOTIFS');random.seed('ENCOUNTERS');const rng=random.value;
plan.extend(60000);assert.equal(random.value,rng);
const twin=new ns.RoutePlan('MOTIFS');twin.extend(60000);assert.equal(JSON.stringify(plan.segments),JSON.stringify(twin.segments));
assert.notEqual(JSON.stringify(plan.segments),JSON.stringify(new ns.RoutePlan('OTHER').between(0,60000)));
for(let i=0;i<plan.segments.length;i+=2){const open=plan.segments[i],special=plan.segments[i+1];close((open.end-open.start)/(special.end-open.start),route.openShare);}
for(const kind of ['open','tunnel','station','cruiser'])assert(plan.segments.some(s=>s.kind===kind));
const sound={play(){},voice(){},ring(chain){this.tones.push(chain)},tones:[]};
// Tunnel walls hurt and reduce momentum once per contact, including while shielded.
const tunnel=plan.segments.find(s=>s.kind==='tunnel'),flight=race.state('MOTIFS');
flight.mode='playing';flight.distance=tunnel.start+20;flight.previousDistance=flight.distance-1;flight.player.x=9.7;flight.protection=0;
flight.motion.ringBonus=.4;flight.speed=100;plan.collide(flight,sound);assert.equal(flight.hull,40);assert.equal(flight.speed,0);assert.equal(flight.motion.ringBonus,0);
assert(Math.hypot(flight.player.x,flight.player.y)<route.tunnel.radius);flight.player.x=9.7;flight.speed=45;plan.collide(flight,sound);assert.equal(flight.speed,45);
flight.player.x=0;plan.collide(flight,sound);flight.player.x=9.7;flight.invincible=7;plan.collide(flight,sound);assert.equal(flight.speed,0);assert.equal(flight.hull,40);
// A station's front wall cannot be flown through; steering into its aperture releases it.
const station=plan.segments.find(s=>s.kind==='station'),portal=station.portals[0],ship=race.state('MOTIFS');
ship.mode='playing';ship.protection=0;ship.previousDistance=portal.d-2;ship.distance=portal.d;ship.player.x=portal.x+route.station.openingHalfWidth+1;ship.player.y=portal.y;
plan.collide(ship,sound);assert(ship.distance<portal.d-route.station.portalDepth);assert.equal(ship.hull,40);
ship.player.x=portal.x;ship.player.y=portal.y;ship.previousDistance=ship.distance;ship.distance=portal.d;
assert.equal(plan.contact(ship),null);
assert(plan.gateProfile(tunnel.start+20).rx<route.tunnel.radius);
assert.equal(plan.gateProfile(portal.d).shape,'rectangle');assert.equal(plan.gateProfile(station.end).shape,'rectangle');
const obstacle=station.obstacles[0];assert(obstacle);ship.distance=obstacle.d;ship.previousDistance=obstacle.d-4;ship.player.x=obstacle.x;ship.player.y=obstacle.y;assert.equal(plan.contact(ship).kind,'bulkhead');
// Unrelated checkpoint boundaries cannot be saved when a portal pushes the ship back.
const boundaryNS=setup({getItem(){return null},setItem(){}}),boundaryPlan=new boundaryNS.RoutePlan('BOUNDARY');
boundaryPlan.extend(10000);const boundaryStation=boundaryPlan.segments.find(s=>s.kind==='station');
const boundaryPortal=boundaryStation.portals[0];boundaryNS.settings.race.waveLength=boundaryPortal.d-.5;
const boundaryState=boundaryNS.settings.race.state('BOUNDARY');boundaryState.mode='playing';boundaryState.distance=boundaryPortal.d-2;
boundaryState.previousDistance=boundaryState.distance;boundaryState.player.x=9;boundaryState.nextSpawn=Infinity;boundaryState.nextPickup=Infinity;
const boundaryScene={route:boundaryPlan,clear(){},celebrate(){throw Error('premature checkpoint')},burst(){},startCrash(){}};
new boundaryNS.FlightSystems(boundaryScene,{play(){},voice(){},ring(){},crash(){}}).step(boundaryState,.05,new Set());
assert.equal(boundaryState.wave,1);assert(!boundaryState.pendingCheckpoint);
// Cruiser sections remain scenery on only the left, right or bottom.
for(const segment of plan.segments.filter(s=>s.kind==='cruiser'))assert(['left','right','bottom'].includes(segment.side));
// Ring results are swept through in distance order; edge hits never cause hull damage.
const ringPlan=new ns.RoutePlan('RINGS'),rings=ringPlan.visibleRings(0,900).filter(r=>r.series===0);assert(rings.length>=3&&rings.length<=7);
const s=race.state('RINGS');s.mode='playing';const [first,second,third]=rings;
s.previousDistance=first.d-1;s.distance=first.d+1;s.player={x:first.x,y:first.y,vx:0,vy:0};ringPlan.crossRings(s,s.player,sound);
assert.equal(first.result,'passed');close(s.motion.ringBonus,speedRings.bonusPerRing);assert(s.speed>race.cruiseSpeed(s.distance));assert.equal(sound.tones.at(-1),1);
s.previousDistance=second.d-1;s.distance=second.d+1;s.player.x=second.x+speedRings.radius+1;s.player.y=second.y;ringPlan.crossRings(s,s.player,sound);assert.equal(second.result,'missed');close(s.motion.ringBonus,speedRings.bonusPerRing);assert.equal(s.hull,100);
s.previousDistance=third.d-1;s.distance=third.d+1;s.player.x=third.x;s.player.y=third.y;ringPlan.crossRings(s,s.player,sound);assert.equal(sound.tones.at(-1),1);
const bonus=s.motion.ringBonus;propulsion.advance(s,1,new Set());assert(s.motion.ringBonus<bonus);
s.motion.ringBonus=speedRings.bonusCap;const captured=checkpoint.capture(s);close(checkpoint.restore(captured).motion.ringBonus,speedRings.bonusCap);
console.log('Route/settings checks passed: persistence and precedence, blocked/malformed storage, deterministic 60% open route, tunnel/portal/bulkhead collisions, shield momentum, cruiser sides, offset ring hit/miss/pitch reset, speed decay and checkpoint bonus.');
// Every complete scheduled series has 3–7 rings, including those near station doors.
const groupPlan=new ns.RoutePlan('GROUPS'),groups=new Map();
for(const ring of groupPlan.visibleRings(0,60000)){const bag=groups.get(ring.series)||[];bag.push(ring);groups.set(ring.series,bag);}
for(const bag of [...groups.values()].slice(0,-1))assert(bag.length>=speedRings.minCount&&bag.length<=speedRings.maxCount);
// A long run exercises motif transitions, station exit apertures, pooled spawning and
// checkpoint turnover. Guide the ship into station doors; invincibility isolates lifecycle stress.
const longNS=setup({getItem(){return null},setItem(){}}),longRace=longNS.settings.race;
const longScene={route:new longNS.RoutePlan('LONG-RUN'),clear(){},burst(){},celebrate(){},startCrash(){}};
const longSystems=new longNS.FlightSystems(longScene,{play(){},voice(){},ring(){},crash(){}}),store=new longNS.WaveCheckpoints();
let run=longRace.state('LONG-RUN'),peak=0;run.mode='playing';store.begin(run);
for(let tick=0;tick<24000;tick++){
 const config=longNS.settings.route;
 const doors=longScene.route.between(run.distance-config.station.runwayDistance,run.distance+config.station.runwayDistance).flatMap(s=>s.portals||[]);
 const door=doors.find(p=>Math.abs(p.d-run.distance)<config.station.runwayDistance);
 run.player.x=door?.x||0;run.player.y=door?.y||0;run.player.vx=0;run.player.vy=0;run.invincible=99;
 longSystems.step(run,.025,new Set(['Space']));run=store.afterStep(run,longSystems);
 peak=Math.max(peak,longSystems.entities.length+longSystems.bullets.length);
 assert.equal(run.mode,'playing');assert.equal(run.lives,3);
}
assert(run.wave>16);assert(peak<200);
console.log(`Ten-minute route integration passed: wave ${run.wave}, ${run.kills} takedowns, peak ${peak} active entities.`);
