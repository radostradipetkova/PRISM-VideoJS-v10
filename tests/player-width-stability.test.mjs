import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');

test('responsive player keeps a stable 16:9 stage without a manual width slider',()=>{
 assert.match(html,/<div class="player-size-stage"><div class="player-wrap" id="player-wrap">/);
 assert.doesNotMatch(html,/id="player-width"/);
 assert.match(css,/\.player-size-stage\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9;/s);
 assert.match(css,/\.player-size-stage\s*\{[^}]*place-items:\s*center;/s);
 assert.match(css,/@media\s*\(max-width:\s*600px\)[\s\S]*?\.player-size-stage\s*\{[\s\S]*?display:\s*block;/);
});
test('removing width controls does not remount or resize the media',()=>{
 assert.doesNotMatch(app,/querySelector\('#player-width'\)/);
 assert.doesNotMatch(app,/updateWidth|--preferred-width|width-readout|ambient-switch|data-theme/);
 assert.match(css,/\.player-wrap\{--preferred-width:1080px/);
});
