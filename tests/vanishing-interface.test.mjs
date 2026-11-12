import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initVanishingInterface} from '../src/vanishing-interface.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

function fakeInterface(){
 const rail=new EventTarget(),mute=new EventTarget(),volume=new EventTarget();
 const value={textContent:''};
 const properties=new Map();
 const gauge={style:{setProperty:(key,val)=>properties.set(key,val)},querySelector:()=>value};
 const skin=new EventTarget();
 skin.dataset={};
 skin.querySelector=selector=>({
  '.prism-rail':rail,'.prism-mute':mute,'.prism-volume':volume,
  '.prism-volume-scale':gauge
 })[selector]||null;
 const media=new EventTarget();
 media.volume=0.65;media.muted=false;media.paused=false;media.ended=false;
 return {skin,media,rail,mute,volume,gauge,value,properties};
}

test('Vanishing Interface spotlights the actual interaction and returns to the film',async()=>{
 const p=fakeInterface();
 const controller=initVanishingInterface({skin:p.skin,media:p.media,holdMs:20});
 p.rail.dispatchEvent(new Event('pointerenter'));
 assert.equal(p.skin.dataset.opticalAttention,'seek');
 await new Promise(resolve=>setTimeout(resolve,32));
 assert.equal(p.skin.dataset.opticalAttention,undefined);
 p.media.volume=0.42;
 p.media.dispatchEvent(new Event('volumechange'));
 assert.equal(p.skin.dataset.opticalAttention,'volume');
 assert.equal(p.value.textContent,'42%');
 assert.equal(p.properties.get('--prism-volume-level'),'42%');
 p.media.muted=true;
 p.media.dispatchEvent(new Event('volumechange'));
 assert.equal(p.value.textContent,'MUTED');
 assert.equal(p.properties.get('--prism-volume-level'),'0%');
 controller.destroy();
 assert.equal(p.skin.dataset.opticalAttention,undefined);
});

test('Pause holds transport in view, active seek temporarily takes priority and destroy cleans listeners',async()=>{
 const p=fakeInterface();
 const controller=initVanishingInterface({skin:p.skin,media:p.media,holdMs:20});
 p.media.paused=true;
 p.media.dispatchEvent(new Event('pause'));
 assert.equal(p.skin.dataset.opticalAttention,'transport');
 p.media.dispatchEvent(new Event('seeking'));
 assert.equal(p.skin.dataset.opticalAttention,'seek');
 await new Promise(resolve=>setTimeout(resolve,32));
 assert.equal(p.skin.dataset.opticalAttention,'transport');
 p.media.paused=false;
 p.media.dispatchEvent(new Event('play'));
 await new Promise(resolve=>setTimeout(resolve,32));
 assert.equal(p.skin.dataset.opticalAttention,undefined);
 controller.destroy();
 p.media.dispatchEvent(new Event('pause'));
 assert.equal(p.skin.dataset.opticalAttention,undefined);
});

test('Spotlight leaves native controls, focus and reduce-motion safeguards intact in both skins',()=>{
 for(const folder of ['src','skin']){
  const player=read(folder+'/prism-player.js');
  const css=read(folder==='src'?'src/styles.css':'skin/prism-skin.css');
  assert.match(player,/initVanishingInterface\(\{skin,media:mediaElement\}\)/);
  assert.match(player,/vanishingInterface\.destroy\(\)/);
  assert.match(player,/class="prism-volume-scale" aria-hidden="true"/);
  assert.match(css,/data-optical-attention="transport"/);
  assert.match(css,/data-optical-attention="seek"/);
  assert.match(css,/data-optical-attention="volume"/);
  assert.match(css,/\.prism-volume-scale-track/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 }
 const code=read('src/vanishing-interface.js');
 assert.doesNotMatch(code,/preventDefault\(|stopPropagation\(|tabIndex\s*=/);
 assert.match(read('scripts/package-skin.mjs'),/'vanishing-interface\.js'/);
});
