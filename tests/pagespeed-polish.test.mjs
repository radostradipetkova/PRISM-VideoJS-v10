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

test('critical Video.js global styles are inline without a blocking stylesheet request',()=>{
 const html=read('index.html');
 assert.doesNotMatch(html,/<link rel="stylesheet" href="https:\/\/cdn\.jsdelivr\.net\/npm\/@videojs\/cdn@10\.3\.0\/global\.css">/);
 assert.match(html,/<style>@property --media-slider-fill/);
 assert.match(html,/media-container video::\-webkit-media-text-track-container/);
 assert.match(html,/media-dialog,media-alert-dialog,media-error-dialog,media-controls/);
});

test('minification runs only for deployable CSS and touch ESM, not the authored sources',()=>{
 const build=read('scripts/build.mjs');
 const pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.devDependencies.esbuild,'0.28.2');
 assert.match(build,/import \{transform\} from 'esbuild'/);
 assert.match(build,/\['src\/styles\.css','css',\{\}\]/);
 assert.match(build,/\['src\/optical-touch\.js','js',\{format:'esm',target:'es2020'\}\]/);
 assert.match(build,/const file=path\.join\(dst,name\)/);
 assert.match(build,/minify:true/);
});
