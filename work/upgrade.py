from pathlib import Path
p=Path('js/settings.js');s=p.read_text().replace('(function (global) {','(function configure(global, overrides = {}) {',1)
s=s.replace('Object.freeze({','({')
pos=s.index('const math =')
s=s[:pos]+'''// Separate gameplay randomness from decorative particles and audio noise.
const random = {
  value: 1,
  seed(text, salt = 0) { let h = 2166136261; for(const c of String(text)+':'+salt) h = Math.imul(h ^ c.charCodeAt(0),16777619); this.value = h >>> 0; },
  next() { this.value = (this.value + 0x6D2B79F5) >>> 0; let t=this.value; t=Math.imul(t ^ t >>> 15,t | 1); t^=t+Math.imul(t ^ t >>> 7,t | 61); return ((t ^ t >>> 14) >>> 0)/4294967296; },
};
''' +s[pos:]
s=s.replace('a + Math.random() * (b - a)','a + random.next() * (b - a)').replace('array[Math.floor(Math.random() * array.length)]','array[Math.floor(random.next() * array.length)]')
s=s.replace('  decrement: (v, dt)', '  visualRandom: (a=0,b=1) => a+Math.random()*(b-a),\n  visualPick: array => array[Math.floor(Math.random()*array.length)],\n  decrement: (v, dt)')
a=s.index('const race =');b=s.index('const flight =',a)
s=s[:a]+'''const race = ({
  targetWaves:16, wavesPerSector:4, waveLength:1100, startLives:3, recoveryLength:210,
  startSpeed:56, speedPerWave:3.5, endlessAcceleration:5, respawnProtection:3,
  chargeDrain:1.2, boostDrain:15, boostMultiplier:1.48, turboMultiplier:1.4,
  names:['THE DEPARTURE','COPPER CURRENT','AMBER DRIFT','ION GARDEN','MIDNIGHT CIRCUIT','SOLAR SWITCHBACK','GLASS HORIZON','AFTERBURN ALLEY','THE BLACK REACH','DEEP SPACE'],
  colors:[0x73d7d0,0xffa571,0xffcd79,0x8eecab,0xb39cf8,0xff997c,0x7bcaeb,0xf593bd,0x9ab4d1,0xffdc96],
  waveAt(d) { return Math.floor(d / this.waveLength)+1; },
  sectorAt(wave) { return Math.floor((wave-1)/this.wavesPerSector); },
  waveInSector(wave) { return (wave-1)%this.wavesPerSector; },
  sectorName(sector) { return this.names[sector%this.names.length]; },
  sectorColor(sector) { return this.colors[sector%this.colors.length]; },
  checkpointDistance(wave) { return (wave-1)*this.waveLength; },
  baseSpeed(wave) { return this.startSpeed+(wave-1)*this.speedPerWave+Math.max(0,wave-this.targetWaves)*this.endlessAcceleration; },
  progress(d) { return (d % this.waveLength)/this.waveLength; },
  recovery(d) { return d % this.waveLength < this.recoveryLength; },
  encounterStart(wave) { return this.checkpointDistance(wave)+this.recoveryLength+100; },
  pickupStart(wave) { return this.checkpointDistance(wave)+55; },
  advance(s,dt,keys) {
    s.elapsed+=dt;s.previousDistance=s.distance;
    s.boosting=(keys.has('ShiftLeft')||keys.has('ShiftRight'))&&s.charge>1;
    s.charge=math.clamp(s.charge-dt*(s.boosting?this.boostDrain:this.chargeDrain),0,100);
    for(const key of ['invincible','protection','turbo','hurt','noticeTime','toastTime'])s[key]=math.decrement(s[key],dt);
    const target=this.baseSpeed(s.wave)*(1+s.charge*.0018)*(s.turbo>0?this.turboMultiplier:1)*(s.boosting?this.boostMultiplier:1);
    s.speed=math.damp(s.speed,target,2,dt);s.distance+=s.speed*dt;
    s.wave=this.waveAt(s.distance);s.sector=this.sectorAt(s.wave);s.bestWave=Math.max(s.bestWave,s.wave);
  },
  state(seed='GOODBOY') { return {mode:'title',seed,distance:0,previousDistance:0,elapsed:0,wave:1,bestWave:1,sector:0,
    speed:this.startSpeed,charge:45,hull:100,lives:this.startLives,invincible:0,protection:0,turbo:0,hurt:0,boosting:false,
    score:0,kills:0,pickups:0,nextSpawn:this.encounterStart(1),nextPickup:this.pickupStart(1),spawnIndex:0,
    checkpointWave:1,checkpointEvent:0,notice:'WAVE 01 · CLEARED FOR TAKEOFF',noticeTime:3,toast:'',toastTime:0,
    player:{x:0,y:0,vx:0,vy:0},weapon:weapon.state()}; },
  announce(s) { s.notice=`WAVE ${math.pad(s.wave)} · CHECKPOINT · BONUS STRETCH`;s.noticeTime=2.4; },
  loseLife(s) { s.lives--;if(s.lives<=0){s.mode='defeat';return false;}return true; },
  jump(s,wave) {
    wave=Math.max(1,Math.floor(wave));s.wave=wave;s.sector=this.sectorAt(wave);s.bestWave=Math.max(s.bestWave,wave);
    s.distance=this.checkpointDistance(wave);s.previousDistance=s.distance;s.speed=this.baseSpeed(wave);
    s.nextSpawn=this.encounterStart(wave);s.nextPickup=this.pickupStart(wave);s.spawnIndex=(wave-1)*64;
    s.hull=100;s.protection=this.respawnProtection;s.invincible=0;s.turbo=0;s.hurt=0;s.boosting=false;
    s.player={x:0,y:0,vx:0,vy:0};weapon.resetHeat(s.weapon);s.mode='playing';this.announce(s);
  },
});

// Automatic wave checkpoints only; no manual save slots.
const checkpoint = {
  key:'starhound.wave-checkpoint.v2', version:2,
  capture(s) {
    return {version:this.version,seed:s.seed,wave:s.wave,lives:s.lives,charge:s.charge,
      elapsed:s.elapsed,bestWave:s.bestWave,score:s.score,kills:s.kills,pickups:s.pickups,
      tier:s.weapon.tier,fireLevel:s.weapon.fireLevel,coolLevel:s.weapon.coolLevel,
      rules:tuning.values()};
  },
  valid(c) {
    const finiteKeys=['wave','lives','charge','elapsed','bestWave','score','kills','pickups','tier','fireLevel','coolLevel'];
    return c&&c.version===this.version&&typeof c.seed==='string'&&c.seed.length<=80&&finiteKeys.every(k=>Number.isFinite(c[k]))&&
      Number.isInteger(c.wave)&&c.wave>=1&&c.wave<=100000&&Number.isInteger(c.lives)&&c.lives>=1&&c.lives<=race.startLives&&
      c.charge>=0&&c.charge<=100&&c.elapsed>=0&&c.bestWave>=c.wave&&c.score>=0&&c.kills>=0&&c.pickups>=0&&
      ['tier','fireLevel','coolLevel'].every(k=>Number.isInteger(c[k])&&c[k]>=0&&c[k]<=3)&&tuning.valid(c.rules);
  },
  restore(c,continuation={}) {
    tuning.apply(c.rules);const s=race.state(c.seed);
    for(const key of ['lives','charge','elapsed','bestWave','score','kills','pickups'])s[key]=c[key];
    s.weapon.tier=c.tier;s.weapon.fireLevel=c.fireLevel;s.weapon.coolLevel=c.coolLevel;
    race.jump(s,c.wave);s.checkpointWave=c.wave;
    if(continuation.lives!==undefined)s.lives=continuation.lives;
    if(continuation.elapsed!==undefined)s.elapsed=continuation.elapsed;
    if(continuation.bestWave!==undefined)s.bestWave=continuation.bestWave;
    s.notice=`CHECKPOINT ${math.pad(c.wave)} · ${s.lives} LIVES`;return s;
  },
};

''' +s[b:]
s=s.replace('if(s.invincible > 0 || s.hurt > 0)','if(s.invincible > 0 || s.protection > 0 || s.hurt > 0)')
a=s.index('const weapon =');b=s.index('const encounters =',a)
s=s[:a]+'''const weapon = ({
  levels:[1,2,4,6],labels:['SINGLE','DOUBLE','QUADRUPLE','SEXTUPLE'],toastTime:2,
  baseInterval:.22,extraCooldown:.5,heatPerVolley:9,coolingPerSecond:22,bulletSpeed:360,bulletRadius:.3,
  barrels:[[0],[-.62,.62],[-1.3,-.46,.46,1.3],[-1.9,-1.15,-.4,.4,1.15,1.9]],
  state() {return {tier:0,fireLevel:0,coolLevel:0,heat:0,overheated:false,lock:0,cooldown:0,shots:0};},
  resetHeat(w) {w.heat=0;w.overheated=false;w.lock=0;w.cooldown=0;},
  interval(w) {return this.baseInterval/(1+w.fireLevel*.22);},
  cooling(w) {return this.coolingPerSecond*(1+w.coolLevel*.25);},
  tick(w,dt) {
    w.cooldown=math.decrement(w.cooldown,dt);w.heat=Math.max(0,w.heat-this.cooling(w)*dt);
    // The extra half-second begins only once the heat actually reaches zero.
    if(w.overheated&&w.heat===0){w.lock=math.decrement(w.lock,dt);if(w.lock===0)w.overheated=false;}
  },
  canFire(w) {return !w.overheated&&w.cooldown===0;},
  fire(w) {
    w.shots++;w.cooldown=this.interval(w);w.heat=Math.min(100,w.heat+this.heatPerVolley+w.tier*.35);
    if(w.heat>=100){w.overheated=true;w.lock=this.extraCooldown;}
  },
  aim(s) {return {x:s.player.x,y:s.player.y-.15,d:s.distance+125};},
  bullets(s) {return this.barrels[s.weapon.tier].map(x=>({type:'bullet',x:s.player.x+x*renderMath.flightScale,y:s.player.y-.15,d:s.distance+2,previousD:s.distance+2,radius:this.bulletRadius,hp:1,age:0}));},
  moveBullet(b,dt) {b.previousD=b.d;b.d+=this.bulletSpeed*dt;b.age+=dt;},
  bulletHit(b,e) {return Math.abs(b.x-e.x)<e.rx+b.radius&&Math.abs(b.y-e.y)<e.ry+b.radius&&Math.min(b.previousD,b.d)<=e.d+e.rz&&Math.max(b.previousD,b.d)>=e.d-e.rz;},
  impact(e) {e.hp--;return e.hp<=0;},
  alive(b,s) {return !b.dead&&b.d<s.distance+tunnel.depth;},
});

''' +s[b:]
s=s.replace('spawnAhead:440, despawnBehind:25, maxObjects:90, finishBuffer:200,','spawnAhead:440, despawnBehind:25, maxObjects:90, easyInterval:230, hardInterval:95,')
s=s.replace("canSpawn(s) {return s.nextSpawn < s.distance + this.spawnAhead && s.nextSpawn < race.totalDistance() - this.finishBuffer;}","canSpawn(s,count=0) {return count<this.maxObjects&&s.nextSpawn<s.distance+this.spawnAhead;}")
s=s.replace('interval(wave) { return math.mix(180,72,(wave-1)/49); }','difficulty(wave) {return (wave-1)/15;},\n  interval(wave) {return Math.max(38,math.mix(this.easyInterval,this.hardInterval,Math.min(1,this.difficulty(wave)))-Math.max(0,wave-16)*1.8);}')
s=s.replace('    s.nextSpawn += this.interval(wave);','    random.seed(s.seed,d);\n    s.nextSpawn += this.interval(wave);\n    if(race.recovery(d))return [];')
s=s.replace('if(wave > 20)','if(wave >= 7)').replace('wave < 9 ? 1 : wave < 28 ? 2 : 3','wave < 4 ? 1 : wave < 7 ? 2 : wave < 17 ? 3 : 4')
s=s.replace('hp:1+Math.floor(wave/14)','hp:1+Math.floor(wave/6)').replace('hp:1+Math.floor(wave/20)','hp:1+Math.floor(wave/8)')
s=s.replace('math.mix(.2,1.6,(wave-1)/49)','Math.min(3,math.mix(.2,1.7,this.difficulty(wave)))').replace('e.wave>=6','e.wave>=4').replace('math.mix(4.5,2.4,(e.wave-1)/49)','Math.max(.55,math.mix(4.5,2.2,this.difficulty(e.wave)))')
s=s.replace('e.d-=85*dt','e.d-=135*dt')
a=s.index('const pickups =');b=s.index('// Low-poly',a)
s=s[:a]+'''const pickups = ({
  interval:260,recoveryInterval:65,radius:1.65,chargeMin:10,chargeMax:15,repairMin:10,repairMax:25,
  canSpawn(s) {return s.nextPickup<s.distance+encounters.spawnAhead;},
  duration:{invincible:7,turbo:7},
  types:['charge','cannon','fire','cool','invincible','turbo','repair'],
  colors:{charge:0x8eeee3,cannon:0xf291bd,fire:0x84b8ff,cool:0xceadff,invincible:0xffce72,turbo:0xffa55e,repair:0x90e99f},
  shapes:{charge:'octa',cannon:'box',fire:'tetra',cool:'ico',invincible:'ico',turbo:'cone',repair:'box'},
  labels:{charge:'SPEED CHARGE',cannon:'CANNON UPGRADE',fire:'FIRE RATE UPGRADE',cool:'COOLING UPGRADE',invincible:'INVINCIBLE · 7 SECONDS',turbo:'TURBO · 7 SECONDS',repair:'HULL REPAIR'},
  make(type,x,y,d) {return {type:'pickup',pickup:type,x,y,d,rx:this.radius,ry:this.radius,rz:1.2,age:0,hp:Infinity,value:type==='charge'?Math.floor(math.random(this.chargeMin,this.chargeMax+1)):type==='repair'?Math.floor(math.random(this.repairMin,this.repairMax+1)):0};},
  scheduled(s) {
    const d=s.nextPickup;random.seed(s.seed,'pickup:'+d);
    const rest=race.recovery(d),wave=race.waveAt(d),index=Math.floor(d/this.interval);
    const type=rest?(wave>1&&d%race.waveLength<120?'repair':'charge'):this.types[index%this.types.length];
    const result=this.make(type,math.random(-5.5,5.5),math.random(-3.4,3.4),d);
    const candidate=d+(rest?this.recoveryInterval:this.interval),nextBreak=race.checkpointDistance(wave+1)+55;
    s.nextPickup=Math.min(candidate,nextBreak);return result;
  },
  drop(e,s) {
    random.seed(s.seed,'drop:'+e.d+':'+e.phase);
    const bag=s.hull<60?['repair','repair','charge','cannon','fire','cool','invincible','turbo']:['charge','charge','cannon','fire','cool','invincible','turbo','repair'];
    return this.make(math.pick(bag),e.x,e.y,e.d);
  },
  collect(p,s) {
    const w=s.weapon;let label=this.labels[p.pickup];
    if(p.pickup==='charge'){s.charge=math.clamp(s.charge+p.value,0,100);label+=` +${p.value}`;}
    if(p.pickup==='cannon'){if(w.tier<3)w.tier++;else s.charge=math.clamp(s.charge+this.chargeMax,0,100);label=`${weapon.labels[w.tier]} CANNON`;}
    if(p.pickup==='fire'){w.fireLevel=math.clamp(w.fireLevel+1,0,3);label=`FIRE RATE ${w.fireLevel+1}`;}
    if(p.pickup==='cool'){w.coolLevel=math.clamp(w.coolLevel+1,0,3);label=`COOLING ${w.coolLevel+1}`;}
    if(p.pickup==='repair'){s.hull=math.clamp(s.hull+p.value,0,100);label+=` +${p.value}%`;}
    if(p.pickup==='invincible')s.invincible=this.duration.invincible;
    if(p.pickup==='turbo')s.turbo=this.duration.turbo;
    s.pickups++;s.score+=50;s.toast=label;s.toastTime=2.4;
  },
});

''' +s[b:]
s=s.replace('clear:0x090f16,fogDensity:.009','clear:0x090f16,fogDensity:.0022')
a=s.index('const gfx =');b=s.index('const ui =',a)
piece=s[a:b].replace('math.random(', 'math.visualRandom(').replace('math.pick(', 'math.visualPick(')
s=s[:a]+piece+s[b:]
s=s.replace("explode(e) { return Array.from({length:32}","explode(e) { return Array.from({length:44}")
s=s.replace("'ShiftRight','KeyR'","'ShiftRight'")
s=s.replace("heatText(w) {return w.overheated?'OVERHEAT · COOLING':w.reload>0?`RELOADING · ${w.reload.toFixed(1)}s`:`HEAT ${Math.round(w.heat)}% · CLIP ${w.ammo}`;}","heatText(w) {return w.overheated?`OVERHEAT · ${w.heat>0?'COOLING':w.lock.toFixed(1)+'s'}`:`HEAT ${Math.round(w.heat)}% · AMMO ∞`;}")
s=s.replace('RELOAD ${this.roman[w.reloadLevel]}','COOL ${this.roman[w.coolLevel]}')
s=s.replace("effect(s) {return s.invincible>0?","effect(s) {return s.protection>0?`RESPAWN SHIELD ${s.protection.toFixed(1)}s`:s.invincible>0?")
s=s.replace(":s.boosting?'AFTERBURN':'CRUISE'",":s.boosting?'AFTERBURN':race.recovery(s.distance)?'BONUS STRETCH':'CRUISE'")
s=s.replace("+(s.mode==='win'?5000:0)",'')
s=s.replace("s.mode==='win'||s.invincible>0?", "s.invincible>0?").replace('Math.floor(s.sector/2)%4','s.sector%4')
s=s.replace("track.startsWith('game') ? this.tracks[track].bpm * math.clamp(s.speed/60,.85,1.65)","track.startsWith('game') ? this.tracks[track].bpm * math.clamp(s.speed/80,.85,2)")
s=s.replace('wallOpacity:.66,lineOpacity:.3','wallOpacity:.012,lineOpacity:.055')
s=s.replace('finishVisible(s) {return race.totalDistance()-s.distance<tunnel.depth;}','reticlePosition(point,width,height) {return {x:(point.x*.5+.5)*width,y:(-point.y*.5+.5)*height};},\n  impactFlash(s) {return s.hurt>1.15?math.clamp((s.hurt-1.15)*2,0,.35):0;},\n  speedGlow(s) {return s.boosting||s.turbo>0?.2:0;},')
# Distinct synthesized pickup signatures.
s=s.replace("tone:{shot:","tone:{charge:{from:440,to:1760,duration:.24,gain:.12,wave:'sine'},cannon:{from:220,to:880,duration:.45,gain:.14,wave:'square'},fire:{from:880,to:2640,duration:.18,gain:.12,wave:'triangle'},cool:{from:1760,to:440,duration:.4,gain:.12,wave:'sine'},invincible:{from:660,to:2640,duration:.6,gain:.14,wave:'triangle'},turbo:{from:110,to:990,duration:.55,gain:.15,wave:'sawtooth'},repair:{from:330,to:660,duration:.5,gain:.13,wave:'sine'},shot:")
s=s.replace("reload:{from:180,to:640,duration:.15,gain:.07,wave:'square'},",'')
a=s.index('namespace.settings =')
s=s[:a]+'''// Mutable numeric overrides; authored rules remain centralized above.
const tuning = {
  seed:'GOODBOY',
  fields:[
    ['race.waveLength','Wave distance',500,2200,10],['race.startSpeed','Starting speed',35,100,1],
    ['race.speedPerWave','Speed per wave',1,8,.1],['race.endlessAcceleration','Speed rise past wave 16',0,12,.1],
    ['race.recoveryLength','Bonus stretch distance',80,350,5],['race.chargeDrain','Charge drain / second',0,5,.1],
    ['race.boostDrain','Boost drain / second',5,30,.5],['encounters.easyInterval','Early obstacle spacing',150,400,5],
    ['encounters.hardInterval','Wave 16 obstacle spacing',55,180,5],['weapon.baseInterval','Fire interval / seconds',.12,.5,.01],
    ['weapon.heatPerVolley','Heat per volley',5,18,.1],['weapon.coolingPerSecond','Cooling / second',12,45,.5],
    ['weapon.extraCooldown','Extra overheat lock / seconds',0,2,.1],['pickups.interval','Pickup spacing',120,500,5],
    ['gfx.fogDensity','Space fog',0,.01,.0001],['renderMath.wallOpacity','Tunnel wall opacity',0,.2,.005],
    ['renderMath.lineOpacity','Tunnel rail opacity',0,.3,.005],['music.musicGain','Music volume',0,1,.05],['music.sfxGain','Effects volume',0,1,.05],
  ],
  objects:{race,encounters,weapon,pickups,gfx,renderMath,music},
  values() {return Object.fromEntries(this.fields.map(([path])=>{const [group,key]=path.split('.');return [path,this.objects[group][key]];}));},
  valid(values) {return values&&typeof values==='object'&&this.fields.every(([path,,min,max])=>Number.isFinite(values[path])&&values[path]>=min&&values[path]<=max);},
  apply(values) {
    for(const [path,,min,max] of this.fields) {if(values[path]===undefined)continue;const [group,key]=path.split('.'),v=Number(values[path]);if(Number.isFinite(v))this.objects[group][key]=math.clamp(v,min,max);}
  },
  exportSource() {return '// STARHOUND complete classic settings. Paste over js/settings.js.\\n('+configure.toString()+')(window, '+JSON.stringify({...this.values(),seed:this.seed},null,2)+');\\n';},
};
tuning.apply(overrides);if(typeof overrides.seed==='string')tuning.seed=overrides.seed.slice(0,80);
namespace.settings = Object.freeze({math,random,tunnel,race,checkpoint,flight,weapon,encounters,pickups,assets,gfx,ui,music,sfx,renderMath,tuning});
})(window);
'''
p.write_text(s)
