import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const src=await readFile(new URL('../src/prism-player.js',import.meta.url),'utf8');
const css=await readFile(new URL('../src/styles.css',import.meta.url),'utf8');

test('Optical Deck keeps real Video.js v10 transport components',()=>{
  for (const primitive of ['media-play-button','media-time-slider','media-slider-fill','media-slider-thumb','media-volume-slider','media-mute-button','media-fullscreen-button','media-playback-rate-radio-group','media-captions-radio-group']) {
    assert.ok(src.includes(`<${primitive}`),`Missing interactive primitive ${primitive}`);
  }
  for (const signature of ['prism-viewfinder-brand','prism-center-aperture','prism-dock','prism-optical-frame']) {
    assert.ok(src.includes(`class="${signature}`),`Missing original design element ${signature}`);
  }
});

test('optical transport readouts derive from the native media and dispose listeners',()=>{
  assert.match(src,/const status = trackTransport\(mediaElement, event\)/);
  for(const event of ['play','pause','timeupdate','seeking','seeked','waiting','ended']){
    assert.ok(src.includes(`'${event}'`),`Missing native event ${event}`);
  }
  assert.match(src,/mediaElement\.addEventListener\(event,syncTransport\)/);
  assert.match(src,/mediaElement\.removeEventListener\(event,syncTransport\)/);
  assert.match(src,/timecode\.textContent = formatMediaTime\(mediaElement\.currentTime\)/);
});

test('player respects native visibility, mobile layout, focus and reduced motion',()=>{
  assert.match(css,/prism-skin\[data-view-state="playing"\]:has\(\.prism-controls:not\(\[data-visible\]\)\)/);
  assert.match(css,/@container \(max-width: 420px\)/);
  assert.match(css,/\.prism-center-play\{display:none\}/);
  assert.match(css,/\.prism-control:focus-visible/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/@media\(forced-colors:active\)/);
});
