(function (namespace) {
'use strict';
const { race, flight, weapon, encounters, pickups, math, tunnel } = namespace.settings;

/** Runtime lists and event dispatch. All numerical rules are configured in settings. */
class FlightSystems {
  constructor(scene,sound) {this.scene=scene;this.sound=sound;this.entities=[];this.bullets=[];}
  reset() {this.entities.length=0;this.bullets.length=0;this.scene.clear();}
  step(s,dt,keys) {
    const sector=s.sector,wave=s.wave;
    race.advance(s,dt,keys);flight.step(s.player,keys,dt);weapon.tick(s.weapon,dt);
    if(s.sector!==sector){race.announce(s);this.sound.play('wave');}
    else if(s.wave!==wave){race.announceWave(s);this.sound.play('wave');}
    this.spawn(s);this.shoot(s,keys);this.move(s,dt);this.collide(s);this.cleanup(s);
    if(s.hull<=0){s.mode='defeat';this.scene.burst({x:s.player.x,y:s.player.y,d:s.distance});this.sound.play('explosion');}
    else if(race.finishCrossed(s)){if(race.finishCleared(s)){s.mode='win';s.notice='FINISH · GOOD DOG, GREAT RACE';s.noticeTime=race.finishNoticeTime;this.sound.play('upgrade');}else{s.mode='defeat';s.failReason='gate';s.hull=0;this.sound.play('hit');}}
  }
  spawn(s) {
    while(encounters.canSpawn(s))
      this.entities.push(...encounters.make(s));
    while(pickups.canSpawn(s))
      this.entities.push(pickups.scheduled(s));
  }
  shoot(s,keys) {
    if(keys.has('KeyR')&&weapon.reloadNow(s.weapon))this.sound.play('reload');
    if(keys.has('Space')&&weapon.canFire(s.weapon)){
      this.bullets.push(...weapon.bullets(s));weapon.fire(s.weapon);this.sound.play('shot',s.player.x);
      if(s.weapon.overheated){this.sound.play('overheat');s.toast='CANNON OVERHEATED';s.toastTime=weapon.toastTime;}
      else if(s.weapon.reload>0)this.sound.play('reload');
    }
  }
  move(s,dt) {
    const shots=[];
    for(const e of this.entities){encounters.animate(e,dt);if(encounters.shouldShoot(e,s))shots.push(encounters.hostile(e,s));}
    this.entities.push(...shots);for(const bullet of this.bullets)weapon.moveBullet(bullet,dt);
  }
  collide(s) {
    const dropped=[];
    for(const bullet of this.bullets){
      if(bullet.dead)continue;
      for(const e of this.entities){
        if(e.dead||e.type==='pickup'||e.type==='hostile')continue;
        if(weapon.bulletHit(bullet,e)){
          bullet.dead=true;
          if(e.type!=='barrier'&&weapon.impact(e)){e.dead=true;encounters.score(s,e);this.scene.burst(e);this.sound.play('explosion',e.x);if(e.type==='enemy')dropped.push(pickups.drop(e,s));}
          break;
        }
      }
    }
    this.entities.push(...dropped);
    for(const e of this.entities){
      if(e.dead||!encounters.playerHit(e,s))continue;
      e.dead=true;
      if(e.type==='pickup'){pickups.collect(e,s);this.sound.play(['cannon','fire','reload'].includes(e.pickup)?'upgrade':'pickup',e.x);}
      else {if(flight.damage(s,encounters.damage[e.type])){this.sound.play('hit',s.player.x);this.scene.burst(e);}else if(s.invincible>0){this.scene.burst(e);this.sound.play('explosion',e.x);}}
    }
  }
  cleanup(s) {
    this.entities=this.entities.filter(e=>encounters.alive(e,s));
    this.bullets=this.bullets.filter(b=>weapon.alive(b,s));
  }
}

namespace.FlightSystems = FlightSystems;
})(window.Starhound);
