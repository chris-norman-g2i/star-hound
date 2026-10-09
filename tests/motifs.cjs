const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
function setup(storage={getItem(){return null},setItem(){}}){
  const window={localStorage:storage},context=vm.createContext({window,console});
  for(const name of ['settings','route','motif-systems','systems','checkpoints','sound'])vm.runInContext(fs.readFileSync(path.join(ROOT,`js/${name}.js`),'utf8'),context);
  return window.Starhound;
}
const ns=setup(),{route,tuning,race,tunnel,traffic,tropes,flight,hull,propulsion,random,checkpoint}=ns.settings;
// Exercise authored motifs even while their production availability is temporarily disabled.
for(const spec of Object.values(route.motifs))spec.enabled=true;
const close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const sound={events:[],play(...args){this.events.push(args)},voice(...args){this.events.push(args)},horn(...args){this.events.push(['horn',...args])},motif(...args){this.events.push(args)},ring(){},crash(){}};
const scene={bursts:[],burst(e){this.bursts.push(e.id)},celebrate(){},startCrash(){},clear(){}};
function only(kind){for(const [id,spec] of Object.entries(route.motifs))route[spec.weight]=id===kind?1:0;}
function at(kind){only(kind);const plan=new ns.RoutePlan('QA'),segment=plan.between(0,20000).find(s=>s.kind===kind),s=race.state('QA');
  s.mode='playing';s.protection=0;s.distance=segment.start;s.previousDistance=s.distance;
  return {plan,segment,s,sim:new ns.InteractiveMotifs(plan,scene,sound)};}
