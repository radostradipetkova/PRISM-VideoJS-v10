/**
 * Build a genuine timed storyboard for the full CC BY 3.0 Tears of Steel film.
 * This is generated once during preparation, NOT while a visitor scrubs.
 *
 * Usage: node scripts/generate-liveaction-storyboard.mjs --input=/path/film.mp4
 *
 * Source/attribution: Blender Foundation / Blender Institute, Tears of Steel
 * https://mango.blender.org/about/ — CC BY 3.0
 */
import {execFileSync,spawnSync} from 'node:child_process';
import {writeFile,mkdir,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const flags=Object.fromEntries(process.argv.slice(2).filter(a=>a.startsWith('--')&&a.includes('=')).map(a=>{
  const [key,...parts]=a.slice(2).split('=');return [key,parts.join('=')];
}));
if(!flags.input)throw new Error('Specify --input=/path/to/full-film.mp4');
const input=path.resolve(flags.input);
const output=path.resolve(flags.output||path.join(root,'assets'));
const interval=8; // 8-second previews; ~90 real frames across the full movie.
const tileWidth=160,tileHeight=90,columns=10;
const jpeg='tears-of-steel-full-storyboard.jpg';
const vtt='tears-of-steel-full-storyboard.vtt';
const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nokey=1:noprint_wrappers=1',input],{encoding:'utf8'}).trim());
if(!Number.isFinite(duration)||duration<100||duration>36000)throw new Error('Invalid source duration: '+duration);
const count=Math.ceil(duration/interval);
const rows=Math.ceil(count/columns);
if(count>1500)throw new Error('Storyboard would exceed 1500 frames');
await mkdir(output,{recursive:true});
const filter=`fps=1/${interval},scale=${tileWidth}:${tileHeight}:flags=lanczos,tile=${columns}x${rows}:padding=0:margin=0`;
const args=['-hide_banner','-loglevel','error','-y','-i',input,'-vf',filter,'-frames:v','1','-q:v','3',path.join(output,jpeg)];
const result=spawnSync('ffmpeg',args,{stdio:'inherit',timeout:22*60*1000});
if(result.error||result.status!==0)throw new Error('Failed generating storyboard: '+(result.error?.message||result.status));
const spriteSize=(await stat(path.join(output,jpeg))).size;
if(spriteSize<10000||spriteSize>8*1024*1024)throw new Error('Unexpected sprite size: '+spriteSize);
const format=n=>{
 const ms=Math.max(0,Math.round(n*1000));
 const part=(v,w=2)=>String(v).padStart(w,'0');
 return `${part(Math.floor(ms/3600000))}:${part(Math.floor(ms/60000)%60)}:${part(Math.floor(ms/1000)%60)}.${part(ms%1000,3)}`;
};
const cues=['WEBVTT',''];
for(let i=0;i<count;i++){
 const start=i*interval;
 const end=Math.min(duration,(i+1)*interval);
 if(end<=start)break;
 const x=(i%columns)*tileWidth;
 const y=Math.floor(i/columns)*tileHeight;
 cues.push(`${format(start)} --> ${format(end)}`,`${jpeg}#xywh=${x},${y},${tileWidth},${tileHeight}`,'');
}
await writeFile(path.join(output,vtt),cues.join('\n'));
console.log(JSON.stringify({duration,frameCount:count,interval,columns,rows,spriteBytes:spriteSize,files:[jpeg,vtt]}));
