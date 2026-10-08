// Development-only speech generation. No model, runtime or service ships with the game.
// Install: npm install --prefix /private/tmp/starhound-kokoro kokoro-js@1.2.1
// Run: node work/voices/generate.mjs [optional clip id]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runtime = process.env.STARHOUND_TTS_RUNTIME || '/private/tmp/starhound-kokoro';
const assetDir = path.join(root, 'assets/audio/voices');
const rawDir = path.join(root, 'work/voices/raw');
const manifest = JSON.parse(await fs.readFile(path.join(assetDir, 'manifest.json'), 'utf8'));
const { env } = await import(pathToFileURL(path.join(runtime, 'node_modules/@huggingface/transformers/dist/transformers.node.mjs')));
env.cacheDir = path.join(runtime, 'model-cache');
const { KokoroTTS } = await import(pathToFileURL(path.join(runtime, 'node_modules/kokoro-js/dist/kokoro.js')));
console.log('Loading Kokoro locally; the first run downloads the public model.');
const tts = await KokoroTTS.from_pretrained(manifest.model, {
  dtype: manifest.precision, device: 'cpu',
  progress_callback: p => { if (p.status === 'done') console.log('Downloaded:', p.file); },
});
await fs.mkdir(rawDir, {recursive: true});
const selected = new Set(process.argv.slice(2));
for (const clip of manifest.clips) {
  if (selected.size && !selected.has(clip.id)) continue;
  const character = manifest.characters[clip.character];
  const rawFile = path.join(rawDir, clip.id + '.wav');
  const finalFile = path.join(assetDir, clip.file);
  await fs.mkdir(path.dirname(finalFile), {recursive: true});
  console.log('Generating:', clip.id, character.voice, clip.text);
  const options = {voice: character.voice, speed: clip.speed || character.speed};
  const audio = clip.phonemes
    ? await tts.generate_from_ids(tts.tokenizer(clip.phonemes, {truncation: true}).input_ids, options)
    : await tts.generate(clip.synthesisText || clip.text, options);
  await audio.save(rawFile);
  // Gentle tone shaping, small edge trims, matched loudness and preserved word tails.
  const tone = clip.character === 'dog'
    ? 'asetrate=23040,aresample=24000,highpass=f=75,equalizer=f=180:t=q:w=0.8:g=1.5'
    : 'highpass=f=130,lowpass=f=9000,aecho=0.8:0.9:32:0.075';
  const edgeTrim = 'silenceremove=start_periods=1:start_duration=0.025:start_threshold=-48dB';
  const filter = tone + ',' + edgeTrim + ',areverse,' + edgeTrim + ',areverse,loudnorm=I=-18:TP=-2.5:LRA=7,apad=pad_dur=0.12';
  const result = spawnSync(process.env.STARHOUND_FFMPEG || 'ffmpeg', ['-hide_banner','-loglevel','error','-y','-i',rawFile,'-af',filter,'-ar','24000','-ac','1','-codec:a','libmp3lame','-b:a','96k',finalFile], {encoding:'utf8'});
  if (result.status !== 0) throw new Error(result.stderr || 'Audio export failed');
}
console.log('Voice clips saved in assets/audio/voices.');
