import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async name=>readFile(new URL('../'+name,import.meta.url),'utf8');
test('editorial type effects have a no-JS fallback, reduced-motion and forced-colors support',async()=>{
  const css=await read('src/styles.css');
  const js=await read('src/text-motion.js');
  assert.match(css,/:root\.type-motion-enabled/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/@media\(forced-colors:active\)/);
  assert.match(js,/IntersectionObserver/);
  assert.match(js,/getElementById|manualMinimal/);
  assert.match(js,/aria-label/);
  assert.doesNotMatch(js,/setInterval\(|scroll',/);
});
test('showcase type animation never replaces media on toggling motion settings', async()=>{
  const code=await read('src/app.js');
  assert.match(code,/initTypeMotion\(\)/);
  assert.match(code,/textMotion\.setMinimal\(event\.detail\.effective\.motion\)/);
  assert.match(code,/mount\.addEventListener\('prism:preferenceschange'/);
});
test('cinematic glyph reveal keeps source text intact and animated clone aria-hidden',async()=>{
  const js=await read('src/text-motion.js');
  const css=await read('src/styles.css');
  assert.match(js,/createRange\(/);
  assert.match(js,/setStart\(item\.node,item\.start\)/);
  assert.match(js,/className='type-source'/);
  assert.match(js,/className='type-overlay'/);
  assert.match(js,/overlay\.setAttribute\('aria-hidden','true'\)/);
  assert.match(js,/const stagger=hero\?47:quote\?23:small\?31:40/);
  assert.match(css,/@keyframes prism-letter-materialize/);
  assert.match(css,/blur\(6px\)/);
  assert.match(css,/translate3d\(0,15px,0\)/);
  assert.match(css,/cubic-bezier\(\.22,1,\.36,1\)/);
  assert.match(css,/@keyframes prism-underline-draw/);
});
test('first-paint animation gate has a safe fallback without touching player code',async()=>{
  const html=await read('index.html');
  const code=await read('src/text-motion.js');
  assert.match(html,/classList\.add\('type-booting'\)/);
  assert.match(html,/classList\.remove\('type-booting'\)/);
  assert.match(code,/doc\.classList\.remove\('type-booting'\)/);
  assert.doesNotMatch(code,/media\.play|currentTime|media-player|src\/prism-player/);
});
