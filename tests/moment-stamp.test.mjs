import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  parseMomentSeconds,formatMomentTime,createMomentUrl,
  initMomentStamp,restoreMomentToMedia
} from '../src/moment-stamp.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function fakeStamp(){
 const media=new EventTarget();
 Object.assign(media,{paused:true,ended:false,currentTime:0,volume:.6,readyState:0,duration:NaN,
  seekable:{length:0}});
 const nodes={};
 for(const cls of ['.prism-moment-time','.prism-moment-action','.prism-moment-feedback']){
   nodes[cls]={textContent:''};
 }
 const button=new EventTarget();
 button.hidden=true;
 button.attributes={};
 button.setAttribute=(k,v)=>{button.attributes[k]=v;};
 button.querySelector=sel=>nodes[sel]??null;
 const skin={querySelector:sel=>sel==='.prism-moment-stamp'?button:null};
 return {media,button,skin,nodes};
}

test('Moment Stamp URL is precise, shareable, and never includes internal QA settings',()=>{
 const url=createMomentUrl('https://prism.example/?qa=1&mux=ABC123#anatomy',84.27,'cinematic');
 const parsed=new URL(url);
 assert.equal(parsed.searchParams.get('film'),'cinematic');
 assert.equal(parsed.searchParams.get('t'),'84.27');
 assert.equal(parsed.searchParams.get('mux'),'ABC123');
 assert.equal(parsed.searchParams.get('qa'),null);
 assert.equal(parsed.hash,'#player-wrap');
 assert.equal(new URL(createMomentUrl('https://prism.example/',3.49,'cinematic',{localCinematic:true})).searchParams.get('source'),'local');
 assert.equal(new URL(createMomentUrl('https://prism.example/?liveMux=ABC123',5.55,'liveaction')).searchParams.get('liveMux'),'ABC123');
 assert.equal(createMomentUrl('javascript:alert(1)',5,'cinematic'),null);
 assert.equal(createMomentUrl('https://prism.example/',5,'unknown'),null);
 assert.equal(createMomentUrl('https://prism.example/',-2,'cinematic'),null);
});

test('Linked timestamp parser rejects invalid values and timecode formats to hours',()=>{
 assert.equal(parseMomentSeconds('42.25'),42.25);
 assert.equal(parseMomentSeconds('0'),0);
 for(const bad of ['','abc','-1','Infinity','NaN','3e9','90000','1.234','1/2',null]){
   assert.equal(parseMomentSeconds(bad),null,String(bad));
 }
 assert.equal(formatMomentTime(84.27),'01:24');
 assert.equal(formatMomentTime(3661),'01:01:01');
});

test('Pause reveals an accessible Moment Stamp and copies a real link',async()=>{
 const {media,skin,button,nodes}=fakeStamp();
 let copied=null;
 const stamp=initMomentStamp({skin,media,
  getLink:seconds=>createMomentUrl('https://prism.example/',seconds,'night'),
  copyLink:async link=>{copied=link;return true;}});
 assert.equal(button.hidden,true,'do not clutter initial poster');
 media.paused=false;media.dispatchEvent(new Event('play'));
 media.currentTime=13.27;media.paused=true;media.dispatchEvent(new Event('pause'));
 assert.equal(button.hidden,false);
 assert.equal(nodes['.prism-moment-time'].textContent,'00:13');
 assert.match(button.attributes['aria-label'],/Copy a link to this film at 00:13/);
 button.dispatchEvent(new Event('click'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(new URL(copied).searchParams.get('film'),'night');
 assert.equal(new URL(copied).searchParams.get('t'),'13.27');
 assert.equal(nodes['.prism-moment-action'].textContent,'COPIED');
 media.paused=false;media.dispatchEvent(new Event('play'));
 assert.equal(button.hidden,true,'playing removes the action');
 stamp.destroy();
 media.paused=true;media.dispatchEvent(new Event('pause'));
 assert.equal(button.hidden,true,'destroy removes media listeners');
});

test('Clipboard failures never falsely claim a copied link',async()=>{
 const {media,skin,button,nodes}=fakeStamp();
 const stamp=initMomentStamp({skin,media,
   getLink:()=> 'https://prism.example/?t=2',
   copyLink:async()=>false});
 media.currentTime=2;media.dispatchEvent(new Event('seeked'));
 assert.equal(button.hidden,false);
 button.dispatchEvent(new Event('click'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(nodes['.prism-moment-action'].textContent,'COPY FAILED');
 stamp.destroy();
});

test('A shared moment waits for actual seekability and does not autoplay',()=>{
 const {media}=fakeStamp();
 let seekCalls=0;
 Object.defineProperty(media,'currentTime',{configurable:true,get(){return this._time||0;},set(v){this._time=v;seekCalls++;}});
 const stop=restoreMomentToMedia(media,8.31);
 media.readyState=1;media.duration=32;
 media.dispatchEvent(new Event('loadedmetadata'));
 assert.equal(seekCalls,0,'no seek before HLS advertises a timeline');
 media.seekable={length:1,start:()=>0,end:()=>32};
 media.readyState=3;
 media.dispatchEvent(new Event('canplay'));
 assert.equal(media.currentTime,8.31);
 assert.equal(media.paused,true);
 stop();
});

test('A switched film cannot receive late timestamp restores',()=>{
 const {media}=fakeStamp();
 let seekCalls=0;
 Object.defineProperty(media,'currentTime',{configurable:true,get(){return 0;},set(){seekCalls++;}});
 const cancel=restoreMomentToMedia(media,15);
 cancel();
 media.readyState=3;media.duration=30;
 media.seekable={length:1,start:()=>0,end:()=>30};
 media.dispatchEvent(new Event('canplay'));
 assert.equal(seekCalls,0);
});

test('Moment Stamp is included in showcase, reusable player and portable package',()=>{
 const app=read('src/app.js');
 const pack=read('scripts/package-skin.mjs');
 for(const root of ['src','skin']){
  const player=read(root+'/prism-player.js');
  const css=read(root==='src'?'src/styles.css':'skin/prism-skin.css');
  assert.match(player,/initMomentStamp\(\{skin,media:mediaElement,getLink:momentLink\}\)/);
  assert.match(player,/momentStamp\.destroy\(\)/);
  assert.match(player,/class="prism-moment-stamp" hidden/);
  assert.match(css,/\.prism-moment-stamp\[hidden\]\{display:none!important\}/);
  assert.match(css,/\.prism-moment-stamp:focus-visible/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 }
 assert.match(app,/parseMomentSeconds\(query\.get\('t'\)\)/);
 assert.match(app,/restoreMomentToMedia\(current\.media,seconds\)/);
 assert.match(pack,/'moment-stamp\.js'/);
});