assert(tuning.valid(tuning.values()));
// Complete settings exports remain standalone, including steering bounds.
const exported=tuning.exportSource(),ctx=vm.createContext({window:{localStorage:{getItem(){return null}}},console});
vm.runInContext(exported,ctx);close(ctx.window.Starhound.settings.tunnel.bounds.halfWidth,tunnel.bounds.halfWidth);
// Migration preserves all version-6 values and divides the original station frequency.
const old=tuning.values();for(const key of Object.keys(old))if(key.startsWith('traffic.')||key.startsWith('tropes.')||/curvedStation|trafficWeight|tropesWeight/.test(key))delete old[key];
old['route.stationWeight']=8;old['route.stationLength']=680;
const upgraded=tuning.upgradeValues(6,old);assert(upgraded);close(upgraded['route.stationWeight'],4);close(upgraded['route.curvedStationWeight'],4);close(upgraded['route.curvedStationLength'],680);
const disk=new Map(),storage={getItem:key=>disk.get(key)||null,setItem:(key,value)=>disk.set(key,value)};
assert(setup(storage).settings.tuning.save(upgraded,'SAVE'));disk.set(tuning.persistence.key,JSON.stringify({version:6,seed:'MIGRATED',values:old}));
const migrated=setup(storage);close(migrated.settings.route.curvedStationWeight,4);assert.equal(migrated.settings.tuning.seed,'MIGRATED');
// Same seed gives identical motif boundaries without consuming encounter randomness.
for(const spec of Object.values(route.motifs))route[spec.weight]=1;
random.seed('RNG');const rng=random.value,a=new ns.RoutePlan('ALL'),b=new ns.RoutePlan('ALL');a.extend(150000);b.extend(150000);
assert.equal(random.value,rng);assert.equal(JSON.stringify(a.segments),JSON.stringify(b.segments));
for(const kind of Object.keys(route.motifs))assert(a.segments.some(segment=>segment.kind===kind));
for(let i=0;i<a.segments.length;i+=2)close((a.segments[i].end-a.segments[i].start)/(a.segments[i+1].end-a.segments[i].start),route.openShare);
for(const kind of ['station','curvedStation']){
  const {plan,segment,s}=at(kind),length=segment.end-segment.start;
  const first=plan.center(segment.start),last=plan.center(segment.end),mid=plan.center(segment.start+length/2);
  if(kind==='station'){close(mid.x,(first.x+last.x)/2);close(mid.y,(first.y+last.y)/2);}
  else{const expected=tunnel.center(segment.start+length/2);close(mid.x,expected.x);close(mid.y,expected.y);}
  close(plan.center(segment.start).x,tunnel.center(segment.start).x);close(plan.center(segment.end).y,tunnel.center(segment.end).y);
  for(const portal of segment.portals){
    s.previousDistance=portal.d-2;s.distance=portal.d;s.player.x=portal.x;s.player.y=portal.y;
    assert.equal(plan.contact(s),null);assert.equal(plan.gateProfile(portal.d).shape,'rectangle');
    s.player.x=portal.x+portal.rx+1;assert.equal(plan.contact(s).kind,'portal');
    assert(Math.abs(portal.x)+portal.rx<=tunnel.bounds.halfWidth);
  }
  assert(!plan.allowsEncounter({d:segment.start,type:'enemy'}));
}
assert(ns.sweptContact({x:0,y:0,d:0},{x:0,y:0,d:20},{x:0,y:0,d:30},{x:0,y:0,d:-10},{x:1,y:1,d:1}));
assert(!ns.sweptContact({x:0,y:0,d:0},{x:0,y:0,d:20},{x:4,y:0,d:30},{x:4,y:0,d:-10},{x:1,y:1,d:1}));
assert(traffic.oncomingChance(0)<traffic.oncomingChance(100000));assert(traffic.oncomingChance(1e9)<=traffic.oncoming.maximum);
for(const direction of [-1,1]){
  const {plan,segment,s,sim}=at('traffic');segment.direction=direction;
  assert(segment.mergeEnd-segment.mergeStart>=100&&segment.mergeEnd-segment.mergeStart<=400);
  assert(Math.abs(sim.trafficPoint(segment,segment.start,0).x)>150);
  assert(Math.abs(sim.trafficPoint(segment,segment.end,0).x)>150);
  assert(Math.abs(sim.trafficPoint(segment,segment.mergeStart,0).x-traffic.lanes[0][0])<.3);
  s.distance=segment.mergeStart;s.previousDistance=s.distance;s.player.y=9;
  sim.step(s,.016,s.player);const r=s.motifRuntime;
  assert(r.vehicles.length>50);assert(r.vehicles.every(v=>Math.sign(v.speed)===direction));
  assert(new Set(r.vehicles.map(v=>v.kind)).size===4);assert(r.vehicles.length<=traffic.maxVehicles);
  const v=r.vehicles.find(v=>Math.abs(v.d-s.distance)<50);r.vehicles=[v];
  v.x=0;v.y=0;v.previousX=0;v.previousY=0;v.previousD=s.distance+20;v.d=s.distance-20;v.contactCooldown=0;v.heading=[0,0,-direction];
  s.player.x=0;s.player.y=0;s.previousDistance=s.distance-1;
  sim.collide(s,r,s.player,[]);close(s.hull,40);assert(!v.dead);assert(v.vx!==0);assert(v.spin!==0);
  assert(sound.events.some(e=>e[0]==='horn'));
  // Two vehicles collide once and become genuine, lower-damage hazards.
  s.hurt=0;s.hull=100;s.player.x=12;s.player.y=9;
  const twin={...v,id:'collision-twin',dead:false};v.contactCooldown=0;r.vehicles=[v,twin];r.fragments=[];
  sim.collide(s,r,s.player,[]);assert(v.dead&&twin.dead);assert.equal(r.fragments.length,traffic.debris.count*2);
  const piece=r.fragments[0];r.vehicles=[];r.fragments=[piece];piece.x=piece.previousX=0;piece.y=piece.previousY=0;piece.d=piece.previousD=s.distance;
  s.player.x=s.player.y=0;sim.collide(s,r,s.player,[]);close(s.hull,85);assert(piece.dead);
}
const {plan,segment,s,sim}=at('tropes'),r=sim.state(s);
assert.equal(new Set(segment.stages.map(stage=>stage.kind)).size,4);
for(const stage of segment.stages){
  s.hull=100;s.hurt=0;s.protection=0;s.distance=stage.d;s.previousDistance=stage.d-1;
  const active={...stage,age:0,props:sim.makeProps(stage)};r.stages=[active];r.vehicles=[];r.fragments=[];
  const prop=active.props[0];s.player.x=prop.x;s.player.y=prop.y;
  sim.collide(s,r,s.player,[]);assert(prop.dead);
  if(stage.kind==='clothes'){
    close(s.hull,100);assert(s.motion.drag);close(propulsion.dragScale(s),tropes.clothes.speedMultiplier);
    const target=propulsion.target(s);propulsion.ring(s);close(s.speed,propulsion.target(s));assert(s.speed<race.cruiseSpeed(s.distance));
    s.motion.recovery={elapsed:0,from:0,cruiseOnly:true};propulsion.advance(s,.5,new Set(['ShiftLeft']));assert(s.speed<race.cruiseSpeed(s.distance));
    for(let i=0;i<120;i++)propulsion.advance(s,.05,new Set());assert.equal(s.motion.drag,null);
  }else{close(s.hull,90);assert(r.fragments.length);assert(r.fragments.every(p=>!p.hazard));}
  if(stage.kind==='boxes'){
    const size=tropes.boxes.size;assert(active.props.every(box=>box.rx*2===size&&box.ry*2===size&&box.rz*2===size));
    assert(active.props.every(box=>box.column!==stage.gap));assert(size>flight.shipRadius*2);
  }
}
// Mid-motif checkpoints retain dynamic state and timed clothing; old checkpoints remain valid.
propulsion.clothing(s,'shirt',0x72b4d0,4);const saved=checkpoint.capture(s);assert(checkpoint.valid(saved));
const restored=checkpoint.restore(saved);assert.equal(restored.motion.drag.remaining,4);
assert.equal(JSON.stringify(restored.motifRuntime),JSON.stringify(s.motifRuntime));
// A parked player gets continuing traffic without growing pools or resetting destroyed vehicles.
const stress=at('traffic');stress.s.distance=stress.segment.mergeStart;stress.s.previousDistance=stress.s.distance;stress.s.player.y=9;stress.s.invincible=999;
for(let tick=0;tick<2400;tick++){stress.sim.step(stress.s,.025,stress.s.player);const state=stress.s.motifRuntime;
  assert(state.vehicles.length<=traffic.maxVehicles);assert(state.fragments.length<=traffic.maxFragments+traffic.maxVisualFragments);assert(state.retired.length<traffic.maxVehicles*4);}
