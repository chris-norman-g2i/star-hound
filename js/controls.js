(function(namespace){
'use strict';
const {tuning}=namespace.settings;
const RANGE_CONTROL={percentScale:100,thumbLayers:{minimum:1,overlap:3}};
/** A field owns its form representation; settings own validation and persistence. */
class TuningField {
  constructor(spec,value){
    this.spec=spec;this.inputs=[];
    this.element=document.createElement(spec.type==='range'?'div':'label');
    this.element.textContent=spec.label;this.element.dataset.path=spec.path;
    if(spec.type==='range'){
      this.element.classList.add('tuning-range');this.element.setAttribute('role','group');this.element.setAttribute('aria-label',spec.label);
      this.track=document.createElement('div');this.track.classList.add('tuning-range-track');
      const values=document.createElement('div');values.classList.add('tuning-range-values');
      this.outputs=[];
      for(const bound of ['minimum','maximum']){
        const input=this.createInput('range',`${spec.label} ${bound}`);this.track.append(input);
        const label=document.createElement('label');label.textContent=bound==='minimum'?'MIN ':'MAX ';
        const output=document.createElement('output');label.append(output);values.append(label);this.outputs.push(output);
        input.addEventListener('input',()=>{
          const [low,high]=this.inputs;
          if(Number(low.value)>Number(high.value))input.value=input===low?high.value:low.value;
          this.refresh();
        });
      }
      this.element.append(this.track);this.element.append(values);
    }else this.element.append(this.createInput('number',spec.label));
    this.write(value);
  }
  createInput(type,label){
    const input=document.createElement('input'),{min,max,step,path}=this.spec;
    input.type=type;input.min=min;input.max=max;input.step=step;input.dataset.path=path;input.setAttribute('aria-label',label);
    this.inputs.push(input);return input;
  }
  read(){return this.spec.type==='range'?{min:Number(this.inputs[0].value),max:Number(this.inputs[1].value)}:Number(this.inputs[0].value);}
  write(value){
    if(this.spec.type==='range'){this.inputs[0].value=value.min;this.inputs[1].value=value.max;this.refresh();}
    else this.inputs[0].value=value;
  }
  refresh(){
    const {min,max}=this.read(),spec=this.spec,low=(min-spec.min)/(spec.max-spec.min)*RANGE_CONTROL.percentScale,high=(max-spec.min)/(spec.max-spec.min)*RANGE_CONTROL.percentScale;
    this.outputs[0].textContent=String(min);this.outputs[1].textContent=String(max);
    this.track.style.background=`linear-gradient(to right, var(--range-track-color) ${low}%, var(--orange) ${low}%, var(--orange) ${high}%, var(--range-track-color) ${high}%)`;
    // Let the lower thumb remain reachable when both handles are at the far end.
    this.inputs[0].style.zIndex=String(min===spec.max?RANGE_CONTROL.thumbLayers.overlap:RANGE_CONTROL.thumbLayers.minimum);
  }
  reportValidity(){return this.inputs.every(input=>input.reportValidity());}
}

class FlightControls {
  constructor(actions){
    this.actions=actions;this.defaults=tuning.defaults;this.inputs=new Map();
    this.dialog=document.getElementById('tuning-dialog');this.status=document.getElementById('tuning-status');
    this.seed=document.getElementById('seed-input');this.seed.value=tuning.seed;
    const grid=document.getElementById('tuning-fields');
    for(const spec of tuning.fields){
      if(spec.section){const heading=document.createElement('h3');heading.textContent=spec.section;heading.classList.add('tuning-section');grid.append(heading);}
      const field=new TuningField(spec,this.defaults[spec.path]);grid.append(field.element);this.inputs.set(spec.path,field);
    }
    document.getElementById('tune-button').addEventListener('click',()=>this.open());
    document.getElementById('close-tuning').addEventListener('click',()=>this.dialog.close());
    document.getElementById('apply-tuning').addEventListener('click',()=>this.apply());
    document.getElementById('export-settings').addEventListener('click',()=>this.export());
    document.getElementById('reset-tuning').addEventListener('click',()=>{for(const [path,input] of this.inputs)input.write(this.defaults[path]);this.seed.value=tuning.defaultSeed;this.status.textContent='Default values restored in the form. Apply to save them.';});
    document.getElementById('jump-button').addEventListener('click',()=>{
      const input=document.getElementById('jump-wave');
      if(input.reportValidity()&&this.apply()){this.dialog.close();actions.playNow(Number(input.value));}
    });
    this.dialog.addEventListener('close',()=>actions.closed());
  }
  open(){
    if(this.actions.state().mode!=='title')return;
    tuning.load();this.seed.value=tuning.seed;
    this.actions.opened();for(const [path,input] of this.inputs)input.write(tuning.values()[path]);
    document.getElementById('jump-wave').value=this.actions.state().wave;this.dialog.showModal();this.dialog.scrollTop=0;
  }
  apply(){
    if(Array.from(this.inputs.values()).some(input=>!input.reportValidity()))return false;
    const values=Object.fromEntries(Array.from(this.inputs,([path,input])=>[path,input.read()]));
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
