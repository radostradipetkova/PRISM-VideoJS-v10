import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const player=read('../src/prism-player.js');
const html=read('../index.html');
const css=read('../src/styles.css');
test('exactly one status announcer is present, explicitly imported and required at runtime',()=>{
  assert.equal((player.match(/<media-status-announcer\b/g)||[]).length,1);
  assert.match(player,/media-status-announcer class="prism-a11y-announcer"/);
  assert.match(player,/\'media-status-announcer\'/);
  assert.match(html,/@videojs\/cdn@10\.3\.0\/ui\/status-announcer\.js/);
});
test('status announcer is visually clipped but remains in accessibility tree',()=>{
  const rule=css.match(/\.prism-a11y-announcer\s*\{([^}]+)\}/);
  assert.ok(rule,'missing screen reader announcement CSS');
  assert.match(rule[1],/clip-path:inset\(50%\)/);
  assert.doesNotMatch(rule[1],/display\s*:\s*none|visibility\s*:\s*hidden/i);
});
test('editorial small-text palette uses contrast-specific tokens for both page themes',()=>{
  assert.match(css,/--rust-text:#a23c29/);
  assert.match(css,/\[data-theme="dark"\]\s*\{\s*--rust-text:#ef714b/);
  assert.match(css,/\.section-index, \.setting-group legend/);
  assert.match(css,/--muted-readable:#5c5d55/);
});
