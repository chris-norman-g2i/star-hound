(function(namespace){
'use strict';
const {ui,math,race}=namespace.settings;
class FlightInterface {
  constructor(){
    this.nodes={};for(const id of ['title-screen','hud','overlay','audio-button','sector','sector-name','wave','wave-dots','race-fill','hull-fill','hull-text','lives-text','speed','speed-fill','effect-label','heat-fill','cannon-name','weapon-status','upgrade-status','announcement','pickup-toast','overlay-eyebrow','overlay-title','overlay-copy','run-stats','resume','restart','home','launch','manual','flight-manual','close-manual','pause-button','checkpoint-resume','checkpoint-note','new-run-dialog','new-run-note','confirm-new','cancel-new'])this.nodes[id]=document.getElementById(id);
    for(let i=0;i<race.wavesPerSector;i++)this.nodes['wave-dots'].append(document.createElement('i'));
    this.lastMode=null;this.lastCheckpoint='';
  }
  audio(enabled){this.nodes['audio-button'].textContent=enabled?'SOUND ON':'SOUND OFF';this.nodes['audio-button'].setAttribute('aria-label',enabled?'Mute sound':'Enable sound');}
  checkpoint(store){
    const n=this.nodes,c=store.current;n['checkpoint-resume'].classList.toggle('hidden',!c);
    if(c)n['checkpoint-resume'].textContent=`RESUME CHECKPOINT · WAVE ${c.wave}`;
    n['checkpoint-note'].textContent=store.warning||(c?`${c.lives} lives · seed ${c.seed}. New run clears this checkpoint.`:'Three lives. Wave starts become automatic checkpoints.');
  }
  confirmNew(store,launch){
    if(!store.current){launch();return;}
    this.nodes['new-run-note'].textContent=`Starting a new run clears your wave ${store.current.wave} checkpoint progress.`;
    this.pendingLaunch=launch;this.nodes['new-run-dialog'].showModal();this.nodes['cancel-new'].focus();
  }
  update(s){
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
    if(s.mode==='paused'){n['overlay-eyebrow'].textContent='FLIGHT PAUSED';n['overlay-title'].innerHTML='CATCH YOUR<br>BREATH.';n['overlay-copy'].textContent=`${s.lives} lives remaining. Return to the hangar to resume from wave ${s.checkpointWave}. New run clears that checkpoint.`;n.resume.classList.remove('hidden');n.resume.focus();}
    if(s.mode==='defeat'){n['overlay-eyebrow'].textContent='ALL LIVES LOST';n['overlay-title'].innerHTML='EVERY DOG HAS<br>ANOTHER DAY.';n['overlay-copy'].textContent=`You reached wave ${s.bestWave}. Your run has ended and its checkpoint is cleared. Try another seed, collect repairs, and let your cannon cool.`;n.resume.classList.add('hidden');n.restart.focus();}
    n['run-stats'].innerHTML=`<span>${ui.time(s.elapsed)} FLIGHT</span><span>${s.kills} TAKEDOWNS</span><span>${ui.finalScore(s)} PTS</span>`;
  }
  showManual(){this.nodes.manual.showModal();}
  hideManual(){this.nodes.manual.close();}
  isManualOpen(){return this.nodes.manual.open;}
  isDialogOpen(){return this.nodes.manual.open||this.nodes['new-run-dialog'].open;}
}
namespace.FlightInterface=FlightInterface;
})(window.Starhound);
