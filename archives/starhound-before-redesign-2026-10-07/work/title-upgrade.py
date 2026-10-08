from pathlib import Path
p=Path('js/settings.js');s=p.read_text();mark='  clear:0x090f16,fogDensity:.0022'
s=s.replace(mark,'''  hangar:{
    image:'./assets/title/hangar-reference.png',width:1672,height:941,frames:8,frameSeconds:.6,
    meshStep:20,patch:[1080,285,1540,675],clipExpansion:1.014,buildDelayMs:20,
    lights:[
      {points:[[573,8],[631,22],[625,35],[568,20]],glow:[599,22,55],color:'#ffe3b8',phase:0},
      {points:[[923,112],[970,125],[963,138],[916,124]],glow:[944,126,43],color:'#ffd7a2',phase:2},
      {points:[[1495,89],[1552,114],[1538,128],[1484,101]],glow:[1518,110,64],color:'#ffe5be',phase:4},
      {points:[[1584,246],[1599,243],[1612,302],[1596,307]],glow:[1598,276,49],color:'#ffcc96',phase:6},
      {points:[[1650,333],[1671,330],[1671,341],[1651,345]],glow:[1660,338,26],color:'#ff8250',phase:3},
    ],
    frameAt(time,reduced=false) {return reduced?0:Math.floor(time/this.frameSeconds)%this.frames;},
    influence(x,y,cx,cy,rx,ry) {const q=((x-cx)/rx)**2+((y-cy)/ry)**2;return q<1?(1-q)**2:0;},
    vertex(x,y,index) {
      const phase=index*math.tau/this.frames,wave=Math.sin(phase),flutter=Math.sin(phase*2);
      const scarf=this.influence(x,y,1413,410,158,78),tail=this.influence(x,y,1387,546,106,124);
      const cheek=this.influence(x,y,1236,387,39,61),ear=this.influence(x,y,1209,322,33,33);
      return [x+scarf*(3.2*wave+flutter)+tail*4.8*wave+cheek*.85*flutter+ear*.6*wave,
        y+scarf*(6.4*wave+1.3*flutter)+tail*(2.9*wave+.6*flutter)+cheek*1.15*wave+ear*.8*flutter];
    },
    triangles(index) {
      const [left,top,right,bottom]=this.patch,result=[];
      for(let y=top;y<bottom;y+=this.meshStep)for(let x=left;x<right;x+=this.meshStep){
        const x1=Math.min(right,x+this.meshStep),y1=Math.min(bottom,y+this.meshStep);
        for(const source of [[[x,y],[x1,y],[x1,y1]],[[x,y],[x1,y1],[x,y1]]]){
          const target=source.map(([px,py])=>this.vertex(px,py,index));
          result.push({source,target,matrix:this.matrix(source,target),clip:this.expand(target)});
        }
      }
      return result;
    },
    matrix(source,target) {
      const [[x0,y0],[x1,y1],[x2,y2]]=source,[[u0,v0],[u1,v1],[u2,v2]]=target;
      const det=(x1-x0)*(y2-y0)-(x2-x0)*(y1-y0);
      const a=((u1-u0)*(y2-y0)-(u2-u0)*(y1-y0))/det,b=((v1-v0)*(y2-y0)-(v2-v0)*(y1-y0))/det;
      const c=((u2-u0)*(x1-x0)-(u1-u0)*(x2-x0))/det,d=((v2-v0)*(x1-x0)-(v1-v0)*(x2-x0))/det;
      return [a,b,c,d,u0-a*x0-c*y0,v0-b*x0-d*y0];
    },
    expand(points) {const cx=points.reduce((n,p)=>n+p[0],0)/3,cy=points.reduce((n,p)=>n+p[1],0)/3;return points.map(([x,y])=>[cx+(x-cx)*this.clipExpansion,cy+(y-cy)*this.clipExpansion]);},
    lightAlpha(index,phase) {return [.016,.021,.028,.031,.026,.019,.013,.014][(index+phase)%this.frames];},
    gradientRadius(light) {return light.glow[2];},
    nextFrame(index) {return index+1;},
  },
''' +mark,1)
s=s.replace("  sectorText(s)","  titleMenuIndex(index,count,code) {return (index+(code==='ArrowUp'?-1:1)+count)%count;},\n  sectorText(s)",1)
p.write_text(s)
p=Path('index.html');s=p.read_text().replace('<title>STARHOUND · Neon Run</title>','<title>STARHOUND · Bone Chaser</title>')
a=s.index('<header id="masthead">');b=s.index('<section id="hud"',a)
s=s[:a]+'''<main id="title-screen" class="screen hangar-title" aria-label="Starhound Bone Chaser hangar">
<div class="hangar-stage">
<img id="hangar-art" class="hangar-art" src="./assets/title/hangar-reference.png" alt="Starhound Bone Chaser. A dog pilot with an orange scarf stands beside a mint starship in a hangar overlooking a distant planet." width="1672" height="941" decoding="async" draggable="false">
<canvas id="hangar-animation" class="hangar-animation" width="1672" height="941" aria-hidden="true"></canvas>
<h1 class="sr-only">STARHOUND · BONE CHASER</h1>
<nav class="hangar-menu" aria-label="Main menu">
<button id="launch" class="hangar-action hangar-primary"><span class="menu-star" aria-hidden="true">✦</span><span>START FLIGHT</span></button>
<button id="checkpoint-resume" class="hangar-action" disabled aria-describedby="checkpoint-note"><span class="menu-star" aria-hidden="true">✦</span><span>CONTINUE</span></button>
<button id="flight-manual" class="hangar-action"><span class="menu-star" aria-hidden="true">✦</span><span>FLIGHT MANUAL</span></button>
<button id="tune-button" class="hangar-action"><span class="menu-star" aria-hidden="true">✦</span><span>OPTIONS</span></button>
</nav>
<p id="checkpoint-note" class="hangar-status"></p>
<p class="hangar-keys">↑ ↓ SELECT &nbsp; ENTER CONFIRM &nbsp; F2 OPTIONS &nbsp; M SOUND</p>
</div>
</main>
''' +s[b:]
s=s.replace('<h2>TUNE THE RUN.</h2>','<h2>FLIGHT OPTIONS.</h2><div class="options-audio"><button id="audio-button" class="icon-button" aria-label="Enable sound">SOUND OFF</button><span>Music &amp; sound · M</span></div>')
s=s.replace('<script src="./js/interface.js">','<script src="./js/hangar.js"></script>\n<script src="./js/interface.js">')
p.write_text(s)
p=Path('js/interface.js');s=p.read_text()
s=s.replace("    this.lastMode=null;this.lastCheckpoint='';", "    this.lastMode=null;this.lastCheckpoint='';this.hangar=new namespace.HangarTitle();")
a=s.index('    const n=this.nodes,c=store.current;');b=s.index('\n  }\n  confirmNew',a)
s=s[:a]+'''    const n=this.nodes,c=store.current;const label=store.warning||(c?`CHECKPOINT ${c.wave} · ${c.lives} LIVES · NEW FLIGHT CLEARS PROGRESS`:'3 LIVES · ENDLESS WAVES · NO CHECKPOINT YET');
    if(this.lastCheckpoint===label)return;this.lastCheckpoint=label;
    n['checkpoint-resume'].disabled=!c;
    n['checkpoint-resume'].setAttribute('aria-label',c?`Continue from checkpoint at wave ${c.wave}`:'Continue unavailable: no checkpoint');
    n['checkpoint-note'].textContent=label;''' +s[b:]
