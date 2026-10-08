import * as THREE from 'three';
import { assets, gfx, tunnel, weapon, pickups, flight, math, race, renderMath } from './settings.js';

export class FlightScene {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(gfx.ratio(window.devicePixelRatio));
    this.renderer.setClearColor(gfx.clear);this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=gfx.exposure;
    this.scene = new THREE.Scene();this.scene.fog=new THREE.FogExp2(gfx.clear,gfx.fogDensity);
    this.camera=new THREE.PerspectiveCamera(gfx.camera.fov,1,gfx.camera.near,gfx.camera.far);
    this.scene.add(new THREE.HemisphereLight(...renderMath.hemisphere,gfx.lighting.ambient));
    const key=new THREE.DirectionalLight(renderMath.keyColor,gfx.lighting.key);key.position.fromArray(gfx.lighting.keyPosition);this.scene.add(key);
    const rim=new THREE.DirectionalLight(renderMath.rimColor,gfx.lighting.rim);rim.position.fromArray(gfx.lighting.rimPosition);this.scene.add(rim);
    this.geometries=new Map();this.materials=new Map();this.entities=new Map();this.particles=[];
    this.ship=this.makeShip();this.scene.add(this.ship);
    this.makeTunnel();this.makeStars();this.makeParticles();
    this.finish=this.makeFinish();this.finish.visible=false;this.scene.add(this.finish);
    this.tier=-1;this.sector=-1;this.trailTimer=0;this.frame=new THREE.Object3D();this.color=new THREE.Color();
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
    if(tier===this.tier)return;this.tier=tier;this.cannons.clear();
    for(const x of weapon.barrels[tier]) {const barrel=new THREE.Mesh(this.geometry('box'),this.material('dark'));barrel.position.fromArray(renderMath.barrelPosition(x));barrel.scale.fromArray(assets.cannons.scale);this.cannons.add(barrel);}
  }
  makeTunnel() {
    const walls=new THREE.BufferGeometry();this.wallArray=new Float32Array(tunnel.vertexCount());walls.setAttribute('position',new THREE.BufferAttribute(this.wallArray,3).setUsage(THREE.DynamicDrawUsage));
    this.walls=new THREE.Mesh(walls,new THREE.MeshBasicMaterial({color:tunnel.wallColor,side:THREE.DoubleSide,transparent:true,opacity:renderMath.wallOpacity,depthWrite:false}));this.walls.frustumCulled=false;this.scene.add(this.walls);
    const lines=new THREE.BufferGeometry();this.lineArray=new Float32Array(tunnel.lineCount());lines.setAttribute('position',new THREE.BufferAttribute(this.lineArray,3).setUsage(THREE.DynamicDrawUsage));
    this.lines=new THREE.LineSegments(lines,new THREE.LineBasicMaterial({color:tunnel.railColor,transparent:true,opacity:renderMath.lineOpacity}));this.lines.frustumCulled=false;this.scene.add(this.lines);
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
  makeParticles() {
    const material=new THREE.MeshBasicMaterial({color:assets.finish.color,transparent:true,opacity:renderMath.particleOpacity,depthWrite:false});
    this.particleMesh=new THREE.InstancedMesh(this.geometry('tetra'),material,gfx.particle.capacity);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.particleMesh.frustumCulled=false;this.particleMesh.count=0;this.scene.add(this.particleMesh);
  }
  makeFinish() {
    const texture=new THREE.DataTexture(renderMath.checker(),assets.finish.checkerSize,assets.finish.checkerSize,THREE.RGBAFormat);
    texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.RepeatWrapping;texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
    const group=new THREE.Group();
    for(const part of assets.finishParts()){const tile=texture.clone();tile.repeat.set(...renderMath.checkerRepeats(part));tile.needsUpdate=true;const material=new THREE.MeshBasicMaterial({map:tile,color:assets.finish.color});const mesh=new THREE.Mesh(this.geometry('box'),material);mesh.position.fromArray(renderMath.finishPosition(part));mesh.scale.fromArray(renderMath.finishSize(part));group.add(mesh);}
    return group;
  }
  makeEntity(e) {
    let mesh;
    if(e.type==='enemy')mesh=this.parts(assets.enemyParts);
    if(e.type==='rock'){mesh=new THREE.Mesh(this.geometry('ico'),this.material('fur'));mesh.scale.fromArray(renderMath.rockSize(e));}
    if(e.type==='barrier'){mesh=new THREE.Group();const body=new THREE.Mesh(this.geometry('box'),this.material('orange'));body.scale.fromArray(renderMath.barrierSize(e));mesh.add(body);const edges=new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry),new THREE.LineBasicMaterial({color:renderMath.barrierEdgeColor}));edges.scale.copy(body.scale);mesh.add(edges);}
    if(e.type==='pickup'){
      const color=pickups.colors[e.pickup];mesh=new THREE.Group();
      const core=new THREE.Mesh(this.geometry('octa'),new THREE.MeshBasicMaterial({color,wireframe:false}));core.scale.fromArray(renderMath.pickupScale);mesh.add(core);
      const halo=new THREE.Mesh(this.geometry('octa'),new THREE.MeshBasicMaterial({color,wireframe:true,transparent:true,opacity:renderMath.pickupHaloOpacity}));halo.scale.setScalar(renderMath.pickupHaloSize);mesh.add(halo);
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
  burst(e) {this.particles.push(...gfx.explode(e));}
  clear() {for(const e of this.entities.keys())this.removeEntity(e);this.particles.length=0;this.trailTimer=0;}
  updateTunnel(distance,sector) {
    tunnel.fillWalls(this.wallArray,distance);tunnel.fillLines(this.lineArray,distance);
    this.walls.geometry.attributes.position.needsUpdate=true;this.lines.geometry.attributes.position.needsUpdate=true;
    if(this.sector!==sector){this.sector=sector;this.lines.material.color.set(race.colors[sector]);}
  }
  updateParticles(dt,s,emit) {
    this.trailTimer=math.add(this.trailTimer,dt);
    if(emit&&this.trailTimer>=renderMath.trailInterval){this.trailTimer=0;this.particles.push(...gfx.trail(s));if(s.boosting||s.turbo>0)this.particles.push(gfx.stream(s),gfx.stream(s),gfx.stream(s));}
    this.particles=this.particles.filter(p=>{gfx.stepParticle(p,dt);return p.age<p.life;}).slice(-gfx.particle.capacity);
    let index=0;
    for(const p of this.particles){const pose=renderMath.particleTransform(p,s.distance);this.frame.position.fromArray(pose.position);this.frame.scale.fromArray(pose.scale);this.frame.rotation.fromArray(pose.rotation);this.frame.updateMatrix();this.particleMesh.setMatrixAt(index,this.frame.matrix);this.color.set(p.color).multiplyScalar(pose.fade);this.particleMesh.setColorAt(index,this.color);index++;}
    this.particleMesh.count=index;this.particleMesh.instanceMatrix.needsUpdate=true;if(this.particleMesh.instanceColor)this.particleMesh.instanceColor.needsUpdate=true;
  }
  render(s,dt,titleTime,entities,bullets) {
    this.setCannons(s.weapon.tier);
    if(s.mode==='title'){
      const pose=renderMath.titlePose(titleTime,this.camera.aspect),camera=renderMath.titleCamera(this.camera.aspect);
      this.ship.position.fromArray(pose.position);this.ship.rotation.fromArray(renderMath.titleRotation(titleTime));this.ship.scale.setScalar(renderMath.titleScaleFor(this.camera.aspect));this.ship.visible=true;
      this.camera.position.fromArray(camera.position);this.camera.lookAt(...camera.look);this.finish.visible=false;this.shield.visible=false;
      this.updateTunnel(gfx.titleDistance(titleTime),0);this.particleMesh.count=0;
    }else{
      const pose=flight.shipPose(s),camera=gfx.flightCamera(s);
      this.ship.position.fromArray(pose.position);this.ship.rotation.fromArray(pose.rotation);this.ship.scale.setScalar(renderMath.flightScale);this.ship.visible=s.mode!=='defeat'&&!pose.blink;
      this.camera.position.fromArray(camera.position);this.camera.lookAt(...camera.look);
      this.shield.visible=s.invincible>0;this.shield.scale.setScalar(renderMath.flightShieldScale(s.elapsed));
      this.updateTunnel(s.distance,s.sector);this.synchronize(entities,bullets,s);this.updateParticles(dt,s,s.mode==='playing');
      this.finish.position.fromArray(tunnel.world(0,0,race.totalDistance(),s.distance));this.finish.visible=renderMath.finishVisible(s);
    }
    this.dog.rotation.y=assets.dogAnimation(titleTime);
    for(const engine of this.engines)engine.scale.fromArray(assets.engineScale(titleTime,s.boosting||s.turbo>0));
    this.renderer.render(this.scene,this.camera);
  }
  resize() {this.renderer.setSize(window.innerWidth,window.innerHeight);this.camera.aspect=math.aspect(window.innerWidth,window.innerHeight);this.camera.updateProjectionMatrix();}
}
