import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const player=readFileSync(new URL('../src/prism-player.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const id='i4NN2nQSVFk5TDkOtoLIfUUt2e6h5ah02j9ebYxzXxDM';

test('the submitted public Mux ID is the default source for the competition cinematic reel',()=>{
 assert.ok(app.includes(`PRISM_MUX_PLAYBACK_ID='${id}'`));
 assert.match(app,/film==='cinematic' && !useLocalCinematic/);
 assert.match(app,/isMuxCinematic\?\{muxPlaybackId:muxId\}:\{\}/);
 assert.match(player,/https:\/\/stream\.mux\.com\/\$\{encodeURIComponent\(muxPlaybackId\)\}\.m3u8/);
 assert.match(html,/@videojs\/cdn@10\.3\.0\/media\/mux-video\.js/);
 assert.match(player,/muxPlaybackId \? \['mux-video'\] : \[\]/);
});
test('the main captions menu and descriptive WebVTT remain exposed in the Mux version',()=>{
 assert.match(player,/const hasCaptions = Boolean\(captions\);/);
 assert.match(player,/const captionTrack = hasCaptions \?/);
 assert.match(player,/\$\{captionTrack\}\$\{chapterTrack\}<\/mux-video>/);
 assert.match(player,/media-captions-radio-group/);
 assert.match(player,/crossorigin="anonymous"/);
});
test('Mux does not disable film buttons or the real-media cinematic chapters',()=>{
 assert.doesNotMatch(app,/if\(muxId\)\{[\s\S]*?chapters\.hidden=true/);
 assert.match(app,/btn\.addEventListener\('click',\(\)=>selectFilm\(btn\.dataset\.film\)\)/);
 assert.match(app,/const goal=Number\(b\.dataset\.chapter\)\*8\+0\.3/);
 assert.match(app,/media\.currentTime=target/);
});
test('users can explicitly switch to the local backup after a real Mux media error',()=>{
 assert.match(app,/useLocalCinematic=query\.get\('source'\)==='local'/);
 assert.match(app,/activeMedia\.addEventListener\('error'/);
 assert.match(app,/useLocalCinematic=true;load\('cinematic'\)/);
 assert.doesNotMatch(app,/if\(!muxId\)load/);
});
