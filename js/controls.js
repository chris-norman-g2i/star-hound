(function(namespace){
'use strict';
const {tuning}=namespace.settings;
class FlightControls {
  constructor(actions){
    this.actions=actions;this.defaults=tuning.defaults;this.inputs=new Map();
    this.dialog=document.getElementById('tuning-dialog');this.status=document.getElementById('tuning-status');
    this.seed=document.getElementById('seed-input');this.seed.value=tuning.seed;
    const grid=document.getElementById('tuning-fields');
    for(const {path,label,min,max,step} of tuning.fields){
      const row=document.createElement('label');row.textContent=label;
      const input=document.createElement('input');input.type='number';input.min=min;input.max=max;input.step=step;input.value=this.defaults[path];input.setAttribute('aria-label',label);row.append(input);grid.append(row);this.inputs.set(path,input);
    }
    document.getElementById('tune-button').addEventListener('click',()=>this.open());
    document.getElementById('close-tuning').addEventListener('click',()=>this.dialog.close());
    document.getElementById('apply-tuning').addEventListener('click',()=>this.apply());
    document.getElementById('export-settings').addEventListener('click',()=>this.export());
    document.getElementById('reset-tuning').addEventListener('click',()=>{for(const [path,input] of this.inputs)input.value=this.defaults[path];this.seed.value=tuning.defaultSeed;this.status.textContent='Default values restored in the form. Apply to save them.';});
    document.getElementById('jump-button').addEventListener('click',()=>{
      const input=document.getElementById('jump-wave');
      if(input.reportValidity()&&this.apply()){this.dialog.close();actions.playNow(Number(input.value));}
    });
    this.dialog.addEventListener('close',()=>actions.closed());
  }
  open(){
    if(this.actions.state().mode!=='title')return;
    tuning.load();this.seed.value=tuning.seed;
    this.actions.opened();for(const [path,input] of this.inputs)input.value=tuning.values()[path];
    document.getElementById('jump-wave').value=this.actions.state().wave;this.dialog.showModal();this.dialog.scrollTop=0;
  }
  apply(){
    if(Array.from(this.inputs.values()).some(input=>!input.reportValidity()))return false;
    const values=Object.fromEntries(Array.from(this.inputs,([path,input])=>[path,Number(input.value)]));
    const error=tuning.validationError(values);
    if(error){this.status.textContent=error;return false;}
    const saved=tuning.save(values,this.seed.value);this.actions.applied();
    this.status.textContent=saved?'Settings saved. New flights and checkpoint resumes use these values.':'Settings applied for this session. Browser storage is unavailable; these settings cannot survive a reload.';return true;
  }
  async export(){
    if(!this.apply())return;const source=tuning.exportSource(),area=document.getElementById('settings-export');
    try{await navigator.clipboard.writeText(source);this.status.textContent='Complete settings.js copied. Paste over the entire js/settings.js file in your IDE.';area.classList.add('hidden');}
    catch{area.value=source;area.classList.remove('hidden');area.focus();area.select();this.status.textContent='Clipboard access unavailable. The entire settings.js is selected below; press Ctrl+C / ⌘C, then replace the file in your IDE.';}
  }
}
namespace.FlightControls=FlightControls;
})(window.Starhound);
