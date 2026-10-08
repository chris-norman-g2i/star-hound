(function (namespace) {
'use strict';
const THREE = namespace.THREE;
const { race, math, gfx, ui } = namespace.settings;
const { SoundEngine, FlightScene, FlightSystems, FlightInterface } = namespace;
let initialized = false;

// Registered entry point; index.html calls init after every classic dependency loads.
function init() {
  if (initialized) return;
  if (!THREE) {
    document.getElementById('load-error').classList.remove('hidden');
    return;
  }
  initialized = true;

// The main pipeline only coordinates the work needed at the current timestep.
// Procedural math and tuning live in the structured objects in settings.js.
const sound = new SoundEngine();
const view = new FlightInterface();
let scene;
try { scene = new FlightScene(document.getElementById('world')); }
catch(error) { document.getElementById('load-error').classList.remove('hidden');throw error; }
const systems = new FlightSystems(scene,sound);
const clock = new THREE.Clock();
const keys = new Set();
let state = race.state();
let titleTime = 0;

async function start() {
  systems.reset();
  state = race.state();
  state.mode = 'playing';
  keys.clear();
  view.nodes.launch.blur();
  await sound.resume();
  await sound.unlock();
  view.audio(sound.enabled);
  sound.update(state);
  sound.play('launch');
}
function update() {
  requestAnimationFrame(update);
  const dt = math.delta(clock.getDelta());
  titleTime = gfx.titleTime(titleTime,dt);
  if(state.mode === 'playing') systems.step(state,dt,keys);
  sound.update(state);
  view.update(state);
  scene.render(state,state.mode==='paused'?0:dt,titleTime,systems.entities,systems.bullets);
}
async function pause() {
  if(state.mode === 'playing') {state.mode='paused';keys.clear();await sound.pause();}
  else if(state.mode === 'paused') {state.mode='playing';keys.clear();await sound.resume();}
}
async function home() {
  systems.reset();state=race.state();keys.clear();await sound.resume();
}
async function toggleAudio() {await sound.toggle();view.audio(sound.enabled);}
view.nodes.launch.addEventListener('click',start);
view.nodes.restart.addEventListener('click',start);
view.nodes.resume.addEventListener('click',pause);
view.nodes.home.addEventListener('click',home);
view.nodes['audio-button'].addEventListener('click',toggleAudio);
view.nodes['pause-button'].addEventListener('click',pause);
view.nodes['flight-manual'].addEventListener('click',()=>view.showManual());
view.nodes['close-manual'].addEventListener('click',()=>view.hideManual());
window.addEventListener('keydown',event=>{
  if(view.isManualOpen())return;
  if(ui.keys.includes(event.code)) {event.preventDefault();keys.add(event.code);}
  if(event.repeat)return;
  if(event.code==='Escape'||event.code==='KeyP')pause();
  if(event.code==='KeyM')toggleAudio();
  if(event.code==='Enter'&&state.mode==='title'&&event.target.tagName!=='BUTTON')start();
});
window.addEventListener('keyup',event=>keys.delete(event.code));
window.addEventListener('resize',()=>scene.resize());
window.addEventListener('blur',()=>{keys.clear();if(state.mode==='playing')pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.mode==='playing')pause();});
window.addEventListener('pagehide',()=>sound.dispose());
update();

}
namespace.Game = Object.freeze({ init });
})(window.Starhound);
