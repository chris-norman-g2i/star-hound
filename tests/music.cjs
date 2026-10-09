const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
function setup(source=fs.readFileSync(path.join(ROOT,'js/settings.js'),'utf8')){
  const window={localStorage:{getItem(){return null}},setInterval(){return 0},clearInterval(){},setTimeout(){return 0},clearTimeout(){}};
  const context=vm.createContext({window});vm.runInContext(source,context);
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js/music.js'),'utf8'),context);return window.Starhound;
}
const ns=setup(),{music,random,tuning}=ns.settings;
const plain=value=>JSON.parse(JSON.stringify(value)),close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const iron=music.tracks.stardog0,medley=music.tracks.game0;
assert.equal(iron.lengthSteps,16*4*8);close(iron.lengthSteps*music.stepSeconds(iron.bpm),76.8);
assert.equal(medley.bpm,110);assert.equal(medley.lengthSteps,512);
assert.deepEqual(plain(music.playback.playlist),['game0','stardog0','game1','stardog1']);
assert.equal(music.previewOrder.length,15);assert(!music.previewOrder.includes('game2'));
// Every section step, including the join and loop boundary, uses the original local score.
for(let step=0;step<medley.lengthSteps*2;step++){
  const local=step%medley.lengthSteps,section=local<256?medley.sections[0]:medley.sections[1];
  assert.deepEqual(plain(music.events('game0',step,110)),plain(music.arrangers.scale(section,local%256,110)));
}
// Independent phrase streams are repeatable, varied and leave encounter randomness untouched.
random.seed('MUSIC-QA');const gameplayRandom=random.value;
const layer=iron.layers[0],flourishes=[],waves=new Set();let ascending=0,descending=0;
for(let step=0;step<iron.lengthSteps;step++){
  const base=music.arrangers.sequence(iron,step,iron.bpm),events=music.events('stardog0',step,iron.bpm);
  assert.deepEqual(plain(events.slice(0,base.length)),plain(base));
  const run=events.slice(base.length),expected=step>=layer.firstStep&&(step-layer.firstStep)%layer.intervalSteps===0;
  assert.equal(run.length>0,expected);
  // The accompaniment still repeats the original four-bar form.
  assert.deepEqual(plain(base),plain(music.arrangers.sequence(iron,step%64,iron.bpm)));
  if(!expected)continue;
  flourishes.push(step);assert(layer.noteCounts.includes(run.length));waves.add(run[0].voice.wave);
  const up=run[0].frequency<run.at(-1).frequency;if(up)ascending++;else descending++;
  for(let i=0;i<run.length;i++){
    assert.equal(run[i].voice,run[0].voice);close(run[i].offset,i*music.stepSeconds(iron.bpm)*layer.spacingSteps);
    close(run[i].duration,music.stepSeconds(iron.bpm)*layer.durationSteps);
    if(i)assert(up?run[i].frequency>run[i-1].frequency:run[i].frequency<run[i-1].frequency);
  }
  assert(step+run.at(-1).offset/music.stepSeconds(iron.bpm)+layer.durationSteps<iron.lengthSteps);
  assert.deepEqual(plain(music.events('stardog0',step,iron.bpm)),plain(events));
}
assert.equal(random.value,gameplayRandom);assert.equal(flourishes.length,16);
assert(ascending>descending&&descending>=2);assert.deepEqual([...waves].sort(),['sine','square']);
assert.notDeepEqual(plain(music.events('stardog0',8,100)),plain(music.events('stardog0',iron.lengthSteps+8,100)));
// The exported settings remain standalone and reconstruct nested scores and layers.
const exported=setup(tuning.exportSource()).settings.music;
for(const id of music.previewOrder)for(let step=0;step<music.tracks[id].lengthSteps;step++){
  const bpm=music.tracks[id].bpm??music.oneShotBpm;
  const events=music.events(id,step,bpm);assert.deepEqual(plain(exported.events(id,step,bpm)),plain(events));
  for(const event of events)assert(event.voice&&Number.isFinite(event.frequency)&&event.duration>0&&Number.isFinite(event.offset));
}
// Existing transport honors the longer scores before moving to the next playlist item.
const gain=()=>({value:0,setTargetAtTime(){},setValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){}});
const node=()=>({gain:gain(),connect(){},disconnect(){}});
const context={currentTime:0,state:'running',createGain:node,createDynamicsCompressor(){return {...node(),threshold:gain(),ratio:gain(),attack:gain(),release:gain()};}};
for(const id of ['game0','stardog0']){
  const transport=new ns.MusicTransport(context,{ambient:node(),direct:node()},null);transport.render=()=>{};
  transport.select({id,bpm:music.tracks[id].bpm,revision:1,once:true});
  const start=transport.nextTime,pace=music.stepSeconds(transport.bpm),length=music.tracks[id].lengthSteps;
  for(let step=0;step<length;step++){context.currentTime=transport.nextTime;transport.schedule();}
  assert.equal(transport.step,length);close(transport.arrangementEnd,start+length*pace);
  context.currentTime=transport.arrangementEnd-.001;assert.equal(transport.finished,false);
  context.currentTime=transport.arrangementEnd;assert.equal(transport.finished,true);transport.dispose();
}
const director=new ns.MusicDirector(),state={mode:'playing',speed:80};
director.beginFlight(state);assert.equal(director.request.id,'game0');director.complete(10);
assert.equal(director.update(state,10).id,null);
assert.equal(director.update(state,10+music.playback.gapSeconds).id,'stardog0');
const seen=new Set();for(let i=0;i<music.previewOrder.length;i++)seen.add(director.nextPreview(state).id);
assert.equal(seen.size,music.previewOrder.length);
console.log(`Music passed: 32-bar Iron Drive, ${ascending} ascending/${descending} descending sine/square runs, unchanged accompaniment, continuous 110 BPM medley, catalog preview, export and playlist timing.`);
