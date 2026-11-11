import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizePreferences,resolvePreferences} from '../skin/player-preferences.js';
import {
  DEFAULT_REMEMBER_KEY,normalizePlaybackRate,persistentPreferences,
  readRememberedSettings,saveRememberedSettings,clearRememberedSettings,safeStorage
} from '../skin/remember-settings.js';

const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
class FakeStorage {
  values=new Map();
  getItem(k){return this.values.has(k)?this.values.get(k):null;}
  setItem(k,v){this.values.set(k,v);}
  removeItem(k){this.values.delete(k);}
}

test('Remember My Settings is truly opt-in and scoped to a single website key',()=>{
  const storage=new FakeStorage();
  assert.equal(readRememberedSettings(storage),null);
  assert.equal(storage.values.size,0);
  assert.equal(clearRememberedSettings(storage),true);
  assert.equal(storage.values.size,0);
  assert.match(DEFAULT_REMEMBER_KEY,/^prism:/);
});
test('saving and reading retains exactly requested appearance choices and native playback speed',()=>{
  const storage=new FakeStorage();
  const preferences={surface:'solid',motion:true,captionSize:'large',captionBackground:'transparent',touchSwipes:true,autoRotate:false,irrelevant:'secret'};
  assert.equal(saveRememberedSettings(storage,DEFAULT_REMEMBER_KEY,{preferences,playbackRate:1.75}),true);
  const raw=JSON.parse(storage.getItem(DEFAULT_REMEMBER_KEY));
  assert.deepEqual(Object.keys(raw.preferences).sort(),['captionBackground','captionSize','motion','surface','videoFit'].sort());
  assert.deepEqual(readRememberedSettings(storage),{
    preferences:{surface:'solid',motion:true,captionSize:'large',captionBackground:'transparent',videoFit:null},
    playbackRate:1.75
  });
  assert.equal(storage.values.size,1);
});
test('disabled, corrupted, outdated, or invalid stored records are ignored safely',()=>{
  const storage=new FakeStorage();
  for(const raw of ['{broken',JSON.stringify({version:0,enabled:true,preferences:{}}),JSON.stringify({version:1,enabled:false,preferences:{}}),JSON.stringify({version:1,enabled:true,preferences:[]}),JSON.stringify({version:1,enabled:true})]){
    storage.setItem(DEFAULT_REMEMBER_KEY,raw);
    assert.equal(readRememberedSettings(storage),null);
  }
  storage.setItem(DEFAULT_REMEMBER_KEY,JSON.stringify({version:1,enabled:true,preferences:{surface:'invalid',motion:'false',captionSize:'massive'},playbackRate:'NaN'}));
  assert.deepEqual(readRememberedSettings(storage),{
    preferences:{surface:null,motion:null,captionSize:null,captionBackground:null,videoFit:null},playbackRate:1
  });
});
test('speed supports Video.js rates but rejects unsupported/unsafe input',()=>{
  for(const rate of [0.5,0.75,1,1.25,1.5,1.75,2])assert.equal(normalizePlaybackRate(rate),rate);
  for(const value of [null,undefined,'',0,NaN,Infinity,-1,'bad',100])assert.equal(normalizePlaybackRate(value),null);
});
test('turning memory off clears saved record but does not alter in-page preferences',()=>{
  const storage=new FakeStorage();
  const state=normalizePreferences({surface:'glass',motion:true,captionSize:'small',captionBackground:'solid'});
  assert.equal(saveRememberedSettings(storage,DEFAULT_REMEMBER_KEY,{preferences:state,playbackRate:1.25}),true);
  assert.equal(clearRememberedSettings(storage),true);
  assert.equal(readRememberedSettings(storage),null);
  assert.equal(state.captionSize,'small');
});
test('browser storage unavailable, denied, or quota-exceeded cannot crash playback',()=>{
  const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('quota')},removeItem(){throw Error('blocked')}};
  const fallback=safeStorage({get localStorage(){throw Error('privacy mode')}});
  assert.ok(fallback);
  assert.equal(fallback.getItem(DEFAULT_REMEMBER_KEY),null);
  assert.equal(fallback.persistenceAvailable,false);
  assert.equal(readRememberedSettings(blocked),null);
  assert.equal(saveRememberedSettings(blocked),false);
  assert.equal(clearRememberedSettings(blocked),false);
  assert.equal(saveRememberedSettings(null),false);
});
test('restored choices still respect forced contrast, transparency, and reduced-motion OS settings',()=>{
  const storage=new FakeStorage();
  const original={surface:'glass',motion:false,captionSize:'large',captionBackground:'transparent'};
  saveRememberedSettings(storage,DEFAULT_REMEMBER_KEY,{preferences:original,playbackRate:1.5});
  const recalled=readRememberedSettings(storage);
  assert.deepEqual(resolvePreferences(recalled.preferences,{reducedMotion:true,reducedTransparency:true,forcedColors:true}),{
    surface:'solid',motion:true,captionSize:'large',captionBackground:'solid',videoFit:'fit',touchSwipes:false,autoRotate:true
  });
  assert.equal(resolvePreferences(recalled.preferences,{}).surface,'glass');
  assert.equal(resolvePreferences(recalled.preferences,{}).motion,false);
});
test('both reusable player and showcase include persistence, playback-rate handling, and accessible checkbox',()=>{
  const app=source('src/app.js');
  assert.match(app,/playbackRate:previousRate/);
  assert.match(app,/playerPreferences=\{\.\.\.current\.getPreferences\(\)\}/);
  for(const tree of ['src','skin']){
    const markup=source(tree+'/prism-player.js');
    const prefs=source(tree+'/player-preferences.js');
    const storage=source(tree+'/remember-settings.js');
    const css=source(tree+'/'+(tree==='src'?'styles.css':'prism-skin.css'));
    assert.match(markup,/08 \/ REMEMBER MY SETTINGS/);
    assert.match(markup,/data-pref-remember/);
    assert.match(markup,/data-pref-remember-status.*aria-live="polite"/);
    assert.match(markup,/mediaElement\.addEventListener\('ratechange',onRateChange\)/);
    assert.match(markup,/effective:playerPreferences\.getEffective\(\)/);
    assert.match(markup,/mediaElement\.addEventListener\('loadedmetadata',restorePlaybackRate\)/);
    assert.match(markup,/saved on this device|Saved on this device/);
    assert.match(prefs,/onRememberChange\(remember\.checked/);
    assert.match(prefs,/\[motion,swipes,rotate,remember\]/);
    assert.match(storage,/enabled:true/);
    assert.match(css,/\.prism-remember-settings/);
  }
  assert.match(source('scripts/package-skin.mjs'),/remember-settings\.js/);
});

// The real wrapper must protect the localStorage getter as well as each method.
test('safe storage falls back to per-window memory when the localStorage getter throws',()=>{
  const win={get localStorage(){throw new DOMException('Denied','SecurityError')}};
  const storage=safeStorage(win);
  const preferences={surface:'solid',motion:true,captionSize:'large',captionBackground:'transparent'};
  assert.equal(readRememberedSettings(storage),null);
  assert.equal(saveRememberedSettings(storage,DEFAULT_REMEMBER_KEY,{preferences,playbackRate:1.5}),true);
  assert.equal(storage.persistenceAvailable,false);
  assert.deepEqual(readRememberedSettings(storage),{preferences:{...preferences,videoFit:null},playbackRate:1.5});
  // A newly mounted player in the SAME document gets the memory fallback.
  assert.deepEqual(readRememberedSettings(safeStorage(win)),{preferences:{...preferences,videoFit:null},playbackRate:1.5});
  assert.equal(clearRememberedSettings(storage),true);
  assert.equal(readRememberedSettings(safeStorage(win)),null);
});
test('safe storage handles quota failure after localStorage was accessible',()=>{
  const saved=new Map();
  const win={localStorage:{
    getItem(k){return saved.get(k)??null},
    setItem(){throw new DOMException('Quota exceeded','QuotaExceededError')},
    removeItem(k){saved.delete(k)}
  }};
  const storage=safeStorage(win);
  assert.equal(saveRememberedSettings(storage,DEFAULT_REMEMBER_KEY,{preferences:{captionSize:'small'},playbackRate:2}),true);
  assert.equal(storage.persistenceAvailable,false);
  assert.equal(saved.size,0);
  assert.equal(readRememberedSettings(safeStorage(win)).playbackRate,2);
  assert.equal(clearRememberedSettings(storage),true);
  assert.equal(storage.persistenceAvailable,true);
  assert.equal(readRememberedSettings(storage),null);
});
test('safe storage masks old stored data when removeItem is blocked',()=>{
  const persisted=new FakeStorage();
  persisted.setItem(DEFAULT_REMEMBER_KEY,JSON.stringify({version:1,enabled:true,preferences:{captionSize:'large'},playbackRate:1.25}));
  const win={localStorage:{
    getItem:k=>persisted.getItem(k),
    setItem:(k,v)=>persisted.setItem(k,v),
    removeItem(){throw Error('locked')}
  }};
  const storage=safeStorage(win);
  assert.equal(readRememberedSettings(storage).playbackRate,1.25);
  assert.equal(clearRememberedSettings(storage),true);
  assert.equal(storage.persistenceAvailable,false);
  assert.equal(readRememberedSettings(safeStorage(win)),null);
  // The persistent record genuinely could NOT be removed; UI must disclose this.
  assert.notEqual(persisted.getItem(DEFAULT_REMEMBER_KEY),null);
});
test('safe storage is isolated between independent windows',()=>{
  const first={get localStorage(){throw Error('blocked')}};
  const second={get localStorage(){throw Error('blocked')}};
  const firstStorage=safeStorage(first),secondStorage=safeStorage(second);
  assert.equal(saveRememberedSettings(firstStorage,DEFAULT_REMEMBER_KEY,{playbackRate:1.5}),true);
  assert.equal(readRememberedSettings(secondStorage),null);
  assert.equal(readRememberedSettings(firstStorage).playbackRate,1.5);
});
test('storage getter and method access occur only within the safe wrapper in both builds',()=>{
  for(const tree of ['src','skin']){
    const storage=source(`${tree}/remember-settings.js`);
    const player=source(`${tree}/prism-player.js`);
    assert.match(storage,/const storage=win\?\.localStorage/);
    assert.match(storage,/try\{/);
    assert.doesNotMatch(player,/\.localStorage/);
    assert.match(player,/Browser storage is blocked/);
    assert.match(player,/persistenceAvailable/);
  }
});
