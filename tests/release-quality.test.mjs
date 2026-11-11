import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTransportTracker,formatMediaTime} from '../skin/media-status.js';
const root=new URL('../',import.meta.url);
const read=p=>readFile(new URL(p,root),'utf8');

function mock(overrides={}) {return {error:null,ended:false,seeking:false,paused:false,readyState:4,currentTime:3,...overrides}}
test('transport shows buffering during a waiting or stalled stream even if native readyState is stale',()=>{
 const track=createTransportTracker();const media=mock();
 assert.equal(track(media,{type:'playing'}),'PLAYING');
 assert.equal(track(media,{type:'waiting'}),'BUFFERING');
 assert.equal(track(media,{type:'timeupdate'}),'BUFFERING');
 assert.equal(track(media,{type:'playing'}),'PLAYING');
 assert.equal(track(media,{type:'stalled'}),'BUFFERING');
 assert.equal(track(media,{type:'canplay'}),'PLAYING');
 assert.equal(track(mock({readyState:2})),'BUFFERING');
});
test('transport gives error/ended/seeking/paused priority and does not strand spinner on interruption',()=>{
 const track=createTransportTracker();const media=mock();
 assert.equal(track(media,{type:'waiting'}),'BUFFERING');
 media.paused=true;assert.equal(track(media,{type:'pause'}),'PAUSED');
 media.paused=false;media.seeking=true;assert.equal(track(media,{type:'seeking'}),'SEEKING');
 media.seeking=false;media.ended=true;assert.equal(track(media,{type:'ended'}),'ENDED');
 media.ended=false;media.error={code:2};assert.equal(track(media,{type:'error'}),'ERROR');
 media.error=null;assert.equal(track(media,{type:'playing'}),'PLAYING');
});
test('each player gets its own buffering-state tracker; an interrupted source does not affect another',()=>{
 const a=createTransportTracker(),b=createTransportTracker();const media=mock();
 assert.equal(a(media,{type:'waiting'}),'BUFFERING');
 assert.equal(b(media,{type:'playing'}),'PLAYING');
 assert.equal(a(media,{type:'emptied'}),'PLAYING');
});
test('custom transport readout supports longer videos and handles unknown duration',()=>{
 assert.equal(formatMediaTime(0),'00:00');
 assert.equal(formatMediaTime(9.8),'00:09');
 assert.equal(formatMediaTime(3599),'59:59');
 assert.equal(formatMediaTime(3600),'01:00:00');
 assert.equal(formatMediaTime(7384),'02:03:04');
 assert.equal(formatMediaTime(Infinity),'--:--');
 assert.equal(formatMediaTime(-1),'--:--');
});
test('showcase and standalone player both use the same native-media state tracker',async()=>{
 for(const name of ['src/prism-player.js','skin/prism-player.js']){
   const js=await read(name);
   assert.match(js,/createTransportTracker/);assert.match(js,/formatMediaTime\(mediaElement\.currentTime\)/);
   for(const event of ["'waiting'","'stalled'","'canplay'","'playing'","'error'","'pause'"]) assert.ok(js.includes(event),name+' missing '+event);
   assert.match(js,/mediaElement\.removeEventListener\(event,syncTransport\)/);
 }
});
test('glass over bright footage darkens backdrop and provides opaque fallback if blur is unavailable',async()=>{
 for(const f of ['skin/prism-skin.css','src/styles.css']){
   const css=await read(f);
   assert.match(css,/backdrop-filter:blur\(var\(--prism-blur\)\) brightness\(\.52\)/);
   assert.match(css,/@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)/);
   assert.match(css,/mux-video::part\(video\)::cue/);
 }
});
