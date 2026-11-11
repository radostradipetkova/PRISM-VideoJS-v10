import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const app=read('../src/app.js'),html=read('../index.html'),builder=read('../scripts/build.mjs');
test('open film is an optional additional demo; the original Mux reel remains the default',()=>{
 assert.match(app,/let currentFilm='cinematic'/);
 assert.match(app,/load\(\);/);
 assert.match(html,/data-film="cinematic" aria-pressed="true"/);
 assert.match(html,/data-film="liveaction" aria-pressed="false"/);
 assert.match(app,/Blender|video\.blender\.org|tears-of-steel-excerpt\.mp4/);
 assert.match(app,/films\.liveaction=\{/);
 assert.match(app,/\.chapter-bar'\)\.hidden=film!=='cinematic'\|\|foreignMux/);
});
test('film attribution is visible only for the licensed excerpt / original',()=>{
 assert.match(html,/id="prism-film-credit"/);
 assert.match(html,/Blender Foundation \/ Blender Institute/);
 assert.match(html,/https:\/\/creativecommons\.org\/licenses\/by\/3\.0\//);
 assert.match(html,/https:\/\/mango\.blender\.org\/about\//);
 assert.match(app,/filmCredit\.hidden=film!=='liveaction'/);
});
test('accurately shifted excerpt captions and authored chapters cover the 65-second segment',()=>{
 const caps=read('../assets/tears-of-steel-excerpt.vtt');
 const chapter=read('../assets/tears-of-steel-chapters.vtt');
 assert.ok(caps.startsWith('WEBVTT'));
 assert.match(caps,/00:00:02\.000 --> 00:00:05\.000\n\.\.\.and, action!/);
 assert.match(caps,/00:00:57\.000 --> 00:01:00\.000/);
 assert.match(chapter,/00:00:44\.000 --> 00:01:05\.000/);
 const full=read('../assets/tears-of-steel-full.vtt');
 assert.match(full,/00:04:52\.000 --> 00:04:55\.000/);
 assert.match(full,/00:08:58\.000 --> 00:08:59\.000/);
});
test('deployment includes optimized open film assets only after media has been prepared',()=>{
 assert.match(builder,/const optionalFilm=\[/);
 assert.match(builder,/stat\(path\.join\(root,'assets','tears-of-steel-excerpt\.mp4'\)\)/);
 assert.match(builder,/if\(m\.size>100000\)releaseAssets\.push\(\.\.\.optionalFilm\)/);
 assert.match(builder,/tears-of-steel-fallback\.svg/);
 assert.match(builder,/tears-of-steel-full\.vtt/);
});
test('short comparison page is offline-only, opt-in and never changes default playback',()=>{
 const compare=read('../compare-openings.html');
 assert.match(compare,/FIRST 10 S/);
 assert.match(compare,/assets\/prism-cinematic\.mp4/);
 assert.match(compare,/assets\/tears-of-steel-excerpt\.mp4/);
 assert.match(compare,/currentTime>=10/);
 assert.match(compare,/compare\.disabled=false/);
});
