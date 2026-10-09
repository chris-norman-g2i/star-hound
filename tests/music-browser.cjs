const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const ROOT=path.resolve(__dirname,'..'),BROWSER=process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
(async()=>{
  const browser=await chromium.launch({executablePath:BROWSER,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',async request=>{
      const url=new URL(request.request().url());
      if(url.hostname==='cdn.jsdelivr.net')return request.fulfill({path:process.env.THREE_PATH||'/tmp/starhound-three-r160.min.js',contentType:'text/javascript'});
      if(url.hostname!=='starhound.test')return request.fulfill({body:''});
      const file=path.join(ROOT,url.pathname==='/'?'index.html':decodeURIComponent(url.pathname));
      if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file))return request.fulfill({status:404,body:''});
      if(url.pathname==='/js/game.js')return request.fulfill({contentType:'text/javascript',body:
        'const OriginalSound=Starhound.SoundEngine;Starhound.SoundEngine=class extends OriginalSound{constructor(){super();window.musicQA=this;}};'+fs.readFileSync(file,'utf8')});
      return request.fulfill({path:file,contentType:{'.html':'text/html','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.css':'text/css','.ttf':'font/ttf','.mp3':'audio/mpeg'}[path.extname(file)]||'application/octet-stream'});
    });
    // Render both complete arrangements with the real Web Audio renderer and mixing.
    await page.goto('http://starhound.test/');
    const reports=await page.evaluate(async()=>{
      const ns=Starhound,{music,sfx}=ns.settings,reports=[];
      for(const id of ['stardog0','game0']){
        const track=music.tracks[id],seconds=track.lengthSteps*music.stepSeconds(track.bpm),sampleRate=22050;
        const ctx=new OfflineAudioContext(2,Math.ceil((seconds+1)*sampleRate),sampleRate);
        const master=ctx.createGain();master.gain.value=music.master;
        const compressor=ctx.createDynamicsCompressor();for(const [key,value] of Object.entries(music.compressor))compressor[key].value=value;
        compressor.connect(master);master.connect(ctx.destination);
        const impulse=ctx.createBuffer(2,music.samples(music.reverbSeconds,sampleRate),sampleRate);
        for(const channel of [0,1])impulse.copyToChannel(music.impulse(impulse.length,sampleRate),channel);
        const noise=ctx.createBuffer(1,music.samples(sfx.noiseSeconds,sampleRate),sampleRate);noise.copyToChannel(sfx.noise(noise.length),0);
        const transport=new ns.MusicTransport(ctx,{direct:compressor,ambient:(envelope,nodes)=>{
          envelope.connect(compressor);return ns.SoundEngine.prototype.createSpace.call({context:ctx},envelope,impulse,true,nodes);
        }},noise);
        window.clearInterval(transport.timer);transport.select({id,bpm:track.bpm,revision:1,once:true});
        const start=transport.nextTime,pace=music.stepSeconds(track.bpm);
        transport.bus.envelope.gain.setValueAtTime(1,start+seconds-music.playback.fadeSeconds);
        transport.bus.envelope.gain.linearRampToValueAtTime(0,start+seconds);
        for(let step=0;step<track.lengthSteps;step++)for(const event of music.events(id,step,track.bpm))transport.render(event,start+step*pace+event.offset,transport.bus);
        const buffer=await ctx.startRendering(),data=buffer.getChannelData(0);let peak=0,finite=true;
        for(const sample of data){peak=Math.max(peak,Math.abs(sample));if(!Number.isFinite(sample))finite=false;}
        const rms=(from,to)=>{let sum=0,count=0;for(let i=Math.floor(from*sampleRate);i<Math.floor(to*sampleRate);i++){sum+=data[i]*data[i];count++;}return Math.sqrt(sum/count);};
        const blocks=[];for(let step=0;step<track.lengthSteps;step+=32)blocks.push(rms(start+step*pace,start+(step+32)*pace));
        const join=start+256*pace;
        reports.push({id,seconds,peak,finite,minimumBlockRms:Math.min(...blocks),joinBefore:rms(join-.12,join),joinAfter:rms(join,join+.12)});
        transport.dispose();
      }
      return reports;
    });
    for(const report of reports){assert(report.finite);assert(report.peak>.01&&report.peak<1);assert(report.minimumBlockRms>.001);assert(report.joinBefore>.001&&report.joinAfter>.001);}
    assert.equal(reports[0].seconds,76.8);console.log('Complete Web Audio renders:',reports);
    // Real title/menu and P preview still share the catalog and transport.
    assert.equal(await page.evaluate(()=>musicQA.director.request.id),'stardogTitle');
    await page.keyboard.press('p');await page.waitForFunction(()=>musicQA.enabled&&musicQA.director.request.preview);
    const order=await page.evaluate(()=>Starhound.settings.music.previewOrder),seen=new Set();
    for(let i=0;i<order.length;i++){
      seen.add(await page.evaluate(()=>musicQA.music.track));await page.keyboard.press('p');
    }
    assert.equal(seen.size,order.length);assert(seen.has('game0')&&seen.has('stardog0')&&seen.has('stardogTitle'));
    await page.click('#launch');await page.waitForFunction(()=>musicQA.lastState?.mode==='playing');
    assert.equal(await page.evaluate(()=>musicQA.music.track),'game0');
    assert.equal(await page.evaluate(()=>musicQA.music.bpm),110);
    assert.deepEqual(errors,[]);console.log('Browser music passed: title request, every P preview, and flight launch at the combined song.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
