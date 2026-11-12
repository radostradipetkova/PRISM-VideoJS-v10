import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const app=read('src/app.js');
const expected=[
 ['1080p','-800.mp4'],['720p','-720.mp4'],['480p','-480.mp4'],['360p','-360.mp4'],['240p','-240.mp4']
];
test('Live Action uses actual Blender film variants, not fabricated resolution options',()=>{
  for(const [label,file] of expected){
    assert.ok(app.includes('"label":"'+label+'"'),label+' missing');
    assert.ok(app.includes('8533ea43-4271-4a57-9694-e9d0b35e1aa1'+file),file+' missing');
  }
  assert.match(app,/src:'https:\/\/video\.blender\.org\/download\/web-videos\/.+-720\.mp4',qualitySources:/);
  assert.match(app,/if\(liveMuxId\)films\.liveaction=/);
  assert.match(app,/films\.liveaction=\{captionsDefault:true,src:'\.\/assets\/tears-of-steel-excerpt\.mp4'/);
});
for(const file of ['src/prism-player.js','skin/prism-player.js']){
 test('Live Action MP4 quality selections preserve media, caption and chapter state: '+file,()=>{
   const code=read(file);
   assert.match(code,/const nativeQualityEnabled=nativeQualitySources\.length>1/);
   assert.match(code,/class="prism-quality-section prism-quality-native"/);
   assert.match(code,/data-prism-quality-index/);
   assert.match(code,/captureQualityPlayback/);
   assert.match(code,/restoreQualityPlayback/);
   assert.match(code,/mediaElement\.currentTime=position/);
   assert.match(code,/mediaElement\.load\(\)/);
   assert.match(code,/qualityTransition/);
   assert.match(code,/Quality unavailable\. Restoring previous stream/);
   assert.match(code,/nativeQualitySection\?\.removeEventListener\('click',onNativeQualityClick\)/);
 });
}
for(const file of ['src/styles.css','skin/prism-skin.css']){
 test('MP4 quality menu is tappable and keyboard navigable: '+file,()=>{
  const css=read(file);
  assert.match(css,/PRISM 2\.9 — honest MP4 quality selection/);
  assert.match(css,/\.prism-quality-option\[aria-pressed="true"\]/);
  assert.match(css,/\.prism-quality-option:focus-visible/);
  assert.match(css,/min-height:44px/);
 });
}
