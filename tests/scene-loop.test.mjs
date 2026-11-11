import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chapterLoopRange,isLoopRangeSeekable,mediaDuration,initSceneLoop} from '../src/scene-loop.js';

class ElementStub extends EventTarget {
  constructor(){super();this.disabled=false;this.textContent='';this.attrs={};this.flags=new Set();this.classList={toggle:(n,v)=>v?this.flags.add(n):this.flags.delete(n),remove:n=>this.flags.delete(n)};}
  setAttribute(n,v){this.attrs[n]=v;}
  getAttribute(n){return this.attrs[n];}
  click(){if(!this.disabled)this.dispatchEvent(new Event('click'));}
}
function fixture({duration=70,entries=[],ranges=null,readyState=3}={}){
  const names=['[data-loop-chapter]','[data-loop-in]','[data-loop-out]','[data-loop-ab]','[data-loop-off]','[data-loop-status]','[data-loop-context]','[data-loop-range]'];
  const elements=new Map(names.map(n=>[n,new ElementStub()]));
  const group={querySelector:n=>elements.get(n)};
  const dock=new ElementStub();
  const skin=new ElementStub();
  skin.querySelector=n=>n==='[data-loop-panel]'?group:n==='.prism-loop-trigger'?dock:null;
  const media=new EventTarget();
  Object.assign(media,{duration,readyState,paused:false,ended:false,seeking:false,playCalls:0,
    seekable:ranges===null?{length:1,start:()=>0,end:()=>duration}:ranges,
    play(){this.playCalls++;this.paused=false;this.ended=false;return Promise.resolve();}
  });
  let time=0;
  Object.defineProperty(media,'currentTime',{get(){return time},set(v){time=v;media.dispatchEvent(new Event('seeked'));}});
  const controller=initSceneLoop({skin,media,getChapters:()=>({type:'chapters',entries})});
  return {media,skin,controller,button:n=>elements.get(`[data-loop-${n}]`),event:n=>media.dispatchEvent(new Event(n))};
}
test('arbitrary chapter starts, dynamic lengths, missing zero, and last scene are media-specific',()=>{
  assert.deepEqual(chapterLoopRange([{time:7,title:'A'},{time:36,title:'B'},{time:48,title:'C'}],40,2153),{from:36,to:48,title:'B',index:1,count:3});
  assert.deepEqual(chapterLoopRange([{time:7,title:'A'},{time:36,title:'B'}],1900,2153),{from:36,to:2153,title:'B',index:1,count:2});
  assert.equal(chapterLoopRange([],10,70),null);
  assert.equal(chapterLoopRange([{time:0,title:'Short'},{time:.1,title:'Next'}],0,30),null);
});
test('live, unknown and non-seekable video ranges are safely rejected',()=>{
  for(const duration of [NaN,Infinity,-1,0])assert.equal(mediaDuration({duration}),null);
  assert.equal(isLoopRangeSeekable({duration:40,readyState:3,seekable:{length:1,start:()=>20,end:()=>30}},1,5),false);
  assert.equal(isLoopRangeSeekable({duration:40,readyState:3,seekable:{length:2,start:i=>i?20:0,end:i=>i?40:10}},5,25),false);
  assert.equal(isLoopRangeSeekable({duration:40,readyState:3,seekable:{length:1,start:()=>0,end:()=>40}},10,10.2),false);
  assert.equal(isLoopRangeSeekable({duration:40,readyState:0,seekable:{length:0}},10,20),false);
});
test('chapter button repeats any actual chapter and stops without hijacking Video.js state',()=>{
  const x=fixture({duration:87,entries:[{time:0,title:'INTRO'},{time:13,title:'ACT II'},{time:62,title:'OUTRO'}]});
  x.media.currentTime=19;
  x.button('chapter').click();
  assert.deepEqual(x.controller.getState().active,{type:'chapter',from:13,to:62,title:'ACT II',index:1,count:3});
  assert.equal(x.button('chapter').getAttribute('aria-pressed'),'true');
  x.media.currentTime=61.94;
  x.event('timeupdate');
  assert.ok(x.media.currentTime>=13 && x.media.currentTime<14,'loopback uses real chapter start');
  x.button('chapter').click();
  assert.equal(x.controller.getState().active,null);
  x.media.currentTime=61.95;x.event('timeupdate');
  assert.equal(x.media.currentTime,61.95,'no looping after toggle off');
  x.controller.destroy();
});
test('no chapters: IN / OUT loop works on an arbitrary 153-second video',()=>{
  const x=fixture({duration:153});
  assert.equal(x.button('chapter').disabled,true);
  x.media.currentTime=47.6;x.button('in').click();
  x.media.currentTime=77.8;x.button('out').click();
  assert.equal(x.button('ab').disabled,false);
  x.button('ab').click();
  assert.deepEqual(x.controller.getState().active,{type:'ab',from:47.6,to:77.8});
  x.media.currentTime=77.77;x.event('timeupdate');
  assert.ok(x.media.currentTime>=47.6 && x.media.currentTime<48);
  x.button('off').click();
  assert.equal(x.controller.getState().active,null);
  x.controller.destroy();
});
test('bad OUT or reset cannot accidentally create a loop',()=>{
  const x=fixture({duration:42});
  x.media.currentTime=15;x.button('out').click();
  assert.equal(x.controller.getState().out,null);
  x.media.currentTime=15;x.button('in').click();
  x.media.currentTime=10;x.button('out').click();
  assert.equal(x.button('ab').disabled,true);
  x.media.currentTime=20;x.button('out').click();
  x.button('ab').click();
  assert.ok(x.controller.getState().active);
  x.event('loadstart');
  assert.deepEqual(x.controller.getState(),{active:null,in:null,out:null});
  x.controller.destroy();
});
test('ended, seeking outside range, duration change, and rejected live playback are safe',async()=>{
  const x=fixture({duration:70,entries:[{time:0,title:'A'},{time:30,title:'B'}]});
  x.media.currentTime=44;x.button('chapter').click();
  x.media.ended=true;x.media.paused=true;x.media.currentTime=70;x.event('ended');
  await Promise.resolve();
  assert.ok(x.media.currentTime<31,'returned to chapter start on ended');
  // User-driven seek outside the active chapter turns it off.
  x.media.currentTime=4;
  assert.equal(x.controller.getState().active,null);
  x.media.currentTime=47;x.button('chapter').click();
  x.media.duration=25;x.event('durationchange');
  assert.equal(x.controller.getState().active,null);
  x.media.duration=Infinity;x.event('durationchange');
  assert.equal(x.button('chapter').disabled,true);
  x.controller.destroy();
});
test('showcase and standalone skin provide matching controls and portable loop modules',async()=>{
  for(const where of ['src','skin']){
    const source=await readFile(new URL(`../${where}/prism-player.js`,import.meta.url),'utf8');
    for(const part of ['prism-loop-trigger','data-loop-panel','data-loop-chapter','data-loop-in','data-loop-out','data-loop-ab','data-loop-off','initSceneLoop','getSceneLoopState']){
      assert.ok(source.includes(part),`${where} ${part}`);
    }
    const logic=await readFile(new URL(`../${where}/scene-loop.js`,import.meta.url),'utf8');
    assert.doesNotMatch(logic,/NIGHT CITY|SUNRISE|GOLDEN HOUR|time:\s*8/);
  }
  const packageSkin=await readFile(new URL('../scripts/package-skin.mjs',import.meta.url),'utf8');
  assert.match(packageSkin,/scene-loop\.js/);
});