console.log('Motif rules passed: settings migration/export, seeded selection, straight/curved station parity, moving swept collisions, traffic directions/deflection/pileups/debris/horns, shuffled tropes, hull fractions, clothing modifiers, checkpoint state, bounded long-running pools.');

// Existing hull recovery, tunnel walls, station chains, rings and checkpoints remain functional.
const regression=setup(),cfg=regression.settings,state=cfg.race.state('REGRESSION');state.mode='playing';state.protection=0;
assert(cfg.flight.damage(state,60));cfg.hull.advance(state,1.99);close(state.hull,40);cfg.hull.advance(state,.01);close(state.hull,41);
cfg.hull.advance(state,6);close(state.hull,44);state.hurt=0;assert(cfg.flight.damage(state,12));cfg.hull.advance(state,1.99);close(state.hull,32);
cfg.hull.advance(state,.01);close(state.hull,33);
const openingStart=cfg.route.openingDimensions(0),openingLate=cfg.route.openingDimensions(33000);
assert(openingStart.rx>openingLate.rx&&openingStart.ry>openingLate.ry);
for(let index=0;index<100;index++){
  const plan=new regression.RoutePlan('CHAINS'),segment={id:`chain:${index}`,index,start:index*157,end:index*157+420};
  const portals=plan.stationPortals(segment);assert(portals.length>=2&&portals.length<=4);
  for(let i=1;i<portals.length;i++)assert(Math.hypot(portals[i].x-portals[i-1].x,portals[i].y-portals[i-1].y)<=cfg.route.openingShiftLimit(portals[i-1].d,portals[i].d,portals[i].chainId===portals[i-1].chainId)+1e-7);
}
for(const spec of Object.values(cfg.route.motifs))cfg.route[spec.weight]=spec.family==='tunnel'?1:0;
const tunnelPlan=new regression.RoutePlan('WALL'),section=tunnelPlan.between(0,5000).find(s=>s.kind==='tunnel');
state.hull=100;state.hurt=0;state.distance=section.start+20;state.previousDistance=state.distance-1;state.player.x=9.7;state.player.y=0;
tunnelPlan.collide(state,sound);close(state.hull,40);assert(Math.hypot(state.player.x,state.player.y)<cfg.route.tunnel.radius);
for(const spec of Object.values(cfg.route.motifs))cfg.route[spec.weight]=1;
const runPlan=new regression.RoutePlan('INTEGRATION'),runScene={...scene,route:runPlan},systems=new regression.FlightSystems(runScene,sound,runPlan),store=new regression.WaveCheckpoints();
let run=cfg.race.state('INTEGRATION');run.mode='playing';store.begin(run);
for(let tick=0;tick<4000;tick++){
  const doors=runPlan.between(run.distance-cfg.route.station.runwayDistance,run.distance+cfg.route.station.runwayDistance).flatMap(s=>s.portals||[]),door=doors.find(p=>Math.abs(p.d-run.distance)<cfg.route.station.runwayDistance),active=runPlan.at(run.distance);
  run.player={x:door?.x||0,y:door?.y??(active.family==='tunnel'?0:9),vx:0,vy:0};run.invincible=99;
  systems.step(run,.025,new Set(['Space']));run=store.afterStep(run,systems);
  assert.equal(run.mode,'playing');assert(run.hull>0);assert(run.motifRuntime.vehicles.length<=cfg.traffic.maxVehicles);
  if(run.pendingCheckpoint)assert(cfg.checkpoint.valid(run.pendingCheckpoint));
}
assert(run.wave>3);assert(cfg.checkpoint.valid(store.current));
const malformed={...saved,motifRuntime:{...saved.motifRuntime,vehicles:[null]}};assert.equal(checkpoint.valid(malformed),false);
assert.equal(checkpoint.valid({...saved,drag:{...saved.drag,remaining:NaN}}),false);
// Synthesized horns use distinct layered pitches and scheduled angry beep patterns.
const horn=Object.create(ns.SoundEngine.prototype);horn.enabled=true;horn.context={currentTime:5};horn.paused=false;horn.notes=[];
horn.tone=function(config,time){this.notes.push({config,time})};horn.horn('truck',0,3);
assert.equal(horn.notes.length,6);assert(new Set(horn.notes.map(note=>note.config.from)).size===2);
close(horn.notes[2].time-horn.notes[0].time,traffic.horn.beepSeconds+traffic.horn.gapSeconds);
horn.paused=true;horn.horn('car',0,3);assert.equal(horn.notes.length,6);
console.log(`Existing behavior and integration passed: hull recovery, wall collisions, reachable station chains, ${run.wave} waves of combined gameplay, validated checkpoints, and paused/multiple horns.`);
