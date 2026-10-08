(function(namespace){
'use strict';
const config=namespace.settings.gfx.hangar;

/** A fixed clean background plus independent, registered eight-frame DIV sprites.
 * All frame geometry, anchor positions, proportions and timing come from settings.
 */
class HangarTitle {
  constructor(){
    this.overlay=document.getElementById('hangar-animation');this.lastFrame=-1;
    this.motion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.motion?.addEventListener('change',()=>{this.lastFrame=-1;});
    this.sprites=config.sprites.map(sprite=>{const node=document.getElementById(sprite.id);Object.assign(node.style,config.layerStyle(sprite));return node;});
    const group=document.getElementById('hangar-lights');
    this.lights=config.lights.map(light=>{const node=document.createElement('i');node.classList.add('hangar-light');Object.assign(node.style,config.lightStyle(light));group.append(node);return node;});
    this.update(0,true);
  }
  update(time,visible){
    if(!visible)return;const index=config.frameAt(time,this.motion?.matches);
    if(index===this.lastFrame)return;this.lastFrame=index;
    for(const node of this.sprites)node.style.backgroundPosition=config.framePosition(index);
    for(const [i,node] of this.lights.entries())node.style.opacity=config.lightAlpha(index,config.lights[i].phase);
    this.overlay.dataset.frame=String(index);
  }
}
namespace.HangarTitle=HangarTitle;
})(window.Starhound);
