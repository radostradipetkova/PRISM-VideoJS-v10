import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Production build ships a genuine work portfolio',()=>{
  const build=read('scripts/build.mjs');
  assert.match(build,/'portfolio'/);
  const html=read('portfolio/index.html');
  assert.match(html,/<title>Selected Work — Radostina Petkova<\/title>/);
  assert.match(html,/id="portfolio-prism" class="prism-mount"/);
  assert.match(html,/href="\.\.\/skin\/prism-skin\.css"/);
  assert.match(html,/src="\.\/work\.js"/);
  assert.match(html,/href="https:\/\/case-404\.radostradi-pogo\.workers\.dev\//);
  assert.match(html,/href="https:\/\/bookly\.radostradi-pogo\.workers\.dev\//);
  assert.match(html,/href="https:\/\/whiskers-and-wag\.radostradi-pogo\.workers\.dev\//);
  assert.match(html,/rel="noopener noreferrer"/);
  assert.match(html,/class="skip-link" href="#main"/);
});

test('Portfolio embeds the actual reusable Video.js v10 PRISM player (not an iframe)',()=>{
  const js=read('portfolio/work.js');
  const html=read('portfolio/index.html');
  assert.match(js,/import \{registerVideoJS\} from '\.\.\/skin\/register-videojs\.js'/);
  assert.match(js,/import \{mountPrismPlayer,parseMomentSeconds,restoreMomentToMedia\} from '\.\.\/skin\/index\.js'/);
  assert.match(js,/await registerVideoJS\(\)/);
  assert.match(js,/instance=mountPrismPlayer\(mount,/);
  assert.match(js,/src:'\.\.\/assets\/prism-cinematic\.mp4'/);
  assert.match(js,/captions:'\.\.\/assets\/prism-cinematic\.vtt'/);
  assert.match(js,/chaptersVtt:'\.\.\/assets\/prism-cinematic-chapters\.vtt'/);
  assert.match(js,/storyboard:'\.\.\/assets\/prism-cinematic-storyboard\.vtt'/);
  assert.match(js,/restoreMomentToMedia\(instance\.media,seconds\)/);
  assert.doesNotMatch(html,/<iframe\b/i);
  assert.doesNotMatch(js,/\.\.\/src\/app\.js/);
});

test('Portfolio keeps working without JavaScript and respects accessibility preferences',()=>{
 const html=read('portfolio/index.html');
 const css=read('portfolio/work.css');
 assert.match(html,/<noscript>/);
 assert.match(html,/href="\.\.\/assets\/prism-cinematic\.mp4"/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(html,/role="status" aria-live="polite"/);
 assert.match(html,/link rel="stylesheet" href="https:\/\/cdn\.jsdelivr\.net\/npm\/@videojs\/cdn@10\.3\.0\/global\.css"/);
});
