(function (namespace) {
'use strict';
const THREE = namespace.THREE;
const { assets, gfx, tunnel, weapon, pickups, flight, math, tuning, renderMath, ui } = namespace.settings;

class FlightScene {
  constructor(canvas,route) {
    this.renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(gfx.ratio(window.devicePixelRatio));
    this.renderer.setClearColor(gfx.clear);this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=gfx.exposure;
    this.scene = new THREE.Scene();this.scene.fog=new THREE.FogExp2(gfx.clear,gfx.fogDensity);
    this.camera=new THREE.PerspectiveCamera(gfx.camera.fov,1,gfx.camera.near,gfx.camera.far);
    this.scene.add(new THREE.HemisphereLight(...renderMath.hemisphere,gfx.lighting.ambient));
    const key=new THREE.DirectionalLight(renderMath.keyColor,gfx.lighting.key);key.position.fromArray(gfx.lighting.keyPosition);this.scene.add(key);
    const rim=new THREE.DirectionalLight(renderMath.rimColor,gfx.lighting.rim);rim.position.fromArray(gfx.lighting.rimPosition);this.scene.add(rim);
    this.geometries=new Map();this.materials=new Map();this.entities=new Map();this.shipMaterials=new Map();this.crashPresentation=null;
    this.ship=this.makeShip();this.scene.add(this.ship);
    this.route=route||new namespace.RoutePlan();this.makeStars();this.scene.add(this.camera);
    this.particles=new namespace.FlightParticles(this.scene);
    this.environment=new namespace.FlightEnvironment(this.scene,this.route);
    this.speedEffects=new namespace.FlightSpeedEffects(this.renderer,this.camera);
    this.isolateShipMaterials(this.ship);
    this.reticle=document.getElementById('reticle');this.aimMarkers=[];this.aimPoint=new THREE.Vector3();
    this.hudCenter=new THREE.Vector3();this.hudEdge=new THREE.Vector3();this.hudRight=new THREE.Vector3();
    this.tier=-1;
    this.resize();
  }
  geometry(kind) {
    if(this.geometries.has(kind))return this.geometries.get(kind);
    const spec=assets.shapes[kind];let g;
    if(kind==='box')g=new THREE.BoxGeometry();
    if(kind==='ico')g=new THREE.IcosahedronGeometry(...spec.slice(1));
    if(kind==='octa')g=new THREE.OctahedronGeometry(...spec.slice(1));
    if(kind==='tetra')g=new THREE.TetrahedronGeometry(...spec.slice(1));
    if(kind==='cone')g=new THREE.ConeGeometry(...spec.slice(1));
    if(kind==='cylinder')g=new THREE.CylinderGeometry(...spec.slice(1));
    if(kind==='sphere')g=new THREE.SphereGeometry(...spec.slice(1));
    if(kind==='torus')g=new THREE.TorusGeometry(...spec.slice(1));
    if(kind==='wedge'){
      g=new THREE.BufferGeometry();const a=[-.5,-.5,-.5],b=[.5,-.5,-.5],c=[-.5,.5,-.5],d=[-.5,-.5,.5],e=[.5,-.5,.5],f=[-.5,.5,.5];
      g.setAttribute('position',new THREE.Float32BufferAttribute([a,c,b,d,e,f,a,b,d,b,e,d,a,d,c,c,d,f,b,c,e,c,f,e].flat(),3));g.computeVertexNormals();
    }
    this.geometries.set(kind,g);return g;
  }
  material(name) {
    if(this.materials.has(name))return this.materials.get(name);
    const material=new THREE.MeshStandardMaterial({color:assets.colors[name],flatShading:true,roughness:renderMath.roughness,metalness:renderMath.metalness});
    if(name==='orange'||name==='visor'){material.emissive.set(assets.colors[name]);material.emissiveIntensity=renderMath.emissive;}
    this.materials.set(name,material);return material;
  }
  parts(specs) {
    const group=new THREE.Group();
    for(const [kind,color,position,scale,rotation] of specs) {
      const mesh=new THREE.Mesh(this.geometry(kind),this.material(color));mesh.position.fromArray(position);mesh.scale.fromArray(scale);mesh.rotation.fromArray(rotation);group.add(mesh);
    }
    return group;
  }
  makeShip() {
    const group=this.parts(assets.shipParts);this.dog=this.parts(assets.dogParts);group.add(this.dog);
    this.cannons=new THREE.Group();group.add(this.cannons);this.engines=[];
    const engineGeometry=new THREE.ConeGeometry(...assets.engine.shape.slice(1));
    const engineMaterial=new THREE.MeshBasicMaterial({color:assets.engine.color,transparent:true,opacity:renderMath.engineOpacity});
    for(const position of assets.engine.positions){const flame=new THREE.Mesh(engineGeometry,engineMaterial);flame.position.fromArray(position);flame.rotation.fromArray(assets.engine.rotation);group.add(flame);this.engines.push(flame);}
    const shieldMat=new THREE.MeshBasicMaterial({color:renderMath.shieldColor,wireframe:true,transparent:true,opacity:renderMath.shieldOpacity});
    this.shield=new THREE.Mesh(new THREE.IcosahedronGeometry(renderMath.shieldRadius,renderMath.shieldDetail),shieldMat);this.shield.visible=false;group.add(this.shield);
    return group;
  }
  setCannons(tier) {
    if(tier===this.tier)return;this.tier=tier;
    for(const barrel of this.cannons.children){this.shipMaterials.delete(barrel.material);barrel.material.dispose();}
    this.cannons.clear();this.reticle.replaceChildren();this.aimMarkers=[];
    for(const x of weapon.barrels[tier]){const marker=document.createElement('span');marker.textContent='+';this.reticle.append(marker);this.aimMarkers.push(marker);}
    for(const x of weapon.barrels[tier]) {const barrel=new THREE.Mesh(this.geometry('box'),this.material('dark'));barrel.position.fromArray(renderMath.barrelPosition(x));barrel.scale.fromArray(assets.cannons.scale);this.cannons.add(barrel);this.isolateShipMaterials(barrel);}
  }
  makeStars() {
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(gfx.stars(),3));
    // Small octahedra, rather than circular sprites: even the distant stars are polygonal.
    const starMaterial=new THREE.MeshBasicMaterial({color:renderMath.starColor});
    this.stars=new THREE.InstancedMesh(this.geometry('octa'),starMaterial,gfx.starCount);
    const starPositions=geometry.attributes.position;const object=new THREE.Object3D();
    for(let i=0;i<gfx.starCount;i++){object.position.fromBufferAttribute(starPositions,i);object.scale.setScalar(renderMath.starSize);object.updateMatrix();this.stars.setMatrixAt(i,object.matrix);}
    this.scene.add(this.stars);geometry.dispose();
  }
  isolateShipMaterials(root){
    const clones=new Map();
    root.traverse(mesh=>{
      if(!mesh.isMesh||mesh===this.shield)return;
      const original=mesh.material;
      if(!clones.has(original))clones.set(original,original.clone());
      mesh.material=clones.get(original);
      this.shipMaterials.set(mesh.material,{color:original.color.clone(),emissive:original.emissive?.clone()});
    });
  }
  rainbow(s){
    const active=s.invincible>0,hue=s.elapsed%1;
    for(const [material,original] of this.shipMaterials){
      if(active){material.color.setHSL(hue,.9,.58);if(material.emissive)material.emissive.setHSL(hue,.85,.18);}
      else{material.color.copy(original.color);if(original.emissive)material.emissive.copy(original.emissive);}
    }
  }
  applyTuning() {
    this.scene.fog.density=gfx.fogDensity;this.environment.clear();this.route.reset(tuning.seed);
  }
  updateReticle(s) {
    this.camera.updateMatrixWorld();
    for(const [i,point] of weapon.aimPoints(s).entries()){
      this.aimPoint.fromArray(tunnel.world(point.x,point.y,point.d,s.distance)).project(this.camera);
      const position=renderMath.reticlePosition(this.aimPoint,window.innerWidth,window.innerHeight),marker=this.aimMarkers[i];
      marker.style.left=position.x+'px';marker.style.top=position.y+'px';
    }
    document.getElementById('impact-flash').style.opacity=renderMath.impactFlash(s);
    document.getElementById('speed-glow').style.opacity=renderMath.speedGlow(s);
  }
  playerHudAnchor() {
    this.hudCenter.copy(this.ship.position).project(this.camera);
    this.hudRight.setFromMatrixColumn(this.camera.matrixWorld,0);
    this.hudEdge.copy(this.ship.position).addScaledVector(this.hudRight,ui.hud.heat.radiusWorld).project(this.camera);
    const center=renderMath.reticlePosition(this.hudCenter,window.innerWidth,window.innerHeight);
    const edge=renderMath.reticlePosition(this.hudEdge,window.innerWidth,window.innerHeight);
    return {...center,diameter:Math.max(ui.hud.heat.minDiameterPx,Math.abs(edge.x-center.x)*2)};
  }
  makeEntity(e) {
    let mesh;
    if(e.type==='enemy')mesh=this.parts(assets.enemyParts);
    if(e.type==='rock'){mesh=new THREE.Mesh(this.geometry(e.theme==='station'?'box':'ico'),this.material(e.theme==='station'?'dark':'fur'));mesh.scale.fromArray(renderMath.rockSize(e));}
    if(e.type==='barrier'){mesh=new THREE.Group();const body=new THREE.Mesh(this.geometry('box'),this.material('orange'));body.scale.fromArray(renderMath.barrierSize(e));mesh.add(body);const edges=new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry),new THREE.LineBasicMaterial({color:renderMath.barrierEdgeColor}));edges.scale.copy(body.scale);mesh.add(edges);}
    if(e.type==='pickup'){
      mesh=new THREE.Group();
      for(const [kind,color,position,scale,rotation=[0,0,0]] of assets.pickupParts[e.pickup]){
        const part=new THREE.Mesh(this.geometry(kind),new THREE.MeshStandardMaterial({color,roughness:.65,metalness:.05}));
        part.position.fromArray(position);part.scale.fromArray(scale);part.rotation.fromArray(rotation);mesh.add(part);
      }
      const halo=new THREE.Mesh(this.geometry('torus'),new THREE.MeshBasicMaterial({color:pickups.colors[e.pickup],transparent:true,opacity:.55}));
      halo.scale.set(1.8,1.8,.3);mesh.add(halo);
    }
    if(e.type==='bullet'||e.type==='hostile'){mesh=new THREE.Mesh(this.geometry('box'),new THREE.MeshBasicMaterial({color:e.type==='bullet'?renderMath.bulletColor:renderMath.hostileColor}));mesh.scale.fromArray(e.type==='bullet'?renderMath.bulletScale:renderMath.hostileScale);}
    this.scene.add(mesh);this.entities.set(e,mesh);return mesh;
  }
  removeEntity(e) {
    const mesh=this.entities.get(e);if(!mesh)return;this.scene.remove(mesh);this.entities.delete(e);
    mesh.traverse(object=>{if(object.isMesh||object.isLineSegments){if(object.geometry&&!Array.from(this.geometries.values()).includes(object.geometry))object.geometry.dispose();if(object.material&&!Array.from(this.materials.values()).includes(object.material))object.material.dispose();}});
  }
  synchronize(entities,bullets,s) {
    const live=new Set([...entities,...bullets]);
    for(const e of this.entities.keys())if(!live.has(e))this.removeEntity(e);
    for(const e of live){const mesh=this.entities.get(e)||this.makeEntity(e);mesh.position.fromArray(tunnel.world(e.x,e.y,e.d,s.distance));if(e.type!=='bullet'&&e.type!=='hostile')mesh.rotation.fromArray(assets.rotations(e));}
  }
  burst(e){this.particles.add(gfx.explode(e));}
  celebrate(s){this.particles.add(gfx.fireworks(s));}
  clearCrash(){
    if(!this.crashPresentation)return;
    this.scene.remove(this.crashPresentation.group);
    for(const resource of this.crashPresentation.resources)resource.dispose();
    this.crashPresentation=null;
  }
  clear(){
    for(const e of this.entities.keys())this.removeEntity(e);
    this.particles.clear();this.environment.clear();this.speedEffects.clear();this.clearCrash();
  }
  startCrash(s){
    this.clearCrash();this.rainbow({...s,invincible:0});
    const pose=flight.shipPose(s);this.ship.position.fromArray(pose.position);this.ship.rotation.fromArray(pose.rotation);
    this.ship.scale.setScalar(renderMath.flightScale);this.ship.updateMatrixWorld(true);
    const group=new THREE.Group(),pieces=[],resources=[];
    const meshes=[...this.ship.children.filter(mesh=>mesh.isMesh&&mesh!==this.shield&&!this.engines.includes(mesh)),...this.cannons.children];
    for(const source of meshes){
      const piece=source.clone();source.matrixWorld.decompose(piece.position,piece.quaternion,piece.scale);
      group.add(piece);pieces.push({mesh:piece,origin:piece.position.clone(),rotation:piece.rotation.clone(),
        velocity:new THREE.Vector3(math.visualRandom(-8,8),math.visualRandom(-5,6),math.visualRandom(-5,7)),
        spin:new THREE.Vector3(math.visualRandom(-3,3),math.visualRandom(-3,3),math.visualRandom(-3,3))});
    }
    const dog=this.dog.clone(true);dog.position.copy(this.ship.position);dog.scale.setScalar(renderMath.flightScale);group.add(dog);
    const canopyGeometry=new THREE.SphereGeometry(1.65,16,8,0,Math.PI*2,0,Math.PI/2);
    const canopyMaterial=new THREE.MeshStandardMaterial({color:0xffc276,side:THREE.DoubleSide,roughness:.7});
    const canopy=new THREE.Mesh(canopyGeometry,canopyMaterial);canopy.position.set(0,4.3,.2);dog.add(canopy);
    resources.push(canopyGeometry,canopyMaterial);
    const cordsGeometry=new THREE.BufferGeometry();const cords=[];
    for(const x of [-1.2,1.2])for(const z of [-.7,.7])cords.push(x,4.3,z,0,1.1,.3);
    cordsGeometry.setAttribute('position',new THREE.Float32BufferAttribute(cords,3));
    const cordsMaterial=new THREE.LineBasicMaterial({color:0xffeed4});dog.add(new THREE.LineSegments(cordsGeometry,cordsMaterial));resources.push(cordsGeometry,cordsMaterial);
    this.scene.add(group);this.crashPresentation={group,pieces,dog,canopy,origin:this.ship.position.clone(),resources};
    this.particles.add(gfx.explode({x:s.player.x,y:s.player.y,d:s.distance},150));
  }
  updateCrash(s){
    const crash=this.crashPresentation;if(!crash)return;
    const t=s.crashTime;
    for(const p of crash.pieces){
      p.mesh.position.copy(p.origin).addScaledVector(p.velocity,t);p.mesh.position.y-=t*t*.75;
      p.mesh.rotation.set(p.rotation.x+p.spin.x*t,p.rotation.y+p.spin.y*t,p.rotation.z+p.spin.z*t);
    }
    crash.dog.position.copy(crash.origin).add(new THREE.Vector3(-Math.sin(t)*1.5,Math.min(t*2.8,3),Math.min(t*1.5,2.5)));
    crash.dog.rotation.set(0,Math.sin(t*2)*.2,Math.sin(t*3)*.08);
    crash.canopy.scale.setScalar(math.clamp(t/.4,.01,1));
  }
  render(s,dt,titleTime,entities,bullets) {
    if(s.mode==='title'){this.speedEffects.clear();return;}
    this.setCannons(s.weapon.tier);
    const pose=flight.shipPose(s),camera=gfx.flightCamera(s);
    this.ship.position.fromArray(pose.position);this.ship.rotation.fromArray(pose.rotation);this.ship.scale.setScalar(renderMath.flightScale);this.ship.visible=!['defeat','crashing'].includes(s.mode)&&s.resumeMode!=='crashing'&&!pose.blink;
    this.camera.position.fromArray(camera.position);this.camera.lookAt(...camera.look);
    this.rainbow(s);this.shield.visible=s.protection>0;this.shield.scale.setScalar(renderMath.flightShieldScale(s.elapsed));
    this.route.use(s.seed);this.synchronize(entities,bullets,s);this.particles.update(s,dt);this.environment.update(s);this.speedEffects.update(s,dt);this.updateCrash(s);
    this.updateReticle(s);
    this.dog.rotation.y=assets.dogAnimation(titleTime);
    for(const engine of this.engines)engine.scale.fromArray(assets.engineScale(titleTime,s.boosting||s.turbo>0));
    this.speedEffects.render(this.scene,this.camera,s,dt);
  }
  resize() {this.renderer.setSize(window.innerWidth,window.innerHeight);this.camera.aspect=math.aspect(window.innerWidth,window.innerHeight);this.camera.updateProjectionMatrix();this.particles.resize(window.innerHeight,this.renderer.getPixelRatio());this.speedEffects.resize(window.innerWidth,window.innerHeight);}
}

namespace.FlightScene = FlightScene;
})(window.Starhound);
