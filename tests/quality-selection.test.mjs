import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

for(const file of ['src/prism-player.js','skin/prism-player.js']){
  test('Mux quality uses real Video.js adaptive rendition state: '+file,()=>{
    const source=read(file);
    assert.ok(source.includes('muxPlaybackId ? `<section class="prism-quality-section"'));
    assert.match(source,/<media-quality-radio-group class="prism-quality-group" label="Video quality">/);
    assert.match(source,/data-part="label"/);
    assert.match(source,/data-part="tier"/);
    assert.match(source,/\.\.\.\(muxPlaybackId \? \['media-quality-radio-group'\] : \[\]\)/);
    assert.doesNotMatch(source,/data-quality="(1080|720|540|480|270)p"/);
    assert.match(source,/Playback speed and quality/);
  });
}
test('Both showcase and independent skin register the native Video.js 10.3 quality component',()=>{
  assert.match(read('index.html'),/@videojs\/cdn@10\.3\.0\/ui\/quality-radio-group\.js/);
  assert.match(read('skin/register-videojs.js'),/'ui\/quality-radio-group\.js'/);
});
for(const file of ['src/styles.css','skin/prism-skin.css']){
  test('Unavailable quality is not presented as a selectable option: '+file,()=>{
    const css=read(file);
    assert.match(css,/PRISM 2\.8 — NATIVE MUX ADAPTIVE QUALITY/);
    assert.match(css,/\.prism-quality-group\[data-availability="unavailable"\]/);
    assert.match(css,/\.prism-quality-group\[hidden\]/);
  });
}
