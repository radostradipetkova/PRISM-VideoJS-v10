import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('optional media is announced by build manifest, never probed as missing media',()=>{
 const app=read('src/app.js'),build=read('scripts/build.mjs');
 assert.match(app,/fetch\('\.\/assets\/prism-media-manifest\.json'/);
 assert.doesNotMatch(app,/method:'HEAD'/);
 assert.match(build,/writeFile\(path\.join\(dst,'assets','prism-media-manifest\.json'\)/);
 const defaults=JSON.parse(read('assets/prism-media-manifest.json'));
 assert.equal(defaults.fullFilmStoryboard,false);
 assert.equal(defaults.liveActionExcerpt,false);
});
test('poster is not preloaded separately from its actual Video.js request',()=>{
 const html=read('index.html');
 assert.doesNotMatch(html,/rel="preload" as="image" href="\.\/assets\/prism-cinematic\.jpg"/);
 assert.match(html,/rel="preconnect" href="https:\/\/cdn\.jsdelivr\.net"/);
});
test('mobile player reserves its footprint before chapter navigation',()=>{
 const css=read('src/styles.css');
 assert.match(css,/@media \(max-width:600px\)\{\s*\.player-size-stage\{\s*min-height:calc/);
 assert.match(css,/\.player-wrap\{\s*min-height:calc/);
});
test('previously flagged editorial labels have accessible opaque colors',()=>{
 const css=read('src/styles.css');
 for(const fragment of ['.prism-demo-label{color:#983e28}', '.prism-demo-hint{color:#4a4942}',
 '.feature-card-head span:last-child{opacity:1}', '.aperture-card .aperture-demo-state,',
 '.access-card .access-demo-instruction{color:#28231f}'])
 assert.ok(css.includes(fragment),fragment);
});
