import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = file => readFileSync(new URL('../'+file,import.meta.url),'utf8');

for(const tree of ['src','skin']){
  test(`${tree}: keyboard guide documents only implemented hotkeys and scopes`,()=>{
    const player=read(`${tree}/prism-player.js`);
    const guide=player.slice(player.indexOf('<details class="prism-keyboard-guide"'),player.indexOf('</details>',player.indexOf('<details class="prism-keyboard-guide"'))+10);
    assert.ok(guide.startsWith('<details'),`${tree}: missing disclosure`);
    assert.match(guide,/<summary>.*07 \/ KEYBOARD SHORTCUTS/);
    for(const k of ['SPACE','K','←','→','↑','↓','M','F','SHIFT','TAB','ENTER','ESC']){
      assert.match(guide,new RegExp(`<kbd>${k}</kbd>`),`Missing ${k}`);
    }
    assert.match(guide,/focused timeline when the video provides chapters/);
    assert.match(guide,/focused sliders use their own arrow-key steps/);
    assert.match(guide,/data-guide-focus-player/);
    assert.match(guide,/data-guide-focus-timeline/);
    assert.match(player,/<media-hotkey keys="k" action="togglePaused"/);
    assert.match(player,/<media-hotkey keys="m" action="toggleMuted"/);
    assert.match(player,/<media-hotkey keys="f" action="toggleFullscreen"/);
    assert.match(player,/<media-hotkey keys="ArrowLeft" action="seekStep" value="-5"/);
    assert.match(player,/<media-hotkey keys="ArrowRight" action="seekStep" value="5"/);
    assert.match(player,/<media-hotkey keys="ArrowUp" action="volumeStep" value="0.05"/);
    assert.match(player,/<media-hotkey keys="ArrowDown" action="volumeStep" value="-0.05"/);
    const chapter=read(`${tree}/optical-touch.js`);
    assert.match(chapter,/if\(!e\.shiftKey/);
    assert.match(chapter,/on\(rail,'keydown'/);
  });
  test(`${tree}: interactive guide sends focus to real scoped targets`,()=>{
    const logic=read(`${tree}/player-preferences.js`);
    assert.match(logic,/focusFromGuide\('\.prism-skin'\)/);
    assert.match(logic,/focusFromGuide\('\.prism-rail'\)/);
    assert.match(logic,/targetElement\.focus\(\{preventScroll:true\}\)/);
    assert.match(logic,/hide\(\);\s*\/\/ Video\.js time sliders/);
    assert.match(logic,/if\(!\['Escape','Tab'\]\.includes\(event\.key\)\)event\.stopPropagation\(\)/);
    const css=read(`${tree}/${tree==='src'?'styles.css':'prism-skin.css'}`);
    assert.match(css,/\.prism-keyboard-guide > summary:focus-visible/);
    assert.match(css,/\.prism-keyboard-guide-actions button:focus-visible/);
    assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
    assert.match(css,/@media \(forced-colors:active\)/);
  });
}

test('showcase Space exception is clearly identified as nonportable',()=>{
  assert.match(read('src/prism-player.js'),/On this showcase only, Space also plays or pauses/);
  assert.doesNotMatch(read('skin/prism-player.js'),/On this showcase only/);
});
