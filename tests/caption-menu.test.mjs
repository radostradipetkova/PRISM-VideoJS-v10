import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('Caption Studio appears only behind CC menu gear, not in main preferences',async()=>{
 for(const dir of ['src','skin']){
  const source=await read(`${dir}/prism-player.js`);
  assert.match(source,/prism-caption-menu-heading/);
  assert.match(source,/class="prism-caption-gear"/);
  assert.match(source,/aria-controls="\$\{uid\}-caption-appearance"/);
  assert.match(source,/data-caption-appearance hidden/);
  assert.match(source,/media-captions-radio-group label="Captions"/);
  assert.doesNotMatch(source,/<fieldset class="prism-preferences-group prism-caption-studio"/);
  const pref=await read(`${dir}/player-preferences.js`);
  assert.match(pref,/skin\.querySelectorAll\('\[data-pref-caption-size\]'\)/);
  assert.match(pref,/showCaptionAppearance/);
  assert.match(pref,/event\.key==='Escape'/);
 }
});
test('both players support asynchronous text-track loading and deterministic manual track activation',async()=>{
 for(const dir of ['src','skin']){
  const source=await read(`${dir}/prism-player.js`);
  assert.match(source,/captionLabel='English \/ descriptive', captionLang='en', captionsDefault=false/);
  assert.match(source,/captionsDefault \? 'default' : ''/);
  assert.match(source,/captionTrackNode\?\.addEventListener\('error',captionTrackState\)/);
  assert.match(source,/captionTrackNode\?\.addEventListener\('load',captionTrackState\)/);
  assert.match(source,/track\.mode='showing'/);
  assert.match(source,/track\.mode='disabled'/);
  assert.match(source,/crossorigin="anonymous"/);
 }
});
test('LIVE ACTION enables real captions and validates both local excerpt assets before selection',async()=>{
 const app=await read('src/app.js');
 assert.match(app,/'liveaction':\{captionsDefault:true/);
 assert.match(app,/films\.liveaction=\{/);
 assert.match(app,/assets\.liveActionExcerpt/);
 assert.match(app,/tears-of-steel-excerpt\.vtt/);
 assert.match(app,/prism-media-manifest\.json/);
 assert.doesNotMatch(app,/method:'HEAD'/);
 const subtitle=await read('assets/tears-of-steel-excerpt.vtt');
 assert.match(subtitle,/^WEBVTT/);
 assert.match(subtitle,/00:00:02\.000 --> 00:00:05\.000/);
});
test('caption appearance keeps a compact and accessible layout at phone widths',async()=>{
 for(const name of ['src/styles.css','skin/prism-skin.css']){
  const css=await read(name);
  assert.match(css,/\.prism-captions-menu/);
  assert.match(css,/\.prism-caption-gear/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/\.prism-caption-appearance/);
  assert.match(css,/\.prism-captions-menu \[hidden\]\{display:none!important\}/);
 }
});

test('caption settings uses a toothed cog in the top-left and leaves the title centered',async()=>{
 for(const dir of ['src','skin']){
  const source=await read(`${dir}/prism-player.js`);
  const css=await read(dir==='src'?'src/styles.css':'skin/prism-skin.css');
  assert.ok(source.includes('gear: svg(\'<path d="M10.5 2h3l.6 2.5'));
  assert.ok(!source.includes('gear: svg(\'<circle cx="12" cy="12" r="3"'));
  assert.ok(source.includes('<div class="prism-caption-menu-heading"><button class="prism-caption-gear"'));
  assert.ok(source.includes('>\${icon.gear}</button><span class="prism-menu-title">SUBTITLES</span>'));
  assert.ok(css.includes('.prism-caption-menu-heading{display:grid;grid-template-columns:44px minmax(0,1fr) 44px'));
  assert.ok(css.includes('.prism-caption-menu-heading .prism-menu-title{grid-column:2;grid-row:1;'));
  assert.ok(css.includes('text-align:center'));
  assert.ok(css.includes('.prism-caption-gear{box-sizing:border-box;grid-column:1;grid-row:1;'));
 }
});

test('Mux caption controller reads real internal WebVTT tracks, not inert light DOM track state',async()=>{
 for(const where of ['src','skin']){
  const code=await read(where+'/prism-player.js');
  assert.ok(code.includes('mediaElement?.shadowRoot?.querySelector(\'video track[kind="captions"]\')'));
  assert.ok(code.includes('mediaElement?.textTracks'));
  assert.ok(code.includes("captionTrackList?.addEventListener?.('addtrack',initializeDefaultCaptions)"));
  assert.ok(code.includes("for(const track of tracks)track.mode=track===chosen?'showing':'disabled'"));
  assert.ok(code.includes("for(const track of tracks)track.mode=track===preferred?'showing':'disabled'"));
  assert.ok(code.includes("captionStatus.textContent='Subtitle track could not load. Check the VTT file.'"));
 }
});

// The showcase uses descriptive captions by default (including the Mux reel).
test('Cinematic Reel captions describe waves and remain enabled after track load',async()=>{
 const app=await read('src/app.js');
 const vtt=await read('assets/prism-cinematic.vtt');
 assert.match(app,/'cinematic':\{captionsDefault:true/);
 assert.match(vtt,/Waves roll across the coast/);
 for(const dir of ['src','skin']){
  const source=await read(dir+'/prism-player.js');
  assert.match(source,/captionTrackNode\?\.addEventListener\('load',initializeDefaultCaptions\)/);
  assert.match(source,/mediaForCaptionDefault\?\.addEventListener\('canplay',initializeDefaultCaptions\)/);
  assert.match(source,/if\(!captionsDefault \|\| captionsWereExplicitlyChanged\)return/);
 }
});
