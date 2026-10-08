(function(namespace){
'use strict';
const {checkpoint,race}=namespace.settings;

/** Persistence is automatic at wave boundaries; storage failures retain a session checkpoint. */
class WaveCheckpoints {
  constructor(){
    this.current=null;this.warning='';
    try {const text=window.localStorage.getItem(checkpoint.key);if(text){const value=JSON.parse(text);if(checkpoint.valid(value))this.current=value;else this.warning='An incompatible checkpoint was ignored.';}}
    catch(error){this.warning=error instanceof SyntaxError?'A damaged checkpoint was ignored.':'This browser cannot retain checkpoints after closing. Checkpoints still work this session.';}
  }
  write(value){
    this.current=value;
    try{if(value)window.localStorage.setItem(checkpoint.key,JSON.stringify(value));else window.localStorage.removeItem(checkpoint.key);this.warning='';}
    catch{this.warning='This browser cannot retain checkpoints after closing. Checkpoints still work this session.';}
  }
  begin(s){this.write(checkpoint.capture(s));}
  resume(){return this.current?checkpoint.restore(this.current):null;}
  afterStep(s,systems){
    if(s.mode==='defeat'){this.write(null);return s;}
    if(s.checkpointPending){s.checkpointPending=false;s.checkpointWave=s.wave;this.write(checkpoint.capture(s));}
    if(s.respawnPending){
      systems.reset();const restored=checkpoint.restore(this.current,{lives:s.lives,elapsed:s.elapsed,bestWave:s.bestWave});
      restored.notice=`LIFE LOST · CHECKPOINT ${restored.wave} · ${restored.lives} LIVES`;
      this.write(checkpoint.capture(restored));return restored;
    }
    return s;
  }
  jump(s,wave,systems){systems.reset();race.jump(s,wave);s.checkpointWave=s.wave;this.begin(s);}
}
namespace.WaveCheckpoints=WaveCheckpoints;
})(window.Starhound);
