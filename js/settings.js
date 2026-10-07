(function (global) {
'use strict';
const namespace = global.Starhound = global.Starhound || {};

/** All authored constants, procedural formulas and tuning live here.
 * Runtime scripts own resources; this module owns their numerical behavior.
 * Deliberately dependency-free so flight rules and score generation can be verified without a renderer.
 */
const math = Object.freeze({
  tau: Math.PI * 2,
  clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
  mix: (a, b, t) => a + (b - a) * t,
  damp: (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt)),
  random: (a = 0, b = 1) => a + Math.random() * (b - a),
  pick: array => array[Math.floor(Math.random() * array.length)],
  decrement: (v, dt) => Math.max(0, v - dt),
  fraction: (n, d) => n / d,
  percent: n => `${Math.round(n)}%`,
  squaredDistance: (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2,
  aspect: (w, h) => w / h,
  pad: n => String(Math.round(n)).padStart(2, '0'),
  delta: dt => Math.min(dt, .05),
  add: (a, b) => a + b,
});

const tunnel = Object.freeze({
  profile: [[-12,-6],[-10,-8],[10,-8],[12,-6],[12,6],[10,8],[-10,8],[-12,6]],
  segments: 36, spacing: 16, depth: 540, startZ: 18,
  wallColor: 0x142633, railColor: 0x74cfcc,
  center(d) { return {x: Math.sin(d / 880) * 16 + Math.sin(d / 2410) * 22,
    y: Math.sin(d / 1110 + .7) * 11 + Math.sin(d / 3230) * 16}; },
  world(x, y, d, origin) { const a = this.center(d), b = this.center(origin);
    return [x + a.x - b.x, y + a.y - b.y, origin - d]; },
  ring(i, d) { const offset = i * this.spacing - this.startZ - d % this.spacing;
    return this.profile.map(([x,y]) => this.world(x, y, d + offset, d)); },
  vertexCount() { return (this.segments - 1) * this.profile.length * 6 * 3; },
  fillWalls(array, d) {
    let index = 0;
    for(let i = 0; i < this.segments - 1; i++) {
      const a = this.ring(i, d), b = this.ring(i + 1, d);
      for(let j = 0; j < a.length; j++) {
        const k = (j + 1) % a.length;
        for (const p of [a[j], b[j], a[k], a[k], b[j], b[k]]) for(const n of p) array[index++] = n;
      }
    }
  },
  fillLines(array, d) {
    let index = 0;
    for(let i = 0; i < this.segments; i++) {
      const a = this.ring(i,d), b = this.ring(Math.min(i + 1, this.segments - 1),d);
      for(let j = 0; j < a.length; j++) {
        const k = (j + 1) % a.length;
        for(const p of [a[j], a[k], a[j], b[j]]) for(const n of p) array[index++] = n;
      }
    }
  },
  lineCount() { return this.segments * this.profile.length * 4 * 3; },
  constrain(p) {
    p.x = math.clamp(p.x, -9.7, 9.7); p.y = math.clamp(p.y, -5.7, 5.7);
  },
});

const race = Object.freeze({
  finishNoticeTime:5,waves: 50, wavesPerSector: 5, sectors: 10, waveLength: 1700,
  names: ['THE DEPARTURE','COPPER CURRENT','AMBER DRIFT','ION GARDEN','MIDNIGHT CIRCUIT','SOLAR SWITCHBACK','GLASS HORIZON','AFTERBURN ALLEY','THE BLACK REACH','HOME STRETCH'],
  colors: [0x73d7d0,0xffa571,0xffcd79,0x8eecab,0xb39cf8,0xff997c,0x7bcaeb,0xf593bd,0x9ab4d1,0xffdc96],
  totalDistance() { return this.waves * this.waveLength; },
  waveAt(d) { return math.clamp(Math.floor(d / this.waveLength) + 1, 1, this.waves); },
  sectorAt(wave) { return Math.floor((wave - 1) / this.wavesPerSector); },
  waveInSector(wave) { return (wave - 1) % this.wavesPerSector; },
  baseSpeed(wave) { return 42 + (wave - 1) * 1.35; },
  progress(d) { return math.clamp(d / this.totalDistance(),0,1); },
  advance(s, dt, keys) {
    s.elapsed += dt; s.previousDistance = s.distance;
    s.wave = this.waveAt(s.distance); s.sector = this.sectorAt(s.wave);
    s.boosting = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && s.charge > 1;
    s.charge = math.clamp(s.charge - dt * (s.boosting ? 15 : 1.2), 0, 100);
    s.invincible = math.decrement(s.invincible,dt); s.turbo = math.decrement(s.turbo,dt);
    s.hurt = math.decrement(s.hurt,dt); s.noticeTime = math.decrement(s.noticeTime,dt);
    s.toastTime = math.decrement(s.toastTime,dt);
    const target = this.baseSpeed(s.wave) * (1 + s.charge * .0018) * (s.boosting || s.turbo > 0 ? 1.48 : 1);
    s.speed = math.damp(s.speed,target,2,dt); s.distance += s.speed * dt;
  },
  state() { return {mode:'title',distance:0,previousDistance:0,elapsed:0,wave:1,sector:0,
    speed:42,charge:45,hull:100,invincible:0,turbo:0,hurt:0,boosting:false,
    score:0,kills:0,pickups:0,nextSpawn:260,nextPickup:420,spawnIndex:0,
    notice:'SECTOR 01 · THE DEPARTURE',noticeTime:4,toast:'',toastTime:0,
    player:{x:0,y:0,vx:0,vy:0},weapon:weapon.state()}; },
  announce(s) { s.notice = `SECTOR ${math.pad(s.sector + 1)} · ${this.names[s.sector]}`; s.noticeTime = 3.5; },
  announceWave(s) {s.notice=s.wave===50?'FINAL WAVE · AIM FOR THE CHECKERED GATE':`WAVE ${math.pad(s.wave)} · KEEP IT CLEAN`;s.noticeTime=2;},
  finishCleared(s) {const opening=(assets.finish.width-assets.finish.bar)/2-flight.shipRadius;return Math.abs(s.player.x)<opening && Math.abs(s.player.y)<opening;},
  finishCrossed(s) { return s.previousDistance < this.totalDistance() && s.distance >= this.totalDistance(); },
});

const flight = Object.freeze({
  response: 5, steerSpeed: 15, returnBank: 6, shipRadius:.82,
  step(p, keys, dt) {
    const x = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
    const y = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
    p.vx = math.damp(p.vx, x * this.steerSpeed, this.response, dt);
    p.vy = math.damp(p.vy, y * this.steerSpeed, this.response, dt);
    p.x += p.vx * dt; p.y += p.vy * dt; tunnel.constrain(p);
  },
  damage(s, amount) {
    if(s.invincible > 0 || s.hurt > 0) return false;
    s.hull = Math.max(0,s.hull - amount); s.hurt = 1.4;
    s.charge = Math.max(0,s.charge - 12); return true;
  },
  shipPose(s) { return {position:[s.player.x,s.player.y,0],rotation:[-s.player.vy * .014, -s.player.vx * .006, -s.player.vx * .025],
    blink:s.hurt > 0 && Math.sin(s.elapsed * 38) > .25}; },
  titlePose(t) { return {position:[5.6, .3 + Math.sin(t * .7) * .22, 0],rotation:[.08,-.59 + Math.sin(t * .2) * .09,-.12 + Math.sin(t * .5) * .025]}; },
});

const weapon = Object.freeze({
  levels: [1,2,4,6], labels:['SINGLE','DOUBLE','QUADRUPLE','SEXTUPLE'],
  toastTime:2,clip:18, baseInterval:.22, baseReload:1.6, extraCooldown:1,
  heatPerVolley:9, coolingPerSecond:22, bulletSpeed:220, bulletRadius:.3,
  barrels:[[0],[-.62,.62],[-1.3,-.46,.46,1.3],[-1.9,-1.15,-.4,.4,1.15,1.9]],
  state() { return {tier:0,fireLevel:0,reloadLevel:0,heat:0,overheated:false,lock:0,cooldown:0,reload:0,ammo:this.clip,shots:0}; },
  interval(w) { return this.baseInterval / (1 + w.fireLevel * .28); },
  reloadTime(w) { return this.baseReload / (1 + w.reloadLevel * .24); },
  tick(w,dt) {
    w.cooldown = math.decrement(w.cooldown,dt);
    w.heat = Math.max(0,w.heat - this.coolingPerSecond * dt);
    w.lock = math.decrement(w.lock,dt);
    const wasReloading = w.reload > 0; w.reload = math.decrement(w.reload,dt);
    if(wasReloading && w.reload === 0) w.ammo = this.clip;
    if(w.overheated && w.heat === 0 && w.lock === 0) w.overheated = false;
  },
  reloadNow(w) { if(w.reload > 0 || w.ammo === this.clip) return false; w.reload = this.reloadTime(w); return true; },
  canFire(w) { return !w.overheated && w.reload === 0 && w.cooldown === 0 && w.ammo > 0; },
  fire(w) {
    w.ammo--; w.shots++; w.cooldown = this.interval(w);
    w.heat = Math.min(100,w.heat + this.heatPerVolley + w.tier * .65);
    if(w.heat >= 100) { w.overheated = true; w.lock = w.heat / this.coolingPerSecond + this.extraCooldown; }
    if(w.ammo === 0) w.reload = this.reloadTime(w);
  },
  bullets(s) { return this.barrels[s.weapon.tier].map(x => ({type:'bullet',x:s.player.x + x * renderMath.flightScale,y:s.player.y-.15,d:s.distance+2,previousD:s.distance+2,radius:this.bulletRadius,hp:1,age:0})); },
  moveBullet(b,dt) { b.previousD=b.d; b.d += this.bulletSpeed * dt; b.age += dt; },
  bulletHit(b,e) { return Math.abs(b.x - e.x) < e.rx + b.radius && Math.abs(b.y - e.y) < e.ry + b.radius
    && Math.min(b.previousD,b.d) <= e.d + e.rz && Math.max(b.previousD,b.d) >= e.d - e.rz; },
  impact(e) { e.hp--; return e.hp <= 0; },
  alive(b,s) {return !b.dead && b.d < s.distance + tunnel.depth;},
});

const encounters = Object.freeze({
  spawnAhead:440, despawnBehind:25, maxObjects:90, finishBuffer:200,
  canSpawn(s) {return s.nextSpawn < s.distance + this.spawnAhead && s.nextSpawn < race.totalDistance() - this.finishBuffer;},
  alive(e,s) {return !e.dead && e.d > s.distance - this.despawnBehind;},
  interval(wave) { return math.mix(180,72,(wave-1)/49); },
  make(s) {
    const wave = race.waveAt(s.nextSpawn), n = s.spawnIndex++, d = s.nextSpawn;
    s.nextSpawn += this.interval(wave);
    const list=[];
    if(n % 4 === 3) {
      // Alternating gates preserve a generous traversable corridor; barriers never form a sealed wall.
      const vertical = n % 8 === 3;
      const sign = n % 3 === 0 ? -1 : 1;
      list.push({type:'barrier',x:vertical ? sign*6.5 : 0,y:vertical ? 0 : sign*4.9,d,
        rx:vertical?3.1:11,ry:vertical?7.5:2.2,rz:1.4,hp:Infinity,age:0,phase:n});
      if(wave > 20) list.push(this.enemy(-sign*3, vertical?2:-sign*1,d+46,wave,n));
    } else {
      const count = wave < 9 ? 1 : wave < 28 ? 2 : 3;
      for(let i=0;i<count;i++) {
        const x = count === 1 ? math.random(-6,6) : -6 + i*12/(count-1);
        list.push(n % 3 === 1 ? this.rock(x,math.random(-4,4),d + i*17,wave,n+i) : this.enemy(x,math.random(-4,4),d+i*14,wave,n+i));
      }
    }
    return list;
  },
  enemy(x,y,d,wave,phase) { return {type:'enemy',x,y,baseX:x,baseY:y,d,rx:1.3,ry:.95,rz:1.5,
    hp:1+Math.floor(wave/14),age:0,phase,drift:math.mix(.2,1.6,(wave-1)/49),fire:math.random(2.8,4.7),wave}; },
  rock(x,y,d,wave,phase) { const radius=math.random(.85,1.6);return {type:'rock',x,y,d,rx:radius,ry:radius,rz:radius,hp:1+Math.floor(wave/20),age:0,phase}; },
  animate(e,dt) {
    e.age += dt;
    if(e.type === 'enemy') { e.x=e.baseX+Math.sin(e.age*1.2+e.phase)*e.drift;
      e.y=e.baseY+Math.cos(e.age*.8+e.phase)*e.drift*.55;e.fire-=dt; }
    if(e.type==='hostile') { e.previousD=e.d;e.d-=85*dt; }
  },
  shouldShoot(e,s) { return e.type==='enemy' && e.wave>=6 && e.fire<=0 && e.d-s.distance<280 && e.d>s.distance+25; },
  hostile(e,s) { e.fire = math.mix(4.5,2.4,(e.wave-1)/49);
    return {type:'hostile',x:e.x,y:e.y,d:e.d,previousD:e.d,rx:.35,ry:.35,rz:1.2,hp:1,age:0}; },
  playerHit(e,s) {
    const near = e.type==='hostile' ? Math.min(e.previousD,e.d) <= s.distance+1.2 && Math.max(e.previousD,e.d) >= s.previousDistance-1.2
      : e.d+e.rz>=s.previousDistance && e.d-e.rz<=s.distance;
    return near && Math.abs(e.x-s.player.x)<e.rx+flight.shipRadius && Math.abs(e.y-s.player.y)<e.ry+flight.shipRadius;
  },
  damage: {barrier:24,rock:19,enemy:16,hostile:12},
  score(s,e) { s.kills++;s.score+=e.type==='enemy'?150:75; },
});

const pickups = Object.freeze({
  interval:580, radius:1.65, finishBuffer:100,
  canSpawn(s) {return s.nextPickup < s.distance + encounters.spawnAhead && s.nextPickup < race.totalDistance() - this.finishBuffer;},
  duration:{invincible:10,turbo:7},
  types:['charge','cannon','fire','reload','invincible','turbo','repair'],
  colors:{charge:0x8eeee3,cannon:0xf291bd,fire:0xf291bd,reload:0xceadff,invincible:0xffce72,turbo:0xffa55e,repair:0x90e99f},
  labels:{charge:'SPEED CHARGE +35',cannon:'CANNON UPGRADE',fire:'FIRE RATE UPGRADE',reload:'RELOAD UPGRADE',invincible:'INVINCIBLE · 10 SECONDS',turbo:'TURBO · 7 SECONDS',repair:'HULL REPAIR +25'},
  make(type,x,y,d) { return {type:'pickup',pickup:type,x,y,d,rx:this.radius,ry:this.radius,rz:1.2,age:0,hp:Infinity}; },
  scheduled(s) { const index=Math.floor(s.nextPickup / this.interval);const type=this.types[index%this.types.length];
    const result=this.make(type,math.random(-5.5,5.5),math.random(-3.4,3.4),s.nextPickup);s.nextPickup+=this.interval;return result; },
  drop(e,s) {
    const bag = s.hull < 60 ? ['repair','repair','charge','cannon','fire','reload','invincible','turbo'] : ['charge','charge','cannon','fire','reload','invincible','turbo','repair'];
    return this.make(math.pick(bag),e.x,e.y,e.d);
  },
  collect(p,s) {
    const w=s.weapon;let label=this.labels[p.pickup];
    if(p.pickup==='charge') s.charge=math.clamp(s.charge+35,0,100);
    if(p.pickup==='cannon') {if(w.tier<3)w.tier++;else s.charge=math.clamp(s.charge+35,0,100);label=`${weapon.labels[w.tier]} CANNON`;}
    if(p.pickup==='fire') { w.fireLevel=math.clamp(w.fireLevel+1,0,3);label=`FIRE RATE ${w.fireLevel+1}`; }
    if(p.pickup==='reload') { w.reloadLevel=math.clamp(w.reloadLevel+1,0,3);label=`RELOAD SPEED ${w.reloadLevel+1}`; }
    if(p.pickup==='repair') s.hull=math.clamp(s.hull+25,0,100);
    if(p.pickup==='invincible') s.invincible=this.duration.invincible;
    if(p.pickup==='turbo') s.turbo=this.duration.turbo;
    s.pickups++;s.score+=50;s.toast=label;s.toastTime=2.4;
  },
});

// Low-poly primitives are shared by the title ship and the actual player ship.
const assets = Object.freeze({
  colors:{mint:0x89d9ce,cream:0xf0eee3,dark:0x152c36,orange:0xff754d,gold:0xffcc83,fur:0xc68b58,furLight:0xe6b57c,nose:0x171e23,visor:0x84e0e8},
  shapes:{box:['box'],ico:['ico',1,0],octa:['octa',1,0],cone:['cone',1,1,4],cylinder:['cylinder',1,1,1,6],tetra:['tetra',1,0]},
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
  finish:{depth:1.6,bar:1.05,width:14,height:14,checkerSize:64,tile:8,color:0xffffff},
  checkerPixel(x,y) { return (Math.floor(x/8)+Math.floor(y/8))%2===0 ? 255:0; },
  finishParts() { const f=this.finish;return [[0,f.height/2,0,f.width,f.bar,f.depth],[0,-f.height/2,0,f.width,f.bar,f.depth],[-f.width/2,0,0,f.bar,f.height,f.depth],[f.width/2,0,0,f.bar,f.height,f.depth]]; },
});

const gfx = Object.freeze({
  clear:0x090f16,fogDensity:.009,exposure:1.15,maxPixelRatio:1.75,
  camera:{fov:63,near:.1,far:650,titlePosition:[5,5.6,15],titleLook:[1.6,.1,0],flightPosition:[0,3.2,12],flightLook:[0,1,-60]},
  lighting:{ambient:1.6,key:3.5,rim:4.2,keyPosition:[-6,12,8],rimPosition:[9,3,-4]},
  particle:{capacity:650,size:.22,smokeLife:1.15,streamLife:.4,explosionLife:1.05,
    smokeColors:[0xb4d1cc,0x668482,0xf3a779],streamColor:0x99fff1,explosionColors:[0xff754d,0xffcf84,0xeaf4e8]},
  starCount:220,
  stars() { const a=new Float32Array(this.starCount*3);for(let i=0;i<this.starCount;i++)a.set([math.random(-180,180),math.random(-95,95),math.random(-420,20)],i*3);return a; },
  particleAt(kind,x,y,d,fast=false) {
    const life=kind==='explosion'?this.particle.explosionLife:kind==='stream'?this.particle.streamLife:this.particle.smokeLife;
    return {x,y,d,vx:math.random(-1,1)*(kind==='explosion'?15:.8),vy:math.random(-1,1)*(kind==='explosion'?15:.8),vd:kind==='stream'?-75:math.random(-8,8),age:0,life,
      color:kind==='explosion'?math.pick(this.particle.explosionColors):kind==='stream'?this.particle.streamColor:math.pick(this.particle.smokeColors),kind,fast};
  },
  stepParticle(p,dt) {p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.d+=p.vd*dt;},
  particleScale(p) { return p.kind==='smoke'?.18+p.age*.38:p.kind==='stream'?.12: .3*(1-p.age/p.life); },
  particleOpacity(p) { return Math.max(0,1-p.age/p.life)*.75; },
  particleOffset(index) { return index*3; },
  trail(s) { const d=s.distance-3.2;return [this.particleAt('smoke',s.player.x-1.45,s.player.y-.23,d),this.particleAt('smoke',s.player.x+1.45,s.player.y-.23,d)]; },
  stream(s) { return this.particleAt('stream',math.random(-11,11),math.random(-7,7),s.distance+math.random(-5,110),true); },
  explode(e) { return Array.from({length:32},()=>this.particleAt('explosion',e.x,e.y,e.d)); },
  titleTime(t,dt) { return t+dt; },
  titleDistance(t) {return t*9;},
  flightCamera(s) { return {position:[s.player.x*.25,3.2+s.player.y*.22,12],look:[s.player.x*.5,1+s.player.y*.45,-60]}; },
  ratio(dpr) { return Math.min(dpr,this.maxPixelRatio); },
});

const ui = Object.freeze({
  keys:['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight','KeyR'],
  sectorText(s) {return math.pad(s.sector+1);},
  progressText(s) {return math.percent(race.progress(s.distance)*100);},
  roman:['I','II','III','IV'],
  speedText(s) { return String(Math.round(s.speed)).padStart(3,'0'); },
  chargeText(s) {return math.percent(s.charge);},
  heatText(w) {return w.overheated?'OVERHEAT · COOLING':w.reload>0?`RELOADING · ${w.reload.toFixed(1)}s`:`HEAT ${Math.round(w.heat)}% · CLIP ${w.ammo}`;},
  cannonText(w) {return `${weapon.labels[w.tier]} CANNON`;},
  upgrades(w) {return `FIRE ${this.roman[w.fireLevel]} · RELOAD ${this.roman[w.reloadLevel]}`;},
  effect(s) {return s.invincible>0?`INVINCIBLE ${s.invincible.toFixed(1)}s`:s.turbo>0?`TURBO ${s.turbo.toFixed(1)}s`:s.boosting?'AFTERBURN':'CRUISE';},
  time(seconds) {return `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;},
  finalScore(s) {return s.score+Math.floor(s.distance/10)+(s.mode==='win'?5000:0);},
});

// Seven original deterministic scores. Sixteenth-note steps, 16-bar harmonic cycles;
// each main track has a distinct scale, bass rhythm, voicing, lead and synth palette.
const music = Object.freeze({
  startOffset:.035,lateOffset:.015,retireBusMs:6000,filterQ:.7,
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
  },
  tracks:{
    intro:{name:'Soft Launch',bpm:78,root:57,scale:[0,2,4,7,9],chords:[0,3,5,2,0,3,4,2],bass:[0,null,null,null,7,null,null,null,0,null,null,null,4,null,null,null],lead:[0,null,2,null,4,null,3,null,2,null,1,null,0,null,null,null],voice:'glass',pad:'pad',drums:'soft',flare:false},
    game0:{name:'Copper Funk',bpm:112,root:48,scale:[0,2,3,5,7,9,10],chords:[0,5,3,4,0,2,5,4],bass:[0,null,0,7,null,0,10,null,0,null,5,7,null,10,7,null],lead:[7,null,9,7,null,4,null,2,4,null,7,null,9,11,null,9],voice:'pluck',pad:'pad',drums:'funk',flare:true},
    game1:{name:'Glass Arcade',bpm:116,root:53,scale:[0,2,4,6,7,9,11],chords:[0,4,1,5,2,4,0,5],bass:[0,null,7,null,0,12,null,7,0,null,7,9,null,5,7,null],lead:[0,2,null,4,6,null,4,2,7,null,6,4,2,null,4,6],voice:'glass',pad:'brightPad',drums:'four',flare:true},
    game2:{name:'Afterburn Velvet',bpm:108,root:46,scale:[0,2,3,5,7,8,10],chords:[0,3,6,4,5,3,1,4],bass:[0,0,null,10,7,null,5,null,0,null,12,10,null,7,5,3],lead:[9,null,7,4,null,2,0,null,2,4,null,7,9,null,11,12],voice:'lead',pad:'pad',drums:'broken',flare:true},
    game3:{name:'Solar Disco',bpm:120,root:55,scale:[0,2,4,5,7,9,11],chords:[0,5,1,4,3,5,2,4],bass:[0,null,12,7,0,null,5,7,0,null,12,10,7,null,5,7],lead:[0,null,4,7,null,9,7,4,2,null,5,9,null,11,9,5],voice:'pluck',pad:'brightPad',drums:'disco',flare:true},
    invincible:{name:'Goodboy Forever',bpm:104,root:60,scale:[0,2,4,7,9],chords:[0,3,1,4,0,2,3,4],bass:[0,null,7,null,0,null,12,7,0,null,7,null,4,null,7,12],lead:[0,2,4,null,7,9,7,null,4,2,0,null,2,4,7,9],voice:'glass',pad:'brightPad',drums:'four',flare:true},
    defeat:{name:'Drifting Home',bpm:62,root:45,scale:[0,2,3,5,7,8,10],chords:[0,5,3,4,0,3,1,4],bass:[0,null,null,null,null,null,null,null,7,null,null,null,null,null,null,null],lead:[4,null,null,null,2,null,null,null,0,null,null,null,null,null,null,null],voice:'glass',pad:'pad',drums:'sad',flare:false},
  },
  trackFor(s) {return s.mode==='title'?'intro':s.mode==='defeat'?'defeat':s.mode==='win'||s.invincible>0?'invincible':`game${Math.floor(s.sector/2)%4}`;},
  tempo(track,s) {return track.startsWith('game') ? this.tracks[track].bpm * math.clamp(s.speed/60,.85,1.65) : this.tracks[track].bpm;},
  stepSeconds(bpm) {return 60/bpm/4;},
  frequency(midi) {return 440*2**((midi-69)/12);},
  chordRoot(track,bar) {return track.root+track.scale[track.chords[Math.floor(bar/2)%track.chords.length]%track.scale.length];},
  degree(track,index) {return track.scale[index%track.scale.length]+Math.floor(index/track.scale.length)*12;},
  notes(id,step,bpm) {
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
  drums(id,step) {
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
  end(time,duration) {return time+duration;},
  offset(time,offset) {return time+offset;},
  envelope(time,duration,synth,level) {return {peak:synth.gain*level,attack:time+synth.attack,hold:time+Math.max(synth.attack,duration*.65),end:time+duration+synth.release};},
  detune(i,amount) {return i===0?-amount:amount;},
});

const sfx = Object.freeze({
  noiseSeconds:1,filterCutoff:4400,
  engine:{wave:'triangle',smoothing:.15,noiseGain:.03},
  engineState(s) {const active=s.mode==='playing',fast=s.boosting||s.turbo>0;return {frequency:35+s.speed*.65,cutoff:fast?1100:350,gain:active?(fast?.044:.022):0};},
  tone:{shot:{from:1150,to:270,duration:.11,gain:.15,wave:'sawtooth'},pickup:{from:520,to:1560,duration:.3,gain:.13,wave:'sine'},upgrade:{from:390,to:1170,duration:.5,gain:.14,wave:'triangle'},overheat:{from:250,to:105,duration:.5,gain:.12,wave:'sawtooth'},reload:{from:180,to:640,duration:.15,gain:.07,wave:'square'},launch:{from:110,to:520,duration:1,gain:.15,wave:'sawtooth'},wave:{from:600,to:1200,duration:.24,gain:.09,wave:'triangle'}},
  drums:{kick:{frequency:148,to:43,duration:.36,gain:.45,noise:false},softKick:{frequency:92,to:40,duration:.4,gain:.2,noise:false},snare:{frequency:1600,duration:.19,gain:.21,noise:true,filter:'highpass'},hat:{frequency:7500,duration:.05,gain:.045,noise:true,filter:'highpass'},openHat:{frequency:6200,duration:.23,gain:.052,noise:true,filter:'highpass'},softHat:{frequency:4000,duration:.15,gain:.025,noise:true,filter:'highpass'},clap:{frequency:1300,duration:.14,gain:.085,noise:true,filter:'bandpass'},explosion:{frequency:520,duration:.8,gain:.28,noise:true,filter:'lowpass'},hit:{frequency:800,duration:.35,gain:.19,noise:true,filter:'lowpass'}},
  noise(length) {const a=new Float32Array(length);for(let i=0;i<length;i++)a[i]=Math.random()*2-1;return a;},
  pan(x) {return math.clamp(x/12,-.8,.8);},
  gain:{floor:.0001,peakDelay:.006,tail:.03},
});

const renderMath = Object.freeze({
  wallOpacity:.66,lineOpacity:.3,starOpacity:.48,
  hemisphere:[0xe5f4f0,0x233341],keyColor:0xffdfc3,rimColor:0x75e5e8,roughness:.65,metalness:.2,emissive:.22,
  engineOpacity:.85,shieldColor:0xffda7b,shieldOpacity:.35,shieldRadius:1,shieldDetail:1,starColor:0xd4e9e5,starSize:.16,
  particleOpacity:.85,checkerRepeats(part) {return [part[3]/(assets.finish.bar*4),part[4]/(assets.finish.bar*4)];},barrierEdgeColor:0xffdfa8,pickupHaloOpacity:.5,pickupHaloSize:1.15,bulletColor:0xa7fff0,hostileColor:0xff6a48,
  emissiveIntensity:.8,geometrySegments:0,
  checker() {const n=assets.finish.checkerSize,a=new Uint8Array(n*n*4);for(let y=0;y<n;y++)for(let x=0;x<n;x++) {const i=(y*n+x)*4,v=assets.checkerPixel(x,y);a.set([v,v,v,255],i);}return a;},
  finishSize(part) {return part.slice(3);},
  finishPosition(part) {return part.slice(0,3);},
  barrierSize(e) {return [e.rx*2,e.ry*2,e.rz*2];},
  rockSize(e) {return [e.rx,e.ry,e.rz];},
  barrelPosition(x) {return [x,assets.cannons.y,assets.cannons.z];},
  titleScale:1.35,flightScale:.65,
  titleScaleFor(aspect) {return aspect<1.3?.92:this.titleScale;},
  titlePose(t,aspect) {const pose=flight.titlePose(t);if(aspect<1.3)pose.position[0]=3.5;return pose;},
  titleRotation(t) {return [.08,2.6+Math.sin(t*.2)*.09,-.12+Math.sin(t*.5)*.025];},
  titleCamera(aspect) {return aspect<1.3?{position:[3,5.6,17],look:[-1,.1,0]}:{position:gfx.camera.titlePosition,look:gfx.camera.titleLook};},
  particleTransform(p,origin) {const r=gfx.particleScale(p);return {position:tunnel.world(p.x,p.y,p.d,origin),scale:p.kind==='stream'?[.055,.055,3]:[r,r,r],rotation:[p.age,p.age,0],fade:gfx.particleOpacity(p)};},
  trailInterval:.026,
  flightShieldScale(t) {return 2.5+Math.sin(t*4)*.04;},
  bulletScale:[.09,.09,2.2],hostileScale:[.2,.2,1.4],pickupScale:[.62,.62,.62],
  previewParticleOrigin(t) {return gfx.titleDistance(t);},
  finishVisible(s) {return race.totalDistance()-s.distance<tunnel.depth;},
  cameraDamp:4,flashTime:.12,
});

namespace.settings = Object.freeze({ math, tunnel, race, flight, weapon, encounters, pickups, assets, gfx, ui, music, sfx, renderMath });
})(window);
