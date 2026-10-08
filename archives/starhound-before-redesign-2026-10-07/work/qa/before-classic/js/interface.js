import {ui,math,race,weapon} from './settings.js';

export class FlightInterface {
  constructor() {
    this.nodes={};for(const id of ['title-screen','hud','overlay','audio-button','sector','sector-name','wave','wave-dots','race-fill','hull-fill','hull-text','speed','speed-fill','effect-label','heat-fill','cannon-name','weapon-status','upgrade-status','announcement','pickup-toast','overlay-eyebrow','overlay-title','overlay-copy','run-stats','resume','restart','home','launch','manual','flight-manual','close-manual','pause-button'])this.nodes[id]=document.getElementById(id);
    for(let i=0;i<race.wavesPerSector;i++)this.nodes['wave-dots'].append(document.createElement('i'));
    this.lastMode=null;
  }
  audio(enabled) {this.nodes['audio-button'].textContent=enabled?'SOUND ON':'SOUND OFF';this.nodes['audio-button'].setAttribute('aria-label',enabled?'Mute sound':'Enable sound');}
  update(s) {
    if(this.lastMode!==s.mode){this.lastMode=s.mode;this.mode(s);}
    const n=this.nodes;
    n.sector.textContent=ui.sectorText(s);n['sector-name'].textContent=race.names[s.sector];n.wave.textContent=math.pad(s.wave);
    Array.from(n['wave-dots'].children).forEach((dot,index)=>dot.classList.toggle('active',index<=race.waveInSector(s.wave)));
    n['race-fill'].style.width=ui.progressText(s);
    n['hull-fill'].style.width=math.percent(s.hull);n['hull-text'].textContent=math.percent(s.hull);n.speed.textContent=ui.speedText(s);
    n['speed-fill'].style.width=ui.chargeText(s);n['effect-label'].textContent=ui.effect(s);
    n['heat-fill'].style.width=math.percent(s.weapon.heat);n['cannon-name'].textContent=ui.cannonText(s.weapon);n['weapon-status'].textContent=ui.heatText(s.weapon);n['upgrade-status'].textContent=ui.upgrades(s.weapon);
    n.announcement.textContent=s.notice;n.announcement.classList.toggle('visible',s.noticeTime>0);
    n['pickup-toast'].textContent=s.toast;n['pickup-toast'].classList.toggle('visible',s.toastTime>0);
  }
  mode(s) {
    const n=this.nodes;document.body.classList.toggle('playing',s.mode!=='title');
    n['title-screen'].classList.toggle('hidden',s.mode!=='title');n.hud.classList.toggle('hidden',s.mode==='title');n.overlay.classList.toggle('hidden',s.mode==='playing'||s.mode==='title');
    if(s.mode==='paused'){n['overlay-eyebrow'].textContent='FLIGHT PAUSED';n['overlay-title'].innerHTML='CATCH YOUR<br>BREATH.';n['overlay-copy'].textContent='Your ship is holding position. Resume when you’re ready.';n.resume.classList.remove('hidden');}
    if(s.mode==='defeat'){n['overlay-eyebrow'].textContent='SIGNAL LOST';n['overlay-title'].innerHTML='EVERY DOG HAS<br>ANOTHER DAY.';n['overlay-copy'].textContent=s.failReason==='gate'?'So close! You missed the opening in the finish gate. Aim for the center of the checkered square to bring it home.':`You reached wave ${s.wave}. Dodge orange barriers, collect repairs, and give your cannon time to cool.`;n.resume.classList.add('hidden');}
    if(s.mode==='win'){n['overlay-eyebrow'].textContent='ALL 10 SECTORS CLEARED';n['overlay-title'].innerHTML='HOME, SWEET<br>GOODBOY.';n['overlay-copy'].textContent='Fifty waves. One very good pilot. You crossed the finish line and won the race.';n.resume.classList.add('hidden');}
    n['run-stats'].innerHTML=`<span>${ui.time(s.elapsed)} FLIGHT</span><span>${s.kills} TAKEDOWNS</span><span>${ui.finalScore(s)} PTS</span>`;
    if(s.mode==='paused')n.resume.focus();
    if(s.mode==='win'||s.mode==='defeat')n.restart.focus();
  }
  showManual() {this.nodes.manual.showModal();}
  hideManual() {this.nodes.manual.close();}
  isManualOpen() {return this.nodes.manual.open;}
}
