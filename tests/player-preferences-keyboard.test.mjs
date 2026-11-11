import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Regression guard: all player preference switches must be keyboard usable
// across the showcase and the independently reusable skin.
test('Enter activates all preference checkboxes without replacing native Space or disabled behavior', async () => {
  for (const build of ['src', 'skin']) {
    const logic=await readFile(new URL(`../${build}/player-preferences.js`,import.meta.url),'utf8');
    assert.match(logic,/for\(const checkbox of \[motion,swipes,rotate,remember\]\)/,`${build}: all checkbox settings covered`);
    assert.match(logic,/if\(event\.key!=='Enter'\)return/,`${build}: only Enter is custom-handled`);
    assert.match(logic,/event\.preventDefault\(\)/,`${build}: prevent default Enter action`);
    assert.match(logic,/!event\.repeat && !checkbox\.disabled\)checkbox\.click\(\)/,`${build}: disabled and key repeats respected`);
    for (const name of ['motion','swipes','rotate','remember']) {
      assert.match(logic,new RegExp(`listen\\(${name},'change'`),`${build}: real change event remains the state source`);
    }
  }
});
