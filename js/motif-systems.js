(function(namespace){
'use strict';
const {traffic,tropes,route,tunnel,hull,flight,propulsion,math,motifState}=namespace.settings;
const MOTION={collisionEpsilon:1e-7,fragmentSpin:3,boxGravity:7,smokeOnlyChance:.35};

/** Relative swept AABBs include both moving bodies, including opposing traffic. */
function sweptContact(a0,a1,b0,b1,extents){
  let enter=0,leave=1;
  for(const [axis,radius] of Object.entries(extents)){
    const start=a0[axis]-b0[axis],delta=(a1[axis]-b1[axis])-start;
    if(Math.abs(delta)<MOTION.collisionEpsilon){if(Math.abs(start)>radius)return false;continue;}
    const first=(-radius-start)/delta,last=(radius-start)/delta;
    enter=Math.max(enter,Math.min(first,last));leave=Math.min(leave,Math.max(first,last));
    if(enter>leave)return false;
  }
  return enter<=1&&leave>=0;
}
class InteractiveMotifs {
  constructor(plan,scene,sound){this.plan=plan;this.scene=scene;this.sound=sound;}
  state(s){
    if(!s.motifRuntime||s.motifRuntime.seed!==s.seed)s.motifRuntime={version:motifState.version,seed:s.seed,
      streams:[],stages:[],vehicles:[],fragments:[],retired:[],hornCooldown:0,serial:0};
    return s.motifRuntime;
  }
  sample(id,key){return route.sample(this.plan.seed,id,key);}
  point(body,previous=false){return this.plan.absolute(previous?body.previousX:body.x,previous?body.previousY:body.y,previous?body.previousD:body.d);}
  intersects(a,b,margin=0){
    const broad=sweptContact(this.point(a,true),this.point(a),this.point(b,true),this.point(b),
      {x:a.rx+b.rx+margin,y:a.ry+b.ry+margin,d:a.rz+b.rz+margin});
    if(!broad||!a.heading&&!b.heading)return broad;
    const bases=[this.basis(a),this.basis(b)],axes=[...bases[0],...bases[1]];
    for(const x of bases[0])for(const y of bases[1])axes.push([x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]]);
    const a0=this.point(a,true),a1=this.point(a),b0=this.point(b,true),b1=this.point(b),
      before=[a0.x-b0.x,a0.y-b0.y,a0.d-b0.d],after=[a1.x-b1.x,a1.y-b1.y,a1.d-b1.d];
    const dot=(x,y)=>x.reduce((sum,value,i)=>sum+value*y[i],0);
    let enter=0,leave=1;
    for(const axis of axes){
      const length=Math.hypot(...axis);if(length<MOTION.collisionEpsilon)continue;
      const normal=axis.map(value=>value/length),sizes=[a,b].map(body=>body.type==='vehicle'?traffic.models[body.kind].bounds:[body.rx,body.ry,body.rz]);
      const radius=sizes.reduce((sum,size,body)=>sum+size.reduce((total,value,i)=>total+value*Math.abs(dot(normal,bases[body][i])),0),margin);
      const start=dot(before,normal),delta=dot(after,normal)-start;
      if(Math.abs(delta)<MOTION.collisionEpsilon){if(Math.abs(start)>radius)return false;continue;}
      const first=(-radius-start)/delta,last=(radius-start)/delta;
      enter=Math.max(enter,Math.min(first,last));leave=Math.min(leave,Math.max(first,last));if(enter>leave)return false;
    }
    return enter<=1&&leave>=0;
  }
  basis(body){
    if(!body.heading)return [[1,0,0],[0,1,0],[0,0,1]];
    const h=body.heading,span=Math.hypot(...h),forward=[h[0]/span,h[1]/span,-h[2]/span],horizontal=Math.hypot(forward[0],forward[2]),
      right=[forward[2]/horizontal,0,-forward[0]/horizontal],up=[forward[1]*right[2],forward[2]*right[0]-forward[0]*right[2],-forward[1]*right[0]];
    const roll=body.spin||0,cos=Math.cos(roll),sin=Math.sin(roll);
    return [right.map((value,i)=>value*cos+up[i]*sin),up.map((value,i)=>value*cos-right[i]*sin),forward];
  }
  trafficCenter(segment,d){
    const c=traffic,smooth=t=>{t=math.clamp(t,0,1);return t*t*(3-2*t);};
    return d<segment.mergeStart?-segment.sideSign*c.offPathDistance*smooth((segment.mergeStart-d)/c.approachDistance)
      :d>segment.mergeEnd?segment.sideSign*c.offPathDistance*smooth((d-segment.mergeEnd)/c.approachDistance):0;
  }
  trafficPoint(segment,d,lane){
    const center=this.plan.center(d),step=traffic.pose.sampleDistance,next=this.plan.center(d+step),
      slope=(next.x+this.trafficCenter(segment,d+step)-center.x-this.trafficCenter(segment,d))/step,
      width=traffic.lanes[lane][0],normalLength=Math.hypot(slope,1),distance=d-width*slope/normalLength,
      shifted=this.plan.center(distance);
    // Lane offsets are perpendicular to the highway, even on steep diagonal approaches.
    return {x:center.x+this.trafficCenter(segment,d)+width/normalLength-shifted.x,
      y:center.y+traffic.lanes[lane][1]-shifted.y,d:distance};
  }
  prepare(s,r,dt){
    const first=s.distance-traffic.behindDistance,last=s.distance+traffic.visibleAhead;
    const relevant=this.plan.between(first-traffic.simulationPadding,last+traffic.simulationPadding).filter(segment=>segment.interactive);
    for(const segment of relevant){
      if(segment.family==='traffic'&&!r.streams.some(stream=>stream.segment.id===segment.id))r.streams.push({segment,age:0});
      if(segment.family==='tropes')for(const stage of segment.stages){
        if(stage.d<first||stage.d>last||r.stages.some(active=>active.id===stage.id))continue;
        r.stages.push({...stage,age:0,segmentId:segment.id,props:this.makeProps(stage)});
      }
    }
    r.streams=r.streams.filter(stream=>stream.segment.end>=first);
    r.stages=r.stages.filter(stage=>stage.d>=first&&relevant.some(segment=>segment.id===stage.segmentId)).slice(-motifState.maxStages);
    r.retired=r.retired.filter(item=>{
      const d=item.d+item.speed*item.age;item.age+=dt;
      return d>=first-traffic.simulationPadding&&d<=last+traffic.simulationPadding;
    });
    r.retired=r.retired.slice(-motifState.maxRetired);
    const occupied=new Set([...r.vehicles.map(vehicle=>vehicle.id),...r.retired.map(item=>item.id)]),candidates=[];
    const stride=traffic.rowSpacing/traffic.density;
    for(const stream of r.streams){
      for(let lane=0;lane<traffic.lanes.length;lane++){
        const speed=stream.segment.direction*Math.min(traffic.speed.ceiling,traffic.speed.base+lane*traffic.speed.laneStep
          +namespace.settings.difficulty.progress(stream.segment.start)*traffic.speed.difficultyGrowth);
        const shift=speed*stream.age,base=stream.segment.mergeStart;
        const from=Math.floor((first-traffic.simulationPadding-base-shift)/stride),to=Math.ceil((last+traffic.simulationPadding-base-shift)/stride);
        for(let row=from;row<=to;row++){
          const id=`${stream.segment.id}:lane:${lane}:row:${row}`;
          if(occupied.has(id))continue;
          const d=base+row*stride+shift;
          const kinds=Object.keys(traffic.models),kind=kinds[Math.floor(this.sample(id,'kind')*kinds.length)],spec=traffic.models[kind];
          const position=this.trafficPoint(stream.segment,d,lane);
          candidates.push({id,type:'vehicle',kind,segment:stream.segment,lane,roadD:d,...position,speed,
            previousD:position.d,previousX:position.x,previousY:position.y,rx:spec.bounds[0],ry:spec.bounds[1],rz:spec.bounds[2],
            color:spec.colors[Math.floor(this.sample(id,'color')*spec.colors.length)],engine:kind==='car'&&this.sample(id,'engine')<MOTION.smokeOnlyChance?'smoke':spec.engine,
            phase:this.sample(id,'phase')*math.tau,age:stream.age,offsetX:0,offsetY:0,vx:0,vy:0,spin:0,contactCooldown:0,hornCooldown:0});
        }
      }
    }
    candidates.sort((a,b)=>Math.abs(a.d-s.distance)-Math.abs(b.d-s.distance));
    r.vehicles.push(...candidates.slice(0,Math.max(0,traffic.maxVehicles-r.vehicles.length)));
  }
  makeProps(stage){
    const prop=(id,kind,x,y,rx,ry,rz,extra={})=>({id:`${stage.id}:${id}`,kind,x,y,d:stage.d,previousX:x,previousY:y,previousD:stage.d,rx,ry,rz,...extra});
    const makers={
      glass:()=>[prop('pane','glass',0,0,tropes.glass.halfWidth,tropes.glass.halfHeight,tropes.glass.depth)],
      cart:()=>[prop('cart','cart',0,tropes.cart.centerY,tropes.cart.halfWidth,tropes.cart.halfHeight,tropes.cart.halfDepth)],
      clothes:()=>Array.from({length:tropes.clothes.columns},(_,i)=>prop(`garment:${i}`,'cloth',
        (i-(tropes.clothes.columns-1)/2)*tropes.clothes.spacing,tropes.clothes.lineY-tropes.clothes.height/2,
        tropes.clothes.width/2,tropes.clothes.height/2,tropes.clothes.depth,
        {garment:i%2?'pants':'shirt',color:tropes.clothes.colors[i%tropes.clothes.colors.length],phase:i})),
      boxes:()=>{
        const c=tropes.boxes,props=[];
        for(let column=0;column<c.columns;column++){
          if(column===stage.gap)continue;
          for(let row=0;row<c.rows;row++)props.push(prop(`box:${column}:${row}`,'box',
            (column-(c.columns-1)/2)*c.size,tropes.walkway.y+c.size*(row+.5),c.size/2,c.size/2,c.size/2,
            {brand:Math.floor(column/2)%tropes.brands.length,column,row}));
        }
        return props;
      },
    };
    return makers[stage.kind]();
  }
  move(s,r,dt){
    for(const stream of r.streams)stream.age+=dt;
    for(const vehicle of r.vehicles){
      vehicle.previousD=vehicle.d;vehicle.previousX=vehicle.x;vehicle.previousY=vehicle.y;
      vehicle.roadD+=vehicle.speed*dt;vehicle.age+=dt;
      vehicle.offsetX+=vehicle.vx*dt;vehicle.offsetY+=vehicle.vy*dt;
      const decay=Math.exp(-traffic.steering.decay*dt);vehicle.vx*=decay;vehicle.vy*=decay;vehicle.spin*=decay;
      const position=this.trafficPoint(vehicle.segment,vehicle.roadD,vehicle.lane);
      vehicle.d=position.d;
      vehicle.x=position.x+vehicle.offsetX+Math.sin(vehicle.age*traffic.steering.frequency+vehicle.phase)*traffic.steering.weave;
      vehicle.y=position.y+vehicle.offsetY;
      vehicle.contactCooldown=math.decrement(vehicle.contactCooldown,dt);vehicle.hornCooldown=math.decrement(vehicle.hornCooldown,dt);
      const a=this.plan.absolute(position.x,position.y,position.d),next=this.trafficPoint(vehicle.segment,vehicle.roadD+traffic.pose.sampleDistance,vehicle.lane),
        b=this.plan.absolute(next.x,next.y,next.d),direction=vehicle.segment.direction;
      vehicle.heading=[(b.x-a.x)*direction,(b.y-a.y)*direction,-(b.d-a.d)*direction];
      const basis=this.basis(vehicle),spec=traffic.models[vehicle.kind];
      [vehicle.rx,vehicle.ry,vehicle.rz]=[0,1,2].map(axis=>spec.bounds.reduce((sum,value,i)=>sum+Math.abs(basis[i][axis])*value,0));
    }
    for(const stage of r.stages){
      stage.age+=dt;
      for(const prop of stage.props){
        prop.previousX=prop.x;prop.previousY=prop.y;prop.previousD=prop.d;
        if(prop.kind==='glass')prop.x=Math.sin(stage.age*tropes.crossing.frequency+stage.phase)*tropes.crossing.amplitude;
        if(prop.kind==='cart')prop.x=Math.sin(stage.age*tropes.crossing.cartFrequency+stage.phase)*tropes.crossing.cartAmplitude;
      }
    }
    for(const piece of r.fragments){
      piece.previousX=piece.x;piece.previousY=piece.y;piece.previousD=piece.d;
      piece.age+=dt;
      if(piece.age>=piece.life){piece.dead=true;continue;}
      piece.rx=piece.ry=piece.rz=piece.baseRadius*Math.min(1,(piece.life-piece.age)/motifState.fragmentFadeSeconds);
      piece.x+=piece.vx*dt;piece.y+=piece.vy*dt;piece.d+=piece.speed*dt;
      piece.vy-=piece.gravity*dt;
    }
    r.hornCooldown=math.decrement(r.hornCooldown,dt);
  }
  fragments(r,source,kind,count,life,speed,hazard=false){
    for(let index=0;index<count;index++){
      const id=`${source.id}:fragment:${r.serial++}`,sample=key=>this.sample(id,key);
      const radius=kind==='fruit'?tropes.fruit.radius:math.mix(traffic.debris.radius.min,traffic.debris.radius.max,sample('radius'));
      r.fragments.push({id,kind,color:source.color||0xc79456,brand:source.brand||0,x:source.x,y:source.y,d:source.d,
        previousX:source.x,previousY:source.y,previousD:source.d,rx:radius,ry:radius,rz:radius,
        vx:(sample('vx')*2-1)*speed,vy:(sample('vy')*2-1)*speed,speed:(source.speed||0)+(sample('vz')*2-1)*speed,
        rotation:[sample('rx')*math.tau,sample('ry')*math.tau,sample('rz')*math.tau],
        spin:[sample('sx')*MOTION.fragmentSpin,sample('sy')*MOTION.fragmentSpin,sample('sz')*MOTION.fragmentSpin],
        age:0,life,hazard,baseRadius:radius,gravity:kind==='fruit'?tropes.fruit.gravity:kind==='cardboard'?MOTION.boxGravity:0});
    }
  }
  retire(r,vehicle){
    if(vehicle.dead)return;
    vehicle.dead=true;r.retired.push({id:vehicle.id,d:vehicle.d,speed:vehicle.speed,age:0});
  }
  explode(r,vehicle){
    this.retire(r,vehicle);
    this.fragments(r,vehicle,'wreckage',traffic.debris.count,traffic.debris.lifeSeconds,traffic.debris.speed,true);
    this.scene.burst(vehicle);this.sound.play('enemyExplosion',vehicle.x);
  }
  hitProp(s,r,stage,prop){
    prop.dead=true;
    const reactions={
      glass:()=>{
        this.fragments(r,prop,'glass',tropes.glass.shards,tropes.glass.shardLife,tropes.glass.shardSpeed);
        stage.angryUntil=stage.age+tropes.complaint.duration+tropes.complaint.beeps*tropes.complaint.gapSeconds;
        this.sound.motif('glass',prop.x);this.sound.motif('complaint',prop.x);
      },
      cart:()=>{this.fragments(r,prop,'fruit',tropes.fruit.count,tropes.fruit.life,tropes.fruit.speed);this.sound.motif('cart',prop.x);},
      cloth:()=>{
        const c=tropes.clothes,duration=math.mix(c.duration.min,c.duration.max,this.sample(prop.id,'duration'));
        propulsion.clothing(s,prop.garment,prop.color,duration);this.sound.motif('cloth',prop.x);
      },
      box:()=>{
        // Collapse the struck column once; its moving cardboard is purely visual.
        for(const box of stage.props)if(box.column===prop.column&&!box.dead){box.dead=true;
          this.fragments(r,box,'cardboard',1,tropes.boxes.life,tropes.fruit.speed);}
        this.fragments(r,prop,'cardboard',tropes.boxes.fragmentCount,tropes.boxes.life,tropes.fruit.speed);
        this.sound.motif('box',prop.x);
      },
    };
    reactions[prop.kind]();
    if(prop.kind!=='cloth'&&flight.damage(s,hull.maxIntegrity*tropes.damageFraction)){this.sound.play('hit',s.player.x);this.sound.voice('hit',s);}
  }
  collide(s,r,previousPlayer,bullets){
    const ship={x:s.player.x,y:s.player.y,d:s.distance,previousX:previousPlayer.x,previousY:previousPlayer.y,previousD:s.previousDistance,
      rx:flight.shipRadius,ry:flight.shipRadius,rz:flight.shipRadius};
    // Collision candidates are ordered along distance; nearby pairs avoid an all-pairs scan.
    const vehicles=r.vehicles.filter(vehicle=>!vehicle.dead).sort((a,b)=>a.d-b.d);
    for(let i=0;i<vehicles.length;i++){
      const a=vehicles[i];if(a.dead)continue;
      for(let j=i+1;j<vehicles.length;j++){
        const b=vehicles[j];
        if(b.d-a.d>a.rz+b.rz+Math.abs(a.d-a.previousD)+Math.abs(b.d-b.previousD))break;
        if(!b.dead&&this.intersects(a,b)){this.explode(r,a);this.explode(r,b);break;}
      }
    }
    for(const vehicle of vehicles){
      if(vehicle.dead)continue;
      for(const bullet of bullets){
        if(bullet.dead)continue;
        const shot={...bullet,previousX:bullet.x,previousY:bullet.y,rx:bullet.radius,ry:bullet.radius,rz:bullet.radius};
        if(this.intersects(vehicle,shot)){bullet.dead=true;vehicle.vx+=(vehicle.x>=bullet.x?1:-1)*traffic.steering.shotImpulse;this.scene.burst({...vehicle,type:'sparks'});}
      }
      if(!vehicle.contactCooldown&&this.intersects(ship,vehicle)){
        vehicle.contactCooldown=traffic.steering.contactSeconds;
        vehicle.vx+=(vehicle.x>=ship.x?1:-1)*traffic.steering.impulse;vehicle.vy+=(vehicle.y>=ship.y?1:-1)*traffic.steering.impulse/2;
        vehicle.spin=traffic.steering.spin;propulsion.impact(s,'vehicle');
        if(flight.damage(s,hull.obstacleDamage)){this.sound.play('hit',s.player.x);this.sound.voice('hit',s);}
      }
      if(this.intersects(ship,vehicle,traffic.horn.nearDistance)&&!vehicle.hornCooldown&&!r.hornCooldown){
        this.sound.horn(vehicle.kind,vehicle.x,1+Math.floor(this.sample(vehicle.id,'horn-beeps')*traffic.horn.maxBeeps));
        vehicle.hornCooldown=traffic.horn.cooldownSeconds;r.hornCooldown=traffic.horn.globalIntervalSeconds;
      }
    }
    for(const stage of r.stages)for(const prop of stage.props)if(!prop.dead&&this.intersects(ship,prop))this.hitProp(s,r,stage,prop);
    for(const piece of r.fragments)if(piece.hazard&&!piece.dead&&this.intersects(ship,piece)){
      piece.dead=true;if(flight.damage(s,hull.maxIntegrity*traffic.debris.damageFraction)){this.sound.play('hit',s.player.x);this.sound.voice('hit',s);}
    }
  }
  step(s,dt,previousPlayer,bullets=[]){
    const r=this.state(s);
    this.prepare(s,r,dt);this.move(s,r,dt);this.collide(s,r,previousPlayer,bullets);
    r.retired=r.retired.slice(-motifState.maxRetired);
    r.vehicles=r.vehicles.filter(vehicle=>!vehicle.dead&&vehicle.d>=s.distance-traffic.behindDistance-traffic.simulationPadding
      &&vehicle.d<=s.distance+traffic.visibleAhead+traffic.simulationPadding);
    const fragments=r.fragments.filter(piece=>!piece.dead&&piece.age<piece.life&&piece.d>s.distance-traffic.behindDistance);
    r.fragments=[...fragments.filter(piece=>piece.hazard).slice(-traffic.maxFragments),...fragments.filter(piece=>!piece.hazard).slice(-traffic.maxVisualFragments)];
  }
}
namespace.sweptContact=sweptContact;namespace.InteractiveMotifs=InteractiveMotifs;
})(window.Starhound);