s=s.replace('  update(s){','  update(s,titleTime=0){\n    this.hangar.update(titleTime,s.mode===\'title\');',1)
s=s.replace("    if(s.mode==='paused')", "    if(s.mode==='title')n.launch.focus();\n    if(s.mode==='paused')",1)
s=s.replace('  showManual(){', '''  navigateTitle(event,s){
    if(s.mode!=='title'||!['ArrowUp','ArrowDown'].includes(event.code))return false;
    const choices=['launch','checkpoint-resume','flight-manual','tune-button'].map(id=>this.nodes[id]).filter(node=>!node.disabled);
    const index=choices.indexOf(document.activeElement);choices[ui.titleMenuIndex(index,choices.length,event.code)].focus();event.preventDefault();return true;
  }
  showManual(){''')
p.write_text(s)
p=Path('js/game.js');s=p.read_text().replace('view.update(state);','view.update(state,titleTime);')
s=s.replace('    if(controls.handleKey(event))return;',"    if(controls.handleKey(event))return;\n    if(view.navigateTitle(event,state))return;")
p.write_text(s)
p=Path('js/scene.js');s=p.read_text();a=s.index('    this.setCannons(s.weapon.tier);\n    if(s.mode===\'title\')');b=s.index("      const pose=flight.shipPose(s)",a)
s=s[:a]+"    if(s.mode==='title')return;\n    this.setCannons(s.weapon.tier);\n"+s[b:]
s=s.replace('      this.updateReticle(s);\n    }','      this.updateReticle(s);')
p.write_text(s)
