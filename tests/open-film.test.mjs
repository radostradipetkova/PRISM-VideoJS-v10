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

test('full live-action movie has real authored chapter navigation and frame preview',()=>{
 const full=read('../assets/tears-of-steel-full-chapters.vtt');
 assert.ok(full.startsWith('WEBVTT'));
 for(const label of ['THE PAST','SYSTEMS GO','MEMORY OVERWRITE','AFTERMATH']) assert.ok(full.includes(label));
 assert.ok(app.includes("chaptersVtt:'./assets/tears-of-steel-full-chapters.vtt'"));
 assert.ok(builder.includes('tears-of-steel-full-chapters.vtt'));
 const touch=read('../src/optical-touch.js');
 const frames=read('../src/frame-preview.js');
 assert.ok(touch.includes('initOpticalFramePreview'));
 assert.ok(frames.includes("document.createElement('video')"));
 assert.ok(frames.includes('preview.currentTime=time'));
});
test('Mux uploads can be previewed in live action mode and get adaptive chapter fallback',()=>{
 assert.ok(app.includes("query.get('liveMux')"));
 assert.ok(app.includes('muxPlaybackId:liveMuxId'));
 assert.ok(app.includes("const effectiveIndexMode=indexMode??((film==='liveaction'||isMuxCinematic)?'smart':'auto')"));
});

test('English LIVE ACTION captions have timed cues beyond 39 seconds and do not fake speech',()=>{
 const full=read('../assets/tears-of-steel-full.vtt');
 const excerpt=read('../assets/tears-of-steel-excerpt.vtt');
 assert.match(full,/00:00:38\.000 --> 00:00:41\.000/);
 assert.match(full,/00:00:41\.000 --> 00:00:42\.000/);
 assert.match(full,/00:00:45\.000 --> 00:00:49\.800/);
 assert.match(full,/00:00:50\.000 --> 00:00:53\.500/);
 assert.match(full,/00:05:39\.000 --> 00:05:41\.000/);
 assert.match(excerpt,/00:00:38\.000 --> 00:00:48\.800/);
 assert.match(excerpt,/00:00:49\.000 --> 00:00:51\.000/);
 // Spoken dialogue remains the original transcript; inserted cue is
 // explicitly descriptive, not attributed to a speaker.
 assert.match(full,/\[The scene moves forward in time; dialogue pauses\.\]/);
 assert.match(excerpt,/\[Dialogue pauses as the scene continues\.\]/);
});
