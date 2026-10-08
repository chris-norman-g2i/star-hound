import path from 'node:path';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const runtime='/private/tmp/starhound-kokoro';
const {env,pipeline}=await import(pathToFileURL(path.join(runtime,'node_modules/@huggingface/transformers/dist/transformers.node.mjs')));
env.cacheDir=path.join(runtime,'model-cache');
const {KokoroTTS}=await import(pathToFileURL(path.join(runtime,'node_modules/kokoro-js/dist/kokoro.js')));
const tts=await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX',{dtype:'fp32',device:'cpu'});
const recognize=await pipeline('automatic-speech-recognition','Xenova/whisper-base.en',{dtype:'q8',device:'cpu'});
const folder=path.resolve('work/voices/candidates');await fs.mkdir(folder,{recursive:true});
for(const voice of ['af_heart','af_bella','af_sarah','am_michael','am_fenrir']){
  const text=voice.startsWith('af_')?'Good boy. Who\'s a good boy? Who\'s the best space doggie?':"Ha ha! Get 'em!";
  const audio=await tts.generate(text,{voice,speed:.9});const file=path.join(folder,voice+'.wav');await audio.save(file);
  const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-i',file,'-f','f32le','-ar','16000','-ac','1','pipe:1']);const pcm=new Float32Array(result.stdout.buffer.slice(result.stdout.byteOffset,result.stdout.byteOffset+result.stdout.byteLength));
  console.log(JSON.stringify({voice,text,...await recognize(pcm)}));
}
