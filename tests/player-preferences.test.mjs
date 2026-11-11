import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizePreferences,resolvePreferences,isTouchCapable} from '../skin/player-preferences.js';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('system default is glass, animated, safe swipes and automatic rotation',()=>{
  assert.deepEqual(resolvePreferences({}),{surface:'glass',motion:false,captionSize:'medium',captionBackground:'solid',videoFit:'fit',touchSwipes:false,autoRotate:true});
});
test('OS accessibility settings default to solid and minimal motion',()=>{
  assert.deepEqual(resolvePreferences({}, {highContrast:true,reducedMotion:true}),{
    surface:'solid',motion:true,captionSize:'medium',captionBackground:'solid',videoFit:'fit',touchSwipes:false,autoRotate:true
  });
  assert.equal(resolvePreferences({}, {reducedTransparency:true}).surface,'solid');
  assert.equal(resolvePreferences({}, {forcedColors:true}).surface,'solid');
});
test('touch settings appear only when touch capability is detected',()=>{
  assert.equal(isTouchCapable({windowObject:{matchMedia:()=>({matches:false})},navigatorObject:{maxTouchPoints:0}}),false);
  assert.equal(isTouchCapable({windowObject:{matchMedia:()=>({matches:false})},navigatorObject:{maxTouchPoints:5}}),true);
  assert.equal(isTouchCapable({windowObject:{matchMedia:q=>({matches:q.includes('any-pointer')})},navigatorObject:{maxTouchPoints:0}}),true);
});
test('viewer choices customize the player but hard OS accessibility constraints remain respected',()=>{
  const overrides={surface:'glass',motion:false,touchSwipes:true,autoRotate:false};
  assert.deepEqual(resolvePreferences(overrides,{highContrast:true}),{...overrides,captionSize:'medium',captionBackground:'solid',videoFit:'fit'});
  assert.deepEqual(resolvePreferences(overrides,{reducedTransparency:true,reducedMotion:true}),{...overrides,surface:'solid',motion:true,captionSize:'medium',captionBackground:'solid',videoFit:'fit'});
  assert.deepEqual(normalizePreferences({surface:'invalid',motion:'false',touchSwipes:0}),{
    surface:null,motion:null,captionSize:null,captionBackground:null,videoFit:null,touchSwipes:null,autoRotate:null
  });
});
test('both player builds expose one coherent player menu with all four preferences',async()=>{
  for(const where of ['src','skin']){
    const player=await read(where+'/prism-player.js');
    const logic=await read(where+'/player-preferences.js');
    const css=await read(where+(where==='src'?'/styles.css':'/prism-skin.css'));
    for(const marker of ['prism-preferences-trigger','prism-preferences-panel','data-pref-surface','data-pref-motion','data-pref-touch-swipes','data-pref-auto-rotate']){
      assert.ok(player.includes(marker),where+' missing '+marker);
    }
    assert.match(player,/onChange:\(overrides,effective\)=>/);
    assert.match(player,/enabled:initialPreferences\.autoRotate/);
    assert.match(logic,/prefers-contrast: more/);
    assert.match(logic,/prefers-reduced-motion: reduce/);
    assert.match(logic,/pointer: coarse/);
    assert.match(logic,/prism-allow-embed-swipes/);
    assert.match(css,/\.prism-skin \.prism-preferences-panel/);
    assert.match(css,/@container \(max-width:420px\)/);
    assert.match(css,/\.prism-preferences-panel\[hidden\]/);
  }
});
test('showcase no longer duplicates player behavior toggles in workbench',async()=>{
  const html=await read('index.html');
  for(const id of ['motion-switch','gesture-switch','orientation-switch'])assert.ok(!html.includes('id="'+id+'"'),id);
  assert.ok(!html.includes('data-surface='));
  const app=await read('src/app.js');
  assert.match(app,/prism:preferenceschange/);
  assert.match(app,/preferences:playerPreferences/);
  const pack=await read('scripts/package-skin.mjs');
  assert.match(pack,/player-preferences\.js/);
});
