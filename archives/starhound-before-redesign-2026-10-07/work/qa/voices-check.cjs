const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Audio {
  constructor(){this.listeners={};this.played=[];this.paused=true;this.volume=1;this.currentTime=0;}
  addEventListener(name,fn){this.listeners[name]=fn;}
  play(){this.paused=false;this.played.push(this.src);return this.reject?Promise.reject(Error('unavailable')):Promise.resolve();}
  pause(){this.paused=true;}
  removeAttribute(){this.src='';this.currentTime=0;}
  load(){}
  end(){this.paused=true;this.listeners.ended();}
}
function setup(AudioType=Audio){
  const window={Audio:AudioType},ctx=vm.createContext({window,console,Math,JSON,Number,Float32Array,Uint8Array,Promise});
  for(const f of ['settings','voices','systems','checkpoints'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx);
  return window.Starhound;
}
const ns=setup(),{race,voices,checkpoint,tuning}=ns.settings,ducks=[],engine=new ns.VoiceEngine(active=>ducks.push(active));
let s=race.state();s.mode='playing';s.distance=500;
const tick=(seconds)=>engine.update(s,seconds),url=id=>voices.folder+voices.clips[id];
engine.event('launch',s);assert.equal(engine.audio.played.length,0);
engine.setEnabled(true);engine.event('launch',s);
assert.equal(engine.audio.src,url('computer-ready'));assert.equal(engine.queue[0].id,'dog-bark');
engine.audio.end();tick(.31);assert.equal(engine.audio.src,url('dog-bark'));assert(ducks.includes(true));
// Pausing freezes both spoken playback and queued timing; resume retains the phrase.
engine.audio.currentTime=.7;const time=engine.time;engine.pause();tick(5);assert.equal(engine.time,time);assert(engine.audio.paused);
engine.resume();assert.equal(engine.audio.currentTime,.7);assert(!engine.audio.paused);
engine.audio.end();tick(15);engine.event('enemyKill',s);assert.equal(engine.active.id,'dog-get-em');
engine.event('powerup',s);assert.equal(engine.queue.length,0);assert.equal(engine.active.id,'dog-get-em');
// Mandatory checkpoints preempt casual quips, destruction preempts all older dialogue.
engine.event('checkpoint',s);assert.equal(engine.active.id,'computer-checkpoint');
engine.event('respawn',s);assert.equal(engine.active.id,'computer-lost');assert.equal(engine.queue[0].id,'computer-resumed');
engine.audio.end();tick(.31);assert.equal(engine.active.id,'computer-resumed');
engine.event('defeat',s);assert.equal(engine.active.id,'computer-lost');assert.equal(engine.queue.length,0);
// Mute clears the current clip and pending lines; re-enabling cannot resurrect stale speech.
engine.setEnabled(false);assert(engine.audio.paused);assert.equal(engine.active,null);assert.equal(engine.queue.length,0);assert.equal(ducks.at(-1),false);
engine.setEnabled(true);tick(1);assert.equal(engine.active,null);
engine.event('continue',s);assert.equal(engine.active.id,'computer-resumed');engine.audio.end();tick(.31);assert.equal(engine.active.id,'dog-bone');
s.mode='title';tick(.1);assert.equal(engine.active,null);assert(engine.audio.paused);s.mode='playing';
// Reactive clips share one cooldown, and low hull selects the long caution line.
tick(15);s.hull=20;engine.event('hit',s);assert.equal(engine.active.id,'dog-yikes');engine.audio.end();tick(.31);engine.event('hit',s);assert.equal(engine.active,null);
tick(15);s.hull=100;engine.event('hit',s);assert.equal(engine.active.id,'dog-whoops');engine.audio.end();tick(15);engine.event('nearMiss',s);assert.equal(engine.active.id,'dog-close-one');
engine.audio.end();tick(15);engine.event('powerup',s);assert.equal(engine.active.id,'dog-yee-haw');
engine.audio.end();tick(15);engine.event('pickup',s);assert.equal(engine.active.id,'computer-good-boy');
engine.audio.end();tick(15);engine.event('treat',s);assert.equal(engine.active.id,'computer-treat');
// Recovery encouragement rotates, while active danger and announcements keep it quiet.
engine.clear();engine.nextEncouragement=engine.time;engine.nextChatter=engine.time;s.distance=0;s.hull=100;tick(.1);assert.equal(engine.active.id,'computer-great');
engine.audio.end();s.distance=500;tick(30);assert.equal(engine.active,null);s.distance=0;tick(.1);assert.equal(engine.active.id,'computer-whos-good');
engine.audio.end();tick(30);assert.equal(engine.active.id,'computer-best-doggie');
// Expired announcements cannot be played long after their event.
engine.clear();engine.event('launch',s);engine.audio.end();tick(10);assert.equal(engine.active,null);assert.equal(engine.queue.length,0);
// An older rejected play promise must not discard a newer announcement.
(async()=>{
  engine.audio.reject=true;engine.event('launch',s);engine.audio.reject=false;engine.event('defeat',s);await Promise.resolve();await Promise.resolve();assert.equal(engine.active.id,'computer-lost');
  engine.audio.listeners.error();assert.equal(engine.active,null);assert.equal(ducks.at(-1),false);
  engine.audio.reject=true;engine.event('launch',s);await Promise.resolve();await Promise.resolve();assert.equal(engine.active,null);assert.equal(ducks.at(-1),false);
  engine.dispose();assert.equal(engine.enabled,false);
  const unavailable=setup(null),silent=new unavailable.VoiceEngine();silent.setEnabled(true);silent.event('launch',s);silent.update(s,.1);assert.equal(silent.active,null);
  // Voice settings do not alter the checkpoint schema or its exported replacement.
  assert(checkpoint.valid(checkpoint.capture(s)));
  const ctx=vm.createContext({window:{}});vm.runInContext(tuning.exportSource(),ctx);assert.equal(ctx.window.Starhound.settings.voices.clips['computer-ready'],'computer/ready.mp3');
  // Actual flight events produce the intended announcements without changing collision rules.
  const events=[],systems=new ns.FlightSystems({clear(){},burst(){}},{play(){},voice:(id,state)=>events.push([id,state.hull])});
  const run=race.state();run.mode='playing';run.distance=race.waveLength-.1;systems.step(run,.025,new Set());assert(events.some(([id])=>id==='checkpoint'));
  systems.entities=[{type:'rock',x:run.player.x+2,y:0,d:run.distance-5,rx:.85,ry:.85,rz:1,hp:1,age:0}];run.previousDistance=run.distance;run.hurt=0;systems.cleanup(run);assert(events.some(([id])=>id==='nearMiss'));const count=events.length;systems.cleanup(run);assert.equal(events.length,count);
  console.log('Voice checks passed: queue order, preemption, pause/resume, mute, cooldowns, all character reactions, recovery encouragement, expiry, playback failure, unsupported audio, checkpoint compatibility and flight events.');
})().catch(error=>{console.error(error);process.exitCode=1;});
