/**
 * Standalone Starhound procedural soundtrack, extracted from settings.js and sound.js.
 * No Starhound runtime, renderer, assets, network requests or build step required.
 * Load with <script src="js/music_export.js"></script>, then:
 *
 *   const soundtrack = new StarhoundMusic.MusicPlayer();
 *   startButton.addEventListener('click', async () => {
 *     await soundtrack.play('game0'); // Start inside a user gesture to unlock audio.
 *   });
 *   // soundtrack.play('invincible'); switches tracks and remembers the old position.
 *   // soundtrack.play('game0', 140); overrides BPM (default: the track's authored BPM).
 *   // soundtrack.update({mode:'playing', sector:0, speed:100, invincible:0});
 *   // update() is optional: it selects tracks and scales gameplay BPM like Starhound.
 *   // await soundtrack.pause(); await soundtrack.resume();
 *   // soundtrack.stop(); await soundtrack.dispose();
 *
 * Track IDs: intro, game0, game1, game2, game3, invincible, defeat.
 * Public data: StarhoundMusic.music and StarhoundMusic.sfx (music percussion only).
 * CommonJS: const {music, sfx, MusicPlayer} = require('./js/music_export.js');
 * ES modules can import this file for its side effect and use globalThis.StarhoundMusic.
 * Score notes/drums repeat every 256 sixteenth-note steps (16 bars).
 * Scores are deterministic; drum noise and reverb textures use Math.random().
 * Call pause/resume for your game's visibility lifecycle; dispose closes its own context.
 * This is a snapshot: later edits to settings.js do not update this file automatically.
 */
