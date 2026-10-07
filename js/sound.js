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
    this.voiceActive=false;this.voices=new namespace.VoiceEngine(active=>{
      this.voiceActive=active;
      if(this.context)this.applyMix();
    });
  }
  async unlock() {
    if (!this.context) this.initialize();
    if (!this.context) return false;
    if(!this.paused) await this.context.resume(); this.enabled = true;
    this.voices.setEnabled(true);
    this.master.gain.setTargetAtTime(music.master, this.context.currentTime, music.fade);
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
    this.fxBus = ctx.createGain(); this.fxBus.gain.value = music.sfxGain; this.fxBus.connect(this.compressor);
    this.reverb = ctx.createConvolver();
    const length = music.samples(music.reverbSeconds,ctx.sampleRate);
    const impulse = ctx.createBuffer(2,length,ctx.sampleRate);
    for(const channel of [0,1]) impulse.copyToChannel(music.impulse(length,ctx.sampleRate),channel);
    this.reverb.buffer = impulse;
    this.wet = ctx.createGain(); this.wet.gain.value = music.reverbGain;
    this.reverb.connect(this.wet); this.wet.connect(this.compressor);
    this.delay = ctx.createDelay(); this.delay.delayTime.value = music.delaySeconds;
    this.feedback = ctx.createGain(); this.feedback.gain.value = music.delayFeedback;
    this.delayWet = ctx.createGain(); this.delayWet.gain.value = music.delayGain;
    this.delay.connect(this.feedback); this.feedback.connect(this.delay);
    this.delay.connect(this.delayWet); this.delayWet.connect(this.compressor);
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
  async toggle() {
    if (!this.enabled) return this.unlock();
    this.enabled = false;
    this.voices.setEnabled(false);
    this.master.gain.setTargetAtTime(0,this.context.currentTime,music.fade);
    return false;
  }
  applyMix() {
    const time=this.context.currentTime;
    this.fxBus.gain.setTargetAtTime(music.sfxGain*(this.voiceActive?voices.effectsDuck:1),time,music.fade);
    if(this.musicBus)this.musicBus.gain.setTargetAtTime(music.musicGain*(this.voiceActive?voices.musicDuck:1),time,music.fade);
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
    const id = music.trackFor(state);
    this.bpm = music.tempo(id,state);
    if(id !== this.track) this.setTrack(id);
  }
  setTrack(id) {
    const ctx = this.context;
    if(this.track)this.positions[this.track]=this.step;
    if(this.musicBus) {
      const old = this.musicBus;
      old.gain.cancelScheduledValues(ctx.currentTime);
      old.gain.setTargetAtTime(0,ctx.currentTime,music.fade);
      window.setTimeout(() => old.disconnect(),music.retireBusMs);
    }
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0;
    this.musicBus.connect(this.compressor);
    this.musicBus.gain.setTargetAtTime(music.musicGain*(this.voiceActive?voices.musicDuck:1),ctx.currentTime,music.fade);
    this.step = music.transitionStep(id,this.step,this.positions); this.track = id; this.nextTime = music.offset(ctx.currentTime,music.startOffset);
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
    if(note.voice!=='bass'&&note.voice!=='sub'){pan.connect(this.reverb);pan.connect(this.delay);}
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
    if(id==='snare'||id==='explosion')pan.connect(this.reverb);
    source.start(time);source.stop(music.offset(time,cfg.duration));
    source.onended=()=>{source.disconnect();filter.disconnect();amp.disconnect();pan.disconnect();};
  }
  play(id,x=0) {
    if(!this.enabled||!this.context||this.paused)return;
    const ctx=this.context,time=ctx.currentTime,cfg=sfx.tone[id];
    if(!cfg){this.drum(id,time,this.fxBus,sfx.pan(x));return;}
    const osc=ctx.createOscillator();osc.type=cfg.wave;
    osc.frequency.setValueAtTime(cfg.from,time);osc.frequency.exponentialRampToValueAtTime(cfg.to,music.offset(time,cfg.duration));
    const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=sfx.filterCutoff;
    const amp=ctx.createGain();amp.gain.setValueAtTime(sfx.gain.floor,time);
    amp.gain.linearRampToValueAtTime(cfg.gain,music.offset(time,sfx.gain.peakDelay));amp.gain.exponentialRampToValueAtTime(sfx.gain.floor,music.offset(time,cfg.duration));
    const pan=ctx.createStereoPanner();pan.pan.value=sfx.pan(x);
    osc.connect(filter);filter.connect(amp);amp.connect(pan);pan.connect(this.fxBus);
    if(id!=='shot')pan.connect(this.reverb);
    osc.start(time);osc.stop(music.offset(time,cfg.duration));
    osc.onended=()=>{osc.disconnect();filter.disconnect();amp.disconnect();pan.disconnect();};
  }
  async pause() {this.paused=true;this.voices.pause();if(this.context?.state==='running')await this.context.suspend();}
  async resume() {this.paused=false;this.voices.resume();if(this.context){await this.context.resume();this.nextTime=music.offset(this.context.currentTime,music.startOffset);}}
  dispose() {this.voices.dispose();clearInterval(this.timer);this.context?.close();}
}

namespace.SoundEngine = SoundEngine;
})(window.Starhound);
