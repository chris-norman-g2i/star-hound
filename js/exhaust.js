(function(namespace){
'use strict';
const THREE=namespace.THREE;
const {exhaust,math}=namespace.settings;
const BILLBOARD={planeSize:1,minimumLife:.001,smokeRateFraction:.45,plasmaStartSize:.75,smokeStartSize:.65,
  plasmaTailSize:.3,maxFrameEmissionSeconds:.05};
const VERTEX=`attribute vec3 center;attribute vec3 tint;attribute vec2 extent;attribute float opacity;
  attribute float ratio;attribute float seed;varying vec2 uv0;varying vec3 color0;
  varying float alpha0;varying float age0;varying float seed0;
  void main(){uv0=uv;color0=tint;alpha0=opacity;age0=ratio;seed0=seed;
    vec4 view=modelViewMatrix*vec4(center,1.);view.xy+=position.xy*extent;
    gl_Position=projectionMatrix*view;}`;
const NOISE=`float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
  float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec2(4.7,8.1);a*=.5;}return v;}`;
/** Two instanced billboard layers: shaded alpha smoke and luminous additive plasma. */
class ExhaustLayer {
  constructor(scene,kind,capacity){
    this.kind=kind;this.capacity=capacity;this.particles=[];
    const plane=new THREE.PlaneGeometry(BILLBOARD.planeSize,BILLBOARD.planeSize),g=this.geometry=new THREE.InstancedBufferGeometry();
    g.index=plane.index.clone();for(const name of ['position','uv'])g.setAttribute(name,plane.attributes[name].clone());plane.dispose();
    this.arrays={};
    for(const [name,width] of [['center',3],['tint',3],['extent',2],['opacity',1],['ratio',1],['seed',1]]){
      const array=this.arrays[name]=new Float32Array(capacity*width);
      g.setAttribute(name,new THREE.InstancedBufferAttribute(array,width).setUsage(THREE.DynamicDrawUsage));
    }
    const c=exhaust.shader;
    this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,
      blending:kind==='smoke'?THREE.NormalBlending:THREE.AdditiveBlending,
      uniforms:{noiseScale:{value:c.noiseScale},noiseSpeed:{value:c.noiseSpeed},edgeStart:{value:c.edgeStart},edgeEnd:{value:c.edgeEnd},hotIntensity:{value:c.hotIntensity}},
      vertexShader:VERTEX,fragmentShader:`varying vec2 uv0;varying vec3 color0;varying float alpha0;varying float age0;varying float seed0;
        uniform float noiseScale;uniform float noiseSpeed;uniform float edgeStart;uniform float edgeEnd;uniform float hotIntensity;
        ${NOISE}
        void main(){vec2 p=uv0-.5;float r=length(p);float edge=1.-smoothstep(edgeStart,edgeEnd,r);
          float n=fbm(p*noiseScale+vec2(seed0,age0*noiseSpeed));
          ${kind==='smoke'?`float billow=smoothstep(.12,.82,n);float density=edge*(.45+.55*billow);
            float lighting=.55+.65*fbm(p*noiseScale+vec2(seed0+.6,age0*noiseSpeed-.4));
            gl_FragColor=vec4(color0*lighting,alpha0*density);`
          :`float flame=pow(max(0.,1.-r*2.),1.6)*( .55+.65*n);
            float core=exp(-r*r*65.)*(1.-age0);
            gl_FragColor=vec4(mix(color0,vec3(1.,.97,.88),core)*hotIntensity,alpha0*edge*flame);`}
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`});
    this.mesh=new THREE.Mesh(g,this.material);this.mesh.frustumCulled=false;this.mesh.renderOrder=kind==='smoke'?1:2;scene.add(this.mesh);
    this.color=new THREE.Color();g.instanceCount=0;
  }
  update(s,dt,base){
    this.particles=this.particles.filter(p=>{
      p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.d+=p.vd*dt;return p.age<p.life;
    });
    if(this.particles.length>this.capacity){
      this.particles.sort((a,b)=>b.priority-a.priority||Math.abs(a.d-s.distance)-Math.abs(b.d-s.distance));this.particles.length=this.capacity;
    }
    if(this.kind==='smoke')this.particles.sort((a,b)=>b.d-a.d);
    for(const [i,p] of this.particles.entries()){
      const t=p.age/Math.max(BILLBOARD.minimumLife,p.life),size=p.size*(this.kind==='smoke'?BILLBOARD.smokeStartSize+t*exhaust.growth
        :BILLBOARD.plasmaStartSize*(1-t)+BILLBOARD.plasmaTailSize);
      this.arrays.center.set([p.x-base.x,p.y-base.y,s.distance-p.d],i*3);
      this.color.set(p.color);this.arrays.tint.set([this.color.r,this.color.g,this.color.b],i*3);
      this.arrays.extent.set([size,size],i*2);this.arrays.opacity[i]=p.opacity*(1-t)*(this.kind==='smoke'?Math.min(1,t*8):1);
      this.arrays.ratio[i]=t;this.arrays.seed[i]=p.seed;
    }
    for(const attr of Object.values(this.geometry.attributes))if(attr.isInstancedBufferAttribute)attr.needsUpdate=true;
    this.geometry.instanceCount=this.particles.length;
  }
  clear(){this.particles=[];this.geometry.instanceCount=0;}
}
class FlightExhaust {
  constructor(scene,plan){
    this.plan=plan;this.emitters=new Map();
    this.layers={smoke:new ExhaustLayer(scene,'smoke',exhaust.capacity.smoke),plasma:new ExhaustLayer(scene,'plasma',exhaust.capacity.plasma)};
  }
  emit(emitter,kind,profile,velocity){
    const scale=emitter.scale||1,life=(kind==='smoke'?profile.smokeLife:profile.plasmaLife)*scale;
    const speed=profile.jetSpeed*scale,inherit=kind==='smoke'?exhaust.velocityInheritance:1;
    this.layers[kind].particles.push({x:emitter.x,y:emitter.y,d:emitter.d,
      vx:velocity.x*inherit+emitter.direction[0]*speed+math.visualRandom(-exhaust.spread,exhaust.spread),
      vy:velocity.y*inherit+emitter.direction[1]*speed+math.visualRandom(-exhaust.spread,exhaust.spread),
      vd:emitter.speed*inherit+emitter.direction[2]*speed,
      age:0,life,size:profile.size*scale,color:kind==='smoke'?exhaust.smokeColor:profile.color,
      opacity:kind==='smoke'?profile.smokeOpacity:1,seed:math.visualRandom(0,math.tau),priority:emitter.profile==='player'?1:0});
  }
  update(s,dt,emitters){
    const wanted=new Set();
    for(const emitter of emitters){
      wanted.add(emitter.id);const profile=exhaust.profiles[emitter.profile];
      let state=this.emitters.get(emitter.id);if(!state){state={smoke:0,plasma:0,x:emitter.x,y:emitter.y};this.emitters.set(emitter.id,state);}
      const velocity={x:dt?(emitter.x-state.x)/dt:0,y:dt?(emitter.y-state.y)/dt:0};
      if(s.mode==='playing'&&dt>0){
        for(const kind of ['smoke','plasma']){
          if(profile.mode!==kind&&profile.mode!=='both')continue;
          state[kind]+=Math.min(dt,BILLBOARD.maxFrameEmissionSeconds)*profile.rate*(kind==='smoke'?BILLBOARD.smokeRateFraction:1);
          while(state[kind]>=1){this.emit(emitter,kind,profile,velocity);state[kind]--;}
        }
      }
      state.x=emitter.x;state.y=emitter.y;
    }
    for(const id of this.emitters.keys())if(!wanted.has(id))this.emitters.delete(id);
    const base=this.plan.center(s.distance);for(const layer of Object.values(this.layers))layer.update(s,dt,base);
  }
  clear(){this.emitters.clear();for(const layer of Object.values(this.layers))layer.clear();}
}
namespace.FlightExhaust=FlightExhaust;
})(window.Starhound);
