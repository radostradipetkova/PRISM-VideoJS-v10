import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const player=readFileSync(new URL('../src/prism-player.js',import.meta.url),'utf8');
const touch=readFileSync(new URL('../src/optical-touch.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');

test('Optical Index uses a named native dialog with associated instructions',()=>{
  assert.match(player,/<dialog class="prism-chapter-dialog" aria-label="Explore video navigation" aria-describedby="\$\{uid\}-index-help"/);
  assert.match(player,/<p id="\$\{uid\}-index-help" class="prism-chapter-dialog-help">/);
});
test('large chapter library has an accessible search and live result count',()=>{
  assert.match(player,/class="prism-index-result-count" role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(touch,/search\.focus\(\);/);
  assert.match(touch,/resultCount\.textContent/);
});
test('index search matches metadata fields separately, not concatenated DOM text',()=>{
  assert.match(touch,/entry\.title\.toLowerCase\(\)\.includes\(term\)/);
  assert.match(touch,/formatIndexTime\(entry\.time\)\.includes\(term\)/);
  assert.doesNotMatch(touch,/button\.textContent\.toLowerCase\(\)\.includes\(term\)/);
});
test('dialog Escape, focus return and visible focus are preserved',()=>{
  assert.match(touch,/dialog\.showModal\(\)/);
  assert.match(touch,/launch\.focus\(\{preventScroll:true\}\)/);
  assert.match(css,/\.prism-chapter-choice:focus-visible/);
});

test('caption language and label are configurable and safely escaped',()=>{
  assert.ok(player.includes("captionLabel='English / descriptive'"));
  assert.ok(player.includes("captionLang='en'"));
  assert.ok(player.includes('srclang="${escapeHTML(captionLang)}"'));
  assert.ok(player.includes('label="${escapeHTML(captionLabel)}"'));
});
