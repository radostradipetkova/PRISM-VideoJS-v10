import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {chapterAtTime,clamp,seekTarget,touchRegion,DEFAULT_CHAPTERS,isIOSVolumeLocked} from '../src/optical-touch.js';
const ROOT=new URL('../',import.meta.url);
const read=f=>readFileSync(new URL(f,ROOT),'utf8');

test('chapter lookup respects zero, boundary and end of film',()=>{
 assert.equal(chapterAtTime(DEFAULT_CHAPTERS,0),0);
 assert.equal(chapterAtTime(DEFAULT_CHAPTERS,7.9),0);
 assert.equal(chapterAtTime(DEFAULT_CHAPTERS,8),1);
 assert.equal(chapterAtTime(DEFAULT_CHAPTERS,16),2);
 assert.equal(chapterAtTime(DEFAULT_CHAPTERS,24),3);
 assert.equal(chapterAtTime(DEFAULT_CHAPTERS,31.9),3);
 assert.equal(chapterAtTime([],0),-1);
});
test('seek never exceeds actual duration or becomes negative',()=>{
 assert.equal(seekTarget(2,-5,32),0);
 assert.equal(seekTarget(31,5,32),31.92);
 assert.equal(seekTarget(10,5,32),15);
 assert.equal(seekTarget(10,5,Number.NaN),null);
});
test('gesture zones reserve center for ordinary playback',()=>{
 assert.equal(touchRegion(10,0,300),'left');
 assert.equal(touchRegion(150,0,300),'middle');
 assert.equal(touchRegion(290,0,300),'right');
});
test('Mux storyboard and native Video.js preview registered',()=>{
 const html=read('index.html');const player=read('src/prism-player.js');const app=read('src/app.js');
 assert.match(html,/\/ui\/slider-thumbnail\.js/);
 assert.match(player,/<media-slider-thumbnail class="prism-loupe-image"/);
 assert.match(player,/prism-chapter-dialog/);
 assert.match(player,/initOpticalTouch\(/);
 assert.match(app,/prism-cinematic-storyboard\.vtt/);
});
test('local storyboard cue assets exist, with real scene frames and xywh sprite coordinates',()=>{
 for(const name of ['prism-cinematic','night-city','coast-sunrise']){
  assert.ok(existsSync(new URL(`assets/${name}-storyboard.jpg`,ROOT)));
  const vtt=read(`assets/${name}-storyboard.vtt`);
  assert.match(vtt,/^WEBVTT/);
  assert.match(vtt,/#xywh=\d+,\d+,176,99/);
  assert.ok((vtt.match(/ --> /g)||[]).length>=8);
 }
});
test('liquid glass opt-out, reduced transparency and reduced motion supported',()=>{
 const css=read('src/styles.css');
 for(const needle of ['.prism-solid-surface','prefers-reduced-transparency','prefers-reduced-motion','prism-optical-loupe','prism-iris'])assert.ok(css.includes(needle));
});

test('iOS/iPadOS hardware volume is never presented as a writable web control',()=>{
 assert.equal(isIOSVolumeLocked({platform:'iPhone',maxTouchPoints:5}),true);
 assert.equal(isIOSVolumeLocked({platform:'iPad',maxTouchPoints:5}),true);
 assert.equal(isIOSVolumeLocked({platform:'MacIntel',maxTouchPoints:5}),true);
 assert.equal(isIOSVolumeLocked({platform:'MacIntel',maxTouchPoints:0}),false);
 assert.equal(isIOSVolumeLocked({platform:'Win32',maxTouchPoints:5}),false);
 for(const p of ['src/optical-touch.js','skin/optical-touch.js']){
   const js=read(p);
   assert.match(js,/VOLUME \/ USE DEVICE BUTTONS/);
   assert.match(js,/skin\.classList\.contains\('prism-allow-embed-swipes'\)/);
 }
});
test('iOS gesture surfaces disable browser panning but retain scrollable settings',()=>{
 for(const cssPath of ['src/styles.css','skin/prism-skin.css']){
   const css=read(cssPath);
   assert.match(css,/prism-allow-embed-swipes \.prism-media/);
   assert.match(css,/prism-preferences-panel\{touch-action:pan-y/);
   assert.match(css,/minimal-motion \*::after/);
 }
});
