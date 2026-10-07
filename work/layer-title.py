from pathlib import Path
p=Path('js/settings.js');s=p.read_text();a=s.index('  hangar:{');b=s.index('  clear:0x090f16',a)
s=s[:a]+'''  hangar:{
    image:'./assets/title/hangar-clean-v1.png',width:1672,height:941,frames:8,frameSeconds:.6,
    sheet:{width:1774,height:887,columns:4,rows:2},
    sprites:[
      {id:'hangar-tail',image:'./assets/title/tail-wind-v2.png',size:[312,302],scale:[.8,1.2],sourceAnchor:[80,309],anchor:[1280,592]},
      {id:'hangar-scarf',image:'./assets/title/scarf-wind-v2.png',size:[400,300],scale:[1,1],sourceAnchor:[30,218],anchor:[1138,432]},
    ],
    lights:[
      {glow:[599,22,55],color:'#ffe3b8',phase:0},
      {glow:[944,126,43],color:'#ffd7a2',phase:2},
      {glow:[1518,110,64],color:'#ffe5be',phase:4},
      {glow:[1598,276,49],color:'#ffcc96',phase:6},
      {glow:[1660,338,26],color:'#ff8250',phase:3},
    ],
    frameAt(time,reduced=false) {return reduced?0:Math.floor(time/this.frameSeconds)%this.frames;},
    frameRect(index) {const w=this.sheet.width/this.sheet.columns,h=this.sheet.height/this.sheet.rows;return [(index%this.sheet.columns)*w,Math.floor(index/this.sheet.columns)*h,w,h];},
    framePosition(index) {return `${index%this.sheet.columns/(this.sheet.columns-1)*100}% ${Math.floor(index/this.sheet.columns)/(this.sheet.rows-1)*100}%`;},
    layerRect(sprite) {
      const w=sprite.size[0]*sprite.scale[0],h=sprite.size[1]*sprite.scale[1];
      return [sprite.anchor[0]-sprite.sourceAnchor[0]/(this.sheet.width/this.sheet.columns)*w,
        sprite.anchor[1]-sprite.sourceAnchor[1]/(this.sheet.height/this.sheet.rows)*h,w,h];
    },
    layerStyle(sprite) {
      const [x,y,w,h]=this.layerRect(sprite);return {left:`${x/this.width*100}%`,top:`${y/this.height*100}%`,width:`${w/this.width*100}%`,height:`${h/this.height*100}%`,
        backgroundImage:`url("${sprite.image}")`,backgroundSize:`${this.sheet.columns*100}% ${this.sheet.rows*100}%`,backgroundPosition:this.framePosition(0)};
    },
    lightStyle(light) {const [x,y,r]=light.glow;return {left:`${(x-r)/this.width*100}%`,top:`${(y-r)/this.height*100}%`,width:`${r*2/this.width*100}%`,height:`${r*2/this.height*100}%`,background:`radial-gradient(ellipse,${light.color},transparent 70%)`};},
    lightAlpha(index,phase) {return [.016,.021,.028,.031,.026,.019,.013,.014][(index+phase)%this.frames];},
  },
''' +s[b:];p.write_text(s)
p=Path('index.html');s=p.read_text().replace('src="./assets/title/hangar-reference.png"','src="./assets/title/hangar-clean-v1.png"',1)
s=s.replace('<canvas id="hangar-animation" class="hangar-animation" width="1672" height="941" aria-hidden="true"></canvas>', '<div id="hangar-animation" class="hangar-wind" aria-hidden="true"><div id="hangar-tail" class="wind-sprite"></div><div id="hangar-scarf" class="wind-sprite"></div></div>\n<div id="hangar-lights" class="hangar-lights" aria-hidden="true"></div>')
p.write_text(s)
p=Path('style.css');s=p.read_text().replace('.hangar-art,.hangar-animation{','.hangar-art{').replace('.hangar-animation{opacity:0}.hangar-animation.ready{opacity:1}', '.hangar-wind,.hangar-lights{position:absolute;inset:0;pointer-events:none}.hangar-wind{z-index:2}.wind-sprite{position:absolute;background-repeat:no-repeat}.hangar-lights{z-index:1;mix-blend-mode:screen}.hangar-light{position:absolute;opacity:0;pointer-events:none}.hangar-menu{z-index:3}')
p.write_text(s)
