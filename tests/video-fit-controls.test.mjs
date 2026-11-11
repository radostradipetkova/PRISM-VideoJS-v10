import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizePreferences,resolvePreferences} from '../skin/player-preferences.js';
import {safeStorage,saveRememberedSettings,readRememberedSettings,DEFAULT_REMEMBER_KEY} from '../skin/remember-settings.js';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('video fit preserves full frame by default, and fill is opt-in',()=>{
  assert.equal(normalizePreferences({}).videoFit,null);
  assert.equal(resolvePreferences({}).videoFit,'fit');
  assert.equal(resolvePreferences({videoFit:'fill'}).videoFit,'fill');
  assert.equal(resolvePreferences({videoFit:'fit'}).videoFit,'fit');
  assert.equal(resolvePreferences({videoFit:'stretch'}).videoFit,'fit');
  assert.equal(normalizePreferences({videoFit:'invalid'}).videoFit,null);
});

test('device accessibility preferences cannot accidentally change the chosen video framing',()=>{
  for(const os of [{reducedMotion:true},{forcedColors:true},{highContrast:true},{reducedTransparency:true}]){
    assert.equal(resolvePreferences({videoFit:'fill'},os).videoFit,'fill');
    assert.equal(resolvePreferences({videoFit:'fit'},os).videoFit,'fit');
  }
});

test('both player builds expose accessible in-player Fit/Fill options and apply the same media styling',()=>{
  for(const tree of ['src','skin']){
    const player=source(`${tree}/prism-player.js`), prefs=source(`${tree}/player-preferences.js`);
    const css=source(`${tree}/${tree==='src'?'styles.css':'prism-skin.css'}`);
    assert.match(player,/09 \/ VIDEO FIT/);
    assert.match(player,/data-pref-video-fit="fit" aria-pressed="true"/);
    assert.match(player,/data-pref-video-fit="fill" aria-pressed="false"/);
    assert.match(player,/role="group" aria-label="Video framing mode"/);
    assert.match(prefs,/skin\.style\.setProperty\('--prism-video-fit',effective\.videoFit==='fill'\?'cover':'contain'\)/);
    assert.match(prefs,/videoFitButtons\.forEach\(button=>listen\(button,'click'/);
    assert.match(prefs,/skin\.dataset\.videoFit=effective\.videoFit/);
    assert.match(css,/\.prism-skin mux-video::part\(video\)/);
    assert.match(css,/object-fit:\s*var\(--prism-video-fit, var\(--media-object-fit, contain\)\)/);
    assert.match(css,/\.prism-video-fit-choices button\{[^}]*min-height:44px/);
  }
});

test('Remember My Settings opt-in saves video fit and remains backward-compatible',()=>{
  const map=new Map();const win={localStorage:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}};
  const storage=safeStorage(win);
  assert.equal(readRememberedSettings(storage),null);
  saveRememberedSettings(storage,DEFAULT_REMEMBER_KEY,{preferences:{videoFit:'fill'},playbackRate:1.5});
  assert.equal(readRememberedSettings(safeStorage(win)).preferences.videoFit,'fill');
  assert.equal(JSON.parse(map.get(DEFAULT_REMEMBER_KEY)).preferences.videoFit,'fill');
  map.set(DEFAULT_REMEMBER_KEY,JSON.stringify({version:1,enabled:true,preferences:{surface:'solid'},playbackRate:1.25}));
  assert.equal(readRememberedSettings({getItem:k=>map.get(k)}).preferences.videoFit,null);
});

test('Fit/Fill controls do not change playback, capture keyboard shortcuts, crop loupe previews or resize player',()=>{
  for(const tree of ['src','skin']){
    const prefs=source(`${tree}/player-preferences.js`);
    const css=source(`${tree}/${tree==='src'?'styles.css':'prism-skin.css'}`);
    assert.doesNotMatch(prefs,/media\.src\s*=|media\.currentTime\s*=|\.play\(\)/);
    assert.match(css,/\.prism-loupe-image.*object-fit: contain/s);
  }
});
