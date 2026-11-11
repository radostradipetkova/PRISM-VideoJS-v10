import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=p=>readFile(new URL(p,root),'utf8');

test('isolated PRISM stylesheet exposes all eight documented Video.js theme variables',async()=>{
 const css=await read('skin/prism-skin.css');
 for(const name of ['--media-accent-color','--media-accent-text-color','--media-border-color','--media-border-radius','--media-font-family','--media-object-fit','--media-object-position','--media-scale-unit']) assert.ok(css.includes(name),name);
 assert.match(css,/\.prism-skin\s*\{/);
 assert.match(css,/object-fit:\s*var\(--prism-video-fit,\s*var\(--media-object-fit,\s*contain\)\)/);
 assert.match(css,/mux-video::part\(video\)/);
 assert.match(css,/min-width:\s*max\(44px/);
});
test('CSS is independent of the showcase global resets',async()=>{
 const css=await read('skin/prism-skin.css');
 for(const p of [/\bbody\s*\{/i, /\bhtml\s*\{/i, /(?:^|\n)\s*:root\s*\{/im, /(?:^|\n)\s*\.hero\s*\{/im, /(?:^|\n)\s*\.site-header\s*\{/im]) assert.equal(p.test(css),false,`global selector ${p}`);
 assert.equal(css.includes('.player-size-stage{'),false);
});
test('standalone mounting requires explicit media and does not fetch showcase defaults',async()=>{
 const src=await read('skin/prism-player.js');
 assert.match(src,/requires src or muxPlaybackId/);
 assert.match(src,/target\.classList\.add\('prism-mount'\)/);
 assert.doesNotMatch(src,/src='\.\/assets\/prism-cinematic\.mp4'/);
 assert.match(src,/chaptersVtt/);
 assert.match(src,/captionLabel/);
});
test('isolated public entry and Video.js CDN registration are available',async()=>{
 assert.match(await read('skin/index.js'),/mountPrismPlayer/);
 const loader=await read('skin/register-videojs.js');
 assert.match(loader,/@videojs\/cdn@10\.3\.0/);
 assert.match(loader,/ui\/slider-thumbnail.js/);
 assert.match(loader,/media\/mux-video.js/);
 assert.match(await read('examples/reusable.html'),/two independent/i);
});
test('portable skin bundle includes license and standalone installation guide',async()=>{
 assert.match(await read('skin/LICENSE'),/Apache License/);
 assert.match(await read('skin/README.md'),/--media-accent-color/);
 for(const p of ['skin/fullscreen-orientation.js','skin/optical-touch.js','skin/chapter-index.js','examples/media/narrator-alt-portrait.mp4']) await stat(new URL(p,root));
});
