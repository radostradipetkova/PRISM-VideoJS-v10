import test from 'node:test';
import assert from 'node:assert/strict';
import {orientationForVideo, isFullscreenPlayer, initFullscreenOrientation} from '../src/fullscreen-orientation.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function harness({videoWidth=1920,videoHeight=1080,touch=true,enable=true,reject=false,lockPromise=null}={}) {
  const calls=[];
  const listeners=new Map();
  const doc={fullscreenElement:null,
    addEventListener(name,fn){listeners.set(name,fn)},
    removeEventListener(name,fn){if(listeners.get(name)===fn)listeners.delete(name)},
    dispatch(name){listeners.get(name)?.()}
  };
  const player={contains(x){return x===skin}};
  const skin={contains(){return false}};
  const media={videoWidth,videoHeight,_events:new Map(),
    addEventListener(name,fn){this._events.set(name,fn)},
    removeEventListener(name,fn){if(this._events.get(name)===fn)this._events.delete(name)},
    dispatch(name){this._events.get(name)?.()}
  };
  const orientation={lock(type){calls.push('lock:'+type);if(reject)return Promise.reject(new Error('not allowed'));return lockPromise||Promise.resolve()},unlock(){calls.push('unlock')}};
  const controller=initFullscreenOrientation({player,skin,media,doc,orientation,mobile:()=>touch,enabled:enable});
  return {calls,controller,doc,media,player,skin,listeners};
}
test('landscape, portrait, and square choose appropriate orientation',()=>{
  assert.equal(orientationForVideo(1920,1080),'landscape');
  assert.equal(orientationForVideo(1080,1920),'portrait');
  assert.equal(orientationForVideo(400,400),null);
  assert.equal(orientationForVideo(0,900),null);
  assert.equal(orientationForVideo(Infinity,900),null);
});
test('only the PRISM player fullscreen counts',()=>{
 const h=harness();
 assert.equal(isFullscreenPlayer(null,h.player,h.skin),false);
 assert.equal(isFullscreenPlayer({},h.player,h.skin),false);
 assert.equal(isFullscreenPlayer(h.player,h.player,h.skin),true);
 assert.equal(isFullscreenPlayer(h.skin,h.player,h.skin),true);
 h.controller.destroy();
});
test('landscape mobile video locks on fullscreen and unlocks on exit',async()=>{
 const h=harness();
 h.doc.fullscreenElement=h.player;h.doc.dispatch('fullscreenchange');await flush();
 assert.deepEqual(h.calls,['lock:landscape']);
 h.doc.fullscreenElement=null;h.doc.dispatch('fullscreenchange');
 assert.deepEqual(h.calls,['lock:landscape','unlock']);
 h.controller.destroy();
});
test('portrait mobile video requests portrait',async()=>{
 const h=harness({videoWidth:720,videoHeight:1280});
 h.doc.fullscreenElement=h.player;h.doc.dispatch('fullscreenchange');await flush();
 assert.deepEqual(h.calls,['lock:portrait']);
 h.controller.destroy();assert.equal(h.calls.at(-1),'unlock');
});
test('square or metadata-unavailable video does not force rotation',async()=>{
 for(const dims of [{videoWidth:700,videoHeight:700},{videoWidth:0,videoHeight:0}]){
  const h=harness(dims);h.doc.fullscreenElement=h.player;h.doc.dispatch('fullscreenchange');await flush();
  assert.equal(h.calls.length,0);h.controller.destroy();
 }
});
test('non-mobile, opt-out, and unrelated fullscreen never lock',async()=>{
 for(const options of [{touch:false},{enable:false},{}]){
  const h=harness(options);
  h.doc.fullscreenElement=options.touch===undefined&&options.enable===undefined?{}:h.player;
  h.doc.dispatch('fullscreenchange');await flush();
  assert.equal(h.calls.length,0);h.controller.destroy();
 }
});
test('browser rejection safely leaves fullscreen enabled',async()=>{
 const h=harness({reject:true});h.doc.fullscreenElement=h.player;h.doc.dispatch('fullscreenchange');await flush();
 assert.deepEqual(h.calls,['lock:landscape']);h.controller.destroy();
});
test('opt-out while fullscreen unlocks, re-enable retries, destroy clears events',async()=>{
 const h=harness();h.doc.fullscreenElement=h.player;h.doc.dispatch('fullscreenchange');await flush();
 h.controller.setEnabled(false);assert.equal(h.calls.at(-1),'unlock');
 h.controller.setEnabled(true);await flush();assert.equal(h.calls.at(-1),'lock:landscape');
 h.controller.destroy();assert.equal(h.calls.at(-1),'unlock');
 assert.equal(h.listeners.has('fullscreenchange'),false);
 assert.equal(h.media._events.has('loadedmetadata'),false);
});
test('late async lock after exiting fullscreen is released',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);
 const h=harness({lockPromise:pending});h.doc.fullscreenElement=h.player;h.doc.dispatch('fullscreenchange');
 h.doc.fullscreenElement=null;h.doc.dispatch('fullscreenchange');
 resolve();await flush();
 assert.deepEqual(h.calls,['lock:landscape','unlock']);
 h.controller.destroy();
});
test('late metadata while fullscreen requests lock',async()=>{
 const h=harness({videoWidth:0,videoHeight:0});h.doc.fullscreenElement=h.player;h.doc.dispatch('fullscreenchange');await flush();
 h.media.videoWidth=800;h.media.videoHeight=1400;h.media.dispatch('loadedmetadata');await flush();
 assert.deepEqual(h.calls,['lock:portrait']);h.controller.destroy();
});
