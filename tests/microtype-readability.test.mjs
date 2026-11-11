import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for(const file of ['src/styles.css','skin/prism-skin.css']){
 const css=readFileSync(new URL('../'+file,import.meta.url),'utf8');
 test(file+' improves text accessibility without altering active video controls',()=>{
   assert.match(css,/PRISM 2\.6 — LEGIBLE MICROTYPE/);
   assert.match(css,/\.prism-skin \.prism-rail-meta\{font-size:12px/);
   assert.match(css,/\.prism-skin \.prism-preferences-choices button\{font-size:12px/);
   assert.match(css,/\.prism-skin \.prism-caption-appearance \.prism-preferences-choices button\{font-size:11px/);
   assert.match(css,/\.prism-skin \.prism-optical-loupe \.prism-preview-index\{font-size:11px/);
   assert.match(css,/\.prism-skin \.prism-loupe-footer\{font-size:9px/);
   assert.match(css,/@container \(max-width:420px\)/);
   assert.match(css,/\.prism-skin \.prism-loupe-footer\{font-size:8px\}/);
   assert.match(css,/color:#805039/);
 });
}
