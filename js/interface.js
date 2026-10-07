(function(namespace){
'use strict';
const {ui,math,race}=namespace.settings;
class FlightInterface {
  constructor(){
    this.nodes={};for(const id of ['title-screen','hud','overlay','audio-button','sector','sector-name','wave','wave-dots','race-fill','hull-fill','hull-text','lives-text','speed','speed-fill','effect-label','heat-fill','cannon-name','weapon-status','upgrade-status','announcement','pickup-toast','overlay-eyebrow','overlay-title','overlay-copy','run-stats','resume','restart','home','launch','manual','flight-manual','close-manual','pause-button','checkpoint-resume','tune-button','checkpoint-note','new-run-dialog','new-run-note','confirm-new','cancel-new'])this.nodes[id]=document.getElementById(id);
    for(let i=0;i<race.wavesPerSector;i++)this.nodes['wave-dots'].append(document.createElement('i'));
    this.lastMode=null;this.lastCheckpoint='';this.hangar=new namespace.HangarTitle();
  }
  audio(enabled){this.nodes['audio-button'].textContent=enabled?'SOUND ON':'SOUND OFF';this.nodes['audio-button'].setAttribute('aria-label',enabled?'Mute sound':'Enable sound');}
  checkpoint(store){
    const n=this.nodes,c=store.current;const label=store.warning||(c?`CHECKPOINT ${c.wave} · ${c.lives} LIVES · NEW FLIGHT CLEARS PROGRESS`:'3 LIVES · ENDLESS WAVES · NO CHECKPOINT YET');
    const signature=JSON.stringify([label,c?.wave,c?.lives]);
    if(this.lastCheckpoint===signature)return;this.lastCheckpoint=signature;
    n['checkpoint-resume'].disabled=!c;
    n['checkpoint-resume'].setAttribute('aria-label',c?`Continue from checkpoint at wave ${c.wave}`:'Continue unavailable: no checkpoint');
    n['checkpoint-note'].textContent=label;
  }
  confirmNew(store,launch){
    if(!store.current){launch();return;}
    this.nodes['new-run-note'].textContent=`Starting a new run clears your wave ${store.current.wave} checkpoint progress.`;
    this.pendingLaunch=launch;this.nodes['new-run-dialog'].showModal();this.nodes['cancel-new'].focus();
  }
  update(s,titleTime=0){
    this.hangar.update(titleTime,s.mode==='title');
    if(this.lastMode!==s.mode){this.lastMode=s.mode;this.mode(s);}
    const n=this.nodes;n.sector.textContent=ui.sectorText(s);n['sector-name'].textContent=race.sectorName(s.sector);n.wave.textContent=math.pad(s.wave);
    Array.from(n['wave-dots'].children).forEach((dot,index)=>dot.classList.toggle('active',index<=race.waveInSector(s.wave)));
    n['race-fill'].style.width=ui.progressText(s);n['hull-fill'].style.width=math.percent(s.hull);n['hull-text'].textContent=math.percent(s.hull);
    n['lives-text'].textContent=`${s.lives} LIVES · CHECKPOINT ${s.checkpointWave}`;n.speed.textContent=ui.speedText(s);
    n['speed-fill'].style.width=ui.chargeText(s);n['effect-label'].textContent=ui.effect(s);
    n['heat-fill'].style.width=math.percent(s.weapon.heat);n['cannon-name'].textContent=ui.cannonText(s.weapon);
    n['weapon-status'].textContent=ui.heatText(s.weapon);n['upgrade-status'].textContent=ui.upgrades(s.weapon);
    n.announcement.textContent=s.notice;n.announcement.classList.toggle('visible',s.noticeTime>0);
    n['pickup-toast'].textContent=s.toast;n['pickup-toast'].classList.toggle('visible',s.toastTime>0);
  }
  mode(s){
    const n=this.nodes;document.body.classList.toggle('playing',s.mode!=='title');
    n['title-screen'].classList.toggle('hidden',s.mode!=='title');n.hud.classList.toggle('hidden',s.mode==='title');
    n.overlay.classList.toggle('hidden',s.mode==='playing'||s.mode==='title');
    if(s.mode==='title')n.launch.focus();
    if(s.mode==='paused'){n['overlay-eyebrow'].textContent='FLIGHT PAUSED';n['overlay-title'].innerHTML='CATCH YOUR<br> BREATH.';n['overlay-copy'].textContent=`${s.lives} lives left · Wave ${s.checkpointWave} checkpoint. Return to the hangar to continue from there. A new flight clears this checkpoint.`;n.resume.classList.remove('hidden');n.resume.focus();}
    if(s.mode==='defeat'){n['overlay-eyebrow'].textContent='ALL LIVES LOST';n['overlay-title'].innerHTML='EVERY DOG HAS<br> ANOTHER DAY.';n['overlay-copy'].textContent=`You reached wave ${s.bestWave}. Your run has ended and its checkpoint is cleared. Try another seed, collect repairs, and let your cannon cool.`;n.resume.classList.add('hidden');n.restart.focus();}
    n['run-stats'].innerHTML=`<span><strong>${ui.time(s.elapsed)}</strong><small>FLIGHT TIME</small></span><span><strong>${s.kills}</strong><small>TAKEDOWNS</small></span><span><strong>${ui.finalScore(s)}</strong><small>POINTS</small></span>`;
  }
  navigateTitle(event,s){
    if(s.mode!=='title'||!['ArrowUp','ArrowDown'].includes(event.code))return false;
    const choices=['launch','checkpoint-resume','flight-manual','tune-button'].map(id=>this.nodes[id]).filter(node=>!node.disabled);
    const index=choices.indexOf(document.activeElement);choices[ui.titleMenuIndex(index,choices.length,event.code)].focus();event.preventDefault();return true;
  }
  showManual(){this.nodes.manual.showModal();}
  hideManual(){this.nodes.manual.close();}
  isManualOpen(){return this.nodes.manual.open;}
  isDialogOpen(){return this.nodes.manual.open||this.nodes['new-run-dialog'].open;}
}
namespace.FlightInterface=FlightInterface;
})(window.Starhound);
