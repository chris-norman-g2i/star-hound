(function(namespace){
'use strict';
const {music,sfx}=namespace.settings;

/** Selection policy has no audio resources or DOM dependencies. */
class MusicDirector {
  constructor(){
    this.gameplayIndex=0;this.previewId=null;this.mode=null;this.revision=0;this.request=null;this.gapUntil=null;this.startAt=null;
  }
  update(state,audioTime=0){
    if(music.debug.resetOnModeChange&&this.mode!==state.mode)this.previewId=null;
    this.mode=state.mode;
    if(state.mode==='title'){this.gameplayIndex=0;this.gapUntil=null;this.startAt=null;}
    if(state.mode==='playing'&&this.gapUntil!==null&&audioTime+music.lookAhead>=this.gapUntil){
      this.gameplayIndex=music.wrapIndex(this.gameplayIndex+1,music.playback.playlist.length);
      this.startAt=this.gapUntil;this.gapUntil=null;this.revision++;
    }
    const effective=state.mode==='paused'?{...state,mode:state.resumeMode||music.playback.pausedFallback}:state;
    const automatic=music.trackFor(effective,this.gameplayIndex);
    const id=automatic===null?null:this.previewId??(this.gapUntil!==null&&effective.mode==='playing'?null:automatic);
    const bpm=id?(this.previewId&&!music.debug.tempoFollowsSpeed?music.tracks[id].bpm??music.oneShotBpm:music.tempo(id,state)):null;
    this.request={id,bpm,revision:this.revision,preview:this.previewId!==null,
      startAt:this.previewId===null?this.startAt:null,once:effective.mode==='playing'&&this.previewId===null&&id!==null};
    return this.request;
  }
  beginFlight(state){
    this.previewId=null;this.gameplayIndex=0;this.gapUntil=null;this.startAt=null;this.mode=state.mode;this.revision++;
    return this.update(state);
  }
  complete(endTime){this.gapUntil=endTime+music.playback.gapSeconds;}
  nextGameplay(state){
    if(state.mode!=='playing')return this.update(state);
    this.previewId=null;this.gapUntil=null;this.startAt=null;
    this.gameplayIndex=music.wrapIndex(this.gameplayIndex+1,music.playback.playlist.length);this.revision++;
    return this.update(state);
  }
  nextPreview(state){
    const current=this.update(state).id;
    const index=music.wrapIndex(music.previewOrder.indexOf(current)+1,music.previewOrder.length);
    this.previewId=music.previewOrder[index];this.startAt=null;this.gapUntil=null;this.revision++;
    return this.update(state);
  }
}

/** One transport renders common events from every score format into the shared music mix. */
class MusicTransport {
  constructor(context,outputs,noise){
    this.context=context;this.outputs=outputs;this.noise=noise;
    this.track=null;this.step=music.initialStep;this.bpm=music.oneShotBpm;this.nextTime=0;
    this.revision=0;this.positions={};this.bus=null;this.retiring=new Map();this.curves=new Map();
    this.paused=false;this.duck=1;this.endedAt=0;
    this.timer=window.setInterval(()=>this.schedule(),music.schedulerMs);
  }
  select({id,bpm,revision,once=false,startAt=null}){
    if(bpm)this.bpm=bpm;
    const restart=revision!==this.revision;this.revision=revision;
    if(id===this.track&&!restart&&once===this.once)return;
    if(this.track)this.positions[this.track]=this.step;
    this.retire(restart||id===null);
    this.track=id;this.once=once;this.arrangementEnd=null;
    if(!id)return;
    const profile=music.tracks[id],mix=music.mixes[profile.mix],ctx=this.context;
    const input=ctx.createGain(),nodes=[input];
    input.gain.value=restart?mix.gain*this.duck:0;
    const envelope=ctx.createGain();nodes.push(envelope);
    let output=envelope;
    if(typeof this.outputs[mix.output]==='function')output=this.outputs[mix.output](envelope,nodes);
    else envelope.connect(this.outputs[mix.output]);
    if(mix.compressor){
      const compressor=ctx.createDynamicsCompressor();
      for(const [key,value] of Object.entries(mix.compressor))compressor[key].value=value;
      compressor.connect(output);output=compressor;nodes.push(compressor);
    }
    input.connect(output);input.gain.setTargetAtTime(mix.gain*this.duck,ctx.currentTime,restart?music.immediateFade:music.fade);
    this.bus={input,envelope,nodes,sources:new Set(),echoes:new Map(),gain:mix.gain};
    this.step=restart||profile.loop===false?music.initialStep:once?(this.positions[id]??music.initialStep):music.transitionStep(id,this.step,this.positions);
    this.nextTime=startAt===null?ctx.currentTime+music.startOffset:Math.max(ctx.currentTime,startAt);this.endedAt=ctx.currentTime;
    envelope.gain.setValueAtTime(once?0:1,ctx.currentTime);
    if(once)envelope.gain.setValueAtTime(0,this.nextTime);
    if(once)envelope.gain.linearRampToValueAtTime(1,this.nextTime+music.playback.fadeSeconds);
    const length=profile.lengthSteps??profile.stepsPerMeasure*profile.measures;
    if(once&&this.step>=length)this.arrangementEnd=ctx.currentTime;
  }
  setDuck(value){
    if(value===this.duck)return;this.duck=value;
    if(this.bus)this.bus.input.gain.setTargetAtTime(this.bus.gain*value,this.context.currentTime,music.fade);
  }
  retire(immediate=false){
    const bus=this.bus;if(!bus)return;this.bus=null;
    bus.input.gain.cancelScheduledValues(this.context.currentTime);
    if(immediate){bus.input.gain.setValueAtTime(0,this.context.currentTime);this.release(bus);return;}
    bus.input.gain.setTargetAtTime(0,this.context.currentTime,music.fade);
    this.retiring.set(bus,window.setTimeout(()=>{this.release(bus);this.retiring.delete(bus);},music.retireBusMs));
  }
  release(bus){
    for(const source of bus.sources){try{source.stop(this.context.currentTime);}catch{}}
    for(const node of bus.nodes)node.disconnect();
    bus.echoes.clear();
  }
  schedule(){
    const ctx=this.context;
    if(ctx.state!=='running'||this.paused||!this.track)return;
    const profile=music.tracks[this.track];
    const length=this.once?(profile.lengthSteps??profile.stepsPerMeasure*profile.measures):profile.loop===false?profile.lengthSteps:Infinity;
    if(this.step>=length)return;
    if(this.nextTime<ctx.currentTime)this.nextTime=ctx.currentTime+music.lateOffset;
    while(this.nextTime<ctx.currentTime+music.lookAhead){
      if(this.step>=length)return;
      const pace=music.stepSeconds(this.bpm),remaining=(length-this.step)*pace;
      if(this.once&&remaining<=music.playback.fadeSeconds+pace){
        const end=this.nextTime+remaining,fadeStart=end-music.playback.fadeSeconds,gain=this.bus.envelope.gain;
        // Schedule ahead of the audio clock. Tempo changes update the remaining envelope
        // without letting a later note or ambience tail escape the terminal fade.
        gain.cancelScheduledValues(ctx.currentTime);
        gain.setValueAtTime(Math.max(0,Math.min(1,(end-ctx.currentTime)/music.playback.fadeSeconds)),Math.max(ctx.currentTime,fadeStart));
        gain.linearRampToValueAtTime(0,end);
      }
      for(const event of music.events(this.track,this.step,this.bpm))this.render(event,this.nextTime+event.offset,this.bus);
      this.nextTime+=pace;this.step++;
      if(this.once&&this.step===length)this.arrangementEnd=this.nextTime;
    }
  }
  driveCurve(amount){
    if(!this.curves.has(amount)){
      const c=music.synthesis,curve=new Float32Array(c.driveSamples);
      for(let i=0;i<curve.length;i++)curve[i]=Math.tanh((i*c.driveRange/(curve.length-1)-1)*amount)/Math.tanh(amount);
      this.curves.set(amount,curve);
    }
    return this.curves.get(amount);
  }
  echo(voice,bus){
    const cfg=voice.echo,key=JSON.stringify(cfg);
    if(!bus.echoes.has(key)){
      const ctx=this.context,input=ctx.createGain(),delay=ctx.createDelay(music.synthesis.maxDelaySeconds),feedback=ctx.createGain();
      input.gain.value=cfg.wet;delay.delayTime.value=cfg.seconds;feedback.gain.value=cfg.feedback;
      input.connect(delay);delay.connect(feedback);feedback.connect(delay);delay.connect(bus.input);
      bus.nodes.push(input,delay,feedback);bus.echoes.set(key,input);
    }
    return bus.echoes.get(key);
  }
  render(event,time,bus){
    const ctx=this.context,v=event.voice,c=music.synthesis;
    const duration=Math.max(c.minimumDuration,event.duration),attack=Math.min(duration*c.attackFraction,v.attack);
    const end=time+duration*v.releaseFactor+v.releaseSeconds;
    const filter=ctx.createBiquadFilter(),amp=ctx.createGain(),pan=ctx.createStereoPanner(),nodes=[filter,amp,pan];
    filter.type=v.filterType;filter.frequency.setValueAtTime(v.cutoff,time);filter.Q.value=v.Q;
    if(v.filterEndRatio!==1)filter.frequency.exponentialRampToValueAtTime(Math.max(c.minimumFrequency,v.cutoff*v.filterEndRatio),time+duration);
    let filtered=filter;
    if(v.drive){const shaper=ctx.createWaveShaper();shaper.curve=this.driveCurve(v.drive);shaper.oversample=c.oversample;filter.connect(shaper);filtered=shaper;nodes.push(shaper);}
    filtered.connect(amp);amp.connect(pan);pan.pan.value=event.pan;pan.connect(bus.input);
    if(event.echo&&v.echo)pan.connect(this.echo(v,bus));
    const peak=Math.max(sfx.gain.floor,event.gain??v.gain);
    amp.gain.setValueAtTime(sfx.gain.floor,time);amp.gain.linearRampToValueAtTime(peak,time+attack);
    if(v.holdFraction)amp.gain.setValueAtTime(peak,time+Math.max(attack,duration*v.holdFraction));
    amp.gain.exponentialRampToValueAtTime(sfx.gain.floor,end);
    let remaining=v.source==='noise'?1:v.copies;
    const finish=source=>{
      bus.sources.delete(source);source.disconnect();
      if(--remaining===0)for(const node of nodes)node.disconnect();
    };
    const start=source=>{
      source.connect(filter);bus.sources.add(source);
      source.onended=()=>finish(source);
      const offset=v.noiseOffsetFraction?Math.random()*this.noise.duration*v.noiseOffsetFraction:0;
      source.start(time,offset);source.stop(end+(v.source==='noise'?0:v.stopTail??sfx.gain.tail));
    };
    if(v.source==='noise'){
      const source=ctx.createBufferSource();source.buffer=this.noise;source.loop=true;start(source);
    }else for(let i=0;i<v.copies;i++){
      const source=ctx.createOscillator();source.type=v.wave;
      source.frequency.setValueAtTime(event.frequency,time);
      if(event.endFrequency!==undefined)source.frequency.exponentialRampToValueAtTime(event.endFrequency,time+duration);
      source.detune.value=(i-(v.copies-1)*c.detuneCenter)*v.detune*c.detuneSpacing;
      start(source);
    }
    this.endedAt=Math.max(this.endedAt,end+(v.stopTail??sfx.gain.tail));
  }
  reanchor(){if(this.arrangementEnd===null)this.nextTime=Math.max(this.nextTime,this.context.currentTime+music.startOffset);}
  get finished(){if(this.once)return this.arrangementEnd!==null&&this.context.currentTime>=this.arrangementEnd;const t=music.tracks[this.track];return t?.loop===false&&this.step>=t.lengthSteps&&this.context.currentTime>=this.endedAt;}
  dispose(){
    window.clearInterval(this.timer);this.retire(true);
    for(const [bus,timer] of this.retiring){window.clearTimeout(timer);this.release(bus);}
    this.retiring.clear();this.curves.clear();
  }
}
namespace.MusicDirector=MusicDirector;namespace.MusicTransport=MusicTransport;
})(window.Starhound);
