(function(namespace){
'use strict';
const {checkpoint,race,crash}=namespace.settings;

/** Saves wave starts; life loss finishes only after the crash presentation. */
class WaveCheckpoints {
  constructor(){
    this.current=null;this.warning='';
    try{
      const text=window.localStorage.getItem(checkpoint.key);
      if(text){const value=JSON.parse(text);if(checkpoint.valid(value))this.current=value;else if(value!==null)this.warning='An incompatible checkpoint was ignored.';}
      else{const legacy=window.localStorage.getItem(checkpoint.legacyKey);if(legacy){const migrated=checkpoint.migrate(JSON.parse(legacy));if(migrated)this.write(migrated);}}
    }catch(error){this.warning=error instanceof SyntaxError?'A damaged checkpoint was ignored.':'This browser cannot retain checkpoints after closing. Checkpoints still work this session.';}
  }
  write(value){
    this.current=value;
    try{window.localStorage.setItem(checkpoint.key,JSON.stringify(value));this.warning='';}
    catch{this.warning='This browser cannot retain checkpoints after closing. Checkpoints still work this session.';}
  }
  begin(s){this.write(checkpoint.capture(s));}
  resume(){return this.current?checkpoint.restore(this.current):null;}
  afterStep(s,systems){
    if(s.pendingCheckpoint){this.write(s.pendingCheckpoint);s.pendingCheckpoint=null;}
    if(s.mode==='crashing'&&this.current&&this.current.lives!==s.lives){
      this.write(s.lives>0?{...this.current,lives:s.lives}:null);
    }
    if(!crash.complete(s))return s;
    if(s.lives<=0){s.mode='defeat';this.write(null);return s;}
    systems.reset();
    const restored=checkpoint.restore(this.current,{lives:s.lives,elapsed:s.elapsed,bestWave:s.bestWave});
    restored.notice=`LIFE LOST · CHECKPOINT ${restored.wave} · ${restored.lives} LIVES`;
    this.write(checkpoint.capture(restored));return restored;
  }
  jump(s,wave,systems){systems.reset();race.jump(s,wave);s.checkpointWave=s.wave;this.begin(s);}
}
namespace.WaveCheckpoints=WaveCheckpoints;
})(window.Starhound);
