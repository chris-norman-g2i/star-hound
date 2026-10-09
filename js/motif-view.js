(function(namespace){
'use strict';
const THREE=namespace.THREE;
const {traffic,tropes,math,tunnel,renderMath}=namespace.settings;
// Authored shape data stays separate from rendering and collision behavior.
const ART={materials:{dark:0x162b36,glass:0x87d9e4,trim:0xe4d0ab,wood:0x9d6035,fruit:0xec3352,leaf:0x5ab84e,
  suit:0xe3dbc5,suitAccent:0xd98445,visor:0x193a50,smoke:0x93a5b2},
  roughness:.64,metalness:.28,glassOpacity:.24,glassEmissive:.18,fruitSeeds:8,
  cart:{bounds:[4.6,3,3],wheelRadius:1.55,wheelWidth:.5,wheelSegments:12,loadRows:3,loadColumns:6,berrySize:.27,
    bodyPosition:[0,-.4,0],wheelPositions:[[0,-1.3,-1.75],[0,-1.3,1.75]],wheelRotation:[Math.PI/2,0,0],
    trimRows:[-.65,.65],trimDepth:1.55,trimSize:[4.7,.12,.12],berrySpacing:[.65,.8],berryHeight:1.2,berryRipple:.1},
  cloth:{subdivisions:2,wrapDepth:2.2,foldDepth:.08,attachScale:.85,attachPosition:[0,1.45,-.6],releaseSeconds:1.3,releaseSpeed:16,
    shirt:[[-.18,1],[-.4,1],[-1,.65],[-.75,.25],[-.43,.45],[-.43,-1],[.43,-1],[.43,.45],[.75,.25],[1,.65],[.4,1],[.18,1],[0,.82]],
    pants:[[-.65,1],[-.72,-1],[-.14,-1],[0,.12],[.14,-1],[.72,-1],[.65,1]]},
  spaceman:{xOffset:1.6,y:-8,walkFrequency:2.2,walkAngle:.18,turnAngle:.2,angryFrequencyMultiplier:3,
    parts:[['octa','suit',[0,2.35,0],[.7,.75,.65]],['box','suit',[0,.95,0],[1.05,1.7,.7]],
      ['tetra','suitAccent',[0,1,.6],[.8,1.1,.65]],
      ['tetra','suit',[-.85,1.2,-.25],[.5,1.55,.5],[0,0,.7]],['tetra','suit',[.85,1.2,-.25],[.5,1.55,.5],[0,0,-.7]],
      ['tetra','suit',[-.32,-.6,0],[.5,1.85,.55],[0,0,0],'leg'],['tetra','suit',[.32,-.6,0],[.5,1.85,.55],[0,0,0],'leg'],
      ['tetra','suitAccent',[-.35,-1.7,-.25],[.6,.4,.85]],['tetra','suitAccent',[.35,-1.7,-.25],[.6,.4,.85]],
      ['plane','visor',[0,2.45,-.56],[.9,.45,1]]]},
  vehicleLamps:{size:[.3,.2,.08],front:0xc1edf7,rear:0xfa6b47,widthFraction:.65},
  fruit:{shapeScale:[1,1.3,1],rotation:[0,0,Math.PI],seedSize:[.025,.04,.01],seedColor:0xffd890,
    seedRadius:.75,seedHeight:.6,seedDepth:.78,
    leaves:[[[-.25,-.9,0],[.7,.35,1],[Math.PI/2,0,-.5]],[[.25,-.9,0],[.7,.35,1],[Math.PI/2,0,.5]]]},
  glass:{edgeWidth:.035,edgeDepth:.08,highlightPosition:[-.4,.15,0],highlightScale:[.008,1.7,1],highlightTilt:-.35,highlightColor:0xdaf6ff},
  fragments:{glassScale:[1,.7,.04],cardboardScale:[1,1,.1],wreckageScale:[1,.65,.85]},
  wire:{lineWidth:.055,sag:.45,postWidth:.16},
  vehicles:{
    truck:[['box','body',[0,0,.9],[3.3,2.5,6.8]],['box','trim',[0,1.28,.9],[3.2,.12,6.7]],
      ['box','body',[0,-.1,-3.5],[3.1,2.1,2.1]],['box','dark',[0,.42,-4.58],[2.6,.82,.08]],
      ['box','dark',[-1,-.35,4.25],[.9,.9,1]],['box','dark',[1,-.35,4.25],[.9,.9,1]],
      ['box','trim',[-1.7,0,1],[.1,2.4,.14]],['box','trim',[1.7,0,1],[.1,2.4,.14]]],
    racer:[['ico','body',[0,0,-.3],[.95,.5,3]],['octa','dark',[0,.55,-.7],[.55,.35,1.1]],
      ['ico','body',[-1.1,-.2,1],[1,.12,1.6]],['ico','body',[1.1,-.2,1],[1,.12,1.6]],
      ['box','dark',[-.65,0,2.6],[.5,.5,1.2]],['box','dark',[.65,0,2.6],[.5,.5,1.2]],
      ['box','trim',[0,0,-2.3],[.12,.15,1.6]]],
    car:[['ico','body',[0,-.1,0],[1.3,.65,2.4]],['box','body',[0,.35,-.15],[1.65,.6,2.1]],
      ['box','dark',[0,.7,-.3],[1.5,.08,1.6]],['box','dark',[0,.42,-1.24],[1.45,.45,.08]],
      ['box','trim',[-1.3,-.25,.2],[.12,.18,3]],['box','trim',[1.3,-.25,.2],[.12,.18,3]],
      ['box','dark',[-.7,-.3,2.1],[.5,.5,.8]],['box','dark',[.7,-.3,2.1],[.5,.5,.8]]],
    motorcycle:[['ico','body',[0,-.25,-.2],[.48,.4,2.1]],['octa','body',[0,-.4,1.5],[.65,.3,.7]],
      ['box','dark',[0,-.25,1.8],[.55,.55,1]],['octa','dark',[0,.55,.15],[.32,.6,.48]],
      ['octa','trim',[0,1.18,-.25],[.36,.36,.36]],['box','trim',[0,.35,-1],[1,.12,.2]],
      ['ico','body',[-.58,-.35,.5],[.4,.1,.9]],['ico','body',[.58,-.35,.5],[.4,.1,.9]]],
  },
};
class FlightMotifView {
  constructor(scene,plan,ship,dog){
    this.scene=scene;this.plan=plan;this.ship=ship;this.dog=dog;
    this.vehicles=new Map();this.stages=new Map();this.fragments=new Map();this.materials=new Map();this.released=[];this.attached=null;
    this.geometries={box:new THREE.BoxGeometry(),ico:new THREE.IcosahedronGeometry(1,0),octa:new THREE.OctahedronGeometry(),tetra:new THREE.TetrahedronGeometry(),
      plane:new THREE.PlaneGeometry(),wheel:new THREE.CylinderGeometry(ART.cart.wheelRadius,ART.cart.wheelRadius,ART.cart.wheelWidth,ART.cart.wheelSegments)};
    this.clothGeometry={shirt:this.garmentGeometry('shirt'),pants:this.garmentGeometry('pants')};
    const loader=new THREE.TextureLoader();
    this.boxMaterials=tropes.brands.map(brand=>{
      const texture=loader.load(namespace.MotifTextures[brand.id]);texture.colorSpace=THREE.SRGBColorSpace;
      return new THREE.MeshStandardMaterial({map:texture,roughness:1});
    });
    this.forward=new THREE.Vector3(0,0,-1);this.vector=new THREE.Vector3();
    this.batches=this.vehicleBatches();this.instanceColor=new THREE.Color();
  }
  material(color,glass=false){
    const key=`${color}:${glass}`;
    if(!this.materials.has(key))this.materials.set(key,new THREE.MeshStandardMaterial({color,
      roughness:glass?.18:ART.roughness,metalness:ART.metalness,flatShading:!glass,
      ...(glass?{transparent:true,opacity:ART.glassOpacity,depthWrite:false,side:THREE.DoubleSide,emissive:color,emissiveIntensity:ART.glassEmissive}:{})}));
    return this.materials.get(key);
  }
  part(group,shape,color,position,scale,rotation=[0,0,0],material=null){
    const mesh=new THREE.Mesh(this.geometries[shape],material||this.material(color));
    mesh.position.fromArray(position);mesh.scale.fromArray(scale);mesh.rotation.fromArray(rotation);group.add(mesh);return mesh;
  }
  mergeGeometry(sources,attributes=['position','normal','uv']){
    const geometry=new THREE.BufferGeometry();
    for(const attribute of attributes){
      if(!sources.every(source=>source.attributes[attribute]))continue;
      geometry.setAttribute(attribute,new THREE.Float32BufferAttribute(sources.flatMap(source=>Array.from(source.attributes[attribute].array)),sources[0].attributes[attribute].itemSize));
    }
    for(const source of sources)source.dispose();return geometry;
  }
  vehicleBatches(){
    const batches={};
    for(const [kind,parts] of Object.entries(ART.vehicles)){
      const sources={},bounds=traffic.models[kind].bounds,c=ART.vehicleLamps;
      const specs=[...parts];
      for(const sign of [-1,1]){
        specs.push(['box','front',[sign*bounds[0]*c.widthFraction,0,-bounds[2]],c.size]);
        specs.push(['box','rear',[sign*bounds[0]*c.widthFraction,0,bounds[2]],c.size]);
      }
      for(const [shape,role,position,scale] of specs){
        const source=this.geometries[shape],geometry=source.index?source.toNonIndexed():source.clone();
        geometry.scale(...scale);geometry.translate(...position);(sources[role]||=[]).push(geometry);
      }
      batches[kind]={};
      for(const [role,geometries] of Object.entries(sources)){
        const geometry=this.mergeGeometry(geometries);
        const color=role==='body'?0xffffff:ART.materials[role]||c[role];
        const material=this.material(color);
        const mesh=new THREE.InstancedMesh(geometry,material,traffic.maxVehicles);mesh.count=0;mesh.frustumCulled=false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.scene.add(mesh);batches[kind][role]=mesh;
      }
    }
    return batches;
  }
  vehicle(){return new THREE.Object3D();}
  spaceman(){
    const group=new THREE.Group();
    // All suit parts, including the visor, share the explicit 50-triangle budget.
    for(const [shape,color,position,scale,rotation,tag] of ART.spaceman.parts){
      const mesh=this.part(group,shape,ART.materials[color],position,scale,rotation);
      if(tag)mesh.userData[tag]=true;
    }
    return group;
  }
  garmentGeometry(kind){
    const shape=new THREE.Shape();
    ART.cloth[kind].forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
    const source=new THREE.ShapeGeometry(shape),flat=source.toNonIndexed(),attribute=flat.getAttribute('position');
    let points=Array.from(attribute.array);
    for(let pass=0;pass<ART.cloth.subdivisions;pass++){
      const next=[];
      for(let i=0;i<points.length;i+=9){
        const a=points.slice(i,i+3),b=points.slice(i+3,i+6),c=points.slice(i+6,i+9),
          ab=a.map((value,axis)=>(value+b[axis])/2),bc=b.map((value,axis)=>(value+c[axis])/2),ca=c.map((value,axis)=>(value+a[axis])/2);
        next.push(...a,...ab,...ca,...ab,...b,...bc,...ca,...bc,...c,...ab,...bc,...ca);
      }
      points=next;
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    geometry.scale(tropes.clothes.width/2,tropes.clothes.height/2,1);geometry.computeVertexNormals();
    source.dispose();flat.dispose();return geometry;
  }
  garment(kind,color){
    const geometry=this.clothGeometry[kind].clone(),material=this.material(color).clone();material.side=THREE.DoubleSide;
    const mesh=new THREE.Mesh(geometry,material);mesh.userData.resources=[geometry,material];
    mesh.userData.rest=Array.from(geometry.attributes.position.array);return mesh;
  }
  deformCloth(mesh,time,phase=0,attached=false){
    const array=mesh.geometry.attributes.position.array,rest=mesh.userData.rest,c=tropes.clothes;
    for(let i=0;i<array.length;i+=3){
      const x=rest[i],y=rest[i+1],loose=(c.height/2-y)/c.height;
      array[i]=x+Math.sin(time*c.frequency+phase+y)*c.sway*loose;
      array[i+1]=y+Math.sin(time*c.frequency+phase+x)*c.sway*loose;
      array[i+2]=Math.sin(x*3+time*c.frequency+phase)*ART.cloth.foldDepth+Math.sin(time*c.frequency+phase)*c.sway*loose
        +(attached?(1-Math.cos(x/(c.width/2)*Math.PI))*ART.cloth.wrapDepth/2:0);
    }
    mesh.geometry.attributes.position.needsUpdate=true;mesh.geometry.computeVertexNormals();
  }
  strawberry(group,position,size){
    if(!this.berryGeometry){
      const root=new THREE.Group(),berry=this.part(root,'ico',ART.materials.fruit,[0,0,0],ART.fruit.shapeScale,ART.fruit.rotation),c=ART.fruit;
      for(const [position,scale,rotation] of c.leaves)this.part(berry,'plane',ART.materials.leaf,position,scale,rotation);
      for(let i=0;i<ART.fruitSeeds;i++){
        const angle=i*math.tau/ART.fruitSeeds;
        this.part(berry,'box',c.seedColor,[Math.sin(angle)*c.seedRadius,Math.cos(angle)*c.seedHeight,c.seedDepth],c.seedSize);
      }
      root.updateMatrixWorld(true);const sources=[];
      root.traverse(mesh=>{
        if(!mesh.isMesh)return;
        const source=mesh.geometry,geometry=source.index?source.toNonIndexed():source.clone();geometry.applyMatrix4(mesh.matrixWorld);
        const color=mesh.material.color,colors=Array.from({length:geometry.attributes.position.count},()=>[color.r,color.g,color.b]).flat();
        geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));sources.push(geometry);
      });
      this.berryGeometry=this.mergeGeometry(sources,['position','normal','color']);
      this.berryMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:ART.roughness,side:THREE.DoubleSide,flatShading:true});
    }
    const mesh=new THREE.Mesh(this.berryGeometry,this.berryMaterial);mesh.position.fromArray(position);mesh.scale.setScalar(size);group.add(mesh);return mesh;
  }
  cart(){
    const group=new THREE.Group(),c=ART.cart;
    this.part(group,'box',ART.materials.wood,c.bodyPosition,c.bounds);
    for(const position of c.wheelPositions){const wheel=this.part(group,'wheel',ART.materials.dark,position,[1,1,1],c.wheelRotation);wheel.userData.wheel=true;}
    for(const y of c.trimRows)this.part(group,'box',ART.materials.trim,[0,y,c.trimDepth],c.trimSize);
    for(let row=0;row<c.loadRows;row++)for(let i=0;i<c.loadColumns;i++)this.strawberry(group,
      [(i-(c.loadColumns-1)/2)*c.berrySpacing[0],c.berryHeight+(i%2)*c.berryRipple,(row-(c.loadRows-1)/2)*c.berrySpacing[1]],c.berrySize);
    return group;
  }
  prop(prop){
    const makers={
      glass:()=>{const group=new THREE.Group();this.part(group,'box',ART.materials.glass,[0,0,0],[prop.rx*2,prop.ry*2,prop.rz*2],undefined,this.material(ART.materials.glass,true));
        for(const sign of [-1,1])this.part(group,'box',ART.materials.glass,[sign*prop.rx,0,0],[ART.glass.edgeWidth,prop.ry*2,ART.glass.edgeDepth]);
        this.part(group,'plane',ART.glass.highlightColor,[prop.rx*ART.glass.highlightPosition[0],prop.ry*ART.glass.highlightPosition[1],-prop.rz],
          [prop.rx*ART.glass.highlightScale[0],prop.ry*ART.glass.highlightScale[1],1],[0,0,ART.glass.highlightTilt]);return group;},
      cart:()=>this.cart(),cloth:()=>this.garment(prop.garment,prop.color),
      box:()=>{const group=new THREE.Group();this.part(group,'box',0xffffff,[0,0,0],[tropes.boxes.size,tropes.boxes.size,tropes.boxes.size],undefined,this.boxMaterials[prop.brand]);return group;},
    };
    return makers[prop.kind]();
  }
  stage(stage){
    const group=new THREE.Group(),c=tropes.walkway;
    const deck=new THREE.MeshStandardMaterial({color:c.color,transparent:true,opacity:.2,depthWrite:false,emissive:c.color,emissiveIntensity:.3});
    group.userData.resources=[deck];
    this.part(group,'box',c.color,[0,c.y,0],[c.width,c.thickness,c.depth],undefined,deck);
    for(const sign of [-1,1])this.part(group,'box',c.color,[0,c.y,sign*c.depth/2],[c.width,c.edgeWidth,c.edgeWidth]);
    for(let x=-c.width/2;x<c.width/2;x+=tropes.boxes.size)this.part(group,'box',c.color,[x,c.y+c.thickness,0],[c.edgeWidth,c.edgeWidth,c.depth]);
    group.userData.props=new Map();group.userData.movers=[];
    if(stage.kind==='glass')for(const sign of [-1,1]){
      const mover=this.spaceman();mover.position.set(sign*(tropes.glass.halfWidth+ART.spaceman.xOffset),ART.spaceman.y,0);mover.rotation.y=-sign*ART.spaceman.turnAngle;
      group.add(mover);group.userData.movers.push(mover);
    }
    if(stage.kind==='clothes'){
      for(const sign of [-1,1])this.part(group,'box',ART.materials.trim,[sign*c.width/2,(c.y+tropes.clothes.lineY)/2,0],
        [ART.wire.postWidth,tropes.clothes.lineY-c.y,ART.wire.postWidth]);
      const points=Array.from({length:tropes.clothes.columns+2},(_,i)=>{
        const t=i/(tropes.clothes.columns+1);return new THREE.Vector3((t-.5)*c.width,tropes.clothes.lineY-Math.sin(t*Math.PI)*ART.wire.sag,0);
      });
      const geometry=new THREE.BufferGeometry().setFromPoints(points),material=new THREE.LineBasicMaterial({color:ART.materials.trim});
      const line=new THREE.Line(geometry,material);group.add(line);group.userData.resources.push(geometry,material);
    }
    this.scene.add(group);return group;
  }
  fragment(piece){
    const group=new THREE.Group(),c=ART.fragments;
    const makers={glass:()=>this.part(group,'tetra',ART.materials.glass,[0,0,0],c.glassScale,undefined,this.material(ART.materials.glass,true)),
      cardboard:()=>this.part(group,'box',0xffffff,[0,0,0],c.cardboardScale,undefined,this.boxMaterials[piece.brand]),
      wreckage:()=>this.part(group,'ico',piece.color,[0,0,0],c.wreckageScale),fruit:()=>this.strawberry(group,[0,0,0],1)};
    makers[piece.kind]();group.scale.setScalar(piece.rx);this.scene.add(group);return group;
  }
  release(s){
    if(!this.attached)return;
    const mesh=this.attached;this.dog.updateMatrixWorld(true);mesh.updateMatrixWorld(true);
    const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();mesh.matrixWorld.decompose(position,rotation,scale);
    this.dog.remove(mesh);this.scene.add(mesh);mesh.position.copy(position);mesh.quaternion.copy(rotation);mesh.scale.copy(scale);
    const center=this.plan.center(s.distance);this.released.push({mesh,age:0,x:position.x+center.x,y:position.y+center.y,d:s.distance-position.z});this.attached=null;
  }
  update(s,dt){
    const runtime=s.motifRuntime||{vehicles:[],stages:[],fragments:[]};
    for(const batch of Object.values(this.batches))for(const mesh of Object.values(batch))mesh.count=0;
    this.sync(this.vehicles,runtime.vehicles.filter(vehicle=>!vehicle.dead),vehicle=>this.vehicle(vehicle),(group,vehicle)=>{
      group.position.fromArray(this.plan.world(vehicle.x,vehicle.y,vehicle.d,s.distance));
      if(vehicle.heading)group.quaternion.setFromUnitVectors(this.forward,this.vector.fromArray(vehicle.heading).normalize());
      group.rotateZ(vehicle.spin);group.updateMatrixWorld(true);group.userData.vehicle=vehicle;
      for(const [role,mesh] of Object.entries(this.batches[vehicle.kind])){
        mesh.setMatrixAt(mesh.count,group.matrixWorld);
        if(role==='body')mesh.setColorAt(mesh.count,this.instanceColor.set(vehicle.color));
        mesh.count++;
      }
    });
    for(const batch of Object.values(this.batches))for(const mesh of Object.values(batch)){
      mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    }
    this.sync(this.stages,runtime.stages,stage=>this.stage(stage),(group,stage)=>{
      group.position.fromArray(this.plan.world(0,0,stage.d,s.distance));
      this.sync(group.userData.props,stage.props.filter(prop=>!prop.dead),prop=>{const mesh=this.prop(prop);group.add(mesh);return mesh;},(mesh,prop)=>{
        mesh.position.set(prop.x,prop.y,0);
        if(prop.kind==='cloth')this.deformCloth(mesh,stage.age,prop.phase);
        if(prop.kind==='cart')for(const wheel of mesh.children.filter(part=>part.userData.wheel))wheel.rotation.set(ART.cart.wheelRotation[0],-prop.x/ART.cart.wheelRadius,ART.cart.wheelRotation[2]);
      });
      for(const [i,mover] of group.userData.movers.entries()){
        mover.position.x=(i?1:-1)*(tropes.glass.halfWidth+ART.spaceman.xOffset)+Math.sin(stage.age*tropes.crossing.frequency+stage.phase)*tropes.crossing.amplitude;
        for(const leg of mover.children.filter(part=>part.userData.leg))leg.rotation.x=Math.sin(stage.age*ART.spaceman.walkFrequency+i)*ART.spaceman.walkAngle;
        mover.rotation.z=stage.angryUntil>stage.age?Math.sin(stage.age*ART.spaceman.walkFrequency*ART.spaceman.angryFrequencyMultiplier)*ART.spaceman.walkAngle:0;
      }
    });
    this.sync(this.fragments,runtime.fragments,piece=>this.fragment(piece),(group,piece)=>{
      group.position.fromArray(this.plan.world(piece.x,piece.y,piece.d,s.distance));group.rotation.fromArray(piece.rotation.map((value,i)=>value+piece.spin[i]*piece.age));
      group.scale.setScalar(piece.rx);
    });
    const drag=s.motion.drag;
    if(drag){
      if(this.attached&&(this.attached.userData.kind!==drag.kind||this.attached.userData.color!==drag.color))this.release(s);
      if(!this.attached){this.attached=this.garment(drag.kind,drag.color);this.attached.userData.kind=drag.kind;this.attached.userData.color=drag.color;
        this.attached.position.fromArray(ART.cloth.attachPosition);this.attached.scale.setScalar(ART.cloth.attachScale);this.dog.add(this.attached);}
      this.deformCloth(this.attached,s.elapsed,0,true);
    }else this.release(s);
    this.released=this.released.filter(piece=>{
      piece.age+=dt;piece.d-=ART.cloth.releaseSpeed*dt;piece.y+=dt;
      piece.mesh.position.fromArray(this.plan.world(piece.x-this.plan.center(piece.d).x,piece.y-this.plan.center(piece.d).y,piece.d,s.distance));
      piece.mesh.rotateZ(dt);if(piece.age<ART.cloth.releaseSeconds)return true;this.remove(piece.mesh);return false;
    });
  }
  sync(map,bodies,make,update){
    const wanted=new Set();
    for(const body of bodies){wanted.add(body.id);let group=map.get(body.id);if(!group){group=make(body);map.set(body.id,group);}update(group,body);}
    for(const [id,group] of map)if(!wanted.has(id)){this.remove(group);map.delete(id);}
  }
  remove(group){
    group.removeFromParent();group.traverse(mesh=>{for(const resource of mesh.userData.resources||[])resource.dispose();});
  }
  clear(){
    for(const map of [this.vehicles,this.stages,this.fragments]){for(const group of map.values())this.remove(group);map.clear();}
    for(const batch of Object.values(this.batches))for(const mesh of Object.values(batch))mesh.count=0;
    if(this.attached){this.remove(this.attached);this.attached=null;}
    for(const piece of this.released)this.remove(piece.mesh);this.released=[];
  }
  emitters(s){
    const base=this.plan.center(s.distance),emitters=[];
    const vehicles=[...this.vehicles.values()].sort((a,b)=>Math.abs(a.userData.vehicle.d-s.distance)-Math.abs(b.userData.vehicle.d-s.distance));
    for(const group of vehicles.slice(0,namespace.settings.exhaust.trafficEmitters)){
      const vehicle=group.userData.vehicle;if(Math.abs(vehicle.d-s.distance)>namespace.settings.exhaust.farDistance)continue;
      const rear=new THREE.Vector3(0,0,1).applyQuaternion(group.quaternion);
      for(const nozzle of traffic.models[vehicle.kind].nozzles){const point=group.localToWorld(new THREE.Vector3().fromArray(nozzle));
        emitters.push({id:`${vehicle.id}:${nozzle[0]}`,profile:vehicle.engine,x:point.x+base.x,y:point.y+base.y,d:s.distance-point.z,
          direction:[rear.x,rear.y,-rear.z],speed:vehicle.speed,scale:1});}
    }
    return emitters;
  }
}
namespace.FlightMotifView=FlightMotifView;
})(window.Starhound);
