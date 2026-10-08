(function (namespace) {
'use strict';
const { music, sfx, voices } = namespace.settings;

/** Web Audio resource ownership and sample-accurate scheduling.
 * Composition, note frequencies, envelopes and signal tuning come from settings.
 */
class SoundEngine {
  constructor() {
    this.context = null; this.enabled = false; this.paused = false;
    this.track = null; this.step = 0; this.nextTime = 0; this.bpm = music.tracks.intro.bpm;
    this.musicBus = null; this.lastState = null; this.positions = {};
    this.muted=false;this.volumes={music:1,effects:1,voice:1};
    try{const preferences=JSON.parse(window.localStorage.getItem('starhound.audio.v1'));
      if(preferences){this.muted=preferences.muted===true;for(const channel of Object.keys(this.volumes))if(Number.isFinite(preferences[channel]))this.volumes[channel]=Math.max(0,Math.min(1,preferences[channel]));}
    }catch{}
    this.gameplayIndex=0;this.lastSector=null;this.skipPowerupMusic=false;
    this.voiceActive=false;this.voices=new namespace.VoiceEngine(active=>{
      this.voiceActive=active;
      if(this.context)this.applyMix();
    },()=>this.enabled&&!this.muted?this.volumes.voice:0);
  }
  async unlock() {
    if (!this.context) this.initialize();
    if (!this.context) return false;
    if(!this.paused) await this.context.resume(); this.enabled = true;
    this.applyMix();
    return true;
  }
  initialize() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    const ctx = this.context = new Audio({latencyHint:'interactive'});
    this.master = ctx.createGain(); this.master.gain.value = 0;
    this.compressor = ctx.createDynamicsCompressor();
    for (const [key,value] of Object.entries(music.compressor)) this.compressor[key].value = value;
    this.compressor.connect(this.master); this.master.connect(ctx.destination);
    this.fxBus=ctx.createGain();this.fxBus.connect(this.compressor);
    this.musicOutput=ctx.createGain();this.musicOutput.connect(this.compressor);
    const length=music.samples(music.reverbSeconds,ctx.sampleRate);
    const impulse=ctx.createBuffer(2,length,ctx.sampleRate);
    for(const channel of [0,1])impulse.copyToChannel(music.impulse(length,ctx.sampleRate),channel);
    this.musicSpace=this.createSpace(this.musicOutput,impulse,true);
    this.effectsSpace=this.createSpace(this.fxBus,impulse);
    const noiseLength = music.samples(sfx.noiseSeconds,ctx.sampleRate);
    this.noise = ctx.createBuffer(1,noiseLength,ctx.sampleRate);
    this.noise.copyToChannel(sfx.noise(noiseLength),0);
    this.engineTone=ctx.createOscillator();this.engineTone.type=sfx.engine.wave;
    this.engineNoise=ctx.createBufferSource();this.engineNoise.buffer=this.noise;this.engineNoise.loop=true;
    this.engineWind=ctx.createGain();this.engineWind.gain.value=sfx.engine.noiseGain;
    this.engineFilter=ctx.createBiquadFilter();this.engineFilter.type='lowpass';
    this.engineAmp=ctx.createGain();this.engineAmp.gain.value=0;
    this.engineTone.connect(this.engineFilter);this.engineNoise.connect(this.engineWind);this.engineWind.connect(this.engineFilter);
    this.engineFilter.connect(this.engineAmp);this.engineAmp.connect(this.fxBus);
    this.engineTone.start();this.engineNoise.start();
    this.timer = window.setInterval(() => this.schedule(),music.schedulerMs);
  }
  createSpace(output,impulse,echo=false){
    const ctx=this.context,input=ctx.createGain();input.connect(output);
    const reverb=ctx.createConvolver();reverb.buffer=impulse;
    const wet=ctx.createGain();wet.gain.value=music.reverbGain;
    input.connect(reverb);reverb.connect(wet);wet.connect(output);
    if(echo){
      const delay=ctx.createDelay();delay.delayTime.value=music.delaySeconds;
      const feedback=ctx.createGain();feedback.gain.value=music.delayFeedback;
      const delayWet=ctx.createGain();delayWet.gain.value=music.delayGain;
      input.connect(delay);delay.connect(feedback);feedback.connect(delay);delay.connect(delayWet);delayWet.connect(output);
    }
    return input;
  }
  savePreferences(){
    try{window.localStorage.setItem('starhound.audio.v1',JSON.stringify({...this.volumes,muted:this.muted}));}catch{}
  }
  setVolume(channel,value){
    if(!(channel in this.volumes))return;
    this.volumes[channel]=Math.max(0,Math.min(1,value));this.savePreferences();
    if(this.context)this.applyMix();
  }
  async toggle(){
    this.muted=!this.muted;this.savePreferences();
    if(!this.muted&&!this.enabled)await this.unlock();
    if(this.context)this.applyMix();
  }
  applyMix(){
    const time=this.context.currentTime;
    this.master.gain.setTargetAtTime(this.muted?0:music.master,time,.025);
    this.fxBus.gain.setTargetAtTime(music.sfxGain*this.volumes.effects*(this.voiceActive?voices.effectsDuck:1),time,.025);
    const crashing=this.lastState?.mode==='crashing'||this.lastState?.mode==='paused'&&this.lastState.resumeMode==='crashing';
    this.musicOutput.gain.setTargetAtTime(crashing?0:this.volumes.music,time,.025);
    if(this.musicBus)this.musicBus.gain.setTargetAtTime(music.musicGain*(this.voiceActive?voices.musicDuck:1),time,music.fade);
    this.voices.setEnabled(this.enabled&&!this.muted&&this.volumes.voice>0);
  }
  beginFlight(state){
    this.gameplayIndex=state.sector%4;this.lastSector=state.sector;this.skipPowerupMusic=false;
    if(this.context){const id=music.trackFor(state,this.gameplayIndex);this.bpm=music.tempo(id,state);this.setTrack(id,{restart:true,immediate:true});}
  }
  nextTrack(state){
    if(state.mode!=='playing')return;
    this.gameplayIndex=(this.gameplayIndex+1)%4;this.lastSector=state.sector;
    this.skipPowerupMusic=state.invincible>0;
    if(this.context){const id=`game${this.gameplayIndex}`;this.bpm=music.tempo(id,state);this.setTrack(id,{restart:true,immediate:true});}
  }
  crash(){
    this.clearVoices();
    if(this.context){
      const gain=this.musicOutput.gain,time=this.context.currentTime;
      gain.cancelScheduledValues(time);gain.setValueAtTime(0,time);
      this.setTrack(null,{immediate:true});
    }
    this.play('crashExplosion');
  }
  voice(event,state) {this.voices.event(event,state);}
  clearVoices() {this.voices.clear();}
  update(state,dt=.025) {
    this.lastState = state;
    this.voices.update(state,dt);
    if(!this.context) return;
    const engine=sfx.engineState(state),time=this.context.currentTime;
    this.applyMix();
    this.engineTone.frequency.setTargetAtTime(engine.frequency,time,sfx.engine.smoothing);
    this.engineFilter.frequency.setTargetAtTime(engine.cutoff,time,sfx.engine.smoothing);
    this.engineAmp.gain.setTargetAtTime(engine.gain,time,sfx.engine.smoothing);
    if(state.mode==='playing'){
      if(this.lastSector===null)this.gameplayIndex=state.sector%4;
      else if(state.sector!==this.lastSector)this.gameplayIndex=((this.gameplayIndex+state.sector-this.lastSector)%4+4)%4;
      this.lastSector=state.sector;
    }else if(state.mode==='title'){this.lastSector=null;this.gameplayIndex=0;}
    if(state.invincible<=0)this.skipPowerupMusic=false;
    const effective=state.mode==='paused'?{...state,mode:state.resumeMode||'playing'}:state;
    const id=music.trackFor(this.skipPowerupMusic?{...effective,invincible:0}:effective,this.gameplayIndex);
    if(id)this.bpm=music.tempo(id,state);
    if(id!==this.track)this.setTrack(id,{immediate:id===null});
    const label=document.getElementById('track-name');if(label)label.textContent=id?music.tracks[id].name:'';
  }
  setTrack(id,{restart=false,immediate=false}={}){
    const ctx=this.context;
    if(this.track)this.positions[this.track]=this.step;
    if(this.musicBus){
      const old=this.musicBus;old.gain.cancelScheduledValues(ctx.currentTime);
      if(immediate){old.gain.setValueAtTime(0,ctx.currentTime);old.disconnect();}
      else{old.gain.setTargetAtTime(0,ctx.currentTime,music.fade);window.setTimeout(()=>old.disconnect(),music.retireBusMs);}
    }
    this.track=id;this.musicBus=null;if(!id)return;
    this.musicBus=ctx.createGain();this.musicBus.gain.value=immediate?music.musicGain:0;
    this.musicBus.connect(this.musicSpace);
    this.musicBus.gain.setTargetAtTime(music.musicGain*(this.voiceActive?voices.musicDuck:1),ctx.currentTime,immediate?.01:music.fade);
    this.step=restart?0:music.transitionStep(id,this.step,this.positions);
    this.nextTime=music.offset(ctx.currentTime,music.startOffset);
  }
  schedule() {
    if(!this.context || this.context.state!=='running' || this.paused || !this.track) return;
    const ctx = this.context;
    // Re-anchor after background throttling instead of scheduling a burst of late notes.
    if(this.nextTime < ctx.currentTime) this.nextTime = music.offset(ctx.currentTime,music.lateOffset);
    while(this.nextTime < music.offset(ctx.currentTime,music.lookAhead)) {
      for(const note of music.notes(this.track,this.step,this.bpm))
        this.note(note,music.offset(this.nextTime,note.offset),this.musicBus);
      for(const drum of music.drums(this.track,this.step))this.drum(drum,this.nextTime,this.musicBus);
      this.nextTime = music.offset(this.nextTime,music.stepSeconds(this.bpm));
      this.step++;
    }
  }
  note(note,time,bus) {
    const ctx=this.context, synth=music.synths[note.voice], env=music.envelope(time,note.duration,synth,note.level);
    const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=synth.cutoff;filter.Q.value=music.filterQ;
    const amp=ctx.createGain();amp.gain.setValueAtTime(sfx.gain.floor,time);
    amp.gain.linearRampToValueAtTime(env.peak,env.attack);
    amp.gain.setValueAtTime(env.peak,env.hold);amp.gain.exponentialRampToValueAtTime(sfx.gain.floor,env.end);
    const pan=ctx.createStereoPanner();pan.pan.value=note.pan;
    filter.connect(amp);amp.connect(pan);pan.connect(bus);
    const oscillators=[];
    for(const i of [0,1]) {
      const osc=ctx.createOscillator();osc.type=synth.wave;osc.frequency.value=music.frequency(note.note);
      osc.detune.value=music.detune(i,synth.detune);osc.connect(filter);osc.start(time);osc.stop(music.offset(env.end,sfx.gain.tail));oscillators.push(osc);
    }
    oscillators[0].onended=()=>{for(const osc of oscillators)osc.disconnect();filter.disconnect();amp.disconnect();pan.disconnect();};
  }
  drum(id,time,bus,panValue=0) {
    const ctx=this.context,cfg=sfx.drums[id];if(!cfg)return;
    const source=cfg.noise?ctx.createBufferSource():ctx.createOscillator();
    if(cfg.noise)source.buffer=this.noise;
    else {source.type='sine';source.frequency.setValueAtTime(cfg.frequency,time);source.frequency.exponentialRampToValueAtTime(cfg.to,music.offset(time,cfg.duration));}
    const filter=ctx.createBiquadFilter();filter.type=cfg.filter||'lowpass';filter.frequency.value=cfg.frequency;filter.Q.value=music.filterQ;
    const amp=ctx.createGain();amp.gain.setValueAtTime(sfx.gain.floor,time);
    amp.gain.linearRampToValueAtTime(cfg.gain,music.offset(time,sfx.gain.peakDelay));amp.gain.exponentialRampToValueAtTime(sfx.gain.floor,music.offset(time,cfg.duration));
    const pan=ctx.createStereoPanner();pan.pan.value=panValue;
    source.connect(filter);filter.connect(amp);amp.connect(pan);pan.connect(bus);
    source.start(time);source.stop(music.offset(time,cfg.duration));
    source.onended=()=>{source.disconnect();filter.disconnect();amp.disconnect();pan.disconnect();};
  }
  play(id,x=0){
    if(!this.enabled||!this.context||this.paused)return;
    const time=this.context.currentTime;
    if(id==='checkpoint'){
      for(const note of sfx.fanfare)this.tone(note,time+note.offset,x);
      return;
    }
    const explosion={enemyExplosion:'enemy',rockExplosion:'rock',crashExplosion:'crash'}[id];
    if(explosion){this.explosion(sfx.explosions[explosion],time,x);return;}
    const cfg=sfx.tone[id];
    if(cfg)this.tone(cfg,time,x);else this.drum(id,time,this.effectsSpace,sfx.pan(x));
  }
  tone(cfg,time,x){
    const ctx=this.context,osc=ctx.createOscillator();osc.type=cfg.wave;
    osc.frequency.setValueAtTime(cfg.from,time);osc.frequency.exponentialRampToValueAtTime(cfg.to,time+cfg.duration);
    const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=sfx.filterCutoff;
    const amp=ctx.createGain();amp.gain.setValueAtTime(sfx.gain.floor,time);
    amp.gain.linearRampToValueAtTime(cfg.gain,time+sfx.gain.peakDelay);amp.gain.exponentialRampToValueAtTime(sfx.gain.floor,time+cfg.duration);
    const pan=ctx.createStereoPanner();pan.pan.value=sfx.pan(x);
    osc.connect(filter);filter.connect(amp);amp.connect(pan);pan.connect(this.effectsSpace);
    osc.start(time);osc.stop(time+cfg.duration);
    osc.onended=()=>{osc.disconnect();filter.disconnect();amp.disconnect();pan.disconnect();};
  }
  explosion(cfg,time,x){
    this.tone({from:cfg.sub,to:cfg.to,duration:cfg.duration,gain:cfg.subGain,wave:'sine'},time,x);
    const ctx=this.context,noise=ctx.createBufferSource();noise.buffer=this.noise;
    const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.setValueAtTime(cfg.noiseCutoff,time);
    filter.frequency.exponentialRampToValueAtTime(80,time+cfg.duration);
    const gain=ctx.createGain();gain.gain.setValueAtTime(sfx.gain.floor,time);
    gain.gain.linearRampToValueAtTime(cfg.noiseGain,time+.008);gain.gain.exponentialRampToValueAtTime(sfx.gain.floor,time+cfg.duration);
    const pan=ctx.createStereoPanner();pan.pan.value=sfx.pan(x);
    noise.connect(filter);filter.connect(gain);gain.connect(pan);pan.connect(this.effectsSpace);
    noise.start(time);noise.stop(time+cfg.duration);
    noise.onended=()=>{noise.disconnect();filter.disconnect();gain.disconnect();pan.disconnect();};
  }
  async pause() {this.paused=true;this.voices.pause();if(this.context?.state==='running')await this.context.suspend();}
  async resume() {this.paused=false;this.voices.resume();if(this.context){await this.context.resume();this.nextTime=music.offset(this.context.currentTime,music.startOffset);}}
  dispose() {this.voices.dispose();clearInterval(this.timer);this.context?.close();}
}

namespace.SoundEngine = SoundEngine;
})(window.Starhound);
