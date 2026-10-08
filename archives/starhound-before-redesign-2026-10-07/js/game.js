(function(namespace){
'use strict';
const THREE=namespace.THREE;
const {race,math,gfx,ui,tuning}=namespace.settings;
const {SoundEngine,FlightScene,FlightSystems,FlightInterface,WaveCheckpoints,FlightControls}=namespace;
let initialized=false;
function init(){
  if(initialized)return;
  if(!THREE){document.getElementById('load-error').classList.remove('hidden');return;}
  initialized=true;
  const sound=new SoundEngine(),view=new FlightInterface(),checkpoints=new WaveCheckpoints();
  let scene;
  try{scene=new FlightScene(document.getElementById('world'));}
  catch(error){document.getElementById('load-error').classList.remove('hidden');throw error;}
  const systems=new FlightSystems(scene,sound),clock=new THREE.Clock(),keys=new Set();
  let state=race.state(tuning.seed),titleTime=0;
  // Start/update coordinate resources. Rules, arithmetic and authored behavior stay in settings.
  async function start(){
    systems.reset();state=race.state(tuning.seed);state.mode='playing';checkpoints.begin(state);
    keys.clear();document.activeElement?.blur();await sound.resume();await sound.unlock();view.audio(sound.enabled);sound.play('launch');
    sound.voice?.('launch',state);
  }
  async function continueCheckpoint(){
    const restored=checkpoints.resume();if(!restored)return;
    systems.reset();state=restored;keys.clear();document.activeElement?.blur();scene.applyTuning();
    await sound.resume();await sound.unlock();view.audio(sound.enabled);sound.play('launch');
    sound.voice?.('continue',state);
  }
  function update(){
    requestAnimationFrame(update);const dt=math.delta(clock.getDelta());titleTime=gfx.titleTime(titleTime,dt);
    if(state.mode==='playing'){
      systems.step(state,dt,keys);const respawning=state.respawnPending,defeated=state.mode==='defeat';
      state=checkpoints.afterStep(state,systems);
      if(respawning)sound.voice?.('respawn',state);else if(defeated)sound.voice?.('defeat',state);
    }
    sound.update(state,dt);view.update(state,titleTime);view.checkpoint(checkpoints);
    scene.render(state,state.mode==='paused'?0:dt,titleTime,systems.entities,systems.bullets);
  }
  async function pause(){
    if(state.mode==='playing'){state.mode='paused';keys.clear();await sound.pause();}
    else if(state.mode==='paused'){state.mode='playing';keys.clear();document.activeElement?.blur();await sound.resume();}
  }
  async function home(){sound.clearVoices?.();systems.reset();state=race.state(tuning.seed);keys.clear();await sound.resume();}
  async function toggleAudio(){await sound.toggle();view.audio(sound.enabled);}
  function jump(wave){
    if(state.mode==='title'||state.mode==='defeat'){controls.status.textContent='Launch or resume a run before jumping to a wave.';return;}
    const mode=state.mode;checkpoints.jump(state,wave,systems);state.mode=mode;keys.clear();
    controls.status.textContent=`Checkpoint moved to wave ${state.wave}.`;
  }
  const controls=new FlightControls({
    state:()=>state,jump,
    opened:()=>{keys.clear();if(state.mode==='playing')pause();},
    closed:()=>{keys.clear();},
    applied:()=>{scene.applyTuning();if(state.mode==='playing'||state.mode==='paused')jump(state.wave);},
  });
  const requestNew=()=>view.confirmNew(checkpoints,start);
  view.nodes.launch.addEventListener('click',requestNew);view.nodes.restart.addEventListener('click',requestNew);
  view.nodes['checkpoint-resume'].addEventListener('click',continueCheckpoint);
  view.nodes['confirm-new'].addEventListener('click',()=>{view.nodes['new-run-dialog'].close();view.pendingLaunch?.();view.pendingLaunch=null;});
  view.nodes['cancel-new'].addEventListener('click',()=>{view.nodes['new-run-dialog'].close();view.pendingLaunch=null;});
  view.nodes.resume.addEventListener('click',pause);view.nodes.home.addEventListener('click',home);
  view.nodes['audio-button'].addEventListener('click',toggleAudio);view.nodes['pause-button'].addEventListener('click',pause);
  view.nodes['flight-manual'].addEventListener('click',()=>view.showManual());view.nodes['close-manual'].addEventListener('click',()=>view.hideManual());
  window.addEventListener('keydown',event=>{
    if(view.isDialogOpen())return;
    if(['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))return;
    if(controls.handleKey(event))return;
    if(view.navigateTitle(event,state))return;
    if(event.target.tagName==='BUTTON'&&(event.code==='Space'||event.code==='Enter'))return;
    if(ui.keys.includes(event.code)&&state.mode==='playing'){event.preventDefault();keys.add(event.code);}
    if(event.repeat)return;
    if(event.code==='Escape'||event.code==='KeyP')pause();
    if(event.code==='KeyM')toggleAudio();
    if(event.code==='Enter'&&state.mode==='title')requestNew();
  });
  window.addEventListener('keyup',event=>keys.delete(event.code));window.addEventListener('resize',()=>scene.resize());
  window.addEventListener('blur',()=>{keys.clear();if(state.mode==='playing')pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.mode==='playing')pause();});
  window.addEventListener('pagehide',()=>sound.dispose());
  update();
}
namespace.Game=Object.freeze({init});
})(window.Starhound);
