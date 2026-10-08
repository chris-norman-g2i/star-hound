// STARHOUND complete classic settings. Paste over js/settings.js.
(function configure(global, overrides) {
'use strict';
overrides = overrides || {};
const namespace = global.Starhound = global.Starhound || {};
// Compatibility data belongs to the old schema, never to the live difficulty curve.
const legacyTuning = {
  rampSpan:15,
  minimumObstacleSpacing:38,
  checkpointVersions:{original:2,previous:3},
  settingsVersion:1,
  redesignRatios:{'weapon.baseInterval':.5,'encounters.easyInterval':210/230,'encounters.hardInterval':82/95},
  requiredRules:['race.waveLength','race.startSpeed','race.speedPerWave','race.endlessAcceleration',
    'race.recoveryLength','race.chargeDrain','race.boostDrain','encounters.easyInterval','encounters.hardInterval',
    'weapon.baseInterval','weapon.heatPerVolley','weapon.coolingPerSecond','weapon.extraCooldown','pickups.interval','gfx.fogDensity'],
};

/** All authored constants, procedural formulas and tuning live here.
 * Runtime scripts own resources; this module owns their numerical behavior.
 * Deliberately dependency-free so flight rules and score generation can be verified without a renderer.
 */
// Separate gameplay randomness from decorative particles and audio noise.
const random = {
  value: 1,
  seed(text, salt = 0) { let h = 2166136261; for(const c of String(text)+':'+salt) h = Math.imul(h ^ c.charCodeAt(0),16777619); this.value = h >>> 0; },
  next() { this.value = (this.value + 0x6D2B79F5) >>> 0; let t=this.value; t=Math.imul(t ^ t >>> 15,t | 1); t^=t+Math.imul(t ^ t >>> 7,t | 61); return ((t ^ t >>> 14) >>> 0)/4294967296; },
};
const math = ({
  tau: Math.PI * 2,
  clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
  mix: (a, b, t) => a + (b - a) * t,
  damp: (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt)),
  random: (a = 0, b = 1) => a + random.next() * (b - a),
  pick: array => array[Math.floor(random.next() * array.length)],
  visualRandom: (a=0,b=1) => a+Math.random()*(b-a),
  visualPick: array => array[Math.floor(Math.random()*array.length)],
  decrement: (v, dt) => Math.max(0, v - dt),
  fraction: (n, d) => n / d,
  percent: n => `${Math.round(n)}%`,
  squaredDistance: (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2,
  aspect: (w, h) => w / h,
  pad: n => String(Math.round(n)).padStart(2, '0'),
  delta: dt => Math.min(dt, .05),
  add: (a, b) => a + b,
});

const tunnel = ({
  depth:540,
  center(d) { return {x: Math.sin(d / 360) * 27 + Math.sin(d / 1100) * 32,
    y: Math.sin(d / 480 + .7) * 17 + Math.sin(d / 1500) * 21}; },
  world(x, y, d, origin) { const a = this.center(d), b = this.center(origin);
    return [x + a.x - b.x, y + a.y - b.y, origin - d]; },
  constrain(p) {
    p.x = math.clamp(p.x, -9.7, 9.7); p.y = math.clamp(p.y, -5.7, 5.7);
  },
});

// One continuous distance curve drives every gameplay difficulty contribution.
const difficulty = {
  distanceScale:33000,
  growth:1,
  curve:.9,
  progress(distance) {return Math.pow(Math.max(0,distance)/this.distanceScale*this.growth,this.curve);},
};

const hull = {
  maxIntegrity:100,obstacleDamageFraction:.6,hitImmunitySeconds:1.4,
  get obstacleDamage(){return this.maxIntegrity*this.obstacleDamageFraction;},
};

const race = ({
  wavesPerSector:4, waveLength:1100, startLives:3, recoveryLength:210,
  startSpeed:56,
  speedGrowth:15,
  maxSpeed:500,
  respawnProtection:3,
  chargeDrain:1.2, boostDrain:15, boostMultiplier:1.48, turboMultiplier:1.4,
  names:['THE DEPARTURE','COPPER CURRENT','AMBER DRIFT','ION GARDEN','MIDNIGHT CIRCUIT','SOLAR SWITCHBACK','GLASS HORIZON','AFTERBURN ALLEY','THE BLACK REACH','DEEP SPACE'],
  colors:[0x73d7d0,0xffa571,0xffcd79,0x8eecab,0xb39cf8,0xff997c,0x7bcaeb,0xf593bd,0x9ab4d1,0xffdc96],
  waveAt(d) { return Math.floor(d / this.waveLength)+1; },
  sectorAt(wave) { return Math.floor((wave-1)/this.wavesPerSector); },
  sectorName(sector) { return this.names[sector%this.names.length]; },
  sectorColor(sector) { return this.colors[sector%this.colors.length]; },
  checkpointDistance(wave) { return (wave-1)*this.waveLength; },
  cruiseSpeed(distance) {return Math.min(this.maxSpeed,this.startSpeed+this.speedGrowth*difficulty.progress(distance));},
  progress(d) { return (d % this.waveLength)/this.waveLength; },
  recovery(d) { return d % this.waveLength < this.recoveryLength; },
  encounterStart(wave) { return this.checkpointDistance(wave)+this.recoveryLength+100; },
  pickupStart(wave) {return pickups.startDistance(this.checkpointDistance(wave));},
  advance(s,dt,keys) {
    s.elapsed+=dt;s.previousDistance=s.distance;
    for(const key of ['invincible','protection','turbo','hurt','toastTime','checkpointCelebration'])s[key]=math.decrement(s[key],dt);
    propulsion.advance(s,dt,keys);
    s.distance+=s.speed*dt;
    s.wave=this.waveAt(s.distance);s.sector=this.sectorAt(s.wave);s.bestWave=Math.max(s.bestWave,s.wave);
  },
  state(seed='GOODBOY') { return {mode:'title',seed,distance:0,previousDistance:0,elapsed:0,wave:1,bestWave:1,sector:0,
    speed:this.startSpeed,charge:45,hull:hull.maxIntegrity,lives:this.startLives,invincible:0,protection:0,turbo:0,hurt:0,boosting:false,
    score:0,kills:0,pickups:0,nextSpawn:this.encounterStart(1),nextPickup:this.pickupStart(1),pickupDistances:[],
    motion:propulsion.state(),crashTime:0,checkpointCelebration:0,checkpointWave:1,toast:'',toastTime:0,
    player:{x:0,y:0,vx:0,vy:0},weapon:weapon.state()}; },
  jump(s,wave) {
    wave=Math.max(1,Math.floor(wave));s.wave=wave;s.sector=this.sectorAt(wave);s.bestWave=Math.max(s.bestWave,wave);
    s.distance=this.checkpointDistance(wave);s.previousDistance=s.distance;s.speed=this.cruiseSpeed(s.distance);
    s.nextSpawn=this.encounterStart(wave);s.nextPickup=this.pickupStart(wave);s.pickupDistances=[];
    s.hull=hull.maxIntegrity;s.protection=this.respawnProtection;s.invincible=0;s.turbo=0;s.hurt=0;s.boosting=false;
    s.motion=propulsion.state();s.crashTime=0;s.checkpointCelebration=0;
    s.player={x:0,y:0,vx:0,vy:0};weapon.resetHeat(s.weapon);s.mode='playing';
  },
});

/** Speed bonuses are explicit contributions above wave cruise. A collision can reduce
 * every active source together without changing weapon upgrades or damage immunity.
 * Boost/turbo activation compounds with existing bonuses, preserving their stacking.
 */
const propulsion = {
  recoverySeconds:1.2,enemyBonusRetention:.67,enemySpeedRetention:.55,
  state() {return {boostBonus:0,turboBonus:0,ringBonus:0,boostBlocked:false,recovery:null};},
  bonus(s) {return s.charge*.0018+s.motion.turboBonus+s.motion.boostBonus+s.motion.ringBonus;},
  target(s) {return race.cruiseSpeed(s.distance)*(1+this.bonus(s));},
  turbo(s) {
    s.turbo=pickups.duration.turbo;
    s.motion.turboBonus=(race.turboMultiplier-1)*(1+s.charge*.0018+s.motion.boostBonus+s.motion.ringBonus);
  },
  ring(s) {
    s.motion.ringBonus=Math.min(speedRings.bonusCap,s.motion.ringBonus+speedRings.bonusPerRing);
    if(!s.motion.recovery)s.speed=this.target(s);
  },
  impact(s,type) {
    const obstacle=type==='rock'||type==='barrier';
    if(!obstacle&&type!=='enemy')return;
    if(obstacle){
      s.charge=0;s.turbo=0;s.motion.turboBonus=0;s.motion.boostBonus=0;s.motion.ringBonus=0;
      s.motion.boostBlocked=true;s.boosting=false;s.speed=0;
    }else{
      s.charge*=this.enemyBonusRetention;
      s.motion.turboBonus*=this.enemyBonusRetention;s.motion.boostBonus*=this.enemyBonusRetention;s.motion.ringBonus*=this.enemyBonusRetention;
      s.speed*=this.enemySpeedRetention;
    }
    s.motion.recovery={elapsed:0,from:s.speed,cruiseOnly:obstacle};
  },
  advance(s,dt,keys) {
    const m=s.motion,held=keys.has('ShiftLeft')||keys.has('ShiftRight');
    m.ringBonus=math.decrement(m.ringBonus,speedRings.decayPerSecond*dt);
    if(!held)m.boostBlocked=false;
    if(s.turbo<=0)m.turboBonus=0;
    const boosting=held&&!m.boostBlocked&&s.charge>1;
    if(boosting&&!s.boosting)m.boostBonus=(race.boostMultiplier-1)*(1+s.charge*.0018+m.turboBonus+m.ringBonus);
    if(!boosting)m.boostBonus=0;
    s.boosting=boosting;
    s.charge=math.clamp(s.charge-dt*(boosting?race.boostDrain:race.chargeDrain),0,100);
    if(m.recovery){
      m.recovery.elapsed+=dt;
      const t=m.recovery.elapsed>=this.recoverySeconds-1e-9?1:m.recovery.elapsed/this.recoverySeconds;
      const target=m.recovery.cruiseOnly?race.cruiseSpeed(s.distance):this.target(s);
      s.speed=math.mix(m.recovery.from,target,t*t);
      if(t===1)m.recovery=null;
    }else s.speed=math.damp(s.speed,this.target(s),2,dt);
  },
};

const crash = {
  duration:2.6,
  begin(s) {s.mode='crashing';s.crashTime=0;s.lives--;s.speed=0;s.boosting=false;s.toastTime=0;s.invincible=0;},
  advance(s,dt) {s.crashTime+=dt;s.elapsed+=dt;},
  complete(s) {return s.mode==='crashing'&&s.crashTime>=this.duration-1e-9;},
};

// Automatic wave checkpoints only; no manual save slots.
const checkpoint = {
  key:'starhound.wave-checkpoint.v3', version:4,
  legacyKey:'starhound.wave-checkpoint.v2',
  migrate(saved) {
    if(!saved||!Object.values(legacyTuning.checkpointVersions).includes(saved.version)||!saved.rules)return null;
    const rules={...saved.rules};
    if(saved.version===legacyTuning.checkpointVersions.original)
      for(const [key,ratio] of Object.entries(legacyTuning.redesignRatios))rules[key]*=ratio;
    const migrated=tuning.migrateValues(rules);
    if(!migrated)return null;
    const updated={...saved,version:this.version,rules:migrated};return this.valid(updated)?updated:null;
  },
  capture(s) {
    return {version:this.version,seed:s.seed,wave:s.wave,lives:s.lives,charge:s.charge,
      elapsed:s.elapsed,bestWave:s.bestWave,score:s.score,kills:s.kills,pickups:s.pickups,
      tier:s.weapon.tier,fireLevel:s.weapon.fireLevel,coolLevel:s.weapon.coolLevel,ringBonus:s.motion.ringBonus,
      pickupDistances:[...s.pickupDistances],rules:tuning.values()};
  },
  valid(c) {
    const finiteKeys=['wave','lives','charge','elapsed','bestWave','score','kills','pickups','tier','fireLevel','coolLevel'];
    return c&&c.version===this.version&&typeof c.seed==='string'&&c.seed.length<=80&&finiteKeys.every(k=>Number.isFinite(c[k]))&&
      Number.isInteger(c.wave)&&c.wave>=1&&c.wave<=100000&&Number.isInteger(c.lives)&&c.lives>=1&&c.lives<=race.startLives&&
      c.charge>=0&&c.charge<=100&&c.elapsed>=0&&c.bestWave>=c.wave&&c.score>=0&&c.kills>=0&&c.pickups>=0&&
      ['tier','fireLevel','coolLevel'].every(k=>Number.isInteger(c[k])&&c[k]>=0&&c[k]<=3)&&
      (c.ringBonus===undefined||Number.isFinite(c.ringBonus)&&c.ringBonus>=0)&&
      (c.pickupDistances===undefined||Array.isArray(c.pickupDistances)&&c.pickupDistances.every(d=>Number.isFinite(d)&&d>=0))&&tuning.validCheckpoint(c.rules);
  },
  restore(c,continuation={}) {
    tuning.load();tuning.apply({...tuning.defaults,...c.rules,...tuning.saved?.values});
    const s=race.state(tuning.saved?tuning.seed:c.seed);
    for(const key of ['lives','charge','elapsed','bestWave','score','kills','pickups'])s[key]=c[key];
    s.weapon.tier=c.tier;s.weapon.fireLevel=c.fireLevel;s.weapon.coolLevel=c.coolLevel;
    race.jump(s,c.wave);s.checkpointWave=c.wave;
    s.pickupDistances=(c.pickupDistances||[]).filter(d=>d<s.distance&&d>=s.distance-pickups.minimumSpacing-encounters.despawnBehind);
    s.motion.ringBonus=Math.min(speedRings.bonusCap,c.ringBonus||0);
    if(continuation.lives!==undefined)s.lives=continuation.lives;
    if(continuation.elapsed!==undefined)s.elapsed=continuation.elapsed;
    if(continuation.bestWave!==undefined)s.bestWave=continuation.bestWave;
    return s;
  },
};

const flight = ({
  response: 5, steerSpeed: 15, returnBank: 6, shipRadius:.82,
  step(p, keys, dt) {
    const x = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
    const y = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
    p.vx = math.damp(p.vx, x * this.steerSpeed, this.response, dt);
    p.vy = math.damp(p.vy, y * this.steerSpeed, this.response, dt);
    p.x += p.vx * dt; p.y += p.vy * dt; tunnel.constrain(p);
  },
  damage(s, amount) {
    if(s.invincible > 0 || s.protection > 0 || s.hurt > 0) return false;
    s.hull = Math.max(0,s.hull - amount); s.hurt = hull.hitImmunitySeconds;
    return true;
  },
  shipPose(s) { return {position:[s.player.x,s.player.y,0],rotation:[-s.player.vy * .014, -s.player.vx * .006, -s.player.vx * .025],
    blink:s.hurt > 0 && Math.sin(s.elapsed * 38) > .25}; },
  titlePose(t) { return {position:[5.6, .3 + Math.sin(t * .7) * .22, 0],rotation:[.08,-.59 + Math.sin(t * .2) * .09,-.12 + Math.sin(t * .5) * .025]}; },
});

const weapon = ({
  levels:[1,2,4,6],labels:['SINGLE','DOUBLE','QUADRUPLE','SEXTUPLE'],toastTime:2,
  baseInterval:.11,extraCooldown:.5,heatPerVolley:9,coolingPerSecond:22,bulletSpeed:360,bulletRadius:.3,
  barrels:[[0],[-.62,.62],[-1.3,-.46,.46,1.3],[-1.9,-1.15,-.4,.4,1.15,1.9]],
  state() {return {tier:0,fireLevel:0,coolLevel:0,heat:0,overheated:false,lock:0,cooldown:0,shots:0};},
  resetHeat(w) {w.heat=0;w.overheated=false;w.lock=0;w.cooldown=0;},
  interval(w) {return this.baseInterval/(1+w.fireLevel*.22);},
  cooling(w) {return this.coolingPerSecond*(1+w.coolLevel*.25);},
  tick(w,dt) {
    w.cooldown=math.decrement(w.cooldown,dt);const heatTime=w.heat/this.cooling(w);w.heat=Math.max(0,w.heat-this.cooling(w)*dt);
    // The extra half-second begins only once the heat actually reaches zero.
    if(w.overheated&&w.heat===0){w.lock=math.decrement(w.lock,Math.max(0,dt-heatTime));if(w.lock===0)w.overheated=false;}
  },
  canFire(w) {return !w.overheated&&w.cooldown===0;},
  fire(w) {
    w.shots++;w.cooldown=this.interval(w);w.heat=Math.min(100,w.heat+this.heatPerVolley+w.tier*.35);
    if(w.heat>=100){w.overheated=true;w.lock=this.extraCooldown;}
  },
  aimPoints(s) {return this.barrels[s.weapon.tier].map(x=>({x:s.player.x+x*renderMath.flightScale,y:s.player.y-.15,d:s.distance+125}));},
  bullets(s) {return this.barrels[s.weapon.tier].map(x=>({type:'bullet',x:s.player.x+x*renderMath.flightScale,y:s.player.y-.15,d:s.distance+2,previousD:s.distance+2,radius:this.bulletRadius,speed:s.speed+this.bulletSpeed,hp:1,age:0}));},
  moveBullet(b,dt) {b.previousD=b.d;b.d+=b.speed*dt;b.age+=dt;},
  bulletHit(b,e) {return Math.abs(b.x-e.x)<e.rx+b.radius&&Math.abs(b.y-e.y)<e.ry+b.radius&&Math.min(b.previousD,b.d)<=e.d+e.rz&&Math.max(b.previousD,b.d)>=e.d-e.rz;},
  impact(e) {e.hp--;return e.hp<=0;},
  alive(b,s) {return !b.dead&&b.d<s.distance+tunnel.depth;},
});

const encounters = ({
  spawnAhead:440, despawnBehind:25, maxObjects:90,
  startInterval:150,
  minInterval:38,
  spacingDecay:1,
  startCount:1,
  maxCount:4,
  countGrowth:2.5,
  startEnemyHp:1,
  enemyHpGrowth:2.5,
  startRockHp:1,
  rockHpGrowth:1.875,
  startDrift:.2,
  maxDrift:3,
  driftGrowth:1.5,
  startFireInterval:4.5,
  minFireInterval:.55,
  fireDecay:.7,
  shootingThreshold:.25,
  escortThreshold:.45,
  layout:{barrierEvery:4,orientationEvery:8,sideEvery:3,rockEvery:3,
    halfWidth:6,halfHeight:4,rockOffset:17,enemyOffset:14,escortOffset:46,endClearance:30},
  shooting:{nearDistance:25,farDistance:280},
  canSpawn(s,count=0) {return count<this.maxObjects&&s.nextSpawn<s.distance+this.spawnAhead;},
  alive(e,s) {return !e.dead && e.d > s.distance - this.despawnBehind;},
  interval(distance) {return Math.max(this.minInterval,this.startInterval*Math.exp(-this.spacingDecay*difficulty.progress(distance)));},
  count(distance) {return Math.min(this.maxCount,this.startCount+Math.floor(this.countGrowth*difficulty.progress(distance)));},
  fireInterval(distance) {return Math.max(this.minFireInterval,this.startFireInterval*Math.exp(-this.fireDecay*difficulty.progress(distance)));},
  make(s) {
    const d=s.nextSpawn,wave=race.waveAt(d),n=Math.floor(d/this.interval(d)),layout=this.layout;
    random.seed(s.seed,d);
    const next=d+this.interval(d),nextWave=race.waveAt(next);
    s.nextSpawn=nextWave===wave?next:race.encounterStart(nextWave);
    if(race.recovery(d))return [];
    const list=[];
    if(n % layout.barrierEvery === layout.barrierEvery-1) {
      // Alternating gates preserve a generous traversable corridor; barriers never form a sealed wall.
      const vertical = n % layout.orientationEvery === layout.barrierEvery-1;
      const sign = n % layout.sideEvery === 0 ? -1 : 1;
      list.push({type:'barrier',x:vertical ? sign*6.5 : 0,y:vertical ? 0 : sign*4.9,d,
        rx:vertical?3.1:11,ry:vertical?7.5:2.2,rz:1.4,hp:Infinity,age:0,phase:n});
      if(difficulty.progress(d)>=this.escortThreshold)list.push(this.enemy(-sign*3,vertical?2:-sign*1,d+layout.escortOffset,wave,n));
    } else {
      const count=this.count(d);
      for(let i=0;i<count;i++) {
        const x=count===1?math.random(-layout.halfWidth,layout.halfWidth):-layout.halfWidth+i*layout.halfWidth*2/(count-1);
        list.push(n%layout.rockEvery===1?this.rock(x,math.random(-layout.halfHeight,layout.halfHeight),d+i*layout.rockOffset,wave,n+i):this.enemy(x,math.random(-layout.halfHeight,layout.halfHeight),d+i*layout.enemyOffset,wave,n+i));
      }
    }
    return list.filter(e=>!race.recovery(e.d)&&e.d%race.waveLength<race.waveLength-layout.endClearance);
  },
  enemy(x,y,d,wave,phase) {const progress=difficulty.progress(d);return {type:'enemy',x,y,baseX:x,baseY:y,d,rx:1.3,ry:.95,rz:1.5,
    hp:this.startEnemyHp+Math.floor(this.enemyHpGrowth*progress),age:0,phase,
    drift:Math.min(this.maxDrift,this.startDrift+this.driftGrowth*progress),fire:this.fireInterval(d),wave};},
  rock(x,y,d,wave,phase) {const radius=math.random(.85,1.6);return {type:'rock',x,y,d,rx:radius,ry:radius,rz:radius,
    hp:this.startRockHp+Math.floor(this.rockHpGrowth*difficulty.progress(d)),age:0,phase};},
  animate(e,dt) {
    e.age += dt;
    if(e.type === 'enemy') { e.x=e.baseX+Math.sin(e.age*1.2+e.phase)*e.drift;
      e.y=e.baseY+Math.cos(e.age*.8+e.phase)*e.drift*.55;e.fire-=dt; }
    if(e.type==='hostile') { e.previousD=e.d;e.d-=135*dt; }
  },
  shouldShoot(e,s) { return !race.recovery(s.distance) && e.type==='enemy' && difficulty.progress(e.d)>=this.shootingThreshold && e.fire<=0 && e.d-s.distance<this.shooting.farDistance && e.d>s.distance+this.shooting.nearDistance; },
  hostile(e,s) { e.fire=this.fireInterval(e.d);
    return {type:'hostile',x:e.x,y:e.y,d:e.d,previousD:e.d,rx:.35,ry:.35,rz:1.2,hp:1,age:0}; },
  playerHit(e,s) {
    const near = e.type==='hostile' ? Math.min(e.previousD,e.d) <= s.distance+1.2 && Math.max(e.previousD,e.d) >= s.previousDistance-1.2
      : e.d+e.rz>=s.previousDistance && e.d-e.rz<=s.distance;
    return near && Math.abs(e.x-s.player.x)<e.rx+flight.shipRadius && Math.abs(e.y-s.player.y)<e.ry+flight.shipRadius;
  },
  damage: {get barrier(){return hull.obstacleDamage;},get rock(){return hull.obstacleDamage;},enemy:16,hostile:12},
  score(s,e) { s.kills++;s.score+=e.type==='enemy'?150:75; },
});

const pickups = ({
  minimumSpacing:500,
  frequency:1,
  placement:{startOffset:55,halfWidth:5.5,halfHeight:3.4,repairStretch:120},
  radius:1.65,chargeMin:10,chargeMax:15,repairMin:10,repairMax:25,
  canSpawn(s) {return s.nextPickup<s.distance+encounters.spawnAhead;},
  duration:{invincible:7,turbo:7},
  types:['charge','cannon','fire','cool','invincible','turbo','repair'],
  food:{charge:'MILK BONE',cannon:'DRUMSTICK',fire:'BACON',cool:'CHEESE',invincible:'PAW BISCUIT',turbo:'SAUSAGE',repair:'KIBBLE BOWL'},
  invincibleFrequency:.25,
  colors:{charge:0x8eeee3,cannon:0xf291bd,fire:0x84b8ff,cool:0xceadff,invincible:0xffce72,turbo:0xffa55e,repair:0x90e99f},
  labels:{charge:'SPEED CHARGE',cannon:'CANNON UPGRADE',fire:'FIRE RATE UPGRADE',cool:'COOLING UPGRADE',invincible:'INVINCIBLE · 7 SECONDS',turbo:'TURBO · 7 SECONDS',repair:'HULL REPAIR'},
  make(type,x,y,d) {return {type:'pickup',pickup:type,x,y,d,rx:this.radius,ry:this.radius,rz:1.2,age:0,hp:Infinity,value:type==='charge'?Math.floor(math.random(this.chargeMin,this.chargeMax+1)):type==='repair'?Math.floor(math.random(this.repairMin,this.repairMax+1)):0};},
  startDistance(distance) {
    const offset=this.placement.startOffset;
    return offset+Math.max(0,Math.ceil((distance-offset)/this.minimumSpacing))*this.minimumSpacing;
  },
  reserve(s,d) {
    // Keep recently passed positions too, so collection does not erase the minimum gap.
    s.pickupDistances=s.pickupDistances.filter(position=>position>=s.distance-encounters.despawnBehind-this.minimumSpacing);
    if(random.next()>=this.frequency||s.pickupDistances.some(position=>Math.abs(position-d)<this.minimumSpacing))return false;
    s.pickupDistances.push(d);return true;
  },
  scheduled(s) {
    const d=s.nextPickup,placement=this.placement;
    s.nextPickup=d+this.minimumSpacing;
    random.seed(s.seed,'pickup:'+d);
    if(!this.reserve(s,d))return null;
    const rest=race.recovery(d),index=Math.round((d-placement.startOffset)/this.minimumSpacing);
    const type=rest?(d>=race.waveLength&&d%race.waveLength<placement.repairStretch?'repair':'charge'):this.types[index%this.types.length];
    return this.make(this.rebalance(type),math.random(-placement.halfWidth,placement.halfWidth),math.random(-placement.halfHeight,placement.halfHeight),d);
  },
  drop(e,s) {
    random.seed(s.seed,'drop:'+e.d+':'+e.phase);
    if(!this.reserve(s,e.d))return null;
    const bag=s.hull<60?['repair','repair','charge','cannon','fire','cool','invincible','turbo']:['charge','charge','cannon','fire','cool','invincible','turbo','repair'];
    return this.make(this.rebalance(math.pick(bag)),e.x,e.y,e.d);
  },
  rebalance(type) {
    if(type!=='invincible'||random.next()<this.invincibleFrequency)return type;
    return math.pick(this.types.filter(candidate=>candidate!=='invincible'));
  },
  collect(p,s) {
    const w=s.weapon;let label=this.labels[p.pickup];
    if(p.pickup==='charge'){s.charge=math.clamp(s.charge+p.value,0,100);label+=` +${p.value}`;}
    if(p.pickup==='cannon'){if(w.tier<3)w.tier++;else s.charge=math.clamp(s.charge+this.chargeMax,0,100);label=`${weapon.labels[w.tier]} CANNON`;}
    if(p.pickup==='fire'){w.fireLevel=math.clamp(w.fireLevel+1,0,3);label=`FIRE RATE ${w.fireLevel+1}`;}
    if(p.pickup==='cool'){w.coolLevel=math.clamp(w.coolLevel+1,0,3);label=`COOLING ${w.coolLevel+1}`;}
    if(p.pickup==='repair'){s.hull=math.clamp(s.hull+p.value,0,hull.maxIntegrity);label+=` +${p.value}%`;}
    if(p.pickup==='invincible')s.invincible=this.duration.invincible;
    if(p.pickup==='turbo')propulsion.turbo(s);
    s.pickups++;s.score+=50;s.toast=this.food[p.pickup]+' · '+label;s.toastTime=2.4;
  },
});

// Low-poly primitives are shared by the title ship and the actual player ship.
const assets = ({
  colors:{mint:0x89d9ce,cream:0xf0eee3,dark:0x152c36,orange:0xff754d,gold:0xffcc83,fur:0xc68b58,furLight:0xe6b57c,nose:0x171e23,visor:0x84e0e8},
  shapes:{box:['box'],ico:['ico',1,0],octa:['octa',1,0],cone:['cone',1,1,4],cylinder:['cylinder',1,1,1,6],tetra:['tetra',1,0],sphere:['sphere',1,12,8],torus:['torus',1,.12,8,32],wedge:['wedge']},
  shipParts:[
    ['ico','mint',[0,-.25,0],[1.35,.6,3.15],[0,0,0]],
    ['cone','cream',[0,-.1,-2.45],[1.1,2.2,1.15],[-1.5708,.7854,0]],
    ['box','dark',[0,.26,.28],[1.18,.2,1.74],[0,0,0]],
    ['ico','mint',[-2,-.24,.65],[2.5,.18,1.65],[0,.32,-.07]],
    ['ico','mint',[2,-.24,.65],[2.5,.18,1.65],[0,-.32,.07]],
    ['box','orange',[-2.65,-.15,.9],[.22,.14,1.85],[0,.25,0]],
    ['box','orange',[2.65,-.15,.9],[.22,.14,1.85],[0,-.25,0]],
    ['ico','dark',[-1.45,-.23,1.68],[.62,.51,1.28],[0,0,0]],
    ['ico','dark',[1.45,-.23,1.68],[.62,.51,1.28],[0,0,0]],
    ['cylinder','orange',[-1.45,-.23,2.7],[.43,.18,.43],[1.5708,0,0]],
    ['cylinder','orange',[1.45,-.23,2.7],[.43,.18,.43],[1.5708,0,0]],
    ['box','dark',[0,-.3,2.2],[.48,.5,.8],[0,0,0]],
    ['cone','orange',[0,.25,1.9],[.55,1.7,.68],[0,.7854,0]],
    ['box','cream',[0,-.11,-.85],[.16,.12,1.8],[0,0,0]],
  ],
  dogParts:[
    ['ico','fur',[0,.95,.5],[.5,.7,.45],[0,0,0]],
    ['ico','furLight',[0,1.8,.18],[.66,.61,.55],[0,0,0]],
    ['ico','cream',[0,1.63,-.25],[.42,.32,.4],[0,0,0]],
    ['ico','nose',[0,1.75,-.56],[.15,.12,.1],[0,0,0]],
    ['cone','fur',[-.5,2.31,.21],[.43,.88,.25],[0,0,.24]],
    ['cone','fur',[.5,2.31,.21],[.43,.88,.25],[0,0,-.24]],
    ['cone','orange',[-.5,2.35,.09],[.23,.53,.1],[0,0,.24]],
    ['cone','orange',[.5,2.35,.09],[.23,.53,.1],[0,0,-.24]],
    ['box','dark',[-.27,1.96,-.31],[.36,.25,.14],[0,.2,0]],
    ['box','dark',[.27,1.96,-.31],[.36,.25,.14],[0,-.2,0]],
    ['box','visor',[-.27,1.96,-.4],[.23,.14,.04],[0,.2,0]],
    ['box','visor',[.27,1.96,-.4],[.23,.14,.04],[0,-.2,0]],
    ['box','orange',[0,1.13,.15],[.82,.17,.64],[0,0,0]],
    ['ico','cream',[-.36,.71,-.13],[.2,.26,.32],[0,0,.3]],
    ['ico','cream',[.36,.71,-.13],[.2,.26,.32],[0,0,-.3]],
  ],
  cannons:{scale:[.16,.16,1.25],y:-.22,z:-1.8,color:0x263c47},
  engine:{positions:[[-1.45,-.23,3.15],[1.45,-.23,3.15]],color:0xffa574,shape:['cone',.35,1.9,5],rotation:[1.5708,0,0]},
  engineScale(t,fast) { return [.75,.8 + Math.sin(t*35)*.2 + (fast?.85:0),.75]; },
  dogAnimation(t) { return Math.sin(t*.75)*.075; },
  enemyParts:[
    ['octa','dark',[0,0,0],[1.5,.7,1.2],[0,0,0]],
    ['box','orange',[0,0,-.9],[.45,.22,.25],[0,0,0]],
    ['ico','orange',[-1.5,0,.15],[1.15,.13,.68],[0,0,.18]],
    ['ico','orange',[1.5,0,.15],[1.15,.13,.68],[0,0,-.18]],
  ],
  rotations(e) { return e.type==='rock' ? [e.age*.23+e.phase,e.age*.32,0] : e.type==='pickup' ? [e.age*.4,e.age*1.8,e.age*.25] : [0,0,Math.sin(e.age*2+e.phase)*.13]; },
  // Each treat has a natural-colored silhouette and an effect-colored orbit.
  // Parts: geometry, color, local position, scale, optional rotation.
  pickupParts:{
    charge:[['box',0xf7dfb0,[0,0,0],[1.7,.5,.4]],
      ...[-.85,.85].flatMap(x=>[-.25,.25].map(y=>['sphere',0xf7dfb0,[x,y,0],[.38,.38,.3]]))],
    cannon:[['ico',0xb95b35,[0,.25,0],[.9,1.15,.65]],['box',0xffe4b8,[0,-.9,0],[.28,.9,.28]],
      ['sphere',0xffe4b8,[-.18,-1.35,0],[.28,.24,.24]],['sphere',0xffe4b8,[.18,-1.35,0],[.28,.24,.24]]],
    fire:Array.from({length:7},(_,i)=>[
      ['box',0xc95040,[Math.sin(i*.9)*.15,(i-3)*.32,0],[.95,.37,.22]],
      ['box',0xffc7a1,[Math.sin(i*.9)*.15-.18,(i-3)*.32,-.13],[.16,.37,.05]],
    ]).flat(),
    cool:[['wedge',0xffd35c,[0,0,0],[1.6,1.4,1.1]],
      ['sphere',0xc8882e,[-.35,-.3,-.57],[.15,.15,.03]],['sphere',0xc8882e,[.32,-.38,-.57],[.2,.2,.03]],
      ['sphere',0xc8882e,[-.2,.23,-.57],[.1,.1,.03]]],
    invincible:[['sphere',0xbd884d,[0,-.35,0],[.78,.65,.28]],
      ...[-.7,-.25,.25,.7].map((x,i)=>['sphere',0xf0c585,[x,i===0||i===3?.35:.7,0],[.26,.32,.22]])],
    turbo:[['cylinder',0xa84931,[0,0,0],[.45,1.75,.45]],
      ['sphere',0xcc7950,[0,.87,0],[.45,.45,.45]],['sphere',0xcc7950,[0,-.87,0],[.45,.45,.45]],
      ...[-.45,0,.45].map(y=>['box',0xf4ac70,[0,y,-.45],[.6,.08,.04]])],
    repair:[['cylinder',0x6ab7cb,[0,-.3,0],[1,.55,1]],['torus',0xd2f7f2,[0,0,0],[1,1,1],[Math.PI/2,0,0]],
      ...[-.5,0,.5].flatMap(x=>[-.3,.25].map(z=>['ico',0x9b683e,[x,.08,z],[.24,.21,.24]]))],
  },
});

const gfx = ({
  hangar:{
    image:'./assets/title/hangar-clean-v1.png',width:1672,height:941,frames:8,frameSeconds:.24,
    sheet:{width:1774,height:887,columns:4,rows:2},
    sprites:[
      {id:'hangar-tail',image:'./assets/title/tail-wind-v2.png',size:[312,302],scale:[.8,1.2],sourceAnchor:[80,309],anchor:[1280,592],sourceWindow:{left:64,right:48}},
      {id:'hangar-scarf',image:'./assets/title/scarf-wind-v2.png',size:[400,300],scale:[1,1],sourceAnchor:[30,218],anchor:[1138,432],sourceWindow:{left:12,right:0}},
    ],
    lights:[
      {glow:[599,22,55],color:'#ffe3b8',phase:0},
      {glow:[944,126,43],color:'#ffd7a2',phase:2},
      {glow:[1518,110,64],color:'#ffe5be',phase:4},
      {glow:[1598,276,49],color:'#ffcc96',phase:6},
      {glow:[1660,338,26],color:'#ff8250',phase:3},
    ],
    frameAt(time,reduced=false) {return reduced?0:Math.floor(time/this.frameSeconds)%this.frames;},
    frameRect(index) {const w=this.sheet.width/this.sheet.columns,h=this.sheet.height/this.sheet.rows;return [(index%this.sheet.columns)*w,Math.floor(index/this.sheet.columns)*h,w,h];},
    // A pose can extend into the next atlas cell's transparent leading margin.
    // Isolate its source window before scaling, retaining its own full tip.
    spriteFrameRect(sprite,index) {
      const [x,y,w,h]=this.frameRect(index),window=sprite.sourceWindow;
      return [x+window.left,y,w-window.left+window.right,h];
    },
    framePosition(index,sprite) {
      const [x,y,w,h]=this.spriteFrameRect(sprite,index);
      return `${x/(this.sheet.width-w)*100}% ${y/(this.sheet.height-h)*100}%`;
    },
    layerRect(sprite) {
      const w=sprite.size[0]*sprite.scale[0],h=sprite.size[1]*sprite.scale[1];
      return [sprite.anchor[0]-sprite.sourceAnchor[0]/(this.sheet.width/this.sheet.columns)*w,
        sprite.anchor[1]-sprite.sourceAnchor[1]/(this.sheet.height/this.sheet.rows)*h,w,h];
    },
    spriteLayerRect(sprite) {
      const [x,y,w,h]=this.layerRect(sprite),frame=this.frameRect(0),source=this.spriteFrameRect(sprite,0);
      return [x+sprite.sourceWindow.left/frame[2]*w,y,source[2]/frame[2]*w,h];
    },
    layerStyle(sprite) {
      const [x,y,w,h]=this.spriteLayerRect(sprite),source=this.spriteFrameRect(sprite,0);
      return {left:`${x/this.width*100}%`,top:`${y/this.height*100}%`,width:`${w/this.width*100}%`,height:`${h/this.height*100}%`,
        backgroundImage:`url("${sprite.image}")`,backgroundSize:`${this.sheet.width/source[2]*100}% ${this.sheet.height/source[3]*100}%`,backgroundPosition:this.framePosition(0,sprite)};
    },
    lightStyle(light) {const [x,y,r]=light.glow;return {left:`${(x-r)/this.width*100}%`,top:`${(y-r)/this.height*100}%`,width:`${r*2/this.width*100}%`,height:`${r*2/this.height*100}%`,background:`radial-gradient(ellipse,${light.color},transparent 70%)`};},
    lightAlpha(index,phase) {return [.016,.021,.028,.031,.026,.019,.013,.014][(index+phase)%this.frames];},
  },
  clear:0x090f16,fogDensity:.0022,exposure:1.15,maxPixelRatio:1.75,
  camera:{fov:63,near:.1,far:650,titlePosition:[5,5.6,15],titleLook:[1.6,.1,0],flightPosition:[0,3.2,12],flightLook:[0,1,-60]},
  lighting:{ambient:1.6,key:3.5,rim:4.2,keyPosition:[-6,12,8],rimPosition:[9,3,-4]},
  particle:{capacity:1400,emissionRate:95,smokeLife:.9,plasmaLife:.24,explosionLife:1.25,
    smokeColors:[0x8295a5,0xb4d1cc,0x647585],plasmaColors:[0xffd69a,0xff8a43,0x99fff1],explosionColors:[0xff754d,0xffcf84,0xeaf4e8]},
  starCount:220,
  stars() {const a=new Float32Array(this.starCount*3);for(let i=0;i<this.starCount;i++)a.set([math.visualRandom(-180,180),math.visualRandom(-95,95),math.visualRandom(-420,20)],i*3);return a;},
  particleAt(kind,x,y,d) {
    const cfg=this.particle,firework=kind==='firework',burst=kind==='explosion'||firework;
    const life=kind==='smoke'?cfg.smokeLife:kind==='plasma'?cfg.plasmaLife:firework?1.7:cfg.explosionLife;
    const colors=kind==='smoke'?cfg.smokeColors:kind==='plasma'?cfg.plasmaColors:firework?race.colors:cfg.explosionColors;
    return {kind,x,y,d,vx:math.visualRandom(-1,1)*(burst?18:.45),vy:math.visualRandom(-1,1)*(burst?18:.45),
      vd:burst?math.visualRandom(-12,12):-9,age:0,life:life*math.visualRandom(.8,1.2),color:math.visualPick(colors)};
  },
  stepParticle(p,dt) {p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.d+=p.vd*dt;},
  particleScale(p) {return p.kind==='smoke'?.15+p.age*.8:p.kind==='plasma'?.27*(1-p.age/p.life):.22+.3*(1-p.age/p.life);},
  particleOpacity(p) {return Math.max(0,1-p.age/p.life)*(p.kind==='smoke'?.38:.95);},
  trail(s) {
    const result=[];
    for(const x of [-1.45,1.45])for(const kind of ['smoke','plasma'])
      result.push(this.particleAt(kind,s.player.x+x*renderMath.flightScale,s.player.y-.23*renderMath.flightScale,s.distance-3.15*renderMath.flightScale));
    return result;
  },
  explode(e,count=60) {return Array.from({length:count},()=>this.particleAt('explosion',e.x,e.y,e.d));},
  fireworks(s) {return [-9,9].flatMap(x=>Array.from({length:36},()=>this.particleAt('firework',x,2,s.distance+4)));},
  titleTime(t,dt) { return t+dt; },
  titleDistance(t) {return t*9;},
  flightCamera(s) { return {position:[s.player.x*.85,3.2+s.player.y*.8,12],look:[s.player.x*.95,1+s.player.y*.9,-60]}; },
  ratio(dpr) { return Math.min(dpr,this.maxPixelRatio); },
});

const ui = ({
  hud:{
    speedDigits:3,percentScale:100,debugGapPx:12,
    heat:{max:100,warningPercent:60,criticalPercent:90,arcDegrees:100,svgSize:100,svgRadius:44,
      radiusWorld:3.25,minDiameterPx:132,lineWidthPx:2,paleBlue:'#a6dcf4',orange:'#ff9a45',red:'#ff453e'},
    hull:{warningPercent:40,criticalPercent:12,lerpRate:9,snapTolerance:.01,flashSeconds:.65,
      flashCyclesPerSecond:6,flashBase:.12,flashStrength:.8,green:'#8effb0',orange:'#ff9a45',red:'#ff453e'},
  },
  menus:{
    title:{actions:['launch','checkpoint-resume','flight-manual','options-button','tune-button'],trapFocus:false},
    paused:{panel:'pause-menu',label:'Flight paused',actions:['resume','home'],trapFocus:true},
    defeat:{panel:'flight-results',label:'Flight results',actions:['restart','results-home'],trapFocus:true},
  },
  menuKeys:{previous:'ArrowUp',next:'ArrowDown',tab:'Tab',firstIndex:0,step:1},
  keys:['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight'],
  menuIndex(index,count,code) {
    const keys=this.menuKeys;
    return index<keys.firstIndex?(code===keys.previous?count-keys.step:keys.firstIndex):(index+(code===keys.previous?-keys.step:keys.step)+count)%count;
  },
  speedText(s) { return `${String(Math.round(s.speed)).padStart(this.hud.speedDigits,'0')} KM/S`; },
  chargeText(s) {return math.percent(s.charge);},
  heatLevel(heat) {return heat>this.hud.heat.criticalPercent?'critical':heat>this.hud.heat.warningPercent?'warning':'normal';},
  hullLevel(integrity) {const percent=integrity/hull.maxIntegrity*this.hud.percentScale;return percent<=this.hud.hull.criticalPercent?'critical':percent<=this.hud.hull.warningPercent?'warning':'normal';},
  heatArcPath(side) {
    const config=this.hud.heat,center=config.svgSize/2,angle=config.arcDegrees/2*Math.PI/180;
    const x=center+side*config.svgRadius*Math.cos(angle),y=config.svgRadius*Math.sin(angle);
    return `M ${x} ${center+y} A ${config.svgRadius} ${config.svgRadius} 0 0 ${side<0?1:0} ${x} ${center-y}`;
  },
  hullFlash(remaining) {
    const config=this.hud.hull,elapsed=config.flashSeconds-remaining;
    return remaining>0?(config.flashBase+config.flashStrength*Math.abs(Math.cos(elapsed*math.tau*config.flashCyclesPerSecond)))*remaining/config.flashSeconds:0;
  },
  time(seconds) {return `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;},
  finalScore(s) {return s.score+Math.floor(s.distance/10);},
});

// Unified soundtrack catalog. Scores and synthesis are data; arrangers emit common audio events.
const music = ({
  startOffset:.035,lateOffset:.015,retireBusMs:6000,filterQ:.7,initialStep:0,oneShotBpm:60,immediateFade:.01,mixSmoothing:.025,
  playback:{playlist:['game0','stardog0','game1','stardog1','game2'],
    roles:{title:'stardogTitle',defeat:'defeat',crashing:null},pausedFallback:'playing',
    gapSeconds:.6,fadeSeconds:.35,scaleSteps:256},
  debug:{enabled:true,key:'KeyP',resetOnModeChange:true,tempoFollowsSpeed:false},
  tempoScaling:{referenceSpeed:80,min:.85,max:2,growth:.5},
  pitch:{referenceFrequency:440,referenceMidi:69,semitonesPerOctave:12,octaveRatio:2},
  synthesis:{detuneSpacing:2,detuneCenter:.5,minimumFrequency:20,minimumDuration:.01,
    attackFraction:.5,driveSamples:2048,driveRange:2,oversample:'2x',maxDelaySeconds:3,noiseOffsetFraction:.4},
  voiceDefaults:{source:'tone',copies:2,releaseFactor:1,releaseSeconds:0,holdFraction:.65,
    filterType:'lowpass',filterEndRatio:1,drive:0,echo:null},
  voicePresets:{starhound:{},stardog:{attack:.006,releaseSeconds:0,releaseFactor:1,holdFraction:0,
    filterEndRatio:.45,stopTail:.04,echo:{seconds:.26,feedback:.28,wet:.18}}},
  trackDefaults:{arranger:'scale',mix:'ambient',loop:true},
  mixes:{ambient:{output:'ambient'},direct:{gain:.27,output:'direct',
    compressor:{threshold:-16,ratio:5,attack:.003,release:.16}}},
  sequence:{stepsPerBeat:4,secondsPerMinute:60,bassMidi:36,melodyMidi:48,chordMidi:48,bassDuration:0.85,leadDuration:1.5,chordSteps:8,chordDuration:5,kickFrequency:150,kickEndFrequency:35,kickDuration:0.15,snareDuration:0.12,snareCutoff:2200,snareGain:0.28,hatDuration:0.04,hatCutoff:7000,hatGain:0.075},
  legacy:{scale:[0,2,3,7,10,12,11,7],roots:[0,5,8,7],bass:[0,0,3,1,0,4,2,3],chords:[0,7,12],
    bassMidi:33,bassDuration:0.88,kickEvery:4,kick:{frequency:75,to:28,duration:0.2},kickNoise:{duration:0.05,cutoff:500,gain:0.14},
    snareEvery:8,snareStep:4,snare:{duration:0.18,cutoff:3800,gain:0.3},metal:{frequency:170,to:85,duration:0.15,gain:0.1},
    hatEvery:2,hatStep:1,hat:{duration:0.04,cutoff:7000,gain:0.055},chordFrequency:110,
    chordDuration:{slow:14,active:6},chordGain:{slow:0.065,active:0.12},offbeatEvery:4,offbeatStep:2,
    offbeat:{octaves:2,duration:0.8,gain:0.13},titleLeadAfterStep:12,flareMultiplier:2,lead:{parity:2,oddOctaves:4,evenOctaves:8,duration:0.85,gain:0.14},
    padEvery:8,pad:{octaves:4,duration:7,gain:0.08}},
  master:.58,musicGain:.65,sfxGain:.82,lookAhead:.16,schedulerMs:25,fade:.32,
  reverbSeconds:2.8,reverbDecay:2.9,reverbGain:.2,delaySeconds:.29,delayFeedback:.25,delayGain:.14,
  compressor:{threshold:-17,knee:18,ratio:3,attack:.006,release:.19},
  synths:{
    bass:{wave:'sawtooth',gain:.105,attack:.007,release:.1,cutoff:900,detune:5},
    sub:{wave:'sine',gain:.12,attack:.009,release:.14,cutoff:420,detune:0},
    pluck:{wave:'triangle',gain:.062,attack:.004,release:.18,cutoff:5200,detune:7},
    glass:{wave:'sine',gain:.076,attack:.004,release:.32,cutoff:9000,detune:12},
    lead:{wave:'sawtooth',gain:.043,attack:.008,release:.18,cutoff:4100,detune:9},
    pad:{wave:'triangle',gain:.022,attack:.18,release:.5,cutoff:1900,detune:13},
    brightPad:{wave:'sawtooth',gain:.013,attack:.15,release:.45,cutoff:2700,detune:17},
    stardogSparkle:{family:'stardog',wave:'triangle',copies:2,detune:2,gain:0.2,cutoff:6500,Q:0.4,drive:1.2},
    stardogBass:{family:'stardog',wave:'sawtooth',copies:2,detune:3.5,gain:0.33,cutoff:950,Q:1.8,drive:5},
    stardogGuitar:{family:'stardog',wave:'sawtooth',copies:3,detune:6,gain:0.16,cutoff:2700,Q:1.2,drive:11},
    stardogLead:{family:'stardog',wave:'sawtooth',copies:3,detune:5,gain:0.2,cutoff:3800,Q:2.5,drive:5},
    stardogPad:{family:'stardog',wave:'sawtooth',copies:3,detune:9,gain:0.06,cutoff:1250,Q:0.7,drive:2},
    stardogKick:{family:'stardog',wave:'sine',copies:1,detune:0,gain:0.65,cutoff:600,Q:0.5,drive:3},
    stardogMetal:{family:'stardog',wave:'triangle',copies:3,detune:11.5,gain:0.23,cutoff:2800,Q:3,drive:7},
  },
  tracks:{
    intro:{name:'Soft Launch',bpm:78,root:57,scale:[0,2,4,7,9],chords:[0,3,5,2,0,3,4,2],bass:[0,null,null,null,7,null,null,null,0,null,null,null,4,null,null,null],lead:[0,null,2,null,4,null,3,null,2,null,1,null,0,null,null,null],voice:'glass',pad:'pad',drums:'soft',flare:false},
    game0:{name:'Copper Funk',bpm:112,root:48,scale:[0,2,3,5,7,9,10],chords:[0,5,3,4,0,2,5,4],bass:[0,null,0,7,null,0,10,null,0,null,5,7,null,10,7,null],lead:[7,null,9,7,null,4,null,2,4,null,7,null,9,11,null,9],voice:'pluck',pad:'pad',drums:'funk',flare:true},
    game1:{name:'Glass Arcade',bpm:116,root:53,scale:[0,2,4,6,7,9,11],chords:[0,4,1,5,2,4,0,5],bass:[0,null,7,null,0,12,null,7,0,null,7,9,null,5,7,null],lead:[0,2,null,4,6,null,4,2,7,null,6,4,2,null,4,6],voice:'glass',pad:'brightPad',drums:'four',flare:true},
    game2:{name:'Afterburner Velvet',bpm:108,root:46,scale:[0,2,3,5,7,8,10],chords:[0,3,6,4,5,3,1,4],bass:[0,0,null,10,7,null,5,null,0,null,12,10,null,7,5,3],lead:[9,null,7,4,null,2,0,null,2,4,null,7,9,null,11,12],voice:'lead',pad:'pad',drums:'broken',flare:true},
    game3:{name:'Solar Disco',bpm:120,root:55,scale:[0,2,4,5,7,9,11],chords:[0,5,1,4,3,5,2,4],bass:[0,null,12,7,0,null,5,7,0,null,12,10,7,null,5,7],lead:[0,null,4,7,null,9,7,4,2,null,5,9,null,11,9,5],voice:'pluck',pad:'brightPad',drums:'disco',flare:true},
    invincible:{name:'Goodboy Forever',bpm:104,root:60,scale:[0,2,4,7,9],chords:[0,3,1,4,0,2,3,4],bass:[0,null,7,null,0,null,12,7,0,null,7,null,4,null,7,12],lead:[0,2,4,null,7,9,7,null,4,2,0,null,2,4,7,9],voice:'glass',pad:'brightPad',drums:'four',flare:true},
    defeat:{name:'Drifting Home',bpm:62,root:45,scale:[0,2,3,5,7,8,10],chords:[0,5,3,4,0,3,1,4],bass:[0,null,null,null,null,null,null,null,7,null,null,null,null,null,null,null],lead:[4,null,null,null,2,null,null,null,0,null,null,null,null,null,null,null],voice:'glass',pad:'pad',drums:'sad',flare:false},
    stardog0:{name:'Iron Drive',bpm:100,arranger:'sequence',mix:'direct',stepsPerMeasure:16,measures:4,
      roots:[0,5,8,7],bass:[0,0,7,3,0,10,7,3],melody:[12,null,15,19,12,22,19,null],
      kicks:[0,8],snares:[4,12],hats:[0,2,4,6,8,10,12,14],chords:[0,3,7],
      leadVoice:'stardogGuitar',bassVoice:'stardogBass',chordVoice:'stardogGuitar',
      leadGain:0.16,bassGain:0.3,chordGain:0.09,leadEcho:true,bassEcho:false,chordEcho:true},
    stardog1:{name:'Neon Pursuit',bpm:106,arranger:'sequence',mix:'direct',stepsPerMeasure:16,measures:4,
      roots:[0,7,3,10],bass:[0,7,12,7,0,10,12,3],melody:[24,19,22,null,27,24,null,22,19,15,19,22,24,null,31,27],
      kicks:[0,3,8,11],snares:[4,12],hats:[0,1,2,3,4,6,8,9,10,11,12,14],chords:[0,7,10],
      leadVoice:'stardogLead',bassVoice:'stardogBass',chordVoice:'stardogGuitar',
      leadGain:0.17,bassGain:0.25,chordGain:0.08,leadEcho:true,bassEcho:false,chordEcho:true},
    stardog2:{name:'Heavy Orbit',bpm:93,arranger:'sequence',mix:'direct',stepsPerMeasure:16,measures:4,
      roots:[0,0,8,5],bass:[0,null,0,0,3,null,0,10],melody:[12,null,null,10,7,null,15,null],
      kicks:[0,2,7,8,10],snares:[4,12,15],hats:[0,4,6,8,12,14],chords:[0,7,12],
      leadVoice:'stardogGuitar',bassVoice:'stardogBass',chordVoice:'stardogGuitar',
      leadGain:0.22,bassGain:0.36,chordGain:0.15,leadEcho:true,bassEcho:false,chordEcho:true},
    stardog3:{name:'Solar Relay',bpm:103,arranger:'sequence',mix:'direct',stepsPerMeasure:16,measures:4,
      roots:[0,5,10,7],bass:[0,12,7,10,0,12,3,7],melody:[19,22,24,27,24,22,19,15,17,19,22,24,22,19,17,15],
      kicks:[0,6,8,14],snares:[4,12],hats:[0,2,3,4,6,7,8,10,11,12,14,15],chords:[0,3,7,10],
      leadVoice:'stardogMetal',bassVoice:'stardogBass',chordVoice:'stardogGuitar',
      leadGain:0.12,bassGain:0.27,chordGain:0.1,leadEcho:true,bassEcho:false,chordEcho:true},
    stardogInvincible:{name:'Rainbow Victory',bpm:130,arranger:'sequence',mix:'direct',stepsPerMeasure:16,measures:4,
      roots:[0,5,7,0],bass:[0,4,7,12,0,7,4,12],melody:[12,16,19,24,19,16,14,19,17,21,24,29,24,21,19,24],
      kicks:[0,4,8,12],snares:[4,12],hats:[0,2,4,6,8,10,12,14],chords:[0,4,7,12],
      leadVoice:'stardogSparkle',bassVoice:'stardogBass',chordVoice:'stardogSparkle',
      leadGain:0.2,bassGain:0.22,chordGain:0.13,leadEcho:true,bassEcho:false,chordEcho:true},
    stardogTitle:{name:'Title Music',bpm:68.18181818181819,arranger:'legacy',mix:'direct',stepsPerMeasure:16,measures:16,slow:false,title:true},
    stardogPause:{name:'Pause Music',bpm:25,arranger:'legacy',mix:'direct',stepsPerMeasure:16,measures:16,slow:true,title:false},
    stardogDeath:{name:'Death Music',bpm:25,arranger:'legacy',mix:'direct',stepsPerMeasure:16,measures:16,slow:true,title:false},
    stardogVictory:{name:'Wave Victory Fanfare',arranger:'fanfare',mix:'direct',loop:false,lengthSteps:1,baseFrequency:196,intervals:[0,4,7,12,16,19,24],noteSpacing:0.1,duration:0.65,gain:0.2,chordDuration:1.5,chords:[0,7,12],leadVoice:'stardogGuitar',chordVoice:'stardogPad'},
  },
  trackFor(s,index=0) {
    if(Object.hasOwn(this.playback.roles,s.mode))return this.playback.roles[s.mode];
    return this.playback.playlist[index];
  },
  tempo(track,s) {const t=this.tracks[track],c=this.tempoScaling;return (t.bpm??this.oneShotBpm)*(this.playback.playlist.includes(track)?1+(math.clamp(s.speed/c.referenceSpeed,c.min,c.max)-1)*c.growth:1);},
  transitionStep(id,step,positions) {return positions[id] ?? Math.ceil(step/16)*16;},
  stepSeconds(bpm) {return this.sequence.secondsPerMinute/bpm/this.sequence.stepsPerBeat;},
  frequency(midi) {const p=this.pitch;return p.referenceFrequency*p.octaveRatio**((midi-p.referenceMidi)/p.semitonesPerOctave);},
  chordRoot(track,bar) {return track.root+track.scale[track.chords[Math.floor(bar/2)%track.chords.length]%track.scale.length];},
  degree(track,index) {return track.scale[index%track.scale.length]+Math.floor(index/track.scale.length)*12;},
  scaleNotes(id,step,bpm) {
    const t=this.tracks[id], part=step%16,bar=Math.floor(step/16)%16,root=this.chordRoot(t,bar),beat=this.stepSeconds(bpm), notes=[];
    const add=(voice,note,length,level=1,offset=0,pan=0)=>notes.push({voice,note,duration:beat*length,level,offset,pan});
    if(part===0 && bar%2===0) for(const [i,degree] of [0,2,4,6].entries())add(t.pad,root+12+this.degree(t,degree),28,1,0,(i-1.5)*.32);
    if(t.bass[part]!==null) {add('bass',root-12+t.bass[part],t.drums==='soft'||t.drums==='sad'?3:1.4,.8);add('sub',root-12+t.bass[part],1.7,.55);}
    const flare=t.flare && bar>=12; // Four measures of ascending sixteenth and thirty-second runs.
    if(flare) {
      const index=(bar-12)*16+part;
      add(t.voice,root+12+this.degree(t,index%21),.65,.68,0,Math.sin(part*.4)*.65);
      if(bar>=14)add(t.voice,root+12+this.degree(t,(index+1)%21),.5,.5,beat/2,Math.cos(part*.5)*.65);
    } else if(t.lead[part]!==null && (t.drums!=='soft'&&t.drums!=='sad'||bar%2===0))add(t.voice,root+12+this.degree(t,t.lead[part]),1.7,.85,0,Math.sin(part*.7)*.35);
    return notes;
  },
  scaleDrums(id,step) {
    const t=this.tracks[id],p=step%16,bar=Math.floor(step/16)%16;if(t.drums==='sad')return p===0&&bar%2===0?['softKick']:[];
    if(t.drums==='soft')return p===0?['softKick']:p===12?['softHat']:[];
    const out=[];
    const kick=t.drums==='four'||t.drums==='disco'?p%4===0:t.drums==='broken'?[0,3,10].includes(p):[0,6,8,11].includes(p);
    if(kick)out.push('kick');if(p===4||p===12)out.push('snare');
    if(p%2===0 || t.drums==='disco')out.push(p===14?'openHat':'hat');
    if(bar%4===3 && [13,15].includes(p))out.push('clap');return out;
  },
  impulse(length,sampleRate) {const data=new Float32Array(length);for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/length,this.reverbDecay);return data;},
  samples(seconds,sampleRate) {return Math.floor(seconds*sampleRate);},
  offset(time,offset) {return time+offset;},
});

// Resolve common defaults once; playback consumes the same profiles for both sound palettes.
music.mixes.ambient.gain=music.musicGain;
music.voiceDefaults.Q=music.filterQ;
for(const [id,voice] of Object.entries(music.synths)){
  const {family='starhound',release,...authored}=voice;
  music.synths[id]={...music.voiceDefaults,...music.voicePresets[family],...authored,
    releaseSeconds:authored.releaseSeconds??release??music.voiceDefaults.releaseSeconds};
}
for(const [id,track] of Object.entries(music.tracks))music.tracks[id]={...music.trackDefaults,
  ...(track.arranger===undefined?{lengthSteps:music.playback.scaleSteps}:{}),...track};
music.previewOrder=Object.keys(music.tracks);

const sfx = ({
  noiseSeconds:2,filterCutoff:4400,
  explosions:{
    enemy:{sub:110,to:32,subGain:.7,noiseCutoff:1400,noiseGain:.5,duration:.85},
    rock:{sub:76,to:27,subGain:.55,noiseCutoff:720,noiseGain:.65,duration:1.05},
    crash:{sub:90,to:22,subGain:1.05,noiseCutoff:1800,noiseGain:.85,duration:1.9},
  },
  fanfare:[{from:523,to:523,offset:0,duration:.15,gain:.17,wave:'triangle'},
    {from:659,to:659,offset:.12,duration:.15,gain:.17,wave:'triangle'},
    {from:784,to:1046,offset:.24,duration:.38,gain:.19,wave:'triangle'}],
  engine:{wave:'triangle',smoothing:.15,noiseGain:.03},
  engineState(s) {const active=s.mode==='playing',fast=s.boosting||s.turbo>0;return {frequency:35+s.speed*.65,cutoff:fast?1100:350,gain:active?(fast?.044:.022):0};},
  tone:{charge:{from:440,to:1760,duration:.24,gain:.12,wave:'sine'},cannon:{from:220,to:880,duration:.45,gain:.14,wave:'square'},fire:{from:880,to:2640,duration:.18,gain:.12,wave:'triangle'},cool:{from:1760,to:440,duration:.4,gain:.12,wave:'sine'},invincible:{from:660,to:2640,duration:.6,gain:.14,wave:'triangle'},turbo:{from:110,to:990,duration:.55,gain:.15,wave:'sawtooth'},repair:{from:330,to:660,duration:.5,gain:.13,wave:'sine'},shot:{from:1150,to:270,duration:.11,gain:.15,wave:'sawtooth'},pickup:{from:520,to:1560,duration:.3,gain:.13,wave:'sine'},upgrade:{from:390,to:1170,duration:.5,gain:.14,wave:'triangle'},overheat:{from:250,to:105,duration:.5,gain:.12,wave:'sawtooth'},launch:{from:110,to:520,duration:1,gain:.15,wave:'sawtooth'},wave:{from:600,to:1200,duration:.24,gain:.09,wave:'triangle'}},
  drums:{kick:{frequency:148,to:43,duration:.36,gain:.45,noise:false},softKick:{frequency:92,to:40,duration:.4,gain:.2,noise:false},snare:{frequency:1600,duration:.19,gain:.21,noise:true,filter:'highpass'},hat:{frequency:7500,duration:.05,gain:.045,noise:true,filter:'highpass'},openHat:{frequency:6200,duration:.23,gain:.052,noise:true,filter:'highpass'},softHat:{frequency:4000,duration:.15,gain:.025,noise:true,filter:'highpass'},clap:{frequency:1300,duration:.14,gain:.085,noise:true,filter:'bandpass'},explosion:{frequency:520,duration:.8,gain:.28,noise:true,filter:'lowpass'},hit:{frequency:800,duration:.35,gain:.19,noise:true,filter:'lowpass'}},
  noise(length) {const a=new Float32Array(length);for(let i=0;i<length;i++)a[i]=Math.random()*2-1;return a;},
  pan(x) {return math.clamp(x/12,-.8,.8);},
  gain:{floor:.0001,peakDelay:.006,tail:.03},
});

// All arrangements return the same synthesis events. The transport never branches on track IDs.
music.wrapIndex = (index,count)=>(index%count+count)%count;
music.event = function(voice,frequency,duration,options={}) {
  return {voice:typeof voice==='string'?this.synths[voice]:voice,frequency,duration,gain:null,
    offset:0,pan:0,echo:false,...options};
};
music.noiseEvent = function({duration,cutoff,gain},filterType='lowpass') {
  return this.event({...this.voiceDefaults,source:'noise',copies:1,attack:0,holdFraction:0,
    gain,cutoff,filterType,noiseOffsetFraction:this.synthesis.noiseOffsetFraction},cutoff,duration);
};
music.arrangers = {
  scale(id,step,bpm) {
    return [...music.scaleNotes(id,step,bpm).map(note=>music.event(note.voice,music.frequency(note.note),note.duration,
      {gain:music.synths[note.voice].gain*note.level,offset:note.offset,pan:note.pan})),
      ...music.scaleDrums(id,step).map(id=>{
        const d=sfx.drums[id];
        const voice={...music.voiceDefaults,source:d.noise?'noise':'tone',wave:'sine',copies:1,detune:0,
          gain:d.gain,attack:sfx.gain.peakDelay,holdFraction:0,cutoff:d.frequency,filterType:d.filter||'lowpass'};
        return music.event(voice,d.frequency,d.duration,{endFrequency:d.to??d.frequency});
      })];
  },
  sequence(id,step,bpm) {
    const t=music.tracks[id],c=music.sequence,pace=music.stepSeconds(bpm),events=[];
    step%=t.stepsPerMeasure*t.measures;
    const beat=step%t.stepsPerMeasure,root=t.roots[Math.floor(step/t.stepsPerMeasure)%t.roots.length];
    const add=(voice,note,duration,gain,echo)=>events.push(music.event(voice,music.frequency(note),duration,{gain,echo}));
    const bass=t.bass[step%t.bass.length],lead=t.melody[step%t.melody.length];
    if(bass!==null)add(t.bassVoice,c.bassMidi+root+bass,pace*c.bassDuration,t.bassGain,t.bassEcho);
    if(lead!==null)add(t.leadVoice,c.melodyMidi+root+lead,pace*c.leadDuration,t.leadGain,t.leadEcho);
    if(beat%c.chordSteps===0)for(const interval of t.chords)add(t.chordVoice,c.chordMidi+root+interval,pace*c.chordDuration,t.chordGain,t.chordEcho);
    if(t.kicks.includes(beat))events.push(music.event('stardogKick',c.kickFrequency,c.kickDuration,{endFrequency:c.kickEndFrequency}));
    if(t.snares.includes(beat))events.push(music.noiseEvent({duration:c.snareDuration,cutoff:c.snareCutoff,gain:c.snareGain},'highpass'));
    if(t.hats.includes(beat))events.push(music.noiseEvent({duration:c.hatDuration,cutoff:c.hatCutoff,gain:c.hatGain},'highpass'));
    return events;
  },
  legacy(id,step,bpm) {
    const t=music.tracks[id],c=music.legacy,pace=music.stepSeconds(bpm),events=[];
    step%=t.stepsPerMeasure*t.measures;
    const measure=Math.floor(step/t.stepsPerMeasure),part=step%t.stepsPerMeasure;
    const root=c.roots[measure%c.roots.length],hz=music.frequency(c.bassMidi+root+c.scale[c.bass[step%c.bass.length]]);
    const add=(voice,frequency,duration,options={})=>events.push(music.event(voice,frequency,duration,options));
    add('stardogBass',hz,pace*c.bassDuration,{echo:t.slow});
    if(step%c.kickEvery===0){
      add('stardogKick',c.kick.frequency,c.kick.duration,{endFrequency:c.kick.to});
      events.push(music.noiseEvent(c.kickNoise));
    }
    if(!t.slow&&step%c.snareEvery===c.snareStep){
      events.push(music.noiseEvent(c.snare,'highpass'));
      add('stardogMetal',c.metal.frequency,c.metal.duration,{gain:c.metal.gain,endFrequency:c.metal.to});
    }
    if(!t.slow&&step%c.hatEvery===c.hatStep)events.push(music.noiseEvent(c.hat,'highpass'));
    const mood=t.slow?'slow':'active';
    if(part===0)for(const interval of c.chords)add(t.slow?'stardogPad':'stardogGuitar',
      c.chordFrequency*music.pitch.octaveRatio**((root+interval)/music.pitch.semitonesPerOctave),pace*c.chordDuration[mood],{gain:c.chordGain[mood],echo:true});
    if(!t.slow&&step%c.offbeatEvery===c.offbeatStep)add('stardogGuitar',hz*c.offbeat.octaves,
      pace*c.offbeat.duration,{gain:c.offbeat.gain});
    if(!t.slow&&!t.title||part>c.titleLeadAfterStep){
      const flare=measure===t.measures-1?c.flareMultiplier:1;
      add('stardogLead',hz*(step%c.lead.parity?c.lead.oddOctaves:c.lead.evenOctaves),
        pace*c.lead.duration*flare,{gain:c.lead.gain,echo:true});
    }
    if(t.slow&&step%c.padEvery===0)add('stardogPad',hz*c.pad.octaves,pace*c.pad.duration,{gain:c.pad.gain,echo:true});
    return events;
  },
  fanfare(id,step) {
    if(step!==music.initialStep)return [];
    const t=music.tracks[id],events=[];
    for(const [index,interval] of t.intervals.entries())events.push(music.event(t.leadVoice,
      t.baseFrequency*music.pitch.octaveRatio**(interval/music.pitch.semitonesPerOctave),t.duration,{offset:index*t.noteSpacing,gain:t.gain,echo:true}));
    for(const interval of t.chords)events.push(music.event(t.chordVoice,
      t.baseFrequency*music.pitch.octaveRatio**(interval/music.pitch.semitonesPerOctave),t.chordDuration,{gain:t.gain}));
    return events;
  },
};
music.events = function(id,step,bpm) {return this.arrangers[this.tracks[id].arranger](id,step,bpm);};

const renderMath = ({
  starOpacity:.48,
  hemisphere:[0xe5f4f0,0x233341],keyColor:0xffdfc3,rimColor:0x75e5e8,roughness:.65,metalness:.2,emissive:.22,
  engineOpacity:.85,shieldColor:0xffda7b,shieldOpacity:.35,shieldRadius:1,shieldDetail:1,starColor:0xd4e9e5,starSize:.16,
  particleOpacity:.85,barrierEdgeColor:0xffdfa8,pickupHaloOpacity:.5,pickupHaloSize:1.15,bulletColor:0xa7fff0,hostileColor:0xff6a48,
  emissiveIntensity:.8,geometrySegments:0,
  barrierSize(e) {return [e.rx*2,e.ry*2,e.rz*2];},
  rockSize(e) {return [e.rx,e.ry,e.rz];},
  barrelPosition(x) {return [x,assets.cannons.y,assets.cannons.z];},
  titleScale:1.35,flightScale:.65,
  titleScaleFor(aspect) {return aspect<1.3?.92:this.titleScale;},
  titlePose(t,aspect) {const pose=flight.titlePose(t);if(aspect<1.3)pose.position[0]=3.5;return pose;},
  titleRotation(t) {return [.08,2.6+Math.sin(t*.2)*.09,-.12+Math.sin(t*.5)*.025];},
  titleCamera(aspect) {return aspect<1.3?{position:[3,5.6,17],look:[-1,.1,0]}:{position:gfx.camera.titlePosition,look:gfx.camera.titleLook};},
  flightShieldScale(t) {return 2.5+Math.sin(t*4)*.04;},
  bulletScale:[.09,.09,2.2],hostileScale:[.2,.2,1.4],pickupScale:[.62,.62,.62],
  previewParticleOrigin(t) {return gfx.titleDistance(t);},
  reticlePosition(point,width,height) {return {x:(point.x*.5+.5)*width,y:(-point.y*.5+.5)*height};},
  impactFlash(s) {return s.hurt>1.15?math.clamp((s.hurt-1.15)*2,0,.35):0;},
  speedGlow(s) {return speedEffects.intensity(s.speed)*.25;},
  cameraDamp:4,flashTime:.12,
});

const speedEffects = {
  streakCount:180,streakStart:35,streakFull:200,blurStart:155,blurFull:300,hudStart:240,hudFull:420,
  intensity(speed) {return math.clamp((speed-this.streakStart)/(this.streakFull-this.streakStart),0,1);},
  blur(speed) {return math.clamp((speed-this.blurStart)/(this.blurFull-this.blurStart),0,1);},
  hudBlur(speed) {return math.clamp((speed-this.hudStart)/(this.hudFull-this.hudStart),0,1)*3;},
};

// Route geometry and simulation share these dimensions and the same seeded plan.
const route = {
  openShare:.6,tunnelWeight:1,stationWeight:1,cruiserWeight:1,
  tunnelLength:720,stationLength:420,cruiserLength:1100,
  tileDistance:20,behindDistance:55,contactMargin:.3,contactEpsilon:.01,
  tunnel:{radius:9.5,sides:24,windowGroupTiles:7,windowTiles:3,windowSides:[0,1,5,6,11,12,17,18],
    ribEveryTiles:4,ribWidth:.22,windowInset:.08},
  station:{halfWidth:17,halfHeight:10,openingHalfWidth:3.2,openingHalfHeight:2.5,
    openingOffsetX:4.5,openingOffsetY:2,portalDepth:1.5,runwayDistance:115,
    obstacleStart:140,obstacleSpacing:85,obstacleHalfWidth:2.1,obstacleHalfHeight:2.1,obstacleDepth:2,
    obstacleOffsetX:6.5,obstacleOffsetY:2.5,frameWidth:.4,lightWidth:.14,
    panelHeight:5,panelDepth:15,panelThickness:.35,panelInset:.2,
    moduleOffset:23,moduleScale:[7,6,10],moduleY:3,armScale:[12,1.5,2],
    exteriorPanelScale:[9,12,.6],exteriorPanelOffset:[28,-3,2],
    domeScale:[6,4,6],domePosition:[0,12,4],doorTrimWidth:.32,hazardStripeScale:[.18,2,.15],
    hazardStripeOffsets:[-.8,0,.8],hazardStripeAngle:Math.PI/4},
  cruiser:{sides:['left','right','bottom'],offsetX:29,offsetY:-24,segmentOverlap:1.15,noseTiles:4,tailTiles:3,
    hullScale:[13,8,23],spineScale:[7,3,25],spineOffset:[0,7,0],
    wingScale:[7,2,18],wingOffset:[14,-1,0],windowScale:[.25,.28,3],
    windowXs:[-11.8,11.8],windowYs:[-2,2],windowZs:[-6,0,6],
    engineScale:[3.5,3.5,1],engineXs:[-5,5],engineZ:9,trimScale:[1,1,23],trimOffset:[0,8.5,0]},
  palette:{wall:0x253a50,window:0x081827,rib:0x48657e,light:0x8fe9e4,
    station:0x8296a6,hazard:0xd99a51,cruiser:0x687d91,cruiserTrim:0xe8ba7b,engine:0x6bf5ee},
  geometry:{rockDetail:0,radialSegments:12,sphereWidthSegments:12,sphereHeightSegments:8,
    torusTube:.13,torusRadialSegments:8,torusSegments:40,gateRadius:15.3,gateTube:.28,
    gateSegments:80,trimRadius:15.9,trimTube:.07,trimRadialSegments:6},
  material:{roughness:.7,metalness:.45,windowOpacity:.2,windowEmissive:.15,lightEmissive:.7,wallEmissive:.22},
  gates:{wallInset:.3,portalRange:6,frameWidth:.28},
  deterministic:{hashOffset:2166136261,hashPrime:16777619,range:4294967296,avalancheShifts:[16,13]},
  sample(seed,index,salt) {
    let hash=this.deterministic.hashOffset;
    for(const c of `${seed}:${index}:${salt}`)hash=Math.imul(hash^c.charCodeAt(0),this.deterministic.hashPrime);
    hash^=hash>>>this.deterministic.avalancheShifts[0];hash=Math.imul(hash,this.deterministic.hashPrime);hash^=hash>>>this.deterministic.avalancheShifts[1];
    return (hash>>>0)/this.deterministic.range;
  },
};
const speedRings = {
  seriesDistance:1200,seriesGap:180,startOffset:220,minCount:3,maxCount:7,spacing:90,
  radius:2.8,tubeRadius:.16,sides:6,tubeSegments:6,offsetX:6.1,offsetY:3.2,steerStepX:2.8,steerStepY:1.5,
  bonusPerRing:.1,bonusCap:.6,decayPerSecond:.025,scorePerRing:30,toastSeconds:1.3,
  colors:{ready:0xffce76,passed:0x72ffbe,missed:0x627388},
  sound:{baseFrequency:440,semitonesPerHit:2,octaveRatio:2,semitonesPerOctave:12,
    endRatio:1.5,duration:.22,gain:.15,wave:'sine'},
  contains(ring,x,y) {
    // The inside of a flat-topped regular hexagon; touching its edge never causes damage.
    const dx=Math.abs(x-ring.x),dy=Math.abs(y-ring.y),apothem=this.radius*Math.cos(Math.PI/this.sides);
    return dy<=apothem&&Math.sqrt(3)*dx+dy<=2*apothem;
  },
  stride() {return Math.max(this.seriesDistance,(this.maxCount-1)*this.spacing+this.seriesGap);},
};
const scenery = {
  spacing:115,clearance:28,corridorRadius:15,kinds:['rock','station','rock','satellite','rock'],
  clusters:{minCount:4,maxCount:9,spreadX:17,spreadY:12,spreadD:22,minRadius:2,maxRadius:6,
    colors:[0x78675d,0x547d88,0x81769b,0x986d57,0x64816b]},
  sample(index,salt) {const n=Math.sin(index*127.1+salt*311.7)*43758.5453;return n-Math.floor(n);},
  placement(index) {
    const d=index*this.spacing+55,side=index%2?1:-1,radius=22;
    const p={index,d,radius,kind:this.kinds[index%this.kinds.length],
      x:side*(65+this.sample(index,1)*40),y:(this.sample(index,2)-.5)*85,
      scale:.7+this.sample(index,3)*.55,rotation:this.sample(index,4)*math.tau};
    if(p.kind==='rock')p.radius=(Math.hypot(this.clusters.spreadX,this.clusters.spreadY,this.clusters.spreadD)+this.clusters.maxRadius)*p.scale;
    return p;
  },
  clearsPath(p) {
    const center=tunnel.center(p.d),minimum=this.corridorRadius+this.clearance+p.radius;
    for(let offset=-p.radius;offset<=p.radius;offset+=3){
      const path=tunnel.center(p.d+offset);
      if(Math.hypot(center.x+p.x-path.x,center.y+p.y-path.y)<minimum)return false;
    }
    return true;
  },
};

// Prerecorded character dialogue. Only these small MP3 files ship with the game.
const voices = {
  folder:'./assets/audio/voices/',volume:1.15,musicDuck:.38,effectsDuck:.72,
  gap:.3,chatterGap:14,encouragementGap:28,expiry:8,queueLimit:4,nearMissMargin:.8,lowHull:30,
  clips:{
    'dog-bark':'dog/bark.mp3','dog-bone':'dog/bone.mp3','dog-yikes':'dog/yikes.mp3',
    'dog-get-em':'dog/get-em.mp3','dog-yee-haw':'dog/yee-haw.mp3','dog-whoops':'dog/whoops.mp3','dog-close-one':'dog/close-one.mp3',
    'computer-ready':'computer/ready.mp3','computer-checkpoint':'computer/checkpoint.mp3','computer-resumed':'computer/resumed.mp3',
    'computer-lost':'computer/lost.mp3','computer-great':'computer/great.mp3','computer-good-boy':'computer/good-boy.mp3',
    'computer-whos-good':'computer/whos-good.mp3','computer-best-doggie':'computer/best-doggie.mp3','computer-treat':'computer/treat.mp3',
  },
  encouragement:['computer-great','computer-whos-good','computer-best-doggie','computer-treat','dog-bone'],
};

// Mutable numeric overrides; authored rules remain centralized above.
const tuning = {
  seed:'GOODBOY',defaultSeed:'GOODBOY',seedLimit:80,
  persistence:{key:'starhound.developer-settings.v1',version:2},saved:null,
  checkpointGroups:['difficulty','race','encounters','weapon','pickups','gfx'],
  fields:[
    {path:'race.waveLength',label:'Wave distance',min:500,max:5000,step:10},
    {path:'race.startSpeed',label:'Starting speed',min:35,max:200,step:1},
    {path:'difficulty.distanceScale',label:'Difficulty growth distance',min:1000,max:100000,step:1},
    {path:'difficulty.growth',label:'Difficulty growth multiplier',min:0,max:10,step:.05},
    {path:'difficulty.curve',label:'Difficulty curve exponent',min:.1,max:2,step:.05},
    {path:'race.speedGrowth',label:'Speed growth / difficulty',min:0,max:200,step:.5},
    {path:'race.maxSpeed',label:'Maximum cruise speed',min:35,max:1000,step:1},
    {path:'race.recoveryLength',label:'Bonus stretch distance',min:80,max:350,step:5},
    {path:'race.chargeDrain',label:'Charge drain / second',min:0,max:15,step:.1},
    {path:'race.boostDrain',label:'Boost drain / second',min:0,max:100,step:.5},
    {path:'encounters.startInterval',label:'Starting obstacle spacing',min:5,max:5000,step:5},
    {path:'encounters.minInterval',label:'Minimum obstacle spacing',min:1,max:5000,step:1},
    {path:'encounters.spacingDecay',label:'Obstacle spacing decay / difficulty',min:0,max:5,step:.01},
    {path:'encounters.startCount',label:'Starting obstacles / group',min:1,max:8,step:1},
    {path:'encounters.maxCount',label:'Maximum obstacles / group',min:1,max:8,step:1},
    {path:'encounters.countGrowth',label:'Obstacle count growth / difficulty',min:0,max:10,step:.1},
    {path:'encounters.startEnemyHp',label:'Starting enemy health',min:1,max:20,step:1},
    {path:'encounters.enemyHpGrowth',label:'Enemy health growth / difficulty',min:0,max:10,step:.1},
    {path:'encounters.startRockHp',label:'Starting rock health',min:1,max:20,step:1},
    {path:'encounters.rockHpGrowth',label:'Rock health growth / difficulty',min:0,max:10,step:.025},
    {path:'encounters.startDrift',label:'Starting enemy drift',min:0,max:6,step:.1},
    {path:'encounters.maxDrift',label:'Maximum enemy drift',min:0,max:6,step:.1},
    {path:'encounters.driftGrowth',label:'Enemy drift growth / difficulty',min:0,max:6,step:.1},
    {path:'encounters.startFireInterval',label:'Starting enemy fire interval / seconds',min:.1,max:20,step:.05},
    {path:'encounters.minFireInterval',label:'Minimum enemy fire interval / seconds',min:.1,max:20,step:.05},
    {path:'encounters.fireDecay',label:'Enemy fire interval decay / difficulty',min:0,max:5,step:.01},
    {path:'encounters.shootingThreshold',label:'Enemy firing threshold / difficulty',min:0,max:5,step:.05},
    {path:'encounters.escortThreshold',label:'Barrier escort threshold / difficulty',min:0,max:5,step:.05},
    {path:'weapon.baseInterval',label:'Fire interval / seconds',min:.05,max:.5,step:.01},
    {path:'weapon.heatPerVolley',label:'Heat per volley',min:5,max:18,step:.1},
    {path:'weapon.coolingPerSecond',label:'Cooling / second',min:12,max:45,step:.5},
    {path:'weapon.extraCooldown',label:'Extra overheat lock / seconds',min:0,max:2,step:.1},
    {path:'pickups.minimumSpacing',label:'Minimum space between pickups / distance',min:5,max:5000,step:5},
    {path:'pickups.frequency',label:'Pickup frequency (0–1)',min:0,max:1,step:.01},
    {path:'gfx.fogDensity',label:'Space fog',min:0,max:.01,step:.0001},
    {path:'route.openShare',label:'Open space share (0–1)',min:.1,max:.95,step:.05},
    {path:'route.tunnelWeight',label:'Tunnel frequency weight',min:0,max:10,step:.1},
    {path:'route.stationWeight',label:'Station frequency weight',min:0,max:10,step:.1},
    {path:'route.cruiserWeight',label:'Cruiser frequency weight',min:0,max:10,step:.1},
    {path:'route.tunnelLength',label:'Tunnel length / distance',min:240,max:3000,step:20},
    {path:'route.stationLength',label:'Station length / distance',min:360,max:1600,step:20},
    {path:'route.cruiserLength',label:'Cruiser length / distance',min:400,max:4000,step:20},
    {path:'speedRings.seriesDistance',label:'Ring series interval / distance',min:800,max:3000,step:20},
    {path:'speedRings.spacing',label:'Space between rings / distance',min:60,max:160,step:5},
    {path:'speedRings.bonusPerRing',label:'Speed bonus per ring (0–1)',min:.01,max:.3,step:.01},
    {path:'speedRings.bonusCap',label:'Maximum ring speed bonus (0–1)',min:.1,max:1.5,step:.05},
    {path:'speedRings.decayPerSecond',label:'Ring bonus decay / second',min:.005,max:.15,step:.005},
  ],
  objects:{difficulty,race,encounters,weapon,pickups,gfx,renderMath,music,route,speedRings},
  values() {return Object.fromEntries(this.fields.map(({path})=>{const [group,key]=path.split('.');return [path,this.objects[group][key]];}));},
  constraints:[
    {lower:'race.startSpeed',upper:'race.maxSpeed',message:'Maximum cruise speed must be at least the starting speed.'},
    {lower:'encounters.minInterval',upper:'encounters.startInterval',message:'Minimum obstacle spacing cannot exceed starting obstacle spacing.'},
    {lower:'encounters.startCount',upper:'encounters.maxCount',message:'Maximum obstacle count must be at least the starting count.'},
    {lower:'encounters.startDrift',upper:'encounters.maxDrift',message:'Maximum enemy drift must be at least the starting drift.'},
    {lower:'encounters.minFireInterval',upper:'encounters.startFireInterval',message:'Minimum enemy fire interval cannot exceed its starting interval.'},
  ],
  validationError(values) {
    if(!values||typeof values!=='object')return 'Enter valid settings.';
    for(const {path,label,min,max,step} of this.fields)
      if(!Number.isFinite(values[path])||values[path]<min||values[path]>max||step===1&&!Number.isInteger(values[path]))return `Enter a valid value for ${label}.`;
    for(const {lower,upper,message} of this.constraints)if(values[lower]>values[upper])return message;
    if(values['route.tunnelWeight']+values['route.stationWeight']+values['route.cruiserWeight']<=0)return 'Give at least one motif a frequency weight above zero.';
    return '';
  },
  valid(values) {return !this.validationError(values);},
  migrateValues(values) {
    if(!values||!legacyTuning.requiredRules.every(path=>Number.isFinite(values[path])))return null;
    const mapped={
      'difficulty.distanceScale':values['race.waveLength']*legacyTuning.rampSpan,
      'race.speedGrowth':values['race.speedPerWave']*legacyTuning.rampSpan,
      'encounters.startInterval':values['encounters.easyInterval'],
      'encounters.minInterval':Math.min(legacyTuning.minimumObstacleSpacing,values['encounters.easyInterval'],values['encounters.hardInterval']),
      'encounters.spacingDecay':Math.max(0,Math.log(values['encounters.easyInterval']/values['encounters.hardInterval'])),
      'pickups.minimumSpacing':values['pickups.interval'],
    };
    for(const {path,min,max,step} of this.fields)
      if(path in mapped)mapped[path]=math.clamp(Math.round(mapped[path]/step)*step,min,max);
    const converted={...this.defaults,...values,...mapped};
    const migrated=Object.fromEntries(this.fields.map(({path})=>[path,converted[path]]));
    return this.valid(migrated)?migrated:null;
  },
  validCheckpoint(values) {
    return values&&this.fields.filter(({path})=>this.checkpointGroups.includes(path.split('.')[0])).every(({path})=>Number.isFinite(values[path]))&&this.valid({...this.defaults,...values});
  },
  apply(values) {
    for(const {path,min,max} of this.fields) {if(values[path]===undefined)continue;const [group,key]=path.split('.'),v=Number(values[path]);if(Number.isFinite(v))this.objects[group][key]=math.clamp(v,min,max);}
  },
  load() {
    try {
      const stored=JSON.parse(global.localStorage?.getItem(this.persistence.key)||'null');
      if(stored&&typeof stored.seed==='string'){
        const values=stored.version===legacyTuning.settingsVersion?this.migrateValues(stored.values):stored.values;
        if((stored.version===this.persistence.version||stored.version===legacyTuning.settingsVersion)&&this.valid(values))
          this.saved={version:this.persistence.version,values,seed:stored.seed};
      }
    }catch{}
    if(this.saved){this.apply(this.saved.values);this.seed=this.saved.seed.slice(0,this.seedLimit);}
  },
  save(values,seed) {
    if(!this.valid(values))return false;
    this.apply(values);this.seed=seed.trim().slice(0,this.seedLimit)||this.defaultSeed;
    this.saved={version:this.persistence.version,values:this.values(),seed:this.seed};
    try{global.localStorage.setItem(this.persistence.key,JSON.stringify(this.saved));return true;}catch{return false;}
  },
  exportSource() {return '// STARHOUND complete classic settings. Paste over js/settings.js.\n('+configure.toString()+')(window, '+JSON.stringify({...this.values(),seed:this.seed},null,2)+');\n';},
};
tuning.apply(overrides);if(typeof overrides.seed==='string')tuning.seed=overrides.seed.slice(0,80);
tuning.defaults=Object.freeze(tuning.values());tuning.defaultSeed=tuning.seed;tuning.load();
namespace.settings = Object.freeze({math,random,tunnel,difficulty,race,hull,checkpoint,flight,weapon,encounters,pickups,assets,gfx,ui,music,sfx,voices,renderMath,speedEffects,scenery,route,speedRings,propulsion,crash,tuning});
})(window, {
  "race.waveLength": 2200,
  "race.startSpeed": 75,
  "difficulty.distanceScale": 33000,
  "difficulty.growth": 1,
  "difficulty.curve": 0.9,
  "race.speedGrowth": 15,
  "race.maxSpeed": 500,
  "race.recoveryLength": 210,
  "race.chargeDrain": 1.2,
  "race.boostDrain": 15,
  "encounters.startInterval": 150,
  "encounters.minInterval": 38,
  "encounters.spacingDecay": 1,
  "weapon.baseInterval": 0.05,
  "weapon.heatPerVolley": 5,
  "weapon.coolingPerSecond": 22,
  "weapon.extraCooldown": 1,
  "pickups.minimumSpacing": 500,
  "pickups.frequency": 1,
  "gfx.fogDensity": 0.0022,
  "route.openShare": 0.6,
  "route.tunnelWeight": 1,
  "route.stationWeight": 1,
  "route.cruiserWeight": 1,
  "route.tunnelLength": 720,
  "route.stationLength": 420,
  "route.cruiserLength": 1100,
  "speedRings.seriesDistance": 1200,
  "speedRings.spacing": 60,
  "speedRings.bonusPerRing": 0.1,
  "speedRings.bonusCap": 0.6,
  "speedRings.decayPerSecond": 0.025,
  "seed": "GOODBOY"
});
