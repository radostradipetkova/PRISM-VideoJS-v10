import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,base),'utf8');
for(const part of ['src','skin']){
  test('PRISM '+part+' exposes control hints on the entire transport',()=>{
    const player=read(part+'/prism-player.js');
    for(const label of ['play','Back 5 seconds','Forward 5 seconds','Playback time · elapsed / total',
      'mute','Adjust volume','playback','Subtitles and caption settings','Scene Loop · repeat a chapter',
      'Player settings','Picture in Picture','fullscreen','seek']){
      assert.ok(player.includes('data-prism-hint="'+label+'"'),label+' missing in '+part);
    }
    assert.match(player,/initControlHints\(\{skin,media:mediaElement\}\)/);
    assert.match(player,/controlHints\.destroy\(\)/);
    assert.doesNotMatch(player,/\?\s*'PLAYBACK'\s*:\s*'SPEED'/);
    assert.match(player,/class="prism-settings-trigger"|class="prism-control prism-settings-trigger"/);
    const help=read(part+'/control-hints.js');
    assert.match(help,/labelFor\(element\)/);
    assert.match(help,/media\.paused\?'Play video':'Pause video'/);
    assert.match(help,/media\.muted \|\| media\.volume===0\?'Unmute audio':'Mute audio'/);
    assert.match(help,/event\.pointerType==='touch'/);
    assert.match(help,/getBoundingClientRect\(\)/);
    assert.match(help,/role','tooltip'/);
    assert.match(help,/focusin/);
    assert.match(help,/destroy\(\)/);
    const css=read(part==='src'?'src/styles.css':'skin/prism-skin.css');
    assert.match(css,/PRISM 3\.0 — FIRST-TIME VIEWER CONTROL HINTS/);
    assert.match(css,/\.prism-control-hint\[hidden\]\{display:none!important\}/);
  });
}
test('independent skin package includes the tooltip runtime',()=>{
  assert.match(read('scripts/package-skin.mjs'),/'control-hints.js'/);
});

test('icon-only Playback trigger shares the neighboring icon sizing',()=>{
 for(const file of ['src/styles.css','skin/prism-skin.css']){
   assert.match(read(file),/\.prism-control\.prism-settings-trigger:not\(\.prism-captions-trigger\)/);
   assert.match(read(file),/border-color:transparent;gap:0/);
 }
});
