import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const player=readFileSync(new URL('../src/prism-player.js',import.meta.url),'utf8');
test('PRISM preserve-all-pixels default also reaches Mux shadow video',()=>{
 assert.match(css,/PRISM 2\.2 — Universal media fit/);
 assert.match(css,/object-fit:\s*var\(--prism-video-fit,\s*var\(--media-object-fit,\s*contain\)\)/);
 assert.match(css,/\.prism-skin mux-video::part\(video\)\s*\{[^}]*object-fit:\s*var\(--prism-video-fit,\s*var\(--media-object-fit,\s*contain\)\)/s);
 assert.match(css,/\.prism-skin video\.prism-media[\s\S]*object-fit:\s*var\(--prism-video-fit,\s*var\(--media-object-fit,\s*contain\)\)/);
});
test('thumbnail previews use contain and no extra video decode layer',()=>{
 assert.match(css,/\.prism-loupe-image::part\(image\)/);
 assert.match(css,/\.prism-iris-thumbnail::part\(image\)/);
 const declarations=css.slice(css.lastIndexOf('/* PRISM 2.2')).replace(/\/\*[\s\S]*?\*\//g,'');
 assert.doesNotMatch(declarations,/(?<!backdrop-)filter:\s*blur|<video|canvas/);
});
test('player width height reservation, transport and v10 player are still present',()=>{
 assert.match(css,/\.player-size-stage\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/s);
 assert.match(player,/<video-player class="prism-vjs-player"/);
 assert.match(player,/<media-time-slider class="prism-rail"/);
 assert.match(player,/<media-status-announcer/);
});
