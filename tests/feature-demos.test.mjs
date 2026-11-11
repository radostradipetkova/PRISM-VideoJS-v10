import test from 'node:test';
import assert from 'node:assert/strict';
import { initFeatureDemos } from '../src/feature-demos.js';

class MockElement extends EventTarget {
  constructor(){super();this.value='0';this.disabled=false;this.attrs={};this.style={setProperty:(name,value)=>{this.cssVars[name]=value}};this.cssVars={};this.classNames=new Set();this.classList={add:n=>this.classNames.add(n),remove:n=>this.classNames.delete(n),toggle:(name,on)=>on?this.classNames.add(name):this.classNames.delete(name)};this.dataset={};this.textContent='';this.max='18';}
  setAttribute(name,value){this.attrs[name]=value;}
  getAttribute(name){return this.attrs[name]}
}
class MockRoot {
  constructor(){this.nodes=new Map();this.keys=['back','toggle','forward'].map(key=>{const el=new MockElement();el.dataset.demoKey=key;return el});}
  querySelector(selector){if(!this.nodes.has(selector))this.nodes.set(selector,new MockElement());return this.nodes.get(selector);}
  querySelectorAll(){return this.keys;}
}
class MockMedia extends EventTarget {
  constructor(duration=18){super();this.duration=duration;this._time=0;this.paused=true;this.ended=false;this.readyState=1;this.seekable={length:1,start:()=>0,end:()=>duration};}
  set currentTime(time){this._time=time;this.dispatchEvent(new Event('timeupdate'));}
  get currentTime(){return this._time;}
  async play(){this.paused=false;this.dispatchEvent(new Event('play'));}
  pause(){this.paused=true;this.dispatchEvent(new Event('pause'));}
}
const fire=(element,name,options={})=>element.dispatchEvent(new Event(name,options));
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('Anatomy rail seeks real media and stays synced to external time changes',()=>{
 const root=new MockRoot(),demos=initFeatureDemos(root),media=new MockMedia(18);
 demos.setMedia(media);
 const range=root.querySelector('#rail-demo-range');
 assert.equal(range.disabled,false);
 assert.equal(root.querySelector('#rail-demo-duration').textContent,'00:18');
 range.value='9.5';fire(range,'input');
 assert.equal(media.currentTime,9.5);
 assert.equal(root.querySelector('#rail-demo-current').textContent,'00:09');
 assert.equal(root.querySelector('.rail-mini-line').cssVars['--demo-progress'],`${9.5/18*100}%`);
 media.currentTime=13;
 assert.equal(range.value,'13');
 assert.equal(range.getAttribute('aria-valuetext'),'00:13 of 00:18');
});
test('Aperture and keyboard buttons control the same player and keep their states in sync',async()=>{
 const root=new MockRoot(),demos=initFeatureDemos(root),media=new MockMedia(18);
 demos.setMedia(media);
 const aperture=root.querySelector('.aperture-toggle');
 fire(aperture,'click');await tick();
 assert.equal(media.paused,false);
 assert.equal(aperture.getAttribute('aria-label'),'Pause video');
 assert.equal(aperture.getAttribute('aria-pressed'),'true');
 assert.ok(root.querySelector('.aperture-card').classNames.has('is-playing'));
 fire(root.keys[2],'click');await tick();
 assert.equal(media.currentTime,5);
 fire(root.keys[0],'click');await tick();
 assert.equal(media.currentTime,0);
 fire(root.keys[1],'click');await tick();
 assert.equal(media.paused,true);
});
test('Switching films reconnects features; updates from the removed media stop',()=>{
 const root=new MockRoot(),demos=initFeatureDemos(root),first=new MockMedia(18),second=new MockMedia(24);
 demos.setMedia(first);first.currentTime=8;
 demos.setMedia(second);
 assert.equal(root.querySelector('#rail-demo-duration').textContent,'00:24');
 first.currentTime=14;
 assert.equal(root.querySelector('#rail-demo-current').textContent,'00:00');
 second.currentTime=7;
 assert.equal(root.querySelector('#rail-demo-current').textContent,'00:07');
});
test('Keyboard arrows and Space on the focused accessibility card seek and toggle playback',async()=>{
 const root=new MockRoot(),demos=initFeatureDemos(root),media=new MockMedia(18);
 demos.setMedia(media);
 const card=root.querySelector('.access-card');
 const dispatchKey=key=>{
  const e=new Event('keydown',{cancelable:true});
  Object.defineProperty(e,'key',{value:key});
  card.dispatchEvent(e);
  return e;
 };
 assert.equal(dispatchKey('ArrowRight').defaultPrevented,true);
 assert.equal(media.currentTime,5);
 assert.equal(dispatchKey('ArrowLeft').defaultPrevented,true);
 assert.equal(media.currentTime,0);
 assert.equal(dispatchKey(' ').defaultPrevented,true);
 await tick();
 assert.equal(media.paused,false);
});
