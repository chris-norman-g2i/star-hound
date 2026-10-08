const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function context(storage){const window={localStorage:storage||{getItem:()=>null,setItem(){},removeItem(){}}};const ctx=vm.createContext({window,console,Math,JSON,Number,Float32Array,Uint8Array});for(const f of ['settings','systems','checkpoints'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f});return ctx;}
const ctx=context(),ns=ctx.window.Starhound,{race,weapon,flight,encounters,pickups,gfx,checkpoint,tuning,music}=ns.settings;
const fakeScene={clear(){},burst(){}},sound={play(){}},sys=new ns.FlightSystems(fakeScene,sound),store=new ns.WaveCheckpoints();
let s=race.state();s.mode='playing';store.begin(s);
assert.equal(s.lives,3);assert(!('ammo' in s.weapon));assert(!('reload' in s.weapon));
for(const dt of [.01,.025,.05])for(let tier=0;tier<4;tier++)for(let fireLevel=0;fireLevel<4;fireLevel++)for(let coolLevel=0;coolLevel<4;coolLevel++){
 const w=weapon.state();Object.assign(w,{tier,fireLevel,coolLevel,heat:100,overheated:true,lock:.5});let t=0;
 while(w.overheated&&t<15){weapon.tick(w,dt);t+=dt;}
 const expected=100/weapon.cooling(w)+.5;assert(Math.abs(t-expected)<=dt+1e-7,`${dt}/${tier}/${fireLevel}/${coolLevel}: ${t} != ${expected}`);
 assert(weapon.canFire(w));
}
let durations=[];
for(let tier=0;tier<4;tier++){
 const w=weapon.state();w.tier=tier;let t=0,volley=0;while(!w.overheated&&t<30){weapon.tick(w,.01);if(weapon.canFire(w)){weapon.fire(w);volley++;}t+=.01;}
 durations.push({tier:weapon.levels[tier],seconds:+t.toFixed(2),volleys:volley});assert(w.overheated);assert.equal(weapon.bullets({...s,weapon:w}).length,weapon.levels[tier]);
}
// Infinite waves, first sixteen pacing, and a ten-minute survivability window.
let cruise=race.state(),first16=0,ten=0;cruise.mode='playing';
while(cruise.elapsed<660){race.advance(cruise,.025,new Set());if(!first16&&cruise.wave===17)first16=cruise.elapsed;if(!ten&&cruise.elapsed>=600)ten=cruise.wave;assert(Number.isFinite(cruise.distance));}
assert(first16>=120&&first16<=300);assert(cruise.wave>16);assert.equal(cruise.mode,'playing');
// Wave boundaries save without an interruption. Each death consumes exactly one life.
s.distance=race.waveLength-.2;s.previousDistance=s.distance;s.invincible=100;sys.step(s,.025,new Set());s=store.afterStep(s,sys);assert.equal(s.wave,2);assert.equal(store.current.wave,2);assert.equal(s.mode,'playing');
s.weapon.tier=3;s.weapon.fireLevel=3;s.weapon.coolLevel=3;store.begin(s);const baseline=store.current;
for(const lives of [2,1]){s.hull=0;s.elapsed+=10;sys.step(s,.025,new Set());s=store.afterStep(s,sys);assert.equal(s.lives,lives);assert.equal(s.wave,2);assert.equal(s.distance,race.checkpointDistance(2));assert.equal(s.hull,100);assert.equal(s.protection,3);assert.equal(s.weapon.tier,3);assert.equal(s.weapon.coolLevel,3);assert.equal(sys.entities.length,0);assert.equal(store.current.lives,lives);}
s.hull=0;sys.step(s,.025,new Set());s=store.afterStep(s,sys);assert.equal(s.mode,'defeat');assert.equal(s.lives,0);assert.equal(store.current,null);
// Resume after reload, seed/rules persistence, malformed/denied storage.
let data=null;const disk={getItem:()=>data,setItem:(key,val)=>{data=val},removeItem:()=>{data=null}};
let other=context(disk),otherStore=new other.window.Starhound.WaveCheckpoints(),saved=other.window.Starhound.settings.race.state('COPPER');saved.mode='playing';other.window.Starhound.settings.race.jump(saved,12);saved.lives=2;saved.weapon.tier=2;otherStore.begin(saved);
other=context(disk);otherStore=new other.window.Starhound.WaveCheckpoints();const resume=otherStore.resume();assert.equal(resume.wave,12);assert.equal(resume.seed,'COPPER');assert.equal(resume.lives,2);assert.equal(resume.weapon.tier,2);
data='{bad';otherStore=new other.window.Starhound.WaveCheckpoints();assert.equal(otherStore.current,null);assert(otherStore.warning);
const blocked=context({getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}});const memory=new blocked.window.Starhound.WaveCheckpoints();memory.begin(blocked.window.Starhound.settings.race.state());assert(memory.resume());assert(memory.warning);
assert(!checkpoint.valid({...baseline,lives:0}));assert(!checkpoint.valid({...baseline,tier:9}));assert(!checkpoint.valid({...baseline,wave:NaN}));
// Seeded content repeats even if graphics consume random numbers.
function patterns(seed){const run=race.state(seed);race.jump(run,8);const result=[];for(let i=0;i<12;i++){result.push(encounters.make(run));for(let j=0;j<100;j++)gfx.stream(run);result.push(pickups.scheduled(run));}return JSON.stringify(result);}
assert.equal(patterns('A'),patterns('A'));assert.notEqual(patterns('A'),patterns('B'));
// Recovery areas stay free of static hazards; bonus pickups are denser.
let run=race.state('T');for(let i=0;i<2000;i++)for(const e of encounters.make(run))assert(!race.recovery(e.d));
run=race.state('T');let types=new Set(),charges=new Set(),repairs=new Set();for(let i=0;i<300;i++){const p=pickups.scheduled(run);types.add(p.pickup);if(p.pickup==='charge'){assert(p.value>=10&&p.value<=15);charges.add(p.value);}if(p.pickup==='repair'){assert(p.value>=10&&p.value<=25);repairs.add(p.value);}}
assert.equal(types.size,7);assert(charges.size>1);assert(repairs.size>1);assert.equal(pickups.duration.invincible,7);assert.equal(race.turboMultiplier,1.4);
let powered=race.state();for(const type of ['cannon','fire','cool'])for(let i=0;i<10;i++)pickups.collect(pickups.make(type,0,0,0),powered);assert.equal(powered.weapon.tier,3);assert.equal(powered.weapon.fireLevel,3);assert.equal(powered.weapon.coolLevel,3);
// Complete export executes as a replacement classic settings file, retaining numeric overrides.
tuning.apply({'race.waveLength':1250,'weapon.extraCooldown':.7});tuning.seed='EXPORT';const exported=tuning.exportSource(),replacement=vm.createContext({window:{},console,Math,JSON,Number,Float32Array,Uint8Array});vm.runInContext(exported,replacement);const replace=replacement.window.Starhound.settings;assert.equal(replace.race.waveLength,1250);assert.equal(replace.weapon.extraCooldown,.7);assert.equal(replace.tuning.seed,'EXPORT');assert.equal(replace.pickups.types.length,7);tuning.apply({'race.waveLength':1100,'weapon.extraCooldown':.5});
// Seven scores stay finite, resume arrangements and map all endless sectors.
for(const id of Object.keys(music.tracks))for(let step=0;step<256;step++)for(const note of music.notes(id,step,music.tracks[id].bpm))assert(Number.isFinite(note.note)&&Number.isFinite(note.duration));
assert.equal(music.transitionStep('game0',130,{game0:74}),74);assert.equal(music.trackFor({...s,mode:'playing',sector:27,invincible:0}),'game3');
console.log(JSON.stringify({first16Seconds:+first16.toFixed(2),waveAt10Minutes:ten,tierHeat:durations,checks:'lives, resume, storage errors, 64 weapon combinations × 3 timesteps, seeds, recovery, pickups, complete export, seven scores passed'},null,2));
// Integrated ten-minute pipeline stress check with protection, including firing and checkpoint rollover.
let stress=race.state('STRESS');stress.mode='playing';stress.weapon.tier=3;stress.weapon.fireLevel=3;stress.weapon.coolLevel=3;store.begin(stress);sys.reset();let peak=0;
for(let i=0;i<24000;i++){stress.invincible=99;sys.step(stress,.025,new Set(['Space']));stress=store.afterStep(stress,sys);peak=Math.max(peak,sys.entities.length+sys.bullets.length);assert.equal(stress.mode,'playing');assert(stress.lives===3);}
assert(stress.wave>16);assert(peak<200);console.log(`Ten-minute integrated simulation: wave ${stress.wave}, ${stress.kills} kills, peak ${peak} live objects.`);
// A resumed wave recreates the same static seeded layout as its first visit.
let original=race.state('REPLAY'),target=race.state('REPLAY');race.jump(target,7);const originalLayout=[];
while(race.waveAt(original.nextSpawn)<=7){const batch=encounters.make(original);if(batch.length&&batch[0].wave===7||batch.length&&race.waveAt(batch[0].d)===7)originalLayout.push(...batch);}
const resumedLayout=[];while(race.waveAt(target.nextSpawn)===7)resumedLayout.push(...encounters.make(target));assert.equal(JSON.stringify(originalLayout),JSON.stringify(resumedLayout));console.log('Checkpoint wave layout replay passed.');
// Aim markers use the same lateral coordinates as the outgoing volley at every tier.
for(let tier=0;tier<4;tier++){const aimState=race.state();aimState.player.x=4;aimState.player.y=-2;aimState.weapon.tier=tier;const aim=weapon.aimPoints(aimState),bullets=weapon.bullets(aimState);assert.equal(aim.length,bullets.length);for(let i=0;i<aim.length;i++){assert.equal(aim[i].x,bullets[i].x);assert.equal(aim[i].y,bullets[i].y);}}
assert.equal(new Set(Object.values(pickups.colors)).size,7);assert.equal(new Set(Object.values(ns.settings.assets.pickupParts).map(parts=>JSON.stringify(parts))).size,7);
for(const type of pickups.types){assert(ns.settings.sfx.tone[type]);for(const [kind,position,scale] of ns.settings.assets.pickupParts[type]){assert(ns.settings.assets.shapes[kind]);assert(position.every(Number.isFinite));assert(scale.every(Number.isFinite));}}
// Render geometry remains finite throughout later waves, even with a nearly invisible tunnel.
for(const wave of [1,4,7,16,50,300]){const distance=race.checkpointDistance(wave),walls=new Float32Array(ns.settings.tunnel.vertexCount()),lines=new Float32Array(ns.settings.tunnel.lineCount());ns.settings.tunnel.fillWalls(walls,distance);ns.settings.tunnel.fillLines(lines,distance);assert(walls.every(Number.isFinite));assert(lines.every(Number.isFinite));assert(Number.isFinite(race.sectorColor(race.sectorAt(wave))));}
console.log('Barrel aim coordinates, seven distinct pickup shapes/colors/sounds and late-wave geometry passed.');
