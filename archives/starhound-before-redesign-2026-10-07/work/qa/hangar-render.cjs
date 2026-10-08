const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createCanvas,loadImage}=require('/Users/mana/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
(async()=>{
const image=await loadImage('assets/title/hangar-reference.png');image.addEventListener=()=>{};
const canvas=createCanvas(image.width,image.height);canvas.classList={add(){}};canvas.dataset={};
const queue=[],motion={matches:false,addEventListener(){}};
const document={getElementById:id=>id==='hangar-art'?image:canvas,createElement:()=>createCanvas(1,1)};
const window={matchMedia:()=>motion,setTimeout:f=>queue.push(f)};
const ctx=vm.createContext({window,document,console,Math,JSON,Number,Float32Array,Uint8Array});
for(const f of ['settings','hangar'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f});
const {gfx}=window.Starhound.settings,title=new window.Starhound.HangarTitle();title.prepare();while(queue.length)queue.shift()();
assert.equal(title.frames.length,8);const hashes=new Set();fs.mkdirSync('work/qa/hangar-render',{recursive:true});
for(let i=0;i<8;i++){
 title.update(i*gfx.hangar.frameSeconds+.001,true);assert.equal(canvas.dataset.frame,String(i));
 const png=canvas.toBuffer('image/png');hashes.add(crypto.createHash('sha256').update(png).digest('hex'));
 fs.writeFileSync('work/qa/hangar-render/frame-'+i+'.png',png);
 for(const triangle of gfx.hangar.triangles(i))for(let j=0;j<3;j++){
  const [a,b,c,d,e,f]=triangle.matrix,[x,y]=triangle.source[j],[u,v]=triangle.target[j];
  assert(Math.abs(a*x+c*y+e-u)<1e-7);assert(Math.abs(b*x+d*y+f-v)<1e-7);
 }
}
assert.equal(hashes.size,8);title.update(4.801,true);assert.equal(canvas.dataset.frame,'0');title.update(1.21,false);assert.equal(canvas.dataset.frame,'0');
motion.matches=true;title.lastFrame=-1;title.update(1.21,true);assert.equal(canvas.dataset.frame,'0');
const baseline=createCanvas(image.width,image.height);baseline.getContext('2d').drawImage(image,0,0);
const logo=baseline.getContext('2d').getImageData(45,100,755,240).data;
for(const frame of title.frames)assert.deepEqual(frame.getContext('2d').getImageData(45,100,755,240).data,logo);
const strip=createCanvas(1840,390),paint=strip.getContext('2d');for(const [i,index] of [0,2,4,6].entries())paint.drawImage(title.frames[index],1080,285,460,390,i*460,0,460,390);fs.writeFileSync('work/qa/hangar-render/dog-phases.png',strip.toBuffer('image/png'));
console.log('Eight distinct frames rendered from the shipped animation class. Affine transforms, loop wrap, hidden-screen freeze, reduced motion and unchanged logo pixels passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
