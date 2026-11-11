/** Prepare the opt-in PRISM live-action demo from the original CC BY 3.0 film.
 * Source: Tears of Steel, © Blender Foundation / Blender Institute.
 * Original: https://mango.blender.org/about/
 * Licensed under https://creativecommons.org/licenses/by/3.0/
 * The 65-second excerpt is an adaptation; retain attribution on the showcase.
 *
 * Usage: npm run prepare:film
 *        node scripts/prepare-film.mjs --input=path/to/source.mp4
 *        node scripts/prepare-film.mjs --input=... --start=0 --duration=8 --output-assets=fixtures/output
 */
import {createRequire} from 'node:module';
import {createWriteStream,existsSync} from 'node:fs';
import {mkdir,rm,stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {spawnSync} from 'node:child_process';

const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const flags=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')&&x.includes('=')).map(x=>{const [k,...v]=x.slice(2).split('=');return [k,v.join('=')];}));
const output=path.resolve(root,flags['output-assets']||'assets');
const start=Number(flags.start??290); // 04:50 of the original
const duration=Number(flags.duration??65);
if(!Number.isFinite(start)||start<0||!Number.isFinite(duration)||duration<1||duration>900)throw new Error('Invalid excerpt boundaries');
const videoPath=path.join(output,'tears-of-steel-excerpt.mp4');
const posterPath=path.join(output,'tears-of-steel-poster.jpg');
const storyboardPath=path.join(output,'tears-of-steel-storyboard.jpg');
const storyboardVttPath=path.join(output,'tears-of-steel-storyboard.vtt');
const ffmpeg=(()=>{if(process.env.FFMPEG_PATH)return process.env.FFMPEG_PATH;try{return require('ffmpeg-static')||'ffmpeg';}catch{return 'ffmpeg';}})();
function run(args){const r=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y',...args],{stdio:'inherit'});if(r.error)throw new Error(`FFmpeg unavailable: ${r.error.message}. Install ffmpeg-static with npm.cmd install, or set FFMPEG_PATH.`);if(r.status!==0)throw new Error(`FFmpeg failed (code ${r.status})`);}
const sources=[
 'https://video.blender.org/download/web-videos/8533ea43-4271-4a57-9694-e9d0b35e1aa1-720.mp4',
 'https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov'
];
async function getMovie(destination){
 let last;
 for(const url of sources){
  try{
   console.log(`Fetching openly licensed film from ${new URL(url).host}...`);
   const response=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(900000)});
   if(!response.ok||!response.body)throw new Error(`HTTP ${response.status}`);
   if(response.headers.get('content-type')?.includes('text/html'))throw new Error('Film server returned HTML, not video');
   await pipeline(Readable.fromWeb(response.body),createWriteStream(destination));
   if((await stat(destination)).size<10000000)throw new Error('Download was unexpectedly small');
   return;
  }catch(e){last=e;await rm(destination,{force:true});console.warn(`Source failed: ${e.message}`);}
 }
 throw new Error(`Could not download the source film: ${last?.message}. Download the original from https://mango.blender.org/download/ and rerun with --input=FULL_PATH.`);
}
let tempDir;
let source=flags.input||process.env.PRISM_FILM_SOURCE;
try{
 if(source){source=path.resolve(source);if(!existsSync(source))throw new Error(`Source film not found: ${source}`);}
 else{tempDir=await import('node:fs/promises').then(fs=>fs.mkdtemp(path.join(os.tmpdir(),'prism-open-film-')));source=path.join(tempDir,'tears-of-steel-original.mp4');await getMovie(source);}
 await mkdir(output,{recursive:true});
 console.log(`Creating ${duration}s excerpt at ${Math.floor(start/60)}:${String(Math.floor(start%60)).padStart(2,'0')}...`);
 run(['-ss',String(start),'-i',source,'-t',String(duration),'-vf','scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2','-c:v','libx264','-preset','veryfast','-crf','22','-maxrate','2400k','-bufsize','4800k','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart',videoPath]);
 run(['-ss','4','-i',videoPath,'-frames:v','1','-q:v','3',posterPath]);
 // Four columns × four rows; 16 genuine frames for the 65-second Optical Loupe.
 run(['-i',videoPath,'-vf',`fps=16/${duration},scale=176:99,tile=4x4`, '-frames:v','1','-q:v','3',storyboardPath]);
 // Use millisecond-accurate media cues, not whole-second rounded durations.
 const ms=n=>{const t=Math.round(n*1000);return `${String(Math.floor(t/3600000)).padStart(2,'0')}:${String(Math.floor(t/60000)%60).padStart(2,'0')}:${String(Math.floor(t/1000)%60).padStart(2,'0')}.${String(t%1000).padStart(3,'0')}`;};
 const precise=['WEBVTT',''];
 for(let i=0;i<16;i++)precise.push(`${ms(i*duration/16)} --> ${ms((i+1)*duration/16)}`,`tears-of-steel-storyboard.jpg#xywh=${(i%4)*176},${Math.floor(i/4)*99},176,99`,'');
 await import('node:fs/promises').then(fs=>fs.writeFile(storyboardVttPath,precise.join('\n')));
 const size=(await stat(videoPath)).size;
 if(size>24*1048576)throw new Error('Optimized movie exceeds the 24 MiB deployment budget; raise CRF / lower maxrate in prepare-film.mjs and rerun.');
 console.log(`Ready: ${videoPath} (${(size/1048576).toFixed(1)} MiB). Poster, storyboard and timed caption tracks are included.`);
 console.log('Run npm.cmd run build to include this film in your Cloudflare deployment.');
}finally{if(tempDir)await rm(tempDir,{recursive:true,force:true});}
