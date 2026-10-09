(function(namespace){
'use strict';
const {route,speedRings,math,flight,hull,propulsion,tuning,race}=namespace.settings;

/** One distance plan owns motif boundaries, collision surfaces and ring placement.
 * Its hash sampling never consumes the encounter or pickup random stream.
 */
class RoutePlan {
  constructor(seed=tuning.seed){this.reset(seed);}
  reset(seed=this.seed){
    this.seed=seed;this.segments=[];this.end=0;this.cycle=0;
    this.rings=new Map();this.chain=0;this.chainSeries=null;this.contactId=null;
  }
  use(seed){if(seed!==this.seed)this.reset(seed);}
  sample(index,salt){return route.sample(this.seed,index,salt);}
  extend(distance){
    const choices=[['tunnel',route.tunnelWeight,route.tunnelLength],['station',route.stationWeight,route.stationLength],['cruiser',route.cruiserWeight,route.cruiserLength]];
    const total=choices.reduce((sum,choice)=>sum+choice[1],0);
    while(this.end<=distance){
      let roll=this.sample(this.cycle,'motif')*total;
      const chosen=choices.find(choice=>{roll-=choice[1];return roll<0;})||choices[0];
      const [kind,,length]=chosen,openLength=length*route.openShare/(1-route.openShare);
      this.segments.push({id:`${this.cycle}:open`,kind:'open',start:this.end,end:this.end+openLength});
      const segment={id:`${this.cycle}:${kind}`,index:this.cycle,kind,start:this.end+openLength,end:this.end+openLength+length,
        side:route.cruiser.sides[Math.floor(this.sample(this.cycle,'side')*route.cruiser.sides.length)]};
      if(kind==='station'){
        const c=route.station;
        segment.portals=this.stationPortals(segment);
        segment.obstacles=[];
        for(let d=segment.start+c.obstacleStart;d<segment.end-c.runwayDistance;d+=c.obstacleSpacing){
          if(segment.portals.some(portal=>Math.abs(portal.d-d)<c.runwayDistance))continue;
          const index=segment.obstacles.length;
          segment.obstacles.push({id:`${segment.id}:bulkhead:${index}`,d,
            x:(index%2?1:-1)*c.obstacleOffsetX,y:(this.sample(this.cycle,`bulkhead:${index}`)*2-1)*c.obstacleOffsetY,
            rx:c.obstacleHalfWidth,ry:c.obstacleHalfHeight,rz:c.obstacleDepth});
        }
      }
      this.segments.push(segment);this.end=segment.end;this.cycle++;
    }
  }
  stationPortals(segment){
    const c=route.station.chains;
    const spacing=Math.max(c.minimumSpacing,race.cruiseSpeed(segment.end)*c.speedAllowance*(c.reactionSeconds+c.steeringSeconds));
    const capacity=Math.max(1,Math.min(c.maxWalls,1+Math.floor((segment.end-segment.start-c.groupGap)/spacing)));
    const desired=this.sample(segment.index,'door-chain-frequency')<c.frequency
      ?2+Math.floor(this.sample(segment.index,'door-chain-count')*(c.maxWalls-1)):1;
    const count=Math.min(capacity,desired);
    const portals=[];
    const add=(d,chainId,chainIndex)=>{
      const index=portals.length,dimensions=route.openingDimensions(d),bounds=route.openingBounds(dimensions);
      let x=(this.sample(segment.index,`door:${index}:x`)*2-1)*bounds.x;
      let y=(this.sample(segment.index,`door:${index}:y`)*2-1)*bounds.y;
      if(this.sample(segment.index,`door:${index}:edge`)<route.station.openings.edgeChance){
        const sign=this.sample(segment.index,`door:${index}:edge-sign`)<.5?-1:1;
        if(this.sample(segment.index,`door:${index}:edge-axis`)<.5)x=sign*bounds.x;
        else y=sign*bounds.y;
      }
      const previous=portals.at(-1);
      if(previous){
        const shift=Math.hypot(x-previous.x,y-previous.y);
        const maximum=route.openingShiftLimit(previous.d,d,previous.chainId===chainId);
        const fraction=shift?Math.min(1,maximum/shift):1;
        x=math.clamp(math.mix(previous.x,x,fraction),-bounds.x,bounds.x);
        y=math.clamp(math.mix(previous.y,y,fraction),-bounds.y,bounds.y);
      }
      portals.push({id:`${segment.id}:portal:${index}`,d,x,y,...dimensions,chainId,chainIndex,exterior:chainIndex===0});
    };
    for(let index=0;index<count;index++)add(segment.start+index*spacing,`${segment.id}:entry`,index);
    add(segment.end,`${segment.id}:exit`,0);
    return portals;
  }
  between(first,last){
    this.extend(last);
    // Binary lookup makes late-wave starts and repeated visible-range reads cheap.
    let lo=0,hi=this.segments.length;
    while(lo<hi){const mid=Math.floor((lo+hi)/2);if(this.segments[mid].end<first)lo=mid+1;else hi=mid;}
    const result=[];
    for(let i=lo;i<this.segments.length&&this.segments[i].start<=last;i++)result.push(this.segments[i]);
    return result;
  }
  at(distance){return this.between(distance,distance).find(s=>s.start<=distance&&s.end>distance)||this.segments.at(-1);}
  gateProfile(distance){
    const segment=this.at(distance),inset=route.gates.wallInset;
    if(segment.kind==='tunnel')return {shape:'ellipse',x:0,y:0,rx:route.tunnel.radius-inset,ry:route.tunnel.radius-inset};
    // Include both adjacent segments so a checkpoint coincident with a station exit fits its door.
    for(const station of this.between(distance-route.gates.portalRange,distance+route.gates.portalRange)){
      const portal=station.portals?.find(p=>Math.abs(p.d-distance)<=route.gates.portalRange);
      if(portal)return {shape:'rectangle',x:portal.x,y:portal.y,rx:portal.rx-inset,ry:portal.ry-inset};
    }
    if(segment.kind==='station')return {shape:'ellipse',x:0,y:0,rx:route.station.halfWidth-inset,ry:route.station.halfHeight-inset};
    return {shape:'circle',x:0,y:0};
  }
  allowsEncounter(e){
    const segment=this.at(e.d);
    if(segment.kind==='station'){
      if(segment.portals.some(p=>Math.abs(e.d-p.d)<route.station.runwayDistance))return false;
      if(e.type==='barrier')return false;
      e.theme='station';
    }
    if(segment.kind==='tunnel'&&e.type!=='barrier'&&Math.hypot(e.x,e.y)+Math.max(e.rx,e.ry)>route.tunnel.radius)return false;
    return true;
  }
  visibleRings(first,last){
    const c=speedRings,stride=c.stride();
    const from=Math.max(0,Math.floor((first-c.startOffset-c.maxCount*c.spacing)/stride));
    const to=Math.max(0,Math.floor(last/stride));
    for(let series=from;series<=to;series++){
      const count=c.minCount+Math.floor(this.sample(series,'ring-count')*(c.maxCount-c.minCount+1));
      let x=(this.sample(series,'ring-x')*2-1)*c.offsetX,y=(this.sample(series,'ring-y')*2-1)*c.offsetY;
      const candidates=[];let blocked=false;
      for(let index=0;index<count;index++){
        const d=series*stride+c.startOffset+index*c.spacing;
        x=math.clamp(x+(this.sample(series,`ring-x:${index}`)*2-1)*c.steerStepX,-c.offsetX,c.offsetX);
        y=math.clamp(y+(this.sample(series,`ring-y:${index}`)*2-1)*c.steerStepY,-c.offsetY,c.offsetY);
        const segment=this.at(d);
        if(segment.kind==='station'&&segment.portals.some(p=>Math.abs(d-p.d)<route.station.runwayDistance))blocked=true;
        const id=`${series}:${index}`;
        candidates.push({id,series,index,d,x,y,result:'ready'});
      }
      // Suppress the whole series near station doors so every visible series still has 3–7 rings.
      if(!blocked)for(const ring of candidates)if(ring.d>=first&&ring.d<=last&&!this.rings.has(ring.id))this.rings.set(ring.id,ring);
    }
    for(const [id,ring] of this.rings)if(ring.d<first)this.rings.delete(id);
    return [...this.rings.values()].filter(ring=>ring.d>=first&&ring.d<=last).sort((a,b)=>a.d-b.d);
  }
  crossRings(s,previousPlayer,sound){
    for(const ring of this.visibleRings(s.previousDistance-route.behindDistance,s.distance)){
      if(ring.result!=='ready'||ring.d<s.previousDistance||ring.d>s.distance)continue;
      if(this.chainSeries!==ring.series){this.chain=0;this.chainSeries=ring.series;}
      const fraction=(ring.d-s.previousDistance)/Math.max(route.contactEpsilon,s.distance-s.previousDistance);
      const x=math.mix(previousPlayer.x,s.player.x,fraction),y=math.mix(previousPlayer.y,s.player.y,fraction);
      if(speedRings.contains(ring,x,y)){
        ring.result='passed';this.chain++;
        propulsion.ring(s);s.score+=speedRings.scorePerRing;
        s.toast=`SPEED RING · ${this.chain} IN A ROW`;s.toastTime=speedRings.toastSeconds;
        sound.ring(this.chain,ring.x);
      }else{ring.result='missed';this.chain=0;}
    }
  }
  contact(s){
    const p=s.player,c=route.station;
    const active=this.at(s.distance);
    if(active.kind==='tunnel'){
      const radius=Math.hypot(p.x,p.y),limit=route.tunnel.radius-flight.shipRadius;
      if(radius>=limit-route.contactMargin)return {id:`${active.id}:wall`,kind:'wall',penetrating:radius>=limit,
        resolve:()=>{const factor=(limit-route.contactEpsilon)/radius;p.x*=factor;p.y*=factor;p.vx=0;p.vy=0;}};
    }
    for(const segment of this.between(s.previousDistance-c.portalDepth,s.distance+c.portalDepth+route.contactMargin)){
      if(segment.kind!=='station')continue;
      for(const portal of segment.portals){
        const front=portal.d-c.portalDepth;
        if(s.previousDistance>portal.d+c.portalDepth||s.distance<front-route.contactMargin)continue;
        if(Math.abs(p.x-portal.x)<=portal.rx-flight.shipRadius&&Math.abs(p.y-portal.y)<=portal.ry-flight.shipRadius)continue;
        return {id:portal.id,kind:'portal',penetrating:s.distance>=front,
          resolve:()=>{
            s.distance=Math.min(s.distance,front-route.contactEpsilon);s.previousDistance=Math.min(s.previousDistance,s.distance);
            s.speed=0;s.motion.recovery={elapsed:0,from:0,cruiseOnly:true};
          }};
      }
      for(const obstacle of segment.obstacles){
        if(obstacle.d+obstacle.rz<s.previousDistance||obstacle.d-obstacle.rz>s.distance)continue;
        if(Math.abs(p.x-obstacle.x)>=obstacle.rx+flight.shipRadius||Math.abs(p.y-obstacle.y)>=obstacle.ry+flight.shipRadius)continue;
        return {id:obstacle.id,kind:'bulkhead',penetrating:true,resolve:()=>{}};
      }
    }
    return null;
  }
  collide(s,sound){
    const contact=this.contact(s);
    if(!contact){this.contactId=null;return;}
    if(!contact.penetrating)return;
    if(contact.id!==this.contactId){
      propulsion.impact(s,'barrier');
      if(flight.damage(s,hull.obstacleDamage)){sound.play('hit',s.player.x);sound.voice('hit',s);}
    }
    this.contactId=contact.id;contact.resolve();
  }
}
namespace.RoutePlan=RoutePlan;
})(window.Starhound);
