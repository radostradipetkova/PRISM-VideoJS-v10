import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('Caption Studio appears only behind CC menu gear, not in main preferences',async()=>{
 for(const dir of ['src','skin']){
  const source=await read(`${dir}/prism-player.js`);
  assert.match(source,/prism-caption-menu-heading/);
  assert.match(source,/class="prism-caption-gear"/);
  assert.match(source,/aria-controls="\$\{uid\}-caption-appearance"/);
  assert.match(source,/data-caption-appearance hidden/);
  assert.match(source,/media-captions-radio-group label="Captions"/);
  assert.doesNotMatch(source,/<fieldset class="prism-preferences-group prism-caption-studio"/);
  const pref=await read(`${dir}/player-preferences.js`);
  assert.match(pref,/skin\.querySelectorAll\('\[data-pref-caption-size\]'\)/);
  assert.match(pref,/showCaptionAppearance/);
  assert.match(pref,/event\.key==='Escape'/);
 }
});
test('both players support asynchronous text-track loading and deterministic manual track activation',async()=>{
 for(const dir of ['src','skin']){
  const source=await read(`${dir}/prism-player.js`);
  assert.match(source,/captionLabel='English \/ descriptive', captionLang='en', captionsDefault=false/);
  assert.match(source,/captionsDefault \? 'default' : ''/);
  assert.match(source,/captionTrackNode\?\.addEventListener\('error',captionTrackState\)/);
  assert.match(source,/captionTrackNode\?\.addEventListener\('load',captionTrackState\)/);
  assert.match(source,/track\.mode='showing'/);
  assert.match(source,/track\.mode='disabled'/);
  assert.match(source,/crossorigin="anonymous"/);
 }
});
test('LIVE ACTION enables real captions and validates both local excerpt assets before selection',async()=>{
 const app=await read('src/app.js');
 assert.match(app,/'liveaction':\{captionsDefault:true/);
 assert.match(app,/films\.liveaction=\{captionsDefault:true/);
 assert.match(app,/tears-of-steel-excerpt\.vtt'\s*,\s*\{method:'HEAD'/);
 assert.match(app,/subtitles\.ok/);
 const subtitle=await read('assets/tears-of-steel-excerpt.vtt');
 assert.match(subtitle,/^WEBVTT/);
 assert.match(subtitle,/00:00:02\.000 --> 00:00:05\.000/);
});
test('caption appearance keeps a compact and accessible layout at phone widths',async()=>{
 for(const name of ['src/styles.css','skin/prism-skin.css']){
  const css=await read(name);
  assert.match(css,/\.prism-captions-menu/);
  assert.match(css,/\.prism-caption-gear/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/\.prism-caption-appearance/);
  assert.match(css,/\.prism-captions-menu \[hidden\]\{display:none!important\}/);
 }
});
