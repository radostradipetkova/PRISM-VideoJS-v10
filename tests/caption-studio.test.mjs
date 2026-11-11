import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizePreferences,resolvePreferences} from '../skin/player-preferences.js';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('Caption Studio defaults are readable and normalizable for arbitrary captioned video',()=>{
  assert.deepEqual({captionSize:resolvePreferences({}).captionSize,captionBackground:resolvePreferences({}).captionBackground},{captionSize:'medium',captionBackground:'solid'});
  assert.equal(normalizePreferences({captionSize:'large',captionBackground:'transparent'}).captionSize,'large');
  assert.equal(normalizePreferences({captionSize:'small',captionBackground:'solid'}).captionBackground,'solid');
  assert.equal(normalizePreferences({captionSize:'gigantic',captionBackground:'neon'}).captionSize,null);
  assert.equal(normalizePreferences({captionSize:'gigantic',captionBackground:'neon'}).captionBackground,null);
});

test('Caption Studio offers all three sizes and both backgrounds, independently of video identity',()=>{
  for(const size of ['small','medium','large'])for(const background of ['solid','transparent']){
    const value=resolvePreferences({captionSize:size,captionBackground:background});
    assert.equal(value.captionSize,size);
    assert.equal(value.captionBackground,background);
  }
});

test('OS contrast requirements take priority over transparent captions',()=>{
  for(const system of [{forcedColors:true},{highContrast:true}]){
    const value=resolvePreferences({captionSize:'large',captionBackground:'transparent'},system);
    assert.equal(value.captionSize,'large');
    assert.equal(value.captionBackground,'solid');
  }
});

test('both player builds expose caption preferences as native keyboard-usable buttons',async()=>{
  for(const where of ['src','skin']){
    const player=await read(where+'/prism-player.js');
    const pref=await read(where+'/player-preferences.js');
    assert.match(player,/prism-caption-gear/);
    assert.match(player,/data-caption-appearance/);
    assert.doesNotMatch(player,/<legend>02 \/ CAPTION STUDIO<\/legend>/);
    for(const key of ['small','medium','large']) assert.match(player,new RegExp('data-pref-caption-size="'+key+'"'));
    for(const key of ['transparent','solid'])assert.match(player,new RegExp('data-pref-caption-background="'+key+'"'));
    assert.match(player,/prism-caption-sample/);
    assert.match(player,/prism-caption-track-status/);
    assert.match(player,/captionTrackNode\?\.addEventListener\('error'/);
    assert.match(pref,/captionSizeButtons\.forEach\(button=>listen\(button,'click'/);
    assert.match(pref,/captionBackgroundButtons\.forEach\(button=>listen\(button,'click'/);
    assert.match(pref,/skin\.style\.setProperty\('--prism-caption-font-size'/);
    assert.match(pref,/skin\.style\.setProperty\('--prism-caption-background'/);
    assert.match(pref,/skin\.dataset\.captionBackground/);
  }
});

test('both stylesheets style native WebVTT cues and exported Mux video cues',async()=>{
  for(const path of ['src/styles.css','skin/prism-skin.css']){
    const css=await read(path);
    assert.match(css,/\.prism-skin video::cue,/);
    assert.match(css,/\.prism-skin mux-video::part\(video\)::cue/);
    assert.match(css,/--prism-caption-font-size,17px/);
    assert.match(css,/--prism-caption-background,rgba/);
    assert.match(css,/\.prism-caption-preview/);
    assert.match(css,/\.prism-caption-size-choices button/);
    assert.match(css,/\.prism-preferences-panel,\s*\.prism-skin \.prism-caption-preview,[\s\S]*box-sizing:border-box/);
  }
});

test('caption styling does not hide or replace Video.js native caption track selection',async()=>{
  for(const where of ['src','skin']){
    const player=await read(where+'/prism-player.js');
    assert.match(player,/<media-captions-radio-group label="Captions">/);
    assert.match(player,/const captionTrack = hasCaptions \?/);
    assert.match(player,/\$\{captionTrack\}\$\{chapterTrack\}/);
  }
  const packed=await read('scripts/package-skin.mjs');
  assert.match(packed,/player-preferences\.js/);
});
