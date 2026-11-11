import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const player=readFileSync(new URL('../src/prism-player.js',import.meta.url),'utf8');

test('touch-first PRISM controls keep 44px targets, full-size rail and visible focus',()=>{
  assert.match(css,/PRISM \/ ACCESSIBLE SCALE/);
  assert.match(css,/\.prism-control\s*\{min-width:44px;min-height:44px/);
  assert.match(css,/\.prism-rail\s*\{min-height:44px;height:44px/);
  assert.match(css,/@container \(max-width: 330px\)/);
  assert.match(css,/\.prism-control-row\s*\{flex-wrap:wrap;row-gap:0\}/);
  assert.match(css,/\.prism-control:focus-visible/);
  assert.match(css,/\.prism-rail:focus-visible/);
  assert.match(player,/<media-time-slider class="prism-rail"/);
});

test('time, menus, chapters and small page typography are larger without altering media controls',()=>{
  assert.match(css,/\.prism-time \{font-size:15px\}/);
  assert.match(css,/\.prism-menu-item \{min-height:44px;font-size:14px/);
  assert.match(css,/\.chapter-bar button \{font-size:12px;min-height:52px\}/);
  assert.match(css,/\.setting-group legend \{font-size:12px\}/);
  assert.match(css,/\.feature-card-bottom p \{font-size:13px/);
  assert.match(player,/<media-mute-button/);
  assert.match(player,/<media-fullscreen-button/);
});
