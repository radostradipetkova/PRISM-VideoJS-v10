import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
test('showcase focuses on live player, demonstration films, and anatomy',()=>{
 for(const fragment of ['MAKE IT','DESIGN ETHOS','THE CHALLENGE','id="philosophy"','class="workbench"','class="manifesto"','class="finish"'])assert.ok(!html.includes(fragment),'Old section remains: '+fragment);
 assert.match(html,/href="#experience"/);
 assert.match(html,/href="#anatomy"/);
 assert.match(html,/02 \/ THE ANATOMY/);
 assert.equal((html.match(/data-film="/g)||[]).length,4);
 for(const name of ['cinematic','night','coast','liveaction'])assert.ok(html.includes('data-film="'+name+'"'));
 assert.match(app,/document\.querySelectorAll\('\[data-film\]'\)/);
 assert.match(css,/\.prism-demo-strip/);
 assert.doesNotMatch(html,/data-theme=|id="player-width"|id="ambient-switch"/);
});
test('all player settings and full video controls remain in the player implementation',()=>{
 const player=readFileSync(new URL('../src/prism-player.js',import.meta.url),'utf8');
 for(const marker of ['prism-preferences-trigger','media-time-slider','media-play-button','media-fullscreen-button','data-pref-video-fit','prism-loop-trigger']){
   assert.ok(player.includes(marker),'Missing '+marker);
 }
});
