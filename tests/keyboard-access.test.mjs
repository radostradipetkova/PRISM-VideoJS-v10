import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const aid=readFileSync(new URL('../src/keyboard-aid.js',import.meta.url),'utf8');
const player=readFileSync(new URL('../src/prism-player.js',import.meta.url),'utf8');
test('keyboard affordance is discoverable and accessible',()=>{
 assert.match(html,/id="skip-to-prism"/);
 assert.match(html,/id="focus-prism-player"[^>]*aria-controls="prism-mount"/);
 assert.match(html,/id="prism-keyboard-help"/);
 assert.match(css,/\.prism-skip-to-player:focus-visible/);
 assert.match(css,/\.prism-skin:focus-visible/);
 assert.match(css,/\.prism-skin\.prism-keyboard-engaged/);
 assert.match(css,/\.prism-skin:has\(:focus-visible\) \.prism-bottom/);
});
test('showcase Space works outside the player while native v10 hotkeys remain scoped',()=>{
 assert.match(app,/initKeyboardAid\(\{mount,getPlayer:\(\)=>current\?\.player,getMedia:\(\)=>current\?\.media\}\)/);
 assert.match(aid,/player\?\.querySelector\('media-container'\)/);
 assert.match(aid,/container\.focus\(\{preventScroll:true\}\)/);
 assert.match(aid,/root\.addEventListener\('keydown',onPageSpace\)/);
 assert.match(aid,/event\.preventDefault\(\); \/\/ prevent the page from scrolling on Space/);
 assert.match(aid,/player\.contains\(event\.target\)/);
 assert.match(aid,/event\.repeat/);
 for(const key of ['Space','ArrowRight','ArrowLeft','ArrowUp','ArrowDown'])
  assert.match(player,new RegExp(`<media-hotkey keys="${key}"`));
 assert.doesNotMatch(player,/<media-hotkey[^>]*target="document"/);
});