test('Scene Loop opens a caption-style popover instead of hiding in Player Settings',async()=>{
 for(const dir of ['src','skin']){
  const source=await readFile(new URL(`../${dir}/prism-player.js`,import.meta.url),'utf8');
  const css=await readFile(new URL(`../${dir==='src'?'src/styles.css':'skin/prism-skin.css'}`,import.meta.url),'utf8');
  const logic=await readFile(new URL(`../${dir}/scene-loop.js`,import.meta.url),'utf8');
  assert.ok(source.includes('loopMenu=`${uid}-loop`'));
  assert.ok(source.includes('commandfor="${loopMenu}"'));
  assert.ok(source.includes('class="prism-menu prism-loop-menu" side="top" align="end"'));
  assert.ok(source.includes('<section class="prism-loop-group" data-loop-panel'));
  assert.ok(!source.includes('<fieldset class="prism-preferences-group prism-loop-group"'));
  assert.ok(!source.includes("playerPreferences.open('[data-loop-in]')"));
  assert.ok(source.indexOf('class="prism-menu prism-loop-menu"')<source.indexOf('class="prism-preferences-panel"'));
  assert.ok(css.includes('.prism-loop-menu{box-sizing:border-box;'));
  assert.ok(!css.includes('.prism-loop-trigger{display:none!important}'));
  assert.ok(logic.includes("on(group,'keydown',event=>"));
  assert.ok(logic.includes("Scene loop controls — loop active"));
 }
});
