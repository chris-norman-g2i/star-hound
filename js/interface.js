(function(namespace){
'use strict';
const {ui,math,race}=namespace.settings;
class FlightInterface {
  constructor(){
    this.nodes={};for(const id of ['title-screen','hud','overlay','audio-button','sector','sector-name','wave','wave-dots','hull-fill','hull-text','lives-text','speed','speed-fill','effect-label','heat-fill','cannon-name','weapon-status','upgrade-status','announcement','pickup-toast','overlay-eyebrow','overlay-title','overlay-copy','run-stats','resume','restart','home','launch','manual','flight-manual','close-manual','pause-button','checkpoint-resume','tune-button','checkpoint-note','new-run-dialog','new-run-note','confirm-new','resume-checkpoint-dialog','checkpoint-success','track-name','music-debug','music-debug-name','music-debug-status','tuning-dialog','options-button','options-dialog','close-options'])this.nodes[id]=document.getElementById(id);
    for(const id of ['pause-menu','flight-results','results-home'])this.nodes[id]=document.getElementById(id);
    for(let i=0;i<race.wavesPerSector;i++)this.nodes['wave-dots'].append(document.createElement('i'));
    // Native dialog backdrops target the dialog itself. Check coordinates so padding,
    // form controls, and drags that started inside never count as outside clicks.
    for(const dialog of document.querySelectorAll('dialog')){
      let pressedOutside=false;
      const outside=event=>{const r=dialog.getBoundingClientRect();return event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom;};
      dialog.addEventListener('pointerdown',event=>{pressedOutside=event.target===dialog&&outside(event);});
      dialog.addEventListener('click',event=>{if(pressedOutside&&event.target===dialog&&outside(event))dialog.close();pressedOutside=false;});
    }
    this.lastMode=null;this.lastCheckpoint='';this.hangar=new namespace.HangarTitle();
  }
  audio(sound){
    this.nodes['audio-button'].textContent=sound.muted?'UNMUTE ALL':'MUTE ALL';
    for(const channel of ['music','effects','voice'])document.getElementById(channel+'-volume-value').textContent=Math.round(sound.volumes[channel]*100)+'%';
  }
  music(sound){
    const status=sound.musicStatus,n=this.nodes;
    n['track-name'].textContent=status.name;
    n['music-debug'].classList.toggle('hidden',!namespace.settings.music.debug.enabled);
    n['music-debug-name'].textContent=status.name;
    const flags=[status.preview?'PREVIEW':'AUTO'];
    if(status.bpm)flags.push(`${Math.round(status.bpm)} BPM`);
    if(status.locked)flags.push('AUDIO SUSPENDED');
    else if(status.muted)flags.push('MUTED');
    else if(status.paused)flags.push('PAUSED');
    else if(status.finished)flags.push('FINISHED');
    n['music-debug-status'].textContent=flags.join(' · ');
  }
  checkpoint(store){
    const n=this.nodes,c=store.current;const label=store.warning||(c?`CHECKPOINT ${c.wave} · ${c.lives} LIVES · NEW FLIGHT CLEARS PROGRESS`:'3 LIVES · ENDLESS WAVES · NO CHECKPOINT YET');
    const signature=JSON.stringify([label,c?.wave,c?.lives]);
    if(this.lastCheckpoint===signature)return;this.lastCheckpoint=signature;
    n['checkpoint-resume'].disabled=!c;
    n['checkpoint-resume'].setAttribute('aria-label',c?`Continue from checkpoint at wave ${c.wave}`:'Continue unavailable: no checkpoint');
    n['checkpoint-note'].textContent=label;
  }
  confirmNew(store){
    this.nodes['new-run-note'].textContent=`Start a new flight, or resume your wave ${store.current.wave} checkpoint.`;
    this.nodes['new-run-dialog'].showModal();this.nodes['resume-checkpoint-dialog'].focus();
  }
  update(s,titleTime=0){
    this.hangar.update(titleTime,s.mode==='title');
    if(this.lastMode!==s.mode){this.lastMode=s.mode;this.mode(s);}
    const n=this.nodes;n.sector.textContent=ui.sectorText(s);n['sector-name'].textContent=race.sectorName(s.sector);n.wave.textContent=math.pad(s.wave);
    Array.from(n['wave-dots'].children).forEach((dot,index)=>dot.classList.toggle('active',index<=race.waveInSector(s.wave)));
    n['hull-fill'].style.width=math.percent(s.hull);n['hull-text'].textContent=math.percent(s.hull);
    n['lives-text'].textContent=`${s.lives} LIVES · CHECKPOINT ${s.checkpointWave}`;n.speed.textContent=ui.speedText(s);
    n['speed-fill'].style.width=ui.chargeText(s);n['effect-label'].textContent=ui.effect(s);
    n['checkpoint-success'].classList.toggle('visible',s.checkpointCelebration>0&&s.mode==='playing');
    n['heat-fill'].style.width=math.percent(s.weapon.heat);n['cannon-name'].textContent=ui.cannonText(s.weapon);
    n['weapon-status'].textContent=ui.heatText(s.weapon);n['upgrade-status'].textContent=ui.upgrades(s.weapon);
    n.announcement.textContent=s.notice;n.announcement.classList.toggle('visible',s.noticeTime>0);
    n['pickup-toast'].textContent=s.toast;n['pickup-toast'].classList.toggle('visible',s.toastTime>0);
  }
  mode(s){
    const n=this.nodes;document.body.classList.toggle('playing',s.mode!=='title');
    n['title-screen'].classList.toggle('hidden',s.mode!=='title');n.hud.classList.toggle('hidden',s.mode==='title');
    const menu=ui.menus[s.mode];
    n.overlay.classList.toggle('hidden',!menu?.panel);n.overlay.dataset.mode=s.mode;
    n['pause-button'].disabled=Boolean(menu?.panel);
    for(const config of Object.values(ui.menus))if(config.panel)n[config.panel].classList.toggle('hidden',config!==menu);
    if(menu?.panel)n.overlay.setAttribute('aria-label',menu.label);
    if(s.mode==='defeat'){
      n['overlay-copy'].textContent=`You reached wave ${s.bestWave}. Your run has ended and its checkpoint is cleared. Try another seed, collect repairs, and let your cannon cool.`;
      n['run-stats'].innerHTML=`<span><strong>${ui.time(s.elapsed)}</strong><small>FLIGHT TIME</small></span><span><strong>${s.kills}</strong><small>TAKEDOWNS</small></span><span><strong>${ui.finalScore(s)}</strong><small>POINTS</small></span>`;
    }
    if(menu)n[menu.actions[ui.menuKeys.firstIndex]].focus();
  }
  navigateMenu(event,s){
    const menu=ui.menus[s.mode],keys=ui.menuKeys;
    if(!menu)return false;
    const isTab=event.code===keys.tab&&menu.trapFocus;
    if(!isTab&&event.code!==keys.previous&&event.code!==keys.next)return false;
    const choices=menu.actions.map(id=>this.nodes[id]).filter(node=>!node.disabled);
    const direction=isTab?(event.shiftKey?keys.previous:keys.next):event.code;
    const index=choices.indexOf(document.activeElement);choices[ui.menuIndex(index,choices.length,direction)].focus();event.preventDefault();return true;
  }
  showManual(){this.nodes.manual.showModal();}
  hideManual(){this.nodes.manual.close();}
  isManualOpen(){return this.nodes.manual.open;}
  isDialogOpen(){return this.nodes.manual.open||this.nodes['new-run-dialog'].open||this.nodes['tuning-dialog'].open||this.nodes['options-dialog'].open;}
}
namespace.FlightInterface=FlightInterface;
})(window.Starhound);
