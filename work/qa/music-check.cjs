const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const callbacks=new Map();let nextTimer=0;
const timers={setInterval(fn){const id=++nextTimer;callbacks.set(id,fn);return id;},clearInterval(id){callbacks.delete(id);},setTimeout(){return ++nextTimer;},clearTimeout(){}};
class Param{
 constructor(value=0){this.value=value;this.events=[];}
 setValueAtTime(value,time){this.events.push({value,time,kind:'set'});}
 linearRampToValueAtTime(value,time){this.events.push({value,time,kind:'linear'});}
 exponentialRampToValueAtTime(value,time){this.events.push({value,time,kind:'exponential'});}
 setTargetAtTime(value,time){this.events.push({value,time,kind:'target'});}
 cancelScheduledValues(){}
}
class Node{
 constructor(context,kind){this.context=context;this.kind=kind;this.targets=[];for(const key of ['gain','frequency','detune','Q','pan','delayTime','threshold','ratio','knee','attack','release'])this[key]=new Param();}
 connect(node){this.targets.push(node);return node;}
 disconnect(){this.disconnected=true;}
 start(time=0,offset=0,duration){this.startTime=time;this.duration=duration;this.context.sources.push(this);}
 stop(time){this.stopTime=time;}
}
class AudioContext{
 constructor(){this.currentTime=0;this.sampleRate=8000;this.state='running';this.sources=[];this.destination=new Node(this,'output');}
 async resume(){this.state='running';}async suspend(){this.state='suspended';}async close(){this.state='closed';}
 createGain(){return new Node(this,'gain');}createDynamicsCompressor(){return new Node(this,'compressor');}
 createDelay(){return new Node(this,'delay');}createBiquadFilter(){return new Node(this,'filter');}
 createWaveShaper(){return new Node(this,'shaper');}createStereoPanner(){return new Node(this,'pan');}
 createOscillator(){return new Node(this,'tone');}createBufferSource(){return new Node(this,'noise');}
 createConvolver(){return new Node(this,'convolver');}
 createBuffer(channels,length){const arrays=Array.from({length:channels},()=>new Float32Array(length));return {duration:length/this.sampleRate,numberOfChannels:channels,getChannelData:i=>arrays[i],copyToChannel:(data,i)=>arrays[i].set(data)};}
}
const window={...timers,AudioContext,localStorage:{getItem(){return null;},setItem(){}}};
const context=vm.createContext({window,console,Float32Array});
for(const file of ['settings','music','voices','sound'])vm.runInContext(fs.readFileSync(`js/${file}.js`,'utf8'),context);
const ns=window.Starhound,{music,race,tuning}=ns.settings;
assert.equal(music.previewOrder.length,16);assert.equal(music.playback.playlist.length,5);
const original=require('../../js/music_export.js').music;
for(const id of Object.keys(original.tracks))for(let step=0;step<256;step++){
 assert.equal(JSON.stringify(music.scaleNotes(id,step,music.tracks[id].bpm)),JSON.stringify(original.notes(id,step,original.tracks[id].bpm)));
 assert.equal(JSON.stringify(music.scaleDrums(id,step)),JSON.stringify(original.drums(id,step)));
}
for(const [id,track] of Object.entries(music.tracks))for(let step=0;step<256;step++)for(const event of music.events(id,step,track.bpm??music.oneShotBpm)){
 assert(event.voice);assert(Number.isFinite(event.frequency)&&event.frequency>0);assert(event.duration>0&&Number.isFinite(event.duration));
}
const director=new ns.MusicDirector(),state=race.state();
assert.equal(director.update(state).id,'stardogTitle');
const visited=new Set();for(let i=0;i<music.previewOrder.length;i++){const request=director.nextPreview(state);visited.add(request.id);assert.equal(request.bpm,music.tracks[request.id].bpm??music.oneShotBpm);}
assert.equal(visited.size,16);
state.mode='playing';state.speed=160;state.invincible=0;
assert.equal(director.update(state).id,'game0');
for(let i=1;i<=5;i++)assert.equal(director.nextGameplay(state).id,music.playback.playlist[i%5]);
state.sector=4;assert.equal(director.update(state).id,'game0');
state.invincible=7;assert.equal(director.update(state).id,'game0');
assert.equal(director.nextGameplay(state).id,'stardog0');assert.equal(director.update(state).id,'stardog0');
director.complete(10);assert.equal(director.update(state,10).id,null);
assert.equal(director.update(state,10+music.playback.gapSeconds-music.lookAhead-.001).id,null);
const next=director.update(state,10+music.playback.gapSeconds-music.lookAhead);
assert.equal(next.id,'game1');assert.equal(next.startAt,10.6);
let preview=director.nextPreview(state);state.sector=12;state.speed=320;
assert.equal(director.update(state).id,preview.id);assert.equal(director.update(state).bpm,preview.bpm);
state.mode='paused';state.resumeMode='playing';assert(!director.update(state).preview);
state.mode='crashing';assert.equal(director.update(state).id,null);assert.equal(director.nextPreview(state).id,null);
state.mode='defeat';assert.equal(director.update(state).id,'defeat');
// Every score, palette and arranger survives the existing complete-settings export.
const exported={window:{}};vm.runInNewContext(tuning.exportSource(),exported);const replacement=exported.window.Starhound.settings.music;
assert.equal(JSON.stringify(replacement.tracks),JSON.stringify(music.tracks));
assert.equal(JSON.stringify(replacement.synths),JSON.stringify(music.synths));
for(const id of music.previewOrder)assert.equal(JSON.stringify(replacement.events(id,0,replacement.tracks[id].bpm??replacement.oneShotBpm)),JSON.stringify(music.events(id,0,music.tracks[id].bpm??music.oneShotBpm)));

