// Independent local speech recognition checks the rendered lines for omissions.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const runtime=process.env.STARHOUND_TTS_RUNTIME||'/private/tmp/starhound-kokoro';
const {pipeline,env}=await import(pathToFileURL(path.join(runtime,'node_modules/@huggingface/transformers/dist/transformers.node.mjs')));
env.cacheDir=path.join(runtime,'model-cache');
const transcriber=await pipeline('automatic-speech-recognition','Xenova/whisper-base.en',{device:'cpu',dtype:'q8',progress_callback:p=>{if(p.status==='done')console.log('Downloaded:',p.file);}});
const manifest=JSON.parse(await fs.readFile(path.join(root,'assets/audio/voices/manifest.json'),'utf8'));
const results=[];
for(const clip of manifest.clips){
  const decoded=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-i',path.join(root,'assets/audio/voices',clip.file),'-f','f32le','-ar','16000','-ac','1','pipe:1'],{maxBuffer:10*1024*1024});
  if(decoded.status!==0)throw Error(decoded.stderr.toString());
  const pcm=new Float32Array(decoded.stdout.buffer.slice(decoded.stdout.byteOffset,decoded.stdout.byteOffset+decoded.stdout.byteLength));
  const result=await transcriber(pcm);
  const item={id:clip.id,expected:clip.text,transcript:result.text.trim(),seconds:pcm.length/16000};results.push(item);console.log(JSON.stringify(item));
}
await fs.writeFile(path.join(root,'work/voices/transcripts.json'),JSON.stringify(results,null,2)+'\n');
