const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createCanvas,loadImage}=require('/Users/mana/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
(async()=>{
const nodes=Object.fromEntries(['hangar-animation','hangar-tail','hangar-scarf','hangar-lights'].map(id=>[id,{style:{},dataset:{},children:[],append(child){this.children.push(child);}}]));
const motion={matches:false,addEventListener(){}};
const document={getElementById:id=>nodes[id],createElement:()=>({style:{},classList:{add(){}}})},window={matchMedia:()=>motion};
const context=vm.createContext({window,document,console,Math,JSON,Number,Float32Array,Uint8Array});for(const name of ['settings','hangar'])vm.runInContext(fs.readFileSync('js/'+name+'.js','utf8'),context);
const config=window.Starhound.settings.gfx.hangar,title=new window.Starhound.HangarTitle();assert.equal(nodes['hangar-lights'].children.length,5);
const background=await loadImage(config.image),sheets=await Promise.all(config.sprites.map(s=>loadImage(s.image)));assert.equal(background.width,1672);assert.equal(background.height,941);
for(const sheet of sheets){assert.equal(sheet.width,config.sheet.width);assert.equal(sheet.height,config.sheet.height);const c=createCanvas(sheet.width,sheet.height),ctx=c.getContext('2d');ctx.drawImage(sheet,0,0);assert.equal(ctx.getImageData(0,0,1,1).data[3],0);}
const hashes=new Set(),frames=[];fs.mkdirSync('work/qa/hangar-layers',{recursive:true});
for(let index=0;index<8;index++){
 title.update(index*config.frameSeconds+.001,true);assert.equal(nodes['hangar-animation'].dataset.frame,String(index));assert.equal(nodes['hangar-tail'].style.backgroundPosition,config.framePosition(index,config.sprites[0]));
 const frame=createCanvas(config.width,config.height),ctx=frame.getContext('2d');ctx.drawImage(background,0,0);
 for(const [i,sprite] of config.sprites.entries())ctx.drawImage(sheets[i],...config.spriteFrameRect(sprite,index),...config.spriteLayerRect(sprite));
 frames.push(frame);const png=frame.toBuffer('image/png');hashes.add(crypto.createHash('sha256').update(png).digest('hex'));fs.writeFileSync('work/qa/hangar-layers/frame-'+index+'.png',png);
}
assert.equal(hashes.size,8);assert.equal(config.frameSeconds,.6/2.5);title.update(config.frames*config.frameSeconds+.001,true);assert.equal(nodes['hangar-animation'].dataset.frame,'0');title.update(1.21,false);assert.equal(nodes['hangar-animation'].dataset.frame,'0');motion.matches=true;title.lastFrame=-1;title.update(1.21,true);assert.equal(nodes['hangar-animation'].dataset.frame,'0');
const tail=config.sprites[0],rect=config.layerRect(tail);assert.equal(rect[2]/tail.size[0],.8);assert.equal(rect[3]/tail.size[1],1.2);
for(const sprite of config.sprites){const [x,y,w,h]=config.layerRect(sprite);assert(Math.abs(x+sprite.sourceAnchor[0]/config.frameRect(0)[2]*w-sprite.anchor[0])<1e-8);assert(Math.abs(y+sprite.sourceAnchor[1]/config.frameRect(0)[3]*h-sprite.anchor[1])<1e-8);}
for(const sprite of config.sprites){const [x,y,w,h]=config.spriteLayerRect(sprite),source=config.spriteFrameRect(sprite,0);assert(Math.abs(x+(sprite.sourceAnchor[0]-sprite.sourceWindow.left)/source[2]*w-sprite.anchor[0])<1e-8);assert(Math.abs(y+sprite.sourceAnchor[1]/source[3]*h-sprite.anchor[1])<1e-8);}
const baseline=createCanvas(config.width,config.height);baseline.getContext('2d').drawImage(background,0,0);const logo=baseline.getContext('2d').getImageData(50,100,950,260).data;
for(const frame of frames)assert.deepEqual(frame.getContext('2d').getImageData(50,100,950,260).data,logo);
const phases=createCanvas(1960,420),p=phases.getContext('2d');for(const [i,index] of [0,2,4,6].entries())p.drawImage(frames[index],1080,290,490,420,i*490,0,490,420);fs.writeFileSync('work/qa/hangar-layers/phases.png',phases.toBuffer('image/png'));
assert(!fs.readFileSync('js/hangar.js','utf8').includes('getContext'));assert(!fs.readFileSync('index.html','utf8').includes('<canvas id="hangar-animation"'));
console.log('Eight DIV sprite frames, real alpha assets, fixed anchors, 0.8× width / 1.2× height tail, loop, reduced motion, hidden-screen pause and static background passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