function rendered(source){
 const filter=source.targets[0];let output=filter.targets[0],drive=null;
 if(output.kind==='shaper'){drive=crypto.createHash('sha256').update(Buffer.from(output.curve.buffer)).digest('hex');output=output.targets[0];}
 const envelope=output.gain.events,peak=Math.max(...envelope.map(e=>e.value));
 const startFrequency=source.frequency.events[0]?.value??source.frequency.value;
 const lastFrequency=source.frequency.events.at(-1)?.value??startFrequency;
 const round=value=>Math.round(value*1e8)/1e8;
 return {kind:source.kind,wave:source.type||null,frequency:source.kind==='tone'?round(startFrequency):null,
  endFrequency:source.kind==='tone'?round(lastFrequency):null,detune:round(source.detune.value),
  offset:round(source.startTime-source.context.currentTime),duration:round(envelope.at(-1).time-source.startTime),
  peak:round(peak),cutoff:round(filter.frequency.events[0]?.value??filter.frequency.value),filter:filter.type,
  Q:filter.Q.value,drive};
}
async function sourceParity(path){
 const ref=vm.createContext({...timers,AudioContext,console,Float32Array});vm.runInContext(fs.readFileSync(path,'utf8'),ref);
 const api=ref.StardogMusic;
 const pairs=[...api.MUSIC_TRACKS.map((t,i)=>[t.name,`stardog${i}`]),['invincible','stardogInvincible'],['title','stardogTitle'],['pause','stardogPause'],['death','stardogDeath'],['victory','stardogVictory']];
 for(const [sourceId,id] of pairs){
  callbacks.clear();const sourceContext=new AudioContext(),targetContext=new AudioContext();
  const player=api.createPlayer({audioContext:sourceContext});await player.play(sourceId);
  const sourceSchedule=[...callbacks.values()][0];
  const transport=new ns.MusicTransport(targetContext,{ambient:targetContext.destination,direct:targetContext.destination},targetContext.createBuffer(1,16000));
  const track=music.tracks[id],bpm=track.bpm??music.oneShotBpm;
  transport.select({id,bpm,revision:1});
  const steps=track.loop?track.stepsPerMeasure*track.measures:1;
  for(let step=0;step<steps;step++){
   if(step){sourceContext.currentTime+=music.stepSeconds(bpm);targetContext.currentTime=sourceContext.currentTime;sourceSchedule();}
   for(const event of music.events(id,step,bpm))transport.render(event,targetContext.currentTime+event.offset,transport.bus);
   const expected=sourceContext.sources.map(rendered),actual=targetContext.sources.map(rendered);
   assert.deepEqual(actual,expected,`${id} step ${step}`);sourceContext.sources=[];targetContext.sources=[];
  }
  await player.dispose();transport.dispose();
 }
 console.log('Imported source parity passed: all nine complete arrangements, note frequencies/durations, noise, gains, filters, detuning and distortion curves.');
}
(async()=>{
 if(process.argv[2])await sourceParity(process.argv[2]);
 callbacks.clear();const engine=new ns.SoundEngine(),s=race.state();engine.update(s);assert(engine.musicStatus.locked);await engine.unlock();
 assert.equal(engine.track,'stardogTitle');assert.equal(callbacks.size,1);
 await engine.previewNext(s);assert.equal(engine.track,'stardogPause');assert(engine.musicStatus.preview);
 const bus=engine.music.bus;engine.setVolume('music',0);assert.equal(engine.musicOutput.gain.events.at(-1).value,0);assert.equal(engine.music.bus,bus);
 engine.setVolume('music',.5);engine.voiceActive=true;engine.applyMix();assert.equal(bus.input.gain.events.at(-1).value,bus.gain*ns.settings.voices.musicDuck);
 s.mode='playing';engine.beginFlight(s);assert.equal(engine.track,'game0');
 engine.nextTrack(s);assert.equal(engine.track,'stardog0');
 for(let i=0;i<16;i++){await engine.previewNext(s);engine.context.currentTime+=.25;engine.music.schedule();assert(engine.step<16);}
 s.mode='paused';s.resumeMode='playing';await engine.pause();engine.update(s);assert.equal(engine.context.state,'suspended');assert(engine.music.paused);
 await engine.previewNext(s);assert.equal(engine.context.state,'running');assert(engine.paused);assert(!engine.music.paused);
 s.mode='playing';await engine.resume();engine.update(s);assert(!engine.musicStatus.preview);
 s.mode='crashing';engine.crash();engine.update(s);assert.equal(engine.track,null);assert.equal(engine.musicOutput.gain.events.at(-1).value,0);
 s.mode='defeat';engine.update(s);assert.equal(engine.track,'defeat');
 // Run every complete arrangement once. Real audio time controls transitions; sectors and
 // invincibility cannot advance or replace gameplay music. Ambience gates also fade to zero.
 s.mode='playing';s.invincible=7;engine.beginFlight(s);
 for(const expected of [...music.playback.playlist,music.playback.playlist[0]]){
  assert.equal(engine.track,expected);assert.equal(engine.step,0);
  const profile=music.tracks[expected],length=profile.lengthSteps??profile.stepsPerMeasure*profile.measures;
  while(engine.step<length){engine.context.currentTime=engine.music.nextTime;engine.music.schedule();}
  const bus=engine.music.bus,end=engine.music.arrangementEnd;
  assert.equal(engine.step,length);assert(bus.envelope.gain.events.some(e=>e.kind==='linear'&&e.value===0&&e.time===end));
  engine.context.currentTime=end;engine.update(s);assert.equal(engine.track,null);assert(bus.nodes.every(n=>n.disconnected));
  engine.context.currentTime=end+music.playback.gapSeconds-music.lookAhead-.001;engine.update(s);assert.equal(engine.track,null);
  engine.context.currentTime=end+music.playback.gapSeconds-music.lookAhead;engine.update(s);
  assert.equal(engine.music.nextTime,end+music.playback.gapSeconds);assert.equal(engine.step,0);
 }
 // Crashing just after the final step was queued must not leave the restored track stuck.
 engine.beginFlight(s);const length=music.tracks.game0.lengthSteps;
 while(engine.step<length){engine.context.currentTime=engine.music.nextTime;engine.music.schedule();}
 s.mode='crashing';engine.crash();engine.update(s);s.mode='playing';engine.update(s);engine.update(s);
 engine.context.currentTime+=music.playback.gapSeconds;engine.update(s);assert.equal(engine.track,'stardog0');
 engine.dispose();assert.equal(callbacks.size,0);assert.equal(engine.music.retiring.size,0);
 console.log('Music checks passed: original score parity, 16 previews, five-track selection, preview isolation/tempo, existing roles, complete export, shared context/scheduler, mute/ducking, pause audition, crash silence and cleanup.');
})().catch(error=>{console.error(error);process.exitCode=1;});
