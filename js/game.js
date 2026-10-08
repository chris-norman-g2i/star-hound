(function(namespace){
'use strict';
const THREE=namespace.THREE;
const {race,math,gfx,ui,tuning}=namespace.settings;
const {SoundEngine,FlightScene,FlightSystems,FlightInterface,WaveCheckpoints,FlightControls,RoutePlan}=namespace;
let initialized=false;
function init(){
  if(initialized)return;
  if(!THREE){document.getElementById('load-error').classList.remove('hidden');return;}
  initialized=true;
  const sound=new SoundEngine(),view=new FlightInterface(),checkpoints=new WaveCheckpoints(),route=new RoutePlan();
  let scene;
  try{scene=new FlightScene(document.getElementById('world'),route);}
  catch(error){document.getElementById('load-error').classList.remove('hidden');throw error;}
  const systems=new FlightSystems(scene,sound,route),clock=new THREE.Clock(),keys=new Set();
  let state=race.state(tuning.seed),titleTime=0;
  // Start/update coordinate resources. Rules, arithmetic and authored behavior stay in settings.
  async function start(wave=1){
    tuning.load();systems.reset();state=race.state(tuning.seed);
    if(wave>1)race.jump(state,wave);
    state.mode='playing';state.checkpointWave=state.wave;scene.applyTuning();checkpoints.begin(state);
    keys.clear();document.activeElement?.blur();await sound.resume();await sound.unlock();view.audio(sound);sound.beginFlight(state);sound.play('launch');
    sound.voice?.('launch',state);
  }
  async function continueCheckpoint(){
    const restored=checkpoints.resume();if(!restored)return;
    systems.reset();state=restored;keys.clear();document.activeElement?.blur();scene.applyTuning();
    await sound.resume();await sound.unlock();view.audio(sound);sound.beginFlight(state);sound.play('launch');
    sound.voice?.('continue',state);
  }
  function update(){
    requestAnimationFrame(update);const dt=math.delta(clock.getDelta());titleTime=gfx.titleTime(titleTime,dt);
    if(state.mode==='playing'||state.mode==='crashing'){
      systems.step(state,dt,keys);const before=state;
      state=checkpoints.afterStep(state,systems);
      if(state!==before)sound.voice('respawn',state);
      else if(state.mode==='defeat'&&view.lastMode!=='defeat')sound.voice('defeat',state);
    }
    sound.update(state,dt);view.music(sound);
    scene.render(state,state.mode==='paused'?0:dt,titleTime,systems.entities,systems.bullets);
    view.update(state,titleTime,state.mode==='paused'?0:dt,scene.playerHudAnchor());view.checkpoint(checkpoints);
  }
  async function pause(){
    if(state.mode==='playing'||state.mode==='crashing'){state.resumeMode=state.mode;state.mode='paused';keys.clear();await sound.pause();}
    else if(state.mode==='paused'){state.mode=state.resumeMode||'playing';keys.clear();document.activeElement?.blur();await sound.resume();}
  }
  async function home(){sound.clearVoices?.();systems.reset();state=race.state(tuning.seed);keys.clear();await sound.resume();}
  async function toggleAudio(){await sound.toggle();view.audio(sound);}
  function nextTrack(){if(state.mode==='playing'){sound.nextTrack(state);}}
  const controls=new FlightControls({
    state:()=>state,playNow:start,
    opened:()=>{keys.clear();},
    closed:()=>{keys.clear();},
    applied:()=>{scene.applyTuning();},
  });
  const requestNew=()=>{if(checkpoints.current)view.confirmNew(checkpoints);else start();};
  view.nodes.launch.addEventListener('click',requestNew);view.nodes.restart.addEventListener('click',requestNew);
  view.nodes['checkpoint-resume'].addEventListener('click',continueCheckpoint);
  view.nodes['confirm-new'].addEventListener('click',()=>{view.nodes['new-run-dialog'].close();start();});
  view.nodes['resume-checkpoint-dialog'].addEventListener('click',()=>{view.nodes['new-run-dialog'].close();continueCheckpoint();});
  view.nodes.resume.addEventListener('click',pause);
  for(const id of ['home','results-home'])view.nodes[id].addEventListener('click',home);
  for(const channel of ['music','effects','voice']){
    const input=document.getElementById(channel+'-volume');input.value=sound.volumes[channel];
    input.addEventListener('input',()=>{sound.setVolume(channel,Number(input.value));view.audio(sound);});
  }
  view.audio(sound);
  view.nodes['audio-button'].addEventListener('click',toggleAudio);view.nodes['pause-button'].addEventListener('click',pause);
  view.nodes['flight-manual'].addEventListener('click',()=>view.showManual());view.nodes['close-manual'].addEventListener('click',()=>view.hideManual());
  view.nodes['options-button'].addEventListener('click',()=>view.nodes['options-dialog'].showModal());
  view.nodes['close-options'].addEventListener('click',()=>view.nodes['options-dialog'].close());
  // Retry the startup playback request if the browser requires a user gesture.
  const unlockAudio=()=>{if(!sound.enabled)sound.unlock();};
  window.addEventListener('pointerdown',unlockAudio,{capture:true});
  window.addEventListener('keydown',event=>{if(!event.repeat)unlockAudio();},{capture:true});
  window.addEventListener('keydown',event=>{
    if(view.isDialogOpen())return;
    if(['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))return;
    if(view.navigateMenu(event,state))return;
    if(event.target.tagName==='BUTTON'&&(event.code==='Space'||event.code==='Enter'))return;
    if(ui.keys.includes(event.code)&&state.mode==='playing'){event.preventDefault();keys.add(event.code);}
    if(event.repeat)return;
    if(event.code==='Escape')pause();
    if(namespace.settings.music.debug.enabled&&event.code===namespace.settings.music.debug.key){event.preventDefault();sound.previewNext(state);}
    if(event.code==='KeyM')nextTrack();
    if(event.code==='Enter'&&state.mode==='title')requestNew();
  });
  window.addEventListener('keyup',event=>keys.delete(event.code));window.addEventListener('resize',()=>scene.resize());
  window.addEventListener('blur',()=>{keys.clear();if(state.mode==='playing'||state.mode==='crashing')pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&(state.mode==='playing'||state.mode==='crashing'))pause();});
  window.addEventListener('pagehide',()=>sound.dispose());
  update();
  sound.unlock();
}
namespace.Game=Object.freeze({init});
})(window.Starhound);