(function (global) {
'use strict';

// The score's only mathematical dependency from the original settings module.
const math = {clamp: (value, min, max) => Math.max(min, Math.min(max, value))};

// Seven original deterministic scores. Sixteenth-note steps, 16-bar harmonic cycles;
// each main track has a distinct scale, bass rhythm, voicing, lead and synth palette.
const music = ({
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
  trackFor(s) {return s.mode==='title'?'intro':s.mode==='defeat'?'defeat':s.invincible>0?'invincible':`game${s.sector%4}`;},
  tempo(track,s) {return track.startsWith('game') ? this.tracks[track].bpm * math.clamp(s.speed/80,.85,2) : this.tracks[track].bpm;},
  transitionStep(id,step,positions) {return positions[id] ?? Math.ceil(step/16)*16;},
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

// Music rendering also needs these values from the original sfx configuration.
// Gameplay effects, engine sounds and prerecorded character voices are omitted.
const sfx = {
  noiseSeconds:1,
  drums:{kick:{frequency:148,to:43,duration:.36,gain:.45,noise:false},softKick:{frequency:92,to:40,duration:.4,gain:.2,noise:false},snare:{frequency:1600,duration:.19,gain:.21,noise:true,filter:'highpass'},hat:{frequency:7500,duration:.05,gain:.045,noise:true,filter:'highpass'},openHat:{frequency:6200,duration:.23,gain:.052,noise:true,filter:'highpass'},softHat:{frequency:4000,duration:.15,gain:.025,noise:true,filter:'highpass'},clap:{frequency:1300,duration:.14,gain:.085,noise:true,filter:'bandpass'}},
  noise(length) {const a=new Float32Array(length);for(let i=0;i<length;i++)a[i]=Math.random()*2-1;return a;},
  gain:{floor:.0001,peakDelay:.006,tail:.03},
};

/** Music-only Web Audio player. Each instance owns its AudioContext. */
class MusicPlayer {
  constructor() {
    this.context = null;
    this.track = null;
    this.step = 0;
    this.nextTime = 0;
    this.bpm = music.tracks.intro.bpm;
    this.musicBus = null;
    this.positions = {};
    this.paused = false;
    this.disposed = false;
    this.timer = null;
    this.retiringBuses = new Map();
  }

  validateTrack(id, bpm) {
    if (this.disposed) throw new Error('MusicPlayer has been disposed; create a new instance.');
    if (!Object.prototype.hasOwnProperty.call(music.tracks, id)) throw new RangeError(`Unknown music track: ${id}`);
    if (!Number.isFinite(bpm) || bpm <= 0) throw new RangeError('BPM must be a finite positive number.');
  }

  initialize() {
    if (this.context) return true;
    const Audio = global.AudioContext || global.webkitAudioContext;
    if (!Audio) return false;
    const ctx = this.context = new Audio({latencyHint:'interactive'});
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.compressor = ctx.createDynamicsCompressor();
    for (const [key, value] of Object.entries(music.compressor)) this.compressor[key].value = value;
    this.compressor.connect(this.master);
    this.master.connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    const length = music.samples(music.reverbSeconds, ctx.sampleRate);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (const channel of [0, 1]) impulse.copyToChannel(music.impulse(length, ctx.sampleRate), channel);
    this.reverb.buffer = impulse;
    this.wet = ctx.createGain();
    this.wet.gain.value = music.reverbGain;
    this.reverb.connect(this.wet);
    this.wet.connect(this.compressor);

    this.delay = ctx.createDelay();
    this.delay.delayTime.value = music.delaySeconds;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = music.delayFeedback;
    this.delayWet = ctx.createGain();
    this.delayWet.gain.value = music.delayGain;
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.delayWet);
    this.delayWet.connect(this.compressor);

    const noiseLength = music.samples(sfx.noiseSeconds, ctx.sampleRate);
    this.noise = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
    this.noise.copyToChannel(sfx.noise(noiseLength), 0);
    this.timer = global.setInterval(() => this.schedule(), music.schedulerMs);
    return true;
  }

  /** Returns false when Web Audio is unavailable. Call from a click/key handler. */
  async play(id = 'intro', bpm = music.tracks[id]?.bpm) {
    this.validateTrack(id, bpm);
    if (!this.initialize()) return false;
    await this.context.resume();
    this.paused = false;
    this.setTrack(id, bpm);
    this.nextTime = music.offset(this.context.currentTime, music.startOffset);
    this.master.gain.setTargetAtTime(music.master, this.context.currentTime, music.fade);
    this.schedule();
    return true;
  }

  retireBus() {
    if (!this.musicBus) return;
    const old = this.musicBus;
    old.gain.cancelScheduledValues(this.context.currentTime);
    old.gain.setTargetAtTime(0, this.context.currentTime, music.fade);
    const timer = global.setTimeout(() => {
      old.disconnect();
      this.retiringBuses.delete(old);
    }, music.retireBusMs);
    this.retiringBuses.set(old, timer);
    this.musicBus = null;
  }

  setTrack(id, bpm = music.tracks[id]?.bpm) {
    this.validateTrack(id, bpm);
    if (!this.context) throw new Error('Call play() before setTrack().');
    this.bpm = bpm;
    if (id === this.track) return;
    if (this.track) this.positions[this.track] = this.step;
    this.retireBus();
    const ctx = this.context;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(this.compressor);
    this.musicBus.gain.setTargetAtTime(music.musicGain, ctx.currentTime, music.fade);
    this.step = music.transitionStep(id, this.step, this.positions);
    this.track = id;
    this.nextTime = music.offset(ctx.currentTime, music.startOffset);
  }

  /** Optional Starhound state adapter; call after play() from your game loop. */
  update({mode = 'playing', sector = 0, speed = 80, invincible = 0} = {}) {
    if (!this.context || this.disposed) return;
    if (!Number.isInteger(sector) || sector < 0 || !Number.isFinite(speed) || !Number.isFinite(invincible)) {
      throw new RangeError('State needs a nonnegative integer sector and finite speed/invincible values.');
    }
    const state = {mode, sector, speed, invincible};
    const id = music.trackFor(state);
    this.setTrack(id, music.tempo(id, state));
  }

  schedule() {
    if (!this.context || this.context.state !== 'running' || this.paused || !this.track) return;
    const ctx = this.context;
    // Re-anchor after background throttling instead of bursting late notes.
    if (this.nextTime < ctx.currentTime) this.nextTime = music.offset(ctx.currentTime, music.lateOffset);
    while (this.nextTime < music.offset(ctx.currentTime, music.lookAhead)) {
      for (const note of music.notes(this.track, this.step, this.bpm)) {
        this.note(note, music.offset(this.nextTime, note.offset), this.musicBus);
      }
      for (const drum of music.drums(this.track, this.step)) this.drum(drum, this.nextTime, this.musicBus);
      this.nextTime = music.offset(this.nextTime, music.stepSeconds(this.bpm));
      this.step++;
    }
  }

  note(note, time, bus) {
    const ctx = this.context, synth = music.synths[note.voice];
    const env = music.envelope(time, note.duration, synth, note.level);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = synth.cutoff;
    filter.Q.value = music.filterQ;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(sfx.gain.floor, time);
    amp.gain.linearRampToValueAtTime(env.peak, env.attack);
    amp.gain.setValueAtTime(env.peak, env.hold);
    amp.gain.exponentialRampToValueAtTime(sfx.gain.floor, env.end);
    const pan = ctx.createStereoPanner();
    pan.pan.value = note.pan;
    filter.connect(amp);
    amp.connect(pan);
    pan.connect(bus);
    if (note.voice !== 'bass' && note.voice !== 'sub') {
      pan.connect(this.reverb);
      pan.connect(this.delay);
    }
    const oscillators = [];
    for (const i of [0, 1]) {
      const osc = ctx.createOscillator();
      osc.type = synth.wave;
      osc.frequency.value = music.frequency(note.note);
      osc.detune.value = music.detune(i, synth.detune);
      osc.connect(filter);
      osc.start(time);
      osc.stop(music.offset(env.end, sfx.gain.tail));
      oscillators.push(osc);
    }
    oscillators[0].onended = () => {
      for (const osc of oscillators) osc.disconnect();
      filter.disconnect(); amp.disconnect(); pan.disconnect();
    };
  }

  drum(id, time, bus) {
    const ctx = this.context, cfg = sfx.drums[id];
    if (!cfg) return;
    const source = cfg.noise ? ctx.createBufferSource() : ctx.createOscillator();
    if (cfg.noise) source.buffer = this.noise;
    else {
      source.type = 'sine';
      source.frequency.setValueAtTime(cfg.frequency, time);
      source.frequency.exponentialRampToValueAtTime(cfg.to, music.offset(time, cfg.duration));
    }
    const filter = ctx.createBiquadFilter();
    filter.type = cfg.filter || 'lowpass';
    filter.frequency.value = cfg.frequency;
    filter.Q.value = music.filterQ;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(sfx.gain.floor, time);
    amp.gain.linearRampToValueAtTime(cfg.gain, music.offset(time, sfx.gain.peakDelay));
    amp.gain.exponentialRampToValueAtTime(sfx.gain.floor, music.offset(time, cfg.duration));
    const pan = ctx.createStereoPanner();
    pan.pan.value = 0;
    source.connect(filter); filter.connect(amp); amp.connect(pan); pan.connect(bus);
    if (id === 'snare') pan.connect(this.reverb);
    source.start(time);
    source.stop(music.offset(time, cfg.duration));
    source.onended = () => {
      source.disconnect(); filter.disconnect(); amp.disconnect(); pan.disconnect();
    };
  }

  async pause() {
    this.paused = true;
    if (this.context?.state === 'running') await this.context.suspend();
  }

  async resume() {
    if (this.disposed) throw new Error('MusicPlayer has been disposed; create a new instance.');
    if (!this.context) return false;
    await this.context.resume();
    this.paused = false;
    this.nextTime = music.offset(this.context.currentTime, music.startOffset);
    this.schedule();
    return true;
  }

  /** Fade out; a later play() resumes the track's remembered arrangement position. */
  stop() {
    if (!this.context || this.disposed) return;
    if (this.track) this.positions[this.track] = this.step;
    this.track = null;
    this.retireBus();
    this.master.gain.setTargetAtTime(0, this.context.currentTime, music.fade);
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    global.clearInterval(this.timer);
    for (const [bus, timer] of this.retiringBuses) {
      global.clearTimeout(timer);
      bus.disconnect();
    }
    this.retiringBuses.clear();
    this.musicBus?.disconnect();
    if (this.context && this.context.state !== 'closed') await this.context.close();
    this.track = null;
  }
}

const api = Object.freeze({music, sfx, MusicPlayer});
if (typeof module === 'object' && module.exports) module.exports = api;
else global.StarhoundMusic = api;
})(globalThis);
