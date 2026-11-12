import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
test('showcase has a practical JavaScript-disabled, poster-backed alternative',()=>{
 const html=read('index.html');
 assert.match(html,/<noscript>/);
 assert.match(html,/src="\.\/assets\/prism-cinematic\.jpg"/);
 assert.match(html,/href="\.\/assets\/prism-cinematic\.mp4"/);
 assert.match(html,/id="rail-demo-current"[^>]*>00:00<\/output>/);
 assert.match(html,/id="rail-demo-duration">—<\/span>/);
 assert.doesNotMatch(html,/>CONNECTING TO THE LIVE VIDEO</);
});
test('Anatomy shows truthful, accessible first-load states',()=>{
 const src=read('src/feature-demos.js');
 assert.match(src,/durationLabel\.textContent = duration \? shortTime\(duration\) : '—'/);
 assert.match(src,/PREPARING SEEKABLE TIMELINE/);
 assert.match(src,/slider\.setAttribute\('aria-valuetext'/);
 assert.match(src,/apertureButton\.setAttribute\('aria-label'/);
});
for(const file of ['src/styles.css','skin/prism-skin.css']){
 test(file+' has high-visibility focus and manual reduced-motion support',()=>{
  const css=read(file);
  assert.match(css,/PRISM 3\.1 \/ ACCESSIBILITY SIGN-OFF/);
  assert.match(css,/box-shadow:0 0 0 5px #101519/);
  assert.match(css,/outline:2px solid #fff9f0/);
  assert.match(css,/outline:3px solid Highlight/);
  assert.match(css,/\.prism-skin\.minimal-motion :is\(/);
  assert.match(css,/\.prism-iris-thumbnail/);
  assert.match(css,/\.prism-noscript/);
 });
}
test('README never advertises broken local links',()=>{
 const md=read('README.md');
 const links=[...md.matchAll(/\]\(\.\/([^#)]+)(?:#[^)]*)?\)/g)].map(match=>match[1]);
 assert.ok(links.length>0);
 for(const path of links) assert.ok(existsSync(new URL(path,root)), 'missing README target: '+path);
 for(const path of ['docs/ACCESSIBILITY-VERIFICATION.md','docs/RELEASE-VALIDATION.md','docs/MUX-STREAMING.md','docs/SUBMISSION-CHECKLIST.md'])assert.ok(md.includes(path));
});
test('reusable skin documents its own hover hints and manual MP4 quality API',()=>{
 const md=read('skin/README.md');
 assert.match(md,/control-hints\.js/);
 assert.match(md,/qualitySources/);
});

test('Worker deployment targets the public existing Worker, not the obsolete name',()=>{
 assert.match(read('wrangler.toml'),/name = "prism-opticaldeck"/);
 assert.match(read('PRISM-GITHUB-CLOUDFLARE-SETUP.md'),/GitHub Actions currently runs/);
 assert.match(read('PRISM-GITHUB-CLOUDFLARE-SETUP.md'),/does not publish the Cloudflare Worker/);
});
