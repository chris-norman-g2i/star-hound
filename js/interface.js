(function(namespace){
'use strict';
const {ui,math,hull}=namespace.settings;
class FlightInterface {
  constructor(){
    this.nodes={};for(const id of ['title-screen','hud','overlay','audio-button','hull-instrument','hull-meter','hull-fill','hull-text','lives','lives-text','speed','speed-charge','speed-fill','ship-heat','pickup-toast','overlay-eyebrow','overlay-title','overlay-copy','run-stats','resume','restart','home','launch','manual','flight-manual','close-manual','pause-button','checkpoint-resume','tune-button','new-run-dialog','new-run-note','confirm-new','resume-checkpoint-dialog','checkpoint-success','music-debug','music-debug-name','music-debug-status','tuning-dialog','options-button','options-dialog','close-options'])this.nodes[id]=document.getElementById(id);
    for(const id of ['pause-menu','flight-results','results-home'])this.nodes[id]=document.getElementById(id);
    this.nodes['tune-button'].classList.toggle('hidden',!ui.developerSettings.visible);
    this.heatFills=Array.from(this.nodes['ship-heat'].querySelectorAll('.heat-fill'));
    for(const selector of ['.heat-track','.heat-fill'])this.nodes['ship-heat'].querySelectorAll(selector).forEach((path,index)=>path.setAttribute('d',ui.heatArcPath(index===0?-1:1)));
    const heat=ui.hud.heat,health=ui.hud.hull;
    for(const [name,color] of Object.entries({normal:heat.paleBlue,warning:heat.orange,critical:heat.red}))this.nodes['ship-heat'].style.setProperty('--'+name,color);
    for(const [name,color] of Object.entries({normal:health.green,warning:health.orange,critical:health.red}))this.nodes['hull-instrument'].style.setProperty('--'+name,color);
    this.hullState=null;this.displayHull=hull.maxIntegrity;this.previousHull=hull.maxIntegrity;this.hullFlashRemaining=0;this.hullPulsePhase=0;
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
    for(const channel of Object.keys(namespace.settings.audio.channels))document.getElementById(channel+'-volume-value').textContent=Math.round(sound.volumes[channel]*100)+'%';
  }
  music(sound){
    const status=sound.musicStatus,n=this.nodes;
    n['music-debug'].classList.toggle('hidden',!namespace.settings.music.debug.enabled);
    n['music-debug-name'].textContent=status.name;
    const flags=[status.preview?'PREVIEW':'AUTO'];
    if(status.bpm)flags.push(`${Math.round(status.bpm)} BPM`);
    if(status.locked)flags.push('AUDIO SUSPENDED');
    else if(status.muted)flags.push('MUTED');
    else if(status.paused)flags.push('PAUSED');
    else if(status.finished)flags.push('FINISHED');
    n['music-debug-status'].textContent=flags.join(' · ');
    n.hud.style.setProperty('--pause-top',n['music-debug'].classList.contains('hidden')?'':n['music-debug'].getBoundingClientRect().bottom+ui.hud.debugGapPx+'px');
  }
  checkpoint(store){
    const n=this.nodes,c=store.current;const label=store.warning||(c?`CHECKPOINT ${c.wave} · ${c.lives} LIVES · NEW FLIGHT CLEARS PROGRESS`:'3 LIVES · ENDLESS WAVES · NO CHECKPOINT YET');
    const signature=JSON.stringify([label,c?.wave,c?.lives]);
    if(this.lastCheckpoint===signature)return;this.lastCheckpoint=signature;
    // n['checkpoint-resume'].disabled=!c;
    // n['checkpoint-resume'].setAttribute('aria-label',c?`Continue from checkpoint at wave ${c.wave}`:'Continue unavailable: no checkpoint');
    // n['checkpoint-note'].textContent=label;
  }
  confirmNew(store){
    this.nodes['new-run-note'].textContent=`Surive as long as you can.`;
    this.nodes['new-run-dialog'].showModal();this.nodes['resume-checkpoint-dialog'].focus();
  }
  update(s,titleTime=0,dt=0,shipAnchor=null){
    this.hangar.update(titleTime,s.mode==='title');
    if(this.lastMode!==s.mode){this.lastMode=s.mode;this.mode(s);}
    const n=this.nodes;this.updateHull(s,dt);
    n['lives-text'].textContent=String(s.lives);n.lives.setAttribute('aria-label',`${s.lives} lives remaining`);n.speed.textContent=ui.speedText(s);
    n['speed-fill'].style.width=ui.chargeText(s);n['speed-charge'].setAttribute('aria-valuenow',Math.round(s.charge));
    n['checkpoint-success'].classList.toggle('visible',s.checkpointCelebration>0&&s.mode==='playing');
    this.updateHeat(s,shipAnchor);
    n['pickup-toast'].textContent=s.toast;n['pickup-toast'].classList.toggle('visible',s.toastTime>0);
  }
  updateHull(s,dt){
    const n=this.nodes,config=ui.hud.hull;
    if(this.hullState!==s){this.hullState=s;this.previousHull=s.hull;this.hullFlashRemaining=0;this.hullPulsePhase=0;}
    if(s.hull<this.previousHull)this.hullFlashRemaining=config.flashSeconds;
    else this.hullFlashRemaining=math.decrement(this.hullFlashRemaining,dt);
    this.previousHull=s.hull;
    this.displayHull=math.damp(this.displayHull,s.hull,config.lerpRate,dt);
    if(Math.abs(this.displayHull-s.hull)<config.snapTolerance)this.displayHull=s.hull;
    n['hull-fill'].style.width=`${this.displayHull/hull.maxIntegrity*ui.hud.percentScale}%`;
    n['hull-text'].textContent=math.percent(s.hull/hull.maxIntegrity*ui.hud.percentScale);
    n['hull-meter'].setAttribute('aria-valuenow',s.hull/hull.maxIntegrity*ui.hud.percentScale);
    const level=ui.hullLevel(s.hull);
    this.hullPulsePhase=level==='normal'?0:(this.hullPulsePhase+dt*ui.hullPulseRate(s.hull))%1;
    n['hull-instrument'].dataset.level=level;
    n['hull-instrument'].style.setProperty('--hull-pulse',level==='normal'?0:ui.hullPulse(this.hullPulsePhase));
    n['hull-instrument'].style.setProperty('--hit-flash',ui.hullFlash(this.hullFlashRemaining));
  }
  updateHeat(s,anchor){
    const node=this.nodes['ship-heat'],heat=s.weapon.heat,config=ui.hud.heat;
    node.dataset.level=ui.heatLevel(heat);node.setAttribute('aria-valuenow',Math.round(heat));
    node.setAttribute('aria-valuetext',s.weapon.overheated?'Overheated, cooling':`${Math.round(heat)}%`);
    for(const path of this.heatFills){path.style.strokeDasharray=`${heat/config.max*ui.hud.percentScale} ${ui.hud.percentScale}`;path.style.opacity=heat>0?'1':'0';}
    const visible=anchor&&s.mode!=='title'&&s.mode!=='crashing'&&s.mode!=='defeat'&&!(s.mode==='paused'&&s.resumeMode==='crashing');
    node.classList.toggle('hidden',!visible);
    if(visible){node.style.left=anchor.x+'px';node.style.top=anchor.y+'px';node.style.width=anchor.diameter+'px';node.style.height=anchor.diameter+'px';node.style.setProperty('--heat-line-width',config.lineWidthPx*config.svgSize/anchor.diameter);}
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
    const choices=menu.actions.map(id=>this.nodes[id]).filter(node=>node&&!node.disabled&&node.getClientRects().length>0);
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
