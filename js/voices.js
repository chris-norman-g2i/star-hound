(function(namespace){
'use strict';
const {voices,music,race}=namespace.settings;

/** Native file playback supports both a double-clicked game and static hosting.
 * One speaker at a time; announcements take precedence over occasional chatter.
 */
class VoiceEngine {
  constructor(onSpeaking=()=>{}) {
    this.audio=window.Audio?new window.Audio():null;
    this.onSpeaking=onSpeaking;this.enabled=false;this.paused=false;this.time=0;
    this.queue=[];this.active=null;this.generation=0;this.nextAvailable=0;
    this.nextChatter=0;this.nextEncouragement=voices.encouragementGap;this.encouragementIndex=0;
    if(this.audio){
      this.audio.preload='auto';
      this.audio.addEventListener('ended',()=>this.finish());
      this.audio.addEventListener('error',()=>this.finish());
    }
  }
  setEnabled(enabled) {this.enabled=enabled;if(!enabled)this.clear();}
  clear() {
    this.generation++;this.queue.length=0;this.active=null;
    if(this.audio){this.audio.pause();this.audio.removeAttribute('src');this.audio.load();}
    this.onSpeaking(false);this.nextAvailable=this.time;
  }
  finish() {
    this.generation++;this.active=null;this.onSpeaking(false);
    this.nextAvailable=this.time+voices.gap;
  }
  enqueue(id,priority=0,delay=0) {
    if(!this.enabled||!this.audio||!voices.clips[id]||this.queue.some(entry=>entry.id===id)||this.active?.id===id)return;
    if(priority===0){
      if(this.active||this.queue.length||this.time<this.nextChatter)return;
      this.nextChatter=this.time+voices.chatterGap;
    }
    this.queue.push({id,priority,ready:this.time+delay,expires:this.time+delay+voices.expiry});
    this.queue.sort((a,b)=>b.priority-a.priority);this.queue.length=Math.min(this.queue.length,voices.queueLimit);
    this.drain();
  }
  event(name,state) {
    if(!this.enabled||this.paused)return;
    if(name==='launch'||name==='continue'||name==='respawn'||name==='defeat') {
      this.clear();this.nextChatter=this.time+voices.chatterGap;
      this.nextEncouragement=this.time+voices.encouragementGap;
      if(name==='launch'){this.encouragementIndex=0;this.enqueue('computer-ready',2);this.enqueue('dog-bark',1);}
      if(name==='continue'){this.enqueue('computer-resumed',2);this.enqueue('dog-bone',1);}
      if(name==='respawn'){this.enqueue('computer-lost',3);this.enqueue('computer-resumed',2);}
      if(name==='defeat')this.enqueue('computer-lost',3);
    } else if(name==='checkpoint') {
      // A checkpoint should be heard promptly, even during a hero quip.
      if(this.active?.priority===0)this.clear();
      this.enqueue('computer-checkpoint',2);this.nextChatter=this.time+voices.chatterGap;
    } else {
      const id=name==='hit'?(state?.hull<=voices.lowHull?'dog-yikes':'dog-whoops')
        :name==='enemyKill'?'dog-get-em':name==='powerup'?'dog-yee-haw'
        :name==='pickup'?'computer-good-boy':name==='treat'?'computer-treat'
        :name==='nearMiss'?'dog-close-one':null;
      if(id)this.enqueue(id);
    }
  }
  drain() {
    if(!this.enabled||this.paused||!this.audio||this.active||this.time<this.nextAvailable)return;
    this.queue=this.queue.filter(entry=>entry.expires>=this.time);
    const index=this.queue.findIndex(entry=>entry.ready<=this.time);if(index<0)return;
    this.active=this.queue.splice(index,1)[0];const generation=++this.generation;
    this.audio.src=voices.folder+voices.clips[this.active.id];
    this.audio.volume=Math.min(1,Math.max(0,music.master*voices.volume));
    this.onSpeaking(true);
    try {Promise.resolve(this.audio.play()).catch(()=>{if(generation===this.generation)this.finish();});}
    catch {if(generation===this.generation)this.finish();}
  }
  update(state,dt) {
    if(this.audio)this.audio.volume=Math.min(1,Math.max(0,music.master*voices.volume));
    if(this.paused)return;this.time+=dt;
    if(state.mode==='title'){if(this.active||this.queue.length)this.clear();return;}
    this.drain();
    if(this.enabled&&state.mode==='playing'&&race.recovery(state.distance)&&state.hull>voices.lowHull&&this.time>=this.nextEncouragement&&!this.active&&!this.queue.length&&this.time>=this.nextChatter){
      this.enqueue(voices.encouragement[this.encouragementIndex++%voices.encouragement.length]);
      this.nextEncouragement=this.time+voices.encouragementGap;
    }
  }
  pause() {this.paused=true;this.audio?.pause();this.onSpeaking(false);}
  resume() {
    this.paused=false;
    if(this.enabled&&this.active&&this.audio){
      const generation=this.generation;this.onSpeaking(true);
      try {Promise.resolve(this.audio.play()).catch(()=>{if(generation===this.generation)this.finish();});}
      catch {if(generation===this.generation)this.finish();}
    }
  }
  dispose() {this.enabled=false;this.clear();}
}
namespace.VoiceEngine=VoiceEngine;
})(window.Starhound);
