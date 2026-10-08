(function(namespace){
'use strict';
const THREE=namespace.THREE;
const {race,tunnel,scenery,route,speedRings}=namespace.settings;

/** Decorative scenery is generated independently of the encounter random stream.
 * Bounding spheres are checked against the curved corridor before any object is shown.
 */
class FlightEnvironment {
  constructor(scene,plan){
    this.scene=scene;this.plan=plan;this.objects=new Map();this.gates=new Map();this.motifs=new Map();this.rings=new Map();
    const g=route.geometry;
    this.geometries={box:new THREE.BoxGeometry(),rock:new THREE.IcosahedronGeometry(1,g.rockDetail),cruiser:new THREE.IcosahedronGeometry(1,g.rockDetail),
      cylinder:new THREE.CylinderGeometry(1,1,1,g.radialSegments),sphere:new THREE.SphereGeometry(1,g.sphereWidthSegments,g.sphereHeightSegments),
      torus:new THREE.TorusGeometry(1,g.torusTube,g.torusRadialSegments,g.torusSegments),gate:new THREE.TorusGeometry(g.gateRadius,g.gateTube,g.torusRadialSegments,g.gateSegments),trim:new THREE.TorusGeometry(g.trimRadius,g.trimTube,g.trimRadialSegments,g.gateSegments),
      rib:new THREE.TorusGeometry(route.tunnel.radius,route.tunnel.ribWidth,g.torusRadialSegments,route.tunnel.sides),
      ring:new THREE.TorusGeometry(speedRings.radius,speedRings.tubeRadius,speedRings.tubeSegments,speedRings.sides)};
    this.materials={hull:new THREE.MeshStandardMaterial({color:0x5e849a,metalness:.65,roughness:.45}),
      panel:new THREE.MeshStandardMaterial({color:0x235a9e,emissive:0x123652,metalness:.6}),
      gate:new THREE.MeshBasicMaterial({color:0x80f1cf})};
    for(const [name,color] of Object.entries(route.palette))this.materials[name]=new THREE.MeshStandardMaterial({
      color,side:THREE.DoubleSide,roughness:route.material.roughness,metalness:route.material.metalness,
      ...(name==='window'?{transparent:true,opacity:route.material.windowOpacity,depthWrite:false,emissive:color,emissiveIntensity:route.material.windowEmissive}:{})});
    this.materials.wall.emissive.set(route.palette.wall);this.materials.wall.emissiveIntensity=route.material.wallEmissive;
    for(const name of ['light','engine']){this.materials[name].emissive.set(route.palette[name]);this.materials[name].emissiveIntensity=route.material.lightEmissive;}
    this.clusterMaterials=scenery.clusters.colors.map(color=>new THREE.MeshStandardMaterial({color,roughness:1,flatShading:true}));
    this.ringMaterials=Object.fromEntries(Object.entries(speedRings.colors).map(([name,color])=>[name,new THREE.MeshBasicMaterial({color})]));
  }
  part(group,shape,material,position,scale,rotation=[0,0,0]){
    const mesh=new THREE.Mesh(this.geometries[shape],this.materials[material]);
    mesh.position.fromArray(position);mesh.scale.fromArray(scale);mesh.rotation.fromArray(rotation);group.add(mesh);return mesh;
  }
  makeObject(p){
    const group=new THREE.Group();
    if(p.kind==='rock'){
      const c=scenery.clusters,count=c.minCount+Math.floor(this.plan.sample(p.index,'cluster-count')*(c.maxCount-c.minCount+1));
      const material=this.clusterMaterials[Math.floor(this.plan.sample(p.index,'cluster-color')*this.clusterMaterials.length)];
      for(let i=0;i<count;i++){
        const radius=c.minRadius+this.plan.sample(p.index,`cluster-radius:${i}`)*(c.maxRadius-c.minRadius);
        const mesh=new THREE.Mesh(this.geometries.rock,material);
        mesh.position.set((this.plan.sample(p.index,`cluster-x:${i}`)*2-1)*c.spreadX,
          (this.plan.sample(p.index,`cluster-y:${i}`)*2-1)*c.spreadY,(this.plan.sample(p.index,`cluster-z:${i}`)*2-1)*c.spreadD);
        mesh.scale.setScalar(radius);mesh.rotation.set(this.plan.sample(p.index,`cluster-spin:${i}`)*Math.PI,0,0);group.add(mesh);
      }
    }
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
    const group=new THREE.Group(),profile=this.plan.gateProfile(race.checkpointDistance(wave));
    group.userData.profile=profile;
    if(profile.shape==='rectangle'){
      const width=route.gates.frameWidth;
      for(const x of [-profile.rx,profile.rx])this.part(group,'box','gate',[x,0,0],[width,profile.ry*2,width]);
      for(const y of [-profile.ry,profile.ry])this.part(group,'box','gate',[0,y,0],[profile.rx*2,width,width]);
    }else{
      this.part(group,'gate','gate',[0,0,0],[1,1,1]);
      this.part(group,'trim','light',[0,0,0],[1,1,1]);
      if(profile.shape==='ellipse'){
        const radius=route.geometry.trimRadius+route.geometry.trimTube;
        group.scale.set(profile.rx/radius,profile.ry/radius,1);
      }
    }
    this.scene.add(group);return group;
  }
  ownGeometry(group,geometry){
    (group.userData.resources||= []).push(geometry);return geometry;
  }
  curvedSkin(group,profile,first,last,origin,windowSides=[]){
    const vertices={wall:[],window:[]};
    const local=(point,d)=>{
      const center=tunnel.center(d),base=tunnel.center(origin);
      return [point[0]+center.x-base.x,point[1]+center.y-base.y,origin-d];
    };
    for(let side=0;side<profile.length;side++){
      const next=(side+1)%profile.length,a=local(profile[side],first),b=local(profile[next],first),
        c=local(profile[side],last),d=local(profile[next],last);
      vertices[windowSides.includes(side)?'window':'wall'].push(...a,...c,...b,...b,...c,...d);
    }
    for(const [material,points] of Object.entries(vertices)){
      if(!points.length)continue;
      const geometry=this.ownGeometry(group,new THREE.BufferGeometry());
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geometry.computeVertexNormals();
      const mesh=new THREE.Mesh(geometry,this.materials[material]);group.add(mesh);
    }
  }
  makeTile(segment,index,first,last){
    const group=new THREE.Group(),d=(first+last)/2;
    group.userData.d=d;group.userData.segment=segment;
    const length=last-first;
    if(segment.kind==='tunnel'){
      const c=route.tunnel,profile=Array.from({length:c.sides},(_,i)=>[Math.cos(i*Math.PI*2/c.sides)*c.radius,Math.sin(i*Math.PI*2/c.sides)*c.radius]);
      const windows=index%c.windowGroupTiles<c.windowTiles?c.windowSides:[];
      this.curvedSkin(group,profile,first,last,d,windows);
      if(index%c.ribEveryTiles===0){
        const center=tunnel.center(first),base=tunnel.center(d);
        this.part(group,'rib','rib',[center.x-base.x,center.y-base.y,d-first],[1,1,1]);
      }
      // Window banks have luminous jambs; ceiling/floor banks use the same grouped pattern.
      for(const side of windows){
        const angle=side*Math.PI*2/c.sides;
        this.part(group,'box','light',[Math.cos(angle)*(c.radius-c.windowInset),Math.sin(angle)*(c.radius-c.windowInset),0],
          [c.windowInset,c.windowInset,length]);
      }
    }
    if(segment.kind==='station'){
      const c=route.station;
      this.curvedSkin(group,[[c.halfWidth,c.halfHeight],[-c.halfWidth,c.halfHeight],[-c.halfWidth,-c.halfHeight],[c.halfWidth,-c.halfHeight]],first,last,d);
      for(const x of [-c.halfWidth,c.halfWidth])for(const y of [-c.halfHeight,c.halfHeight])
        this.part(group,'box','light',[x,y,0],[c.lightWidth,c.lightWidth,length]);
      for(const y of [-c.halfHeight,c.halfHeight])this.part(group,'box','rib',[0,y,0],[c.halfWidth*2,c.frameWidth,c.frameWidth]);
      for(const x of [-c.halfWidth+c.panelInset,c.halfWidth-c.panelInset]){
        this.part(group,'box','rib',[x,0,0],[c.panelThickness,c.panelHeight,Math.min(c.panelDepth,length)]);
        this.part(group,'box','light',[x,c.panelHeight/2,0],[c.lightWidth,c.lightWidth,Math.min(c.panelDepth,length)]);
      }
    }
    if(segment.kind==='cruiser'){
      const c=route.cruiser,tileCount=Math.ceil((segment.end-segment.start)/route.tileDistance);
      const taper=Math.min(1,(index+1)/c.noseTiles,(tileCount-index)/c.tailTiles);
      this.part(group,'cruiser','cruiser',[0,0,0],c.hullScale.map((v,i)=>i===2?length*c.segmentOverlap:v*taper));
      this.part(group,'box','cruiser',[...c.spineOffset],c.spineScale.map((v,i)=>i===2?length*c.segmentOverlap:v*taper));
      for(const sign of [-1,1])this.part(group,'cruiser','cruiser',[sign*c.wingOffset[0],c.wingOffset[1],c.wingOffset[2]],c.wingScale.map((v,i)=>i===2?length*c.segmentOverlap:v*taper));
      this.part(group,'box','cruiserTrim',c.trimOffset,c.trimScale.map((v,i)=>i===2?length*c.segmentOverlap:v));
      for(const x of c.windowXs)for(const y of c.windowYs)for(const z of c.windowZs)this.part(group,'box','light',[x*taper,y,z],c.windowScale);
      if(index>=tileCount-c.tailTiles)for(const x of c.engineXs)this.part(group,'cruiser','engine',[x,0,c.engineZ],c.engineScale);
      group.userData.x=segment.side==='left'?-c.offsetX:segment.side==='right'?c.offsetX:0;
      group.userData.y=segment.side==='bottom'?c.offsetY:0;
      const a=tunnel.center(first),b=tunnel.center(last);
      group.rotation.y=-Math.atan2(b.x-a.x,length);group.rotation.x=Math.atan2(b.y-a.y,length);
    }
    this.scene.add(group);return group;
  }
  makePortal(segment,portal){
    const group=new THREE.Group(),c=route.station;
    group.userData.d=portal.d;
    const left=portal.x-c.openingHalfWidth,right=portal.x+c.openingHalfWidth,
      floor=portal.y-c.openingHalfHeight,ceiling=portal.y+c.openingHalfHeight;
    const slab=(x1,x2,y1,y2)=>this.part(group,'box','station',[(x1+x2)/2,(y1+y2)/2,0],[x2-x1,y2-y1,c.portalDepth*2]);
    slab(-c.halfWidth,left,-c.halfHeight,c.halfHeight);slab(right,c.halfWidth,-c.halfHeight,c.halfHeight);
    slab(left,right,-c.halfHeight,floor);slab(left,right,ceiling,c.halfHeight);
    for(const x of [left,right])this.part(group,'box','light',[x,portal.y,-c.portalDepth],[c.frameWidth,c.openingHalfHeight*2,c.frameWidth]);
    for(const y of [floor,ceiling])this.part(group,'box','light',[portal.x,y,-c.portalDepth],[c.openingHalfWidth*2,c.frameWidth,c.frameWidth]);
    for(const sign of [-1,1]){
      this.part(group,'box','rib',[sign*c.moduleOffset/2,c.moduleY,c.portalDepth],c.armScale);
      this.part(group,'cruiser','station',[sign*c.moduleOffset,c.moduleY,c.portalDepth],c.moduleScale);
      this.part(group,'box','panel',[sign*c.exteriorPanelOffset[0],c.exteriorPanelOffset[1],c.exteriorPanelOffset[2]],c.exteriorPanelScale);
    }
    for(const y of [floor,ceiling])this.part(group,'box','hazard',[portal.x,y,-c.portalDepth-c.doorTrimWidth],[c.openingHalfWidth*2,c.doorTrimWidth,c.doorTrimWidth]);
    this.part(group,'cruiser','station',c.domePosition,c.domeScale);
    this.scene.add(group);return group;
  }
  makeBulkhead(obstacle){
    const group=new THREE.Group();group.userData.d=obstacle.d;
    this.part(group,'box','station',[obstacle.x,obstacle.y,0],[obstacle.rx*2,obstacle.ry*2,obstacle.rz*2]);
    this.part(group,'box','hazard',[obstacle.x,obstacle.y,-obstacle.rz],[obstacle.rx*2,route.station.frameWidth,route.station.frameWidth]);
    for(const x of route.station.hazardStripeOffsets)this.part(group,'box','hazard',[obstacle.x+x,obstacle.y,-obstacle.rz],route.station.hazardStripeScale,[0,0,route.station.hazardStripeAngle]);
    this.scene.add(group);return group;
  }
  updateMotifs(s){
    const first=Math.max(0,s.distance-route.behindDistance),last=s.distance+tunnel.depth,wanted=new Set();
    const keep=(id,make)=>{wanted.add(id);if(!this.motifs.has(id))this.motifs.set(id,make());};
    for(const segment of this.plan.between(first,last)){
      if(segment.kind==='open')continue;
      const from=Math.max(0,Math.floor((first-segment.start)/route.tileDistance)),to=Math.ceil((Math.min(last,segment.end)-segment.start)/route.tileDistance);
      for(let i=from;i<to;i++){
        const a=segment.start+i*route.tileDistance,b=Math.min(segment.end,a+route.tileDistance);
        keep(`${segment.id}:tile:${i}`,()=>this.makeTile(segment,i,a,b));
      }
      for(const portal of segment.portals||[])if(portal.d>=first&&portal.d<=last)keep(portal.id,()=>this.makePortal(segment,portal));
      for(const obstacle of segment.obstacles||[])if(obstacle.d>=first&&obstacle.d<=last)keep(obstacle.id,()=>this.makeBulkhead(obstacle));
    }
    for(const [id,group] of this.motifs){
      if(!wanted.has(id)){this.remove(group);this.motifs.delete(id);continue;}
      group.position.fromArray(tunnel.world(group.userData.x||0,group.userData.y||0,group.userData.d,s.distance));
    }
  }
  updateRings(s){
    const wanted=new Set();
    for(const ring of this.plan.visibleRings(s.distance-route.behindDistance,s.distance+tunnel.depth)){
      wanted.add(ring.id);
      let group=this.rings.get(ring.id);
      if(!group){group=new THREE.Mesh(this.geometries.ring,this.ringMaterials.ready);this.scene.add(group);this.rings.set(ring.id,group);}
      group.material=this.ringMaterials[ring.result];group.position.fromArray(tunnel.world(ring.x,ring.y,ring.d,s.distance));
    }
    for(const [id,group] of this.rings)if(!wanted.has(id)){this.remove(group);this.rings.delete(id);}
  }
  remove(group){
    this.scene.remove(group);
    for(const geometry of group.userData.resources||[])geometry.dispose();
  }
  clear(){
    for(const map of [this.objects,this.gates,this.motifs,this.rings]){for(const group of map.values())this.remove(group);map.clear();}
  }
  update(s){
    this.updateMotifs(s);this.updateRings(s);
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
      const group=this.gates.get(wave),profile=group.userData.profile;
      group.position.fromArray(tunnel.world(profile.x,profile.y,d,s.distance));
    }
    for(const [wave,group] of this.gates)if(!gateWaves.has(wave)){this.scene.remove(group);this.gates.delete(wave);}
  }
}
namespace.FlightEnvironment=FlightEnvironment;
})(window.Starhound);
