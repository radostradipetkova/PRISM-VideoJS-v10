import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseStoryboardCues} from '../src/frame-preview.js';

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
