import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const get=async name=>readFile(new URL(`../${name}`,import.meta.url),'utf8');
test('browser verification supports both Mux and local playback instead of obsolete video-only selectors',async()=>{
  const code=await get('tests/browser_smoke.py');
  assert.match(code,/MODE = os\.environ\.get\('PRISM_MEDIA_MODE'/);
  assert.match(code,/mux-video\.prism-media/);
  assert.match(code,/video\.prism-media/);
  assert.match(code,/with_source\(BASE_URL\)/);
  assert.match(code,/currentTime>17/);
  assert.match(code,/skin\.press\('ArrowRight'\)/);
  assert.match(code,/page\.keyboard\.press\('Escape'\)/);
  assert.match(code,/rect\['height'\]>=43\.9/);
  assert.doesNotMatch(code,/customElements\.define\(/);
});
test('QA verifies genuinely progressing video, and offers reproducible browser report',async()=>{
  const qa=await get('src/qa-panel.js');
  const css=await get('src/styles.css');
  assert.match(qa,/on\(media,'playing'/);
  assert.match(qa,/on\(media,'timeupdate'/);
  assert.match(qa,/media\.currentTime>playingFrom\+\.15/);
  assert.match(qa,/DOWNLOAD QA REPORT/);
  assert.match(qa,/Mux HLS/);
  assert.match(css,/#prism-qa-source/);
  assert.doesNotMatch(qa,/\.play\(\)|\.pause\(\)/);
});
test('no page-wide keyboard overrides, mobile touch and reduced-motion protections still exist',async()=>{
  const player=await get('src/prism-player.js');
  const css=await get('src/styles.css');
  assert.doesNotMatch(player,/target="document"/);
  assert.match(player,/<media-hotkey keys="Space"/);
  assert.match(player,/<media-hotkey keys="ArrowLeft"/);
  assert.match(css,/\.prism-control \{min-width:44px;min-height:44px/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/focus-visible/);
});
