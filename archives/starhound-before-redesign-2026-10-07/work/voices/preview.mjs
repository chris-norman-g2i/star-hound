import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const assetDir=path.join(root,'assets/audio/voices'),outputDir=path.join(root,'output/audio');
const manifest=JSON.parse(await fs.readFile(path.join(assetDir,'manifest.json'),'utf8'));
await fs.mkdir(outputDir,{recursive:true});
const escape=text=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
for(const character of Object.keys(manifest.characters)){
  const clips=manifest.clips.filter(clip=>clip.character===character),args=['-hide_banner','-loglevel','error','-y'];
  for(const clip of clips)args.push('-i',path.join(assetDir,clip.file));
  const filter=clips.map((_,i)=>`[${i}:a]aresample=24000,aformat=sample_fmts=fltp:channel_layouts=mono,apad=pad_dur=0.5[a${i}]`).join(';')+';'+clips.map((_,i)=>`[a${i}]`).join('')+`concat=n=${clips.length}:v=0:a=1[out]`;
  const name=character==='dog'?'dog-hero-preview.mp3':'computer-assistant-preview.mp3';
  args.push('-filter_complex',filter,'-map','[out]','-codec:a','libmp3lame','-b:a','96k',path.join(outputDir,name));
  const result=spawnSync('ffmpeg',args,{encoding:'utf8'});if(result.status!==0)throw Error(result.stderr);
}
const panels=Object.entries(manifest.characters).map(([id,character])=>`<section class="voice ${id}"><div class="eyebrow">VOICE ${id==='dog'?'01':'02'}</div><h2>${escape(character.name)}</h2><p class="description">${id==='dog'?'Suave. Cool. Ready to chase that bone.':'Clear flight announcements and a little affection.'}</p><button class="all" data-character="${id}">▶ Play all ${id==='dog'?'7':'9'} lines</button><ol>${manifest.clips.filter(clip=>clip.character===id).map(clip=>`<li><button class="line" data-src="${escape(clip.file)}" data-character="${id}" aria-label="Play: ${escape(clip.text)}"><span class="play" aria-hidden="true">▶</span><span>${escape(clip.text)}</span></button></li>`).join('')}</ol></section>`).join('');
await fs.writeFile(path.join(assetDir,'preview.html'),`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Starhound · Voice Studio</title><style>
*{box-sizing:border-box}body{margin:0;background:#090f16;color:#f0eee3;font:16px/1.5 system-ui,sans-serif;background-image:radial-gradient(ellipse at 20% 0%,#123434 0%,transparent 45%)}main{max-width:1040px;margin:auto;padding:48px 24px 140px}.eyebrow{color:#89d9ce;letter-spacing:.2em;font-size:12px;font-weight:700}h1{font-size:clamp(34px,6vw,62px);letter-spacing:-.04em;line-height:1.1;margin:12px 0}header p{color:#b4c4c8;max-width:620px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:36px}.voice{padding:24px;border:1px solid #30434b;border-radius:18px;background:#111c25}.computer{border-color:#335e58}h2{margin:8px 0 0;font-size:27px}.description{color:#a9bac0;min-height:48px}.all{border:1px solid #89d9ce;border-radius:8px;background:#153333;color:#b8fff0;padding:10px 16px;cursor:pointer;font:inherit}.dog .all{border-color:#ffa571;color:#ffcfaa;background:#362a24}ol{list-style:none;padding:0;margin:18px 0 0}.line{display:flex;align-items:flex-start;gap:14px;width:100%;text-align:left;color:inherit;background:none;border:0;border-bottom:1px solid #283942;padding:13px 0;font:inherit;cursor:pointer}.play{color:#89d9ce;font-size:13px;margin-top:4px}.dog .play{color:#ffa571}button:hover{filter:brightness(1.3)}button:focus-visible{outline:2px solid #89d9ce;outline-offset:4px}.line.active{color:#89d9ce}.player{position:fixed;bottom:0;left:0;right:0;background:#0d1822f5;border-top:1px solid #30434b;padding:14px 24px;backdrop-filter:blur(12px)}.player-inner{max-width:992px;margin:auto;display:flex;gap:24px;align-items:center;justify-content:space-between}#now{flex:1;font-size:14px;color:#b4c4c8}audio{width:min(420px,50vw)}footer{margin-top:32px;color:#83979e;font-size:13px}a{color:#89d9ce}@media(max-width:680px){.grid{grid-template-columns:1fr}.player-inner{flex-direction:column;gap:8px;align-items:stretch}audio{width:100%}main{padding-top:32px}}
</style></head><body><main><header><div class="eyebrow">STARHOUND · BONE CHASER</div><h1>Meet your flight crew.</h1><p>Sixteen character lines. Choose a phrase to listen, or play a character's full set.</p></header><div class="grid">${panels}</div><footer>Speech generated locally with <a href="https://huggingface.co/hexgrad/Kokoro-82M">Kokoro</a>. No account or connection needed to listen.<br><a href="../../../index.html">Back to the game ↗</a></footer></main><div class="player"><div class="player-inner"><span id="now" aria-live="polite">Select a line to hear your crew.</span><audio id="player" controls preload="none"></audio></div></div><script>
const player=document.getElementById('player'),now=document.getElementById('now'),lines=Array.from(document.querySelectorAll('.line'));let queue=[];
function play(button){lines.forEach(line=>line.classList.toggle('active',line===button));now.textContent=button.textContent.replace('▶','').trim();player.src=button.dataset.src;player.play().catch(()=>{now.textContent='Press play below to hear this line.';});}
lines.forEach(button=>button.addEventListener('click',()=>{queue=[];play(button);}));
document.querySelectorAll('.all').forEach(button=>button.addEventListener('click',()=>{queue=lines.filter(line=>line.dataset.character===button.dataset.character);play(queue.shift());}));
player.addEventListener('ended',()=>{if(queue.length)play(queue.shift());else lines.forEach(line=>line.classList.remove('active'));});
player.addEventListener('error',()=>{queue=[];now.textContent='This clip could not load. Keep the voice folders beside this page.';});
</script></body></html>\n`);
console.log('Created both audio previews and assets/audio/voices/preview.html.');
