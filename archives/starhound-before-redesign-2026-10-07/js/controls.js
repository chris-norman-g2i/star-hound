(function(namespace){
'use strict';
const {tuning,race}=namespace.settings;
class FlightControls {
  constructor(actions){
    this.actions=actions;this.defaults=tuning.values();this.inputs=new Map();
    this.dialog=document.getElementById('tuning-dialog');this.status=document.getElementById('tuning-status');
    this.seed=document.getElementById('seed-input');this.seed.value=tuning.seed;
    const grid=document.getElementById('tuning-fields');
    for(const [path,label,min,max,step] of tuning.fields){
      const row=document.createElement('label');row.textContent=label;
      const input=document.createElement('input');input.type='number';input.min=min;input.max=max;input.step=step;input.value=this.defaults[path];input.setAttribute('aria-label',label);row.append(input);grid.append(row);this.inputs.set(path,input);
    }
    document.getElementById('tune-button').addEventListener('click',()=>this.open());
    document.getElementById('close-tuning').addEventListener('click',()=>this.dialog.close());
    document.getElementById('apply-tuning').addEventListener('click',()=>this.apply());
    document.getElementById('export-settings').addEventListener('click',()=>this.export());
    document.getElementById('reset-tuning').addEventListener('click',()=>{for(const [path,input] of this.inputs)input.value=this.defaults[path];this.status.textContent='Default values restored in the form. Apply to use them.';});
    document.getElementById('jump-button').addEventListener('click',()=>{const input=document.getElementById('jump-wave');if(input.checkValidity())actions.jump(Number(input.value));});
    this.dialog.addEventListener('close',()=>actions.closed());
  }
  open(){
    this.actions.opened();for(const [path,input] of this.inputs)input.value=tuning.values()[path];
    document.getElementById('jump-wave').value=this.actions.state().wave;this.dialog.showModal();
  }
  apply(){
    if(Array.from(this.inputs.values()).some(input=>!input.reportValidity()))return false;
    const values=Object.fromEntries(Array.from(this.inputs,([path,input])=>[path,Number(input.value)]));
    tuning.apply(values);tuning.seed=this.seed.value.trim()||'GOODBOY';this.actions.applied();
    this.status.textContent='Overrides applied. Export copies the entire replacement settings.js.';return true;
  }
  async export(){
    if(!this.apply())return;const source=tuning.exportSource(),area=document.getElementById('settings-export');
    try{await navigator.clipboard.writeText(source);this.status.textContent='Complete settings.js copied. Paste over the entire js/settings.js file in your IDE.';area.classList.add('hidden');}
    catch{area.value=source;area.classList.remove('hidden');area.focus();area.select();this.status.textContent='Clipboard access unavailable. The entire settings.js is selected below; press Ctrl+C / ⌘C, then replace the file in your IDE.';}
  }
  handleKey(event){
    if(event.code==='F2'&&!event.repeat){event.preventDefault();if(this.dialog.open)this.dialog.close();else this.open();return true;}
    if(this.dialog.open)return true;
    if(['BracketLeft','BracketRight'].includes(event.code)&&!event.repeat){event.preventDefault();const s=this.actions.state();if(s.mode==='playing'||s.mode==='paused')this.actions.jump(s.wave+(event.code==='BracketRight'?1:-1));return true;}
    return false;
  }
}
namespace.FlightControls=FlightControls;
})(window.Starhound);
