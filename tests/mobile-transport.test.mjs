import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for(const part of ['src/styles.css','skin/prism-skin.css']){
 const css=readFileSync(new URL('../'+part,import.meta.url),'utf8');
 test('mobile transport keeps primary controls visible and video unobstructed: '+part,()=>{
  assert.match(css,/PRISM 2\.7 — MOBILE TRANSPORT HIERARCHY/);
  assert.match(css,/@container \(max-width:600px\)/);
  assert.match(css,/\.prism-skin \.prism-control-row\{\s*display:flex;flex-direction:column/);
  assert.match(css,/\.prism-skin \.prism-play\{\s*min-width:50px;min-height:50px/);
  assert.match(css,/\.prism-skin \.prism-group-right :is\(\.prism-mute,\.prism-fullscreen\)/);
  assert.match(css,/@container \(max-width:600px\)/);
  assert.match(css,/height:calc\(56\.25cqw \+ 184px\)/);
  assert.match(css,/@container \(max-width:310px\)/);
  assert.match(css,/@container \(min-width:481px\) and \(max-width:600px\)/);
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(44px,1fr\)\)/);
 });
}
