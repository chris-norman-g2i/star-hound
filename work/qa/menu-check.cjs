const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8'),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
class Node{
 constructor(id,tag='DIV'){this.id=id;this.tagName=tag;this.children=[];this.listeners={};this.style={setProperty(name,value){this[name]=value}};this.dataset={};this.open=false;this.value='';this.classes=new Set();this.classList={contains:c=>this.classes.has(c),add:c=>this.classes.add(c),remove:c=>this.classes.delete(c),toggle:(c,on)=>on?this.classes.add(c):this.classes.delete(c)};}
 getBoundingClientRect(){return {bottom:80};}getContext(){return null;}querySelectorAll(){return [];}
 append(n){this.children.push(n);}replaceChildren(){this.children=[];}setAttribute(){}addEventListener(e,f){(this.listeners[e]??=[]).push(f);}focus(){document.activeElement=this;}blur(){document.activeElement=null;}showModal(){assert(!this.open);this.open=true;}close(){this.open=false;this.emit('close');}checkValidity(){return this.type!=='number'||this.value!==''&&Number.isFinite(Number(this.value))&&Number(this.value)>=Number(this.min)&&Number(this.value)<=Number(this.max);}reportValidity(){return this.checkValidity();}select(){this.selected=true;}
 emit(type,data={}){for(const f of this.listeners[type]||[])f({target:this,...data});}
}
const nodes=Object.fromEntries(ids.map(id=>[id,new Node(id,html.includes('<button id="'+id+'"')?'BUTTON':'DIV')]));
const document={getElementById:id=>{assert(nodes[id],id);return nodes[id];},createElement:t=>new Node('',t.toUpperCase()),activeElement:null,body:new Node('body'),addEventListener(){},hidden:false,querySelectorAll:selector=>selector==='dialog'?['manual','new-run-dialog','tuning-dialog','options-dialog'].map(id=>nodes[id]):[]};
let frame;const disk=new Map(),handlers={};const window={innerWidth:1280,innerHeight:800,devicePixelRatio:1,localStorage:{getItem:k=>disk.get(k),setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)},addEventListener:(k,f)=>(handlers[k]??=[]).push(f)};
const ctx=vm.createContext({window,document,console,navigator:{},requestAnimationFrame:f=>{frame=f},Math,JSON,Number,Float32Array,Uint8Array});
function load(f){vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f});}
load('settings');load('route');load('music');const ns=window.Starhound;let rendered;
ns.THREE={Clock:class{getDelta(){return .025;}}};ns.FlightScene=class{clear(){}burst(){}applyTuning(){}resize(){}playerHudAnchor(){return {x:640,y:400,diameter:240};}render(s){rendered=s;}};
ns.SoundEngine=class{
 constructor(){this.enabled=false;this.unlockCalls=0;this.muted=false;this.volumes={music:1,effects:1,voice:1};this.director=new ns.MusicDirector();window.testSound=this;}
 async resume(){}async pause(){}async unlock(){this.unlockCalls++;this.enabled=true;}async toggle(){this.muted=!this.muted;}
 update(s){this.director.update(s);}beginFlight(s){this.director.beginFlight(s);}nextTrack(s){this.director.nextGameplay(s);}
 async previewNext(s){this.director.nextPreview(s);await this.unlock();}setVolume(channel,value){this.volumes[channel]=value;}
 get musicStatus(){const r=this.director.request;return {name:ns.settings.music.tracks[r?.id]?.name||'Silence',bpm:r?.bpm,preview:r?.preview,locked:!this.enabled};}
 play(){}voice(){}ring(){}dispose(){}
};
for(const f of ['systems','hangar','interface','checkpoints','controls','game'])load(f);ns.Game.init();assert.equal(window.testSound.unlockCalls,1);assert.equal(rendered.mode,'title');assert.equal(nodes['lives-text'].textContent,'3');assert.equal(nodes['checkpoint-resume'].disabled,true);
const key=(code,target=document.body)=>{for(const f of handlers.keydown)f({code,target,repeat:false,preventDefault(){}});};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 key('ArrowDown');assert.equal(document.activeElement,nodes['flight-manual']);key('ArrowDown');assert.equal(document.activeElement,nodes['options-button']);key('ArrowUp');assert.equal(document.activeElement,nodes['flight-manual']);key('ArrowUp');assert.equal(document.activeElement,nodes.launch);
 const standaloneView=new ns.FlightInterface(),memoryOnly={warning:'Storage blocked',current:null};standaloneView.checkpoint(memoryOnly);assert(nodes['checkpoint-resume'].disabled);memoryOnly.current={wave:1,lives:3};standaloneView.checkpoint(memoryOnly);assert(!nodes['checkpoint-resume'].disabled);
 nodes.launch.emit('click');await flush();frame();assert.equal(rendered.mode,'playing');assert.equal(rendered.lives,3);assert.equal(nodes['checkpoint-resume'].disabled,false);
 const before=rendered.player.x;key('ArrowRight');for(let i=0;i<20;i++)frame();assert(rendered.player.x>before);for(const f of handlers.keyup)f({code:'ArrowRight'});
 key('Space');for(let i=0;i<30;i++)frame();assert(rendered.weapon.shots>0);for(const f of handlers.keyup)f({code:'Space'});
 key('KeyP');await flush();frame();assert.equal(rendered.mode,'playing');assert(nodes['music-debug-status'].textContent.includes('PREVIEW'));key('Escape');await flush();frame();assert.equal(rendered.mode,'paused');nodes.home.emit('click');await flush();frame();assert.equal(rendered.mode,'title');
 nodes.launch.emit('click');assert(nodes['new-run-dialog'].open);nodes['new-run-dialog'].close();assert(!nodes['new-run-dialog'].open);assert(disk.size===1);
 nodes['checkpoint-resume'].emit('click');await flush();frame();assert.equal(rendered.mode,'playing');assert.equal(rendered.distance<3,true);
 nodes['tune-button'].emit('click');assert(!nodes['tuning-dialog'].open);
 nodes['pause-button'].emit('click');await flush();frame();nodes.home.emit('click');await flush();frame();
 nodes['tune-button'].emit('click');assert(nodes['tuning-dialog'].open);assert.equal(rendered.mode,'title');
 const waveInput=nodes['tuning-fields'].children[0].children[0];waveInput.value='1250';nodes['seed-input'].value='TEST-MENU';nodes['apply-tuning'].emit('click');assert.equal(ns.settings.race.waveLength,1250);assert.equal(rendered.mode,'title');
 nodes['export-settings'].emit('click');await flush();assert(nodes['settings-export'].selected);assert(nodes['settings-export'].value.includes('function configure'));assert(nodes['tuning-status'].textContent.includes('Clipboard access unavailable'));
 nodes['jump-wave'].value='2';nodes['jump-button'].emit('click');await flush();frame();assert(!nodes['tuning-dialog'].open);assert.equal(rendered.mode,'playing');assert.equal(rendered.wave,2);assert.equal(rendered.seed,'TEST-MENU');
 nodes['pause-button'].emit('click');await flush();frame();
 assert(!nodes['pause-menu'].classes.has('hidden'));assert(nodes['flight-results'].classes.has('hidden'));
 assert.equal(document.activeElement,nodes.resume);key('ArrowDown');assert.equal(document.activeElement,nodes.home);key('ArrowDown');assert.equal(document.activeElement,nodes.resume);
 nodes.home.emit('click');await flush();frame();nodes.launch.emit('click');assert(nodes['new-run-dialog'].open);nodes['confirm-new'].emit('click');await flush();frame();assert.equal(rendered.wave,1);assert.equal(rendered.seed,'TEST-MENU');assert.equal(rendered.lives,3);
 rendered.mode='defeat';frame();assert(nodes['pause-menu'].classes.has('hidden'));assert(!nodes['flight-results'].classes.has('hidden'));assert.equal(document.activeElement,nodes.restart);
 nodes.restart.emit('click');nodes['confirm-new'].emit('click');await flush();frame();assert.equal(rendered.mode,'playing');
 console.log('Menu/HUD integration passed: launch, steer/fire, pause, hangar, new-run warning/cancel, checkpoint resume, main-menu developer settings, saved overrides, Play Now, clipboard fallback, restart seed.');
 const scripts=[...html.matchAll(/<script src="([^\"]+)"/g)].map(m=>m[1]);for(const path of scripts.filter(p=>p.startsWith('./')))assert(fs.existsSync(path));assert(!html.includes('type="module"'));assert(!html.includes('importmap'));assert(scripts.indexOf('./js/checkpoints.js')<scripts.indexOf('./js/game.js'));console.log('Classic script paths/order and unique HTML IDs passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
