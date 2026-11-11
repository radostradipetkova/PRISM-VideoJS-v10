import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {chapterAtTime,clamp,seekTarget,touchRegion,DEFAULT_CHAPTERS} from '../src/optical-touch.js';
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
