(function(namespace){
'use strict';
const {race,flight,weapon,encounters,pickups,propulsion,crash,checkpoint,voices}=namespace.settings;

/** Runs simulation and dispatches typed events. Rendering and sound own their resources. */
class FlightSystems {
  constructor(scene,sound,route=scene.route||new namespace.RoutePlan()){this.scene=scene;this.sound=sound;this.entities=[];this.bullets=[];this.route=route;this.motifs=new namespace.InteractiveMotifs(route,scene,sound);}
  reset(){this.entities.length=0;this.bullets.length=0;this.scene.clear();this.route.reset();}
  step(s,dt,keys){
    if(s.mode==='crashing'){crash.advance(s,dt);return;}
    if(s.mode!=='playing')return;
    this.route.use(s.seed);const wave=s.wave,bestWave=s.bestWave,previousPlayer={x:s.player.x,y:s.player.y};
    race.advance(s,dt,keys);flight.step(s.player,keys,dt);weapon.tick(s.weapon,dt);
    this.route.collide(s,this.sound);s.wave=race.waveAt(s.distance);s.sector=race.sectorAt(s.wave);s.bestWave=Math.max(bestWave,s.wave);
    if(s.wave!==wave)this.crossCheckpoint(s);
    this.spawn(s);this.shoot(s,keys);this.move(s,dt);
    this.motifs.step(s,dt,previousPlayer,this.bullets);this.collide(s);this.route.crossRings(s,previousPlayer,this.sound);this.cleanup(s);
    if(s.checkpointPending){s.pendingCheckpoint=checkpoint.capture(s);s.checkpointPending=false;}
    if(s.hull<=0){
      crash.begin(s);this.scene.startCrash(s);this.sound.crash();
    }
  }
  crossCheckpoint(s){
    s.checkpointWave=s.wave;s.checkpointCelebration=2.4;
    s.checkpointPending=true;
    this.scene.celebrate(s);this.sound.play('checkpoint');this.sound.voice('checkpoint',s);
  }
  spawn(s){
    while(encounters.canSpawn(s,this.entities.length))this.entities.push(...encounters.make(s).filter(e=>this.route.allowsEncounter(e)));
    while(pickups.canSpawn(s)){
      const pickup=pickups.scheduled(s);if(pickup)this.entities.push(pickup);
    }
  }
  shoot(s,keys){
    if(!keys.has('Space')||!weapon.canFire(s.weapon))return;
    this.bullets.push(...weapon.bullets(s));weapon.fire(s.weapon);this.sound.play('shot',s.player.x);
    if(s.weapon.overheated){this.sound.play('overheat');s.toast='CANNON OVERHEATED';s.toastTime=weapon.toastTime;}
  }
  move(s,dt){
    const shots=[];
    for(const e of this.entities){
      if(e.type==='hostile'&&race.recovery(s.distance))e.dead=true;
      encounters.animate(e,dt);
      if(!e.dead&&encounters.shouldShoot(e,s))shots.push(encounters.hostile(e,s));
    }
    this.entities.push(...shots);for(const bullet of this.bullets)weapon.moveBullet(bullet,dt);
  }
  destroy(e){this.scene.burst(e);this.sound.play(e.type==='rock'?'rockExplosion':'enemyExplosion',e.x);}
  collide(s){
    const dropped=[];
    for(const bullet of this.bullets){
      if(bullet.dead)continue;
      for(const e of this.entities){
        if(e.dead||e.type==='pickup'||e.type==='hostile'||!weapon.bulletHit(bullet,e))continue;
        bullet.dead=true;
        if(e.type!=='barrier'&&weapon.impact(e)){
          e.dead=true;encounters.score(s,e);this.destroy(e);
          if(e.type==='enemy'){const pickup=pickups.drop(e,s);if(pickup)dropped.push(pickup);this.sound.voice('enemyKill',s);}
        }
        break;
      }
    }
    this.entities.push(...dropped);
    for(const e of this.entities){
      if(s.hull<=0)break;
      if(e.dead||!encounters.playerHit(e,s))continue;
      e.dead=true;
      if(e.type==='pickup'){
        pickups.collect(e,s);this.sound.play(e.pickup,e.x);
        this.sound.voice(['turbo','invincible'].includes(e.pickup)?'powerup':e.pickup==='charge'?'treat':'pickup',s);
        continue;
      }
      // Momentum penalties are independent of hull immunity, including invincibility.
      propulsion.impact(s,e.type);
      const damaged=flight.damage(s,encounters.damage[e.type]);
      if(damaged){this.sound.play('hit',s.player.x);this.scene.burst(e);if(s.hull>0)this.sound.voice('hit',s);}
      else if(s.invincible>0)this.destroy(e);
    }
  }
  cleanup(s){
    if(s.hull>0&&s.invincible<=0&&s.protection<=0&&s.hurt<=0)for(const e of this.entities){
      if(e.dead||e.voicePassed||!['rock','enemy','barrier'].includes(e.type)||e.d+e.rz>=s.previousDistance)continue;
      e.voicePassed=true;
      const dx=Math.max(0,Math.abs(e.x-s.player.x)-e.rx-flight.shipRadius);
      const dy=Math.max(0,Math.abs(e.y-s.player.y)-e.ry-flight.shipRadius);
      const gap=Math.hypot(dx,dy);if(gap>0&&gap<voices.nearMissMargin)this.sound.voice('nearMiss',s);
    }
    this.entities=this.entities.filter(e=>encounters.alive(e,s));
    this.bullets=this.bullets.filter(b=>weapon.alive(b,s));
  }
}
namespace.FlightSystems=FlightSystems;
})(window.Starhound);
