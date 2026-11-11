import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=async f => readFile(path.join(root,f),'utf8');

test('official Video.js v10.3.0 CDN source and UI registration are pinned',async()=>{
 const html=await read('index.html');
 assert.match(html,/@videojs\/cdn@10\.3\.0\/video\.js/);
 assert.match(html,/@videojs\/cdn@10\.3\.0\/global\.css/);
 const urls=[...html.matchAll(/https:\/\/cdn\.jsdelivr\.net\/npm\/@videojs\/cdn@([^/"\s]+)/g)].map(m=>m[1]);
 assert.ok(urls.length>=4);
 assert.deepEqual(new Set(urls),new Set(['10.3.0']));
 assert.doesNotMatch(html,/videojs\.com\/download|videojs-http-streaming|video\.js@8/);
});
test('reusable player is a real v10 player, not a disconnected HTML5 facade',async()=>{
 const code=await read('src/prism-player.js');
 for (const tag of ['video-player','media-container','media-controls','media-time-slider','media-slider-buffer','media-slider-preview','media-play-button','media-fullscreen-button','media-mute-button','media-volume-slider','media-error-dialog','media-gesture','media-hotkey','media-status-announcer']){
  assert.ok(code.includes(`<${tag}`),`missing v10 primitive: ${tag}`);
 }
 assert.match(code,/customElements\.whenDefined\(tag\)/);
 assert.match(code,/requiredTags/);
 assert.match(code,/muxPlaybackId/);
 assert.doesNotMatch(code,/videojs\(/i);
});
test('captions and accessible interaction are not only decorative',async()=>{
 const code=await read('src/prism-player.js');
 assert.match(code,/kind=\\?"captions/);
 assert.match(code,/media-captions-radio-group/);
 assert.match(code,/media-playback-rate-radio-group/);
 assert.match(code,/media-pip-button/);
 assert.match(code,/action=\\?"seekStep/);
 assert.match(code,/action=\\?"volumeStep/);
 assert.match(code,/aria-label/);
});
test('actual local MP4 videos include an audio track and two valid caption files',async()=>{
 for(const name of ['after-dark','daybreak']){
  const file=path.join(root,`assets/${name}.mp4`);
  assert.ok((await stat(file)).size>10000);
  const res=execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_type','-of','csv=p=0',file],{encoding:'utf8'});
  assert.match(res,/video/); assert.match(res,/audio/);
  const vtt=await read(`assets/${name}.vtt`);
  assert.match(vtt,/^WEBVTT/);
  assert.match(vtt,/00:00:01\.000 --> 00:00:04\.000/);
 }
});
test('responsive and reduced-motion support are present',async()=>{
 const css=await read('src/styles.css');
 assert.match(css,/@container \(max-width: 420px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@media\(forced-colors:active\)/);
 assert.match(css,/\.prism-mount:not\(\.is-ready\)/);
});
test('showcase film switcher changes media, with no unused page-theme or width controls',async()=>{
 const app=await read('src/app.js');
 const html=await read('index.html');
 assert.match(app,/document\.querySelectorAll\('\[data-film\]'\)\.forEach/);
 assert.match(app,/load\(btn\.dataset\.film\)/);
 assert.match(app,/if\(current\)current\.destroy\(\)/);
 assert.doesNotMatch(app,/documentElement\.dataset\.theme=selected|updateWidth|ambient-switch/);
 assert.doesNotMatch(html,/data-theme=|id="player-width"|id="ambient-switch"/);
 assert.match(html,/class="prism-demo-strip"/);
});

// Regression: an MP4 can contain hundreds of frames that are pixel-identical.
// Checking stream presence alone would have missed the original frozen-image demos.
test('both demo videos have REAL motion at different timestamps',async()=>{
 for(const name of ['after-dark','daybreak']){
  const file=path.join(root,`assets/${name}.mp4`);
  const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nk=1:nw=1',file],{encoding:'utf8'}).trim());
  assert.ok(duration>=17.9,`${name}: duration should be >=18 seconds`);
  const rawAt=seconds=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-ss',String(seconds),'-i',file,'-frames:v','1','-vf','scale=80:45','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{maxBuffer:1024*1024});
  const first=rawAt(1), second=rawAt(8);
  assert.equal(first.length,second.length);
  let diffs=0;
  for(let i=0;i<first.length;i++) if(Math.abs(first[i]-second[i])>12) diffs++;
  assert.ok(diffs>first.length*.04,`${name}: clip still appears frozen (changed channels: ${diffs}/${first.length})`);
 }
});

test('player controls use documented native v10 playback rate configuration', async()=>{
 const code=await read('src/prism-player.js');
 assert.match(code,/default-playback-rates="0\.5 0\.75 1 1\.25 1\.5 1\.75 2"/);
 assert.doesNotMatch(code,/rateGroup\.rates/);
 assert.match(code,/media-slider-preview class="prism-preview" overflow="clamp"/);
 assert.match(code,/thumb-alignment="edge"/);
});
test('player fails closed and offers a real retry when v10 modules do not register',async()=>{
 const code=await read('src/prism-player.js');
 const css=await read('src/styles.css');
 assert.match(code,/requiredTags\.map\(tag => customElements\.whenDefined\(tag\)\)/);
 assert.match(code,/retry\.addEventListener\('click', \(\) => location\.reload\(\)\)/);
 assert.match(code,/missing.length/);
 assert.match(css,/\.prism-mount:not\(\.is-ready\) media-controls-content/);
 assert.match(css,/\.prism-mount\.is-ready \.prism-loader/);
});
test('mobile keeps actual speed control accessible; only optional pip may hide',async()=>{
 const css=await read('src/styles.css');
 assert.doesNotMatch(css,/button\[commandfor\$="-rate"\]\{display:none\}/);
 assert.match(css,/\.prism-group-right \.prism-pip\{display:none\}/);
});

test('opt-in diagnostics observe real browser media events without faking controls',async()=>{
 const qa=await read('src/qa-panel.js');
 const app=await read('src/app.js');
 assert.match(app,/query\.get\('qa'\)===\'1\'/);
 assert.match(app,/qa\?\.setMedia\(current\.media,current\.player,mount\)/);
 for(const event of ['play','pause','seeked','volumechange','ratechange','enterpictureinpicture','fullscreenchange']) assert.ok(qa.includes(`'${event}'`));
 // A download link may call click(); diagnostics must never drive media controls.
 assert.doesNotMatch(qa, /(?:media|player)\.(?:click|play|pause)\(/);
});
