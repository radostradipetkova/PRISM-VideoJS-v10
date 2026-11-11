import test from 'node:test';
import assert from 'node:assert/strict';
import {initWebKitFullscreenKeyboard} from '../src/fullscreen-orientation.js';

function mock(ua) {
  const listeners = new Map(), calls = [];
  const button = {
    hidden:false,
    getAttribute:()=>null,
    hasAttribute:()=>false,
    addEventListener(type, handler, capture){assert.equal(capture,true);listeners.set(type,handler);},
    removeEventListener(type, handler, capture){assert.equal(capture,true);assert.equal(listeners.get(type),handler);listeners.delete(type);}
  };
  const store={target:{},isFullscreen:false,
    requestFullscreen(){calls.push('enter');store.isFullscreen=true;return Promise.resolve();},
    exitFullscreen(){calls.push('exit');store.isFullscreen=false;return Promise.resolve();}}
  const instance=initWebKitFullscreenKeyboard({player:{store},button,userAgent:ua});
  function send(key,overrides={}){
    const event={key,repeat:false,defaultPrevented:false,isComposing:false,
      ctrlKey:false,altKey:false,metaKey:false,shiftKey:false,
      preventDefault(){this.defaultPrevented=true;},
      stopImmediatePropagation(){this.stopped=true;},...overrides};
    listeners.get('keydown')?.(event);
    return event;
  }
  return {store,button,calls,send,listeners,instance};
}
const safari='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const chrome='Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

test('Safari/WebKit Enter activates the genuine v10 store once, and Enter exits',()=>{
  const h=mock(safari);
  assert.equal(h.listeners.has('keydown'),true);
  assert.equal(h.send('Enter').defaultPrevented,true);
  assert.equal(h.send('Enter').stopped,true);
  assert.deepEqual(h.calls,['enter','exit']);
  h.instance.destroy();
  assert.equal(h.listeners.size,0);
});
test('Safari/WebKit Space uses fullscreen, not the play hotkey',()=>{
  const h=mock(safari);
  assert.equal(h.send(' ').defaultPrevented,true);
  assert.deepEqual(h.calls,['enter']);
  h.instance.destroy();
});
test('bypasses modified or repeated keys, and unavailable fullscreen',()=>{
  const h=mock(safari);
  for(const opts of [{ctrlKey:true},{repeat:true},{shiftKey:true},{defaultPrevented:true},{isComposing:true}])assert.equal(h.send('Enter',opts).stopped,undefined);
  h.store.target=null;
  assert.equal(h.send('Enter').stopped,undefined);
  h.store.target={};h.button.hasAttribute=()=>true;
  assert.equal(h.send('Enter').stopped,undefined);
  assert.deepEqual(h.calls,[]);
  h.instance.destroy();
});
test('Chrome/Firefox keep upstream Video.js keyboard semantics',()=>{
  for(const ua of [chrome,'Mozilla/5.0 Gecko/20100101 Firefox/127.0']){
    const h=mock(ua);
    assert.equal(h.listeners.size,0);
    assert.equal(h.send('Enter').defaultPrevented,false);
    assert.deepEqual(h.calls,[]);
  }
});
