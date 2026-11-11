import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseStoryboardCues,muxThumbnailSample} from '../src/frame-preview.js';

const vtt=readFileSync(new URL('../assets/prism-cinematic-storyboard.vtt',import.meta.url),'utf8');
const origin='https://prism.example/assets/prism-cinematic-storyboard.vtt';

test('Storyboard parser extracts genuine frame times and crop regions',()=>{
 const cues=parseStoryboardCues(vtt,origin);
 assert.equal(cues.length,16);
 assert.deepEqual(cues[0],{
   from:0,to:2,src:'https://prism.example/assets/prism-cinematic-storyboard.jpg',
   x:0,y:0,w:176,h:99
 });
 assert.equal(cues[7].from,14);
 assert.equal(cues[7].y,99);
 assert.equal(cues[15].to,32);
 assert.equal(cues[15].y,297);
});

test('Storyboard parsing rejects invalid markers and out-of-bounds cue dimensions',()=>{
 assert.deepEqual(parseStoryboardCues('not WEBVTT',origin),[]);
 assert.deepEqual(parseStoryboardCues('WEBVTT\n\n00:00:00.000 --> 00:00:08.000\nimage.jpg#xywh=0,0,9000,90\n',origin),[]);
});

test('Both PRISM players use the actual sprite to draw previews instead of seeking remote MP4s',()=>{
 for(const scope of ['src','skin']){
   const code=readFileSync(new URL(`../${scope}/frame-preview.js`,import.meta.url),'utf8');
   const optical=readFileSync(new URL(`../${scope}/optical-touch.js`,import.meta.url),'utf8');
   const css=readFileSync(new URL(`../${scope==='src'?'src/styles.css':'skin/prism-skin.css'}`,import.meta.url),'utf8');
   assert.ok(code.includes('ctx.drawImage(image,cue.x,cue.y,cue.w,cue.h,0,0,cue.w,cue.h)'));
   assert.ok(code.includes('if(storyboard && !muxPlaybackId)return initStoryboardSpritePreview'));
   assert.ok(optical.includes('hasStoryboard:Boolean(storyboard),storyboard'));
   assert.ok(css.includes('.prism-loupe-sprite-preview[data-frame-ready="true"]'));
   assert.ok(css.includes('.prism-iris-sprite-preview[data-frame-ready="true"]'));
 }
});

test('LIVE ACTION checks complete storyboard assets before mounting a film',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 assert.match(app,/const fullFilmStoryboardProbe=Promise\.all/);
 assert.match(app,/tears-of-steel-full-storyboard\.vtt/);
 assert.match(app,/tears-of-steel-full-storyboard\.jpg/);
 assert.match(app,/const liveActionAssetsReady=Promise\.allSettled/);
 assert.match(app,/liveActionAssetsReady\.then/);
 assert.match(app,/serial===filmSelectionSerial/);
});

test('corrupt or undeployed storyboard recovers without touching primary playback',()=>{
 for(const scope of ['src','skin']){
  const code=readFileSync(new URL(`../${scope}/frame-preview.js`,import.meta.url),'utf8');
  assert.match(code,/if\(!cues\.length\)\{useVideoFallback\(\);return;\}/);
  assert.match(code,/image\.onerror=\(\)=>\{/);
  assert.match(code,/failedStoryboardFallback\?\.destroy\(\)/);
  assert.match(code,/initStoryboardSpritePreview\(\{skin,media,storyboard\}\)/);
 }
});

test('Mux fallback uses the nearest allowed preview instead of chapter/10s floor',()=>{
  assert.equal(muxThumbnailSample(6,32),8);  // 4s interval for the cinematic reel
  assert.equal(muxThumbnailSample(15,32),16);
  assert.equal(muxThumbnailSample(31.9,32),28); // never request past the video
  assert.equal(muxThumbnailSample(9,734),10); // 10s interval on long films
  assert.equal(muxThumbnailSample(14,734),10);
  assert.equal(muxThumbnailSample(16,734),20);
  assert.equal(muxThumbnailSample(0,0),0);
  // Short assets generate at most the 10 thumbnails Mux permits.
  for(const duration of [7,32,65,99,120,734]){
    const set=new Set();
    for(let i=0;i<=1000;i++)set.add(muxThumbnailSample(i*duration/1000,duration));
    assert.ok(set.size<=Math.max(10,Math.ceil(duration/10)),`over quota for duration ${duration}`);
  }
});

test('Optical Loupe coalesces decoder seeks to animation frames, not 85ms mouse debounce',()=>{
 for(const part of ['src','skin']){
   const code=readFileSync(new URL(`../${part}/frame-preview.js`,import.meta.url),'utf8');
   assert.match(code,/seekFrame=requestAnimationFrame/);
   assert.doesNotMatch(code,/if\(!frameMatchesPointer\(\)\)preview\.dataset\.frameReady='false'/);
   assert.match(code,/Keep the last successfully decoded real frame visible while seeking/);
   assert.match(code,/if\(!frameMatchesPointer\(\)\)\{/);
   assert.match(code,/cancelAnimationFrame\(seekFrame\)/);
   assert.doesNotMatch(code,/timer=setTimeout\(attempt,85\)/);
   assert.match(code,/muxThumbnailSample\(requested,Number\(media\.duration\)\)/);
 }
});

test('Rapid hover never clears an already displayed frame while a remote seek is pending',()=>{
 for(const part of ['src','skin']){
  const code=readFileSync(new URL(`../${part}/frame-preview.js`,import.meta.url),'utf8');
  const start=code.indexOf('if(canUseVideo){\\n    // The video is only decoded');
  const end=code.indexOf('  // A public Mux asset normally provides',start);
  const native=code.slice(start,end);
  assert.match(native,/scheduleSeek\(\);/);
  assert.doesNotMatch(native,/preview\.dataset\.frameReady='false'/);
  assert.match(code,/housing\.append\(next\);\\s*preview\.remove\(\);/);
  assert.match(code,/if\(disposed \|\| pendingImage!==next \|\| pendingUrl!==url\)return/);
 }
});
