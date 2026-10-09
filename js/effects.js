(function(namespace){
'use strict';
const THREE=namespace.THREE;
const {gfx,tunnel,speedEffects,math}=namespace.settings;

/** Bounded soft sprites serve impact bursts and checkpoint celebrations. */
class FlightParticles {
  constructor(scene,plan){
    this.plan=plan;this.particles=[];
    const capacity=gfx.particle.capacity;
    this.positions=new Float32Array(capacity*3);this.colors=new Float32Array(capacity*3);
    this.sizes=new Float32Array(capacity);this.alpha=new Float32Array(capacity);this.smoke=new Float32Array(capacity);
    this.geometry=new THREE.BufferGeometry();
    for(const [name,array,size] of [['position',this.positions,3],['color',this.colors,3],['size',this.sizes,1],['alpha',this.alpha,1],['smoke',this.smoke,1]])
      this.geometry.setAttribute(name,new THREE.BufferAttribute(array,size).setUsage(THREE.DynamicDrawUsage));
    this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,vertexColors:true,
      uniforms:{pixelScale:{value:500}},
      vertexShader:`attribute float size;attribute float alpha;attribute float smoke;
        uniform float pixelScale;varying vec3 tint;varying float opacity;varying float softness;
        void main(){vec4 view=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*view;
          gl_PointSize=clamp(size*pixelScale/max(1.,-view.z),1.,100.);tint=color;opacity=alpha;softness=smoke;}`,
      fragmentShader:`varying vec3 tint;varying float opacity;varying float softness;
        void main(){vec2 p=gl_PointCoord-.5;float r=length(p);if(r>.5)discard;
          float haze=exp(-r*r*18.);float detail=.85+.15*sin(p.x*24.+sin(p.y*18.));
          float glow=pow(max(0.,1.-r*2.),1.4);float a=mix(glow,haze*detail,softness)*opacity;
          gl_FragColor=vec4(tint*mix(1.5,1.,softness),a);
          #include <colorspace_fragment>
        }`});
    this.mesh=new THREE.Points(this.geometry,this.material);this.mesh.frustumCulled=false;scene.add(this.mesh);
    this.color=new THREE.Color();
  }
  add(particles){this.particles.push(...particles);}
  clear(){this.particles.length=0;this.geometry.setDrawRange(0,0);}
  update(s,dt){
    this.particles=this.particles.filter(p=>{gfx.stepParticle(p,dt);return p.age<p.life;}).slice(-gfx.particle.capacity);
    for(const [i,p] of this.particles.entries()){
      this.positions.set(this.plan.world(p.x,p.y,p.d,s.distance),i*3);
      this.color.set(p.color);this.colors.set([this.color.r,this.color.g,this.color.b],i*3);
      this.sizes[i]=gfx.particleScale(p);this.alpha[i]=gfx.particleOpacity(p);this.smoke[i]=p.kind==='smoke'?1:0;
    }
    for(const attribute of Object.values(this.geometry.attributes))attribute.needsUpdate=true;
    this.geometry.setDrawRange(0,this.particles.length);
  }
  resize(height,pixelRatio){this.material.uniforms.pixelScale.value=height*pixelRatio;}
}

/** Forward-facing star lines and a speed-driven radial/temporal blur pass. */
class FlightSpeedEffects {
  constructor(renderer,camera){
    this.renderer=renderer;this.camera=camera;this.historyValid=false;this.readIndex=0;
    this.stars=Array.from({length:speedEffects.streakCount},()=>speedEffects.star());
    this.positions=new Float32Array(this.stars.length*6);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
    this.lines=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:speedEffects.stars.color,transparent:true,opacity:0,depthWrite:false}));
    this.lines.frustumCulled=false;camera.add(this.lines);
    this.frame=new THREE.WebGLRenderTarget(1,1);
    this.history=[new THREE.WebGLRenderTarget(1,1),new THREE.WebGLRenderTarget(1,1)];
    this.postScene=new THREE.Scene();this.postCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.blurMaterial=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,
      uniforms:{frame:{value:null},history:{value:null},amount:{value:0},memory:{value:0}},
      vertexShader:'varying vec2 uv0;void main(){uv0=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:`uniform sampler2D frame;uniform sampler2D history;uniform float amount;uniform float memory;varying vec2 uv0;
        void main(){vec2 direction=(uv0-.5)*amount*.065;vec4 color=vec4(0.);
          for(int i=0;i<9;i++){float t=float(i)/8.;color+=texture2D(frame,clamp(uv0-direction*t,vec2(0.),vec2(1.)))/9.;}
          gl_FragColor=mix(color,texture2D(history,uv0),memory);
        }`});
    this.copyMaterial=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,
      uniforms:{image:{value:null}},vertexShader:this.blurMaterial.vertexShader,
      fragmentShader:'uniform sampler2D image;varying vec2 uv0;void main(){gl_FragColor=texture2D(image,uv0);\n#include <colorspace_fragment>\n}'});
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.blurMaterial);this.postScene.add(this.quad);
    this.hud=document.getElementById('hud');
  }
  clear(){this.historyValid=false;if(this.hud)this.hud.style.filter='';}
  update(s,dt){
    const amount=speedEffects.intensity(s.speed),length=speedEffects.streakLength(s.speed);
    for(const [i,star] of this.stars.entries()){
      speedEffects.advanceStar(star,s.speed,dt);
      this.positions.set([star.x,star.y,star.z,star.x,star.y,Math.min(-speedEffects.stars.depth.min,star.z+length)],i*6);
    }
    this.lines.geometry.attributes.position.needsUpdate=true;this.lines.material.opacity=amount*speedEffects.stars.opacity;
    if(this.hud)this.hud.style.filter=`blur(${speedEffects.hudBlur(s.speed).toFixed(2)}px)`;
  }
  render(scene,camera,s,dt){
    const renderer=this.renderer,amount=speedEffects.blur(s.speed);
    if(amount<=0){renderer.setRenderTarget(null);renderer.render(scene,camera);this.historyValid=false;return;}
    renderer.setRenderTarget(this.frame);renderer.render(scene,camera);
    const destination=1-this.readIndex;
    this.blurMaterial.uniforms.frame.value=this.frame.texture;
    this.blurMaterial.uniforms.history.value=this.history[this.readIndex].texture;
    this.blurMaterial.uniforms.amount.value=amount;
    this.blurMaterial.uniforms.memory.value=this.historyValid&&dt>0?amount*.24:0;
    this.quad.material=this.blurMaterial;renderer.setRenderTarget(this.history[destination]);renderer.render(this.postScene,this.postCamera);
    this.copyMaterial.uniforms.image.value=this.history[destination].texture;
    this.quad.material=this.copyMaterial;renderer.setRenderTarget(null);renderer.render(this.postScene,this.postCamera);
    this.readIndex=destination;this.historyValid=true;
  }
  resize(width,height){
    const ratio=this.renderer.getPixelRatio();
    this.frame.setSize(Math.round(width*ratio),Math.round(height*ratio));
    for(const target of this.history)target.setSize(Math.round(width*ratio),Math.round(height*ratio));
    this.historyValid=false;
  }
}
namespace.FlightParticles=FlightParticles;namespace.FlightSpeedEffects=FlightSpeedEffects;
})(window.Starhound);
