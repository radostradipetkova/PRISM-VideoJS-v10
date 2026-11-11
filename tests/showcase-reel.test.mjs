import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
const asset=name=>new URL(`assets/${name}`,root);
const filePath=u=>decodeURIComponent(u.pathname);
const ffprobe=(file,args)=>execFileSync('ffprobe',['-v','error',...args,filePath(file)],{encoding:'utf8'}).trim();
const frame=(file,time)=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-ss',String(time),'-i',filePath(file),'-vf','scale=100:56','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);
const portionChanged=(a,b,threshold=12)=>{
 assert.equal(a.length,b.length);let changed=0;
 for(let i=0;i<a.length;i++)if(Math.abs(a[i]-b[i])>threshold)changed++;
 return changed/a.length;
};

test('cinematic showcase has 32 seconds of playable H264 plus AAC stereo audio',async()=>{
 const clip=asset('prism-cinematic.mp4');
 assert.ok((await stat(clip)).size>1_000_000);
 const m=JSON.parse(ffprobe(clip,['-show_entries','format=duration:stream=codec_type,codec_name,width,height,channels','-of','json']));
 assert.ok(Math.abs(Number(m.format.duration)-32)<.1);
 assert.equal(m.streams.find(s=>s.codec_type==='video')?.codec_name,'h264');
 assert.equal(m.streams.find(s=>s.codec_type==='video')?.width,960);
 assert.equal(m.streams.find(s=>s.codec_type==='video')?.height,540);
 assert.equal(m.streams.find(s=>s.codec_type==='audio')?.codec_name,'aac');
 assert.equal(m.streams.find(s=>s.codec_type==='audio')?.channels,2);
 assert.ok((await stat(asset('prism-cinematic.jpg'))).size>10_000);
});

test('four different visual environments are present',()=>{
 const file=asset('prism-cinematic.mp4');
 const timestamps=[3,11,19,27];
 const imgs=timestamps.map(t=>frame(file,t));
 for(let k=0;k<3;k++)assert.ok(portionChanged(imgs[k],imgs[k+1],25)>.34,`Scenarios ${k+1} & ${k+2} look too alike`);
});

test('there is actual movement WITHIN every scene, not just a cut between stills',()=>{
 const file=asset('prism-cinematic.mp4');
 for(const [a,b] of [[1,5],[9,13],[17,21],[25,29]])
  assert.ok(portionChanged(frame(file,a),frame(file,b),10)>.065,`Scene ${a}-${b} had too little movement`);
});

test('night and sunlight focused clips also move and contain audio',async()=>{
 for(const name of ['night-city','coast-sunrise']){
   const f=asset(`${name}.mp4`);
   const m=JSON.parse(ffprobe(f,['-show_entries','format=duration:stream=codec_type','-of','json']));
   assert.ok(Number(m.format.duration)>=7.1);
   assert.ok(m.streams.some(s=>s.codec_type==='audio'));
   assert.ok(portionChanged(frame(f,1),frame(f,5),9)>.04,`${name} contains too little motion`);
   assert.ok((await stat(asset(`${name}.jpg`))).size>10_000);
   assert.match(await readFile(asset(`${name}.vtt`),'utf8'),/^WEBVTT/);
 }
});

test('new moving showcase is default, four chapter buttons seek real media and captions describe each chapter',async()=>{
 const html=await readFile(new URL('index.html',root),'utf8');
 const app=await readFile(new URL('src/app.js',root),'utf8');
 const captions=await readFile(asset('prism-cinematic.vtt'),'utf8');
 assert.match(html,/data-film="cinematic" aria-pressed="true"/);
 assert.match(app,/function load\(film='cinematic'\)/);
 for(const key of ['night','coast'])assert.ok(html.includes(`data-film="${key}"`));
 for(let k=0;k<4;k++)assert.ok(html.includes(`data-chapter="${k}"`));
 assert.match(app,/media\.currentTime=target/);
 assert.match(app,/loadedmetadata/);
 for(const time of ['00:00:00.500','00:00:08.250','00:00:16.250','00:00:24.250'])assert.ok(captions.includes(time));
});
