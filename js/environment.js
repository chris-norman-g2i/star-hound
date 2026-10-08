(function(namespace){
'use strict';
const THREE=namespace.THREE;
const {race,tunnel,scenery}=namespace.settings;

/** Decorative scenery is generated independently of the encounter random stream.
 * Bounding spheres are checked against the curved corridor before any object is shown.
 */
class FlightEnvironment {
  constructor(scene){
    this.scene=scene;this.objects=new Map();this.gates=new Map();
    this.geometries={box:new THREE.BoxGeometry(),rock:new THREE.IcosahedronGeometry(1,1),
      cylinder:new THREE.CylinderGeometry(1,1,1,12),sphere:new THREE.SphereGeometry(1,12,8),
      torus:new THREE.TorusGeometry(1,.13,8,40),gate:new THREE.TorusGeometry(15.3,.28,8,80),trim:new THREE.TorusGeometry(15.9,.07,6,80)};
    this.materials={hull:new THREE.MeshStandardMaterial({color:0x5e849a,metalness:.65,roughness:.45}),
      rock:new THREE.MeshStandardMaterial({color:0x78675d,roughness:.95,flatShading:true}),
      panel:new THREE.MeshStandardMaterial({color:0x235a9e,emissive:0x123652,metalness:.6}),
      light:new THREE.MeshBasicMaterial({color:0xa5f2ef}),gate:new THREE.MeshBasicMaterial({color:0x80f1cf})};
  }
  part(group,shape,material,position,scale,rotation=[0,0,0]){
    const mesh=new THREE.Mesh(this.geometries[shape],this.materials[material]);
    mesh.position.fromArray(position);mesh.scale.fromArray(scale);mesh.rotation.fromArray(rotation);group.add(mesh);return mesh;
  }
  makeObject(p){
    const group=new THREE.Group();
    if(p.kind==='rock')this.part(group,'rock','rock',[0,0,0],[9,7,10]);
    if(p.kind==='station'){
      this.part(group,'cylinder','hull',[0,0,0],[4,13,4],[Math.PI/2,0,0]);
      this.part(group,'torus','hull',[0,0,0],[12,12,12]);
      this.part(group,'torus','light',[0,0,.3],[12.3,12.3,.5]);
      for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
        this.part(group,'box','hull',[Math.cos(angle)*6,Math.sin(angle)*6,0],[12,1,1],[0,0,angle]);
        this.part(group,'box','panel',[Math.cos(angle)*12,Math.sin(angle)*12,0],[4,3,1],[0,0,angle]);
      }
    }
    if(p.kind==='satellite'){
      this.part(group,'cylinder','hull',[0,0,0],[2.5,7,2.5]);
      for(const x of [-8,8]){
        this.part(group,'box','hull',[x*.5,0,0],[8,.5,.5]);
        this.part(group,'box','panel',[x,0,0],[7,9,.3]);
        for(const y of [-3,0,3])this.part(group,'box','light',[x,y,-.2],[6.5,.06,.06]);
      }
      this.part(group,'sphere','hull',[0,5,0],[3,.6,3]);
      this.part(group,'box','light',[0,7,0],[.15,3,.15]);
    }
    group.scale.setScalar(p.scale);group.rotation.set(.2,p.rotation,.15);
    group.userData.placement=p;this.scene.add(group);return group;
  }
  makeGate(wave){
    const group=new THREE.Group();
    this.part(group,'gate','gate',[0,0,0],[1,1,1]);
    this.part(group,'trim','light',[0,0,0],[1,1,1]);
    this.scene.add(group);return group;
  }
  clear(){
    for(const group of [...this.objects.values(),...this.gates.values()])this.scene.remove(group);
    this.objects.clear();this.gates.clear();
  }
  update(s){
    const first=Math.max(0,Math.floor((s.distance-50)/scenery.spacing));
    const last=Math.ceil((s.distance+tunnel.depth)/scenery.spacing);
    for(const [index,group] of this.objects)if(index<first||index>last){this.scene.remove(group);this.objects.delete(index);}
    for(let index=first;index<=last;index++){
      if(!this.objects.has(index)){
        const p=scenery.placement(index);if(scenery.clearsPath(p))this.objects.set(index,this.makeObject(p));
      }
      const group=this.objects.get(index);if(group){const p=group.userData.placement;group.position.fromArray(tunnel.world(p.x,p.y,p.d,s.distance));}
    }
    const gateWaves=new Set();
    for(let wave=Math.max(2,s.wave);race.checkpointDistance(wave)<=s.distance+tunnel.depth;wave++){
      const d=race.checkpointDistance(wave);if(d<s.distance-25)continue;
      gateWaves.add(wave);if(!this.gates.has(wave))this.gates.set(wave,this.makeGate(wave));
      this.gates.get(wave).position.fromArray(tunnel.world(0,0,d,s.distance));
    }
    for(const [wave,group] of this.gates)if(!gateWaves.has(wave)){this.scene.remove(group);this.gates.delete(wave);}
  }
}
namespace.FlightEnvironment=FlightEnvironment;
})(window.Starhound);
