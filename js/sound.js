(function (namespace) {
'use strict';
const { audio, music, sfx, voices, speedRings, traffic, tropes } = namespace.settings;
const clampVolume=value=>Math.max(audio.volume.min,Math.min(audio.volume.max,value));

/** Web Audio resource ownership and sample-accurate scheduling.
 * Composition, note frequencies, envelopes and signal tuning come from settings.
 */
class SoundEngine {
  constructor() {
    this.context = null; this.enabled = false; this.paused = false;
    this.music=null;this.director=new namespace.MusicDirector();this.lastState=null;
    this.muted=false;this.volumes=Object.fromEntries(Object.entries(audio.channels).map(([channel,config])=>[channel,config.defaultVolume]));
    try{const preferences=JSON.parse(window.localStorage.getItem(audio.preferencesKey));
      if(preferences){this.muted=preferences.muted===true;for(const [channel,config] of Object.entries(audio.channels))if(config.adjustable&&Number.isFinite(preferences[channel]))this.volumes[channel]=clampVolume(preferences[channel]);}
    }catch{}
    this.savePreferences();
    this.voiceActive=false;this.voices=new namespace.VoiceEngine(active=>{
      this.voiceActive=active;
      if(this.context)this.applyMix();
    },()=>this.enabled&&!this.muted?this.volumes.voice:0);
  }
  async unlock() {
    if (!this.context) this.initialize();
    if (!this.context) return false;
    this.syncMusic();
    if(!this.paused||this.director.request?.preview){
      try{await this.context.resume();}catch{return false;}
      if(this.context.state!=='running')return false;
    }
    this.enabled=true;this.applyMix();this.syncMusic();
    this.music.schedule();
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
    this.musicImpulse=impulse;
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
    this.music=new namespace.MusicTransport(ctx,{
      ambient:(envelope,nodes)=>{envelope.connect(this.musicOutput);return this.createSpace(envelope,this.musicImpulse,true,nodes);},
      direct:this.musicOutput},this.noise);
  }
  createSpace(output,impulse,echo=false,nodes=[]){
    const ctx=this.context,input=ctx.createGain();input.connect(output);
    const reverb=ctx.createConvolver();reverb.buffer=impulse;
    const wet=ctx.createGain();wet.gain.value=music.reverbGain;
    input.connect(reverb);reverb.connect(wet);wet.connect(output);
    nodes.push(input,reverb,wet);
    if(echo){
      const delay=ctx.createDelay();delay.delayTime.value=music.delaySeconds;
      const feedback=ctx.createGain();feedback.gain.value=music.delayFeedback;
      const delayWet=ctx.createGain();delayWet.gain.value=music.delayGain;
      input.connect(delay);delay.connect(feedback);feedback.connect(delay);delay.connect(delayWet);delayWet.connect(output);
      nodes.push(delay,feedback,delayWet);
    }
    return input;
  }
  savePreferences(){
    try{window.localStorage.setItem(audio.preferencesKey,JSON.stringify({...this.volumes,muted:this.muted}));}catch{}
  }
  setVolume(channel,value){
    if(!audio.channels[channel]?.adjustable||!Number.isFinite(value))return;
    this.volumes[channel]=clampVolume(value);this.savePreferences();
    if(this.context)this.applyMix();
  }
  async toggle(){
    this.muted=!this.muted;this.savePreferences();
    if(!this.muted&&!this.enabled)await this.unlock();
    if(this.context)this.applyMix();
  }
  applyMix(){
    const time=this.context.currentTime;
    this.master.gain.setTargetAtTime(this.muted?0:music.master,time,music.mixSmoothing);
    this.fxBus.gain.setTargetAtTime(music.sfxGain*this.volumes.effects*(this.voiceActive?voices.effectsDuck:1),time,music.mixSmoothing);
    this.musicOutput.gain.setTargetAtTime(this.director.request?.id===null?0:this.volumes.music,time,music.mixSmoothing);
    this.music?.setDuck(this.voiceActive?voices.musicDuck:1);
    this.voices.setEnabled(this.enabled&&!this.muted&&this.volumes.voice>0);
  }
  get track(){return this.music?.track??null;}
  get step(){return this.music?.step??music.initialStep;}
  get gameplayIndex(){return this.director.gameplayIndex;}
  get musicStatus(){
    const request=this.director.request,id=this.music?this.music.track:request?.id;
    return {id,name:music.tracks[id]?.name||'Silence',bpm:music.tracks[id]?.bpm?this.music?.bpm??request?.bpm:null,
      preview:request?.preview||false,locked:!this.enabled,muted:this.muted||this.volumes.music===0,
      paused:this.paused&&!request?.preview,finished:this.music?.finished||false};
  }
  syncMusic(){
    if(!this.music||!this.director.request)return;
    this.music.paused=this.paused&&!this.director.request.preview;
    this.music.select(this.director.request);
  }
  beginFlight(state){
    this.lastState=state;this.director.beginFlight(state);this.syncMusic();
  }
  nextTrack(state){this.director.nextGameplay(state);this.syncMusic();}
  async previewNext(state){
    this.director.nextPreview(state);await this.unlock();this.syncMusic();this.music?.schedule();
  }
  crash(){
    this.clearVoices();
    if(this.context){
      if(this.music?.once&&this.music.finished)this.director.complete(this.music.arrangementEnd);
      const gain=this.musicOutput.gain,time=this.context.currentTime;
      gain.cancelScheduledValues(time);gain.setValueAtTime(0,time);
      this.music.select({id:null,bpm:null,revision:this.director.revision});
    }
    this.play('crashExplosion');
  }
  voice(event,state) {this.voices.event(event,state);}
  ring(chain,x){
    if(!this.enabled||!this.context||this.paused)return;
    const c=speedRings.sound,frequency=c.baseFrequency*c.octaveRatio**((chain-1)*c.semitonesPerHit/c.semitonesPerOctave);
    this.tone({from:frequency,to:frequency*c.endRatio,duration:c.duration,gain:c.gain,wave:c.wave},this.context.currentTime,x);
  }
  horn(kind,x,beeps=1){
    if(!this.enabled||!this.context||this.paused)return;
    const c=traffic.horn,time=this.context.currentTime,frequencies=c.frequencies[kind];
    for(let beep=0;beep<Math.min(beeps,c.maxBeeps);beep++)for(const frequency of frequencies){
      this.tone({from:frequency,to:frequency,duration:c.beepSeconds,gain:c.gain/frequencies.length,wave:'sawtooth'},
        time+beep*(c.beepSeconds+c.gapSeconds),x);
    }
  }
  motif(kind,x){
    if(!this.enabled||!this.context||this.paused)return;
    const time=this.context.currentTime;
    if(kind==='complaint'){
      const c=tropes.complaint;
      for(let beep=0;beep<c.beeps;beep++)this.tone(c,time+beep*c.gapSeconds,x);
      return;
    }
    const c=tropes.sounds[kind];
    if(c?.noiseCutoff)this.explosion(c,time,x);else if(c)this.tone(c,time,x);
  }
  clearVoices() {this.voices.clear();}
  update(state,dt=.025) {
    this.lastState=state;
    if(state.mode==='playing'&&this.director.request?.once&&this.music?.finished)this.director.complete(this.music.arrangementEnd);
    this.director.update(state,this.context?.currentTime);
    this.voices.update(state,dt);
    if(!this.context) return;
    const engine=sfx.engineState(state),time=this.context.currentTime;
    this.applyMix();
    this.engineTone.frequency.setTargetAtTime(engine.frequency,time,sfx.engine.smoothing);
    this.engineFilter.frequency.setTargetAtTime(engine.cutoff,time,sfx.engine.smoothing);
    this.engineAmp.gain.setTargetAtTime(engine.gain,time,sfx.engine.smoothing);
    this.syncMusic();
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
  async pause() {this.paused=true;this.voices.pause();if(this.music)this.music.paused=true;if(this.context?.state==='running')await this.context.suspend();}
  async resume() {this.paused=false;this.voices.resume();if(this.context){await this.context.resume();this.music.paused=false;this.music.reanchor();}}
  dispose() {this.voices.dispose();this.music?.dispose();this.context?.close();}
}

namespace.SoundEngine = SoundEngine;
})(window.Starhound);
