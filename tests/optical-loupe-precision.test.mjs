import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loupeChapterContext,chapterJumpTarget,DEFAULT_CHAPTERS} from '../src/optical-touch.js';
const content=(relative)=>readFileSync(new URL(`../${relative}`,import.meta.url),'utf8');

test('precision Loupe reads real chapter-relative position and upcoming boundary',()=>{
  assert.deepEqual(loupeChapterContext(DEFAULT_CHAPTERS,12,32),{
    index:1,count:4,progress:.5,next:16
  });
  assert.deepEqual(loupeChapterContext(DEFAULT_CHAPTERS,24,32),{
    index:3,count:4,progress:0,next:null
  });
  assert.deepEqual(loupeChapterContext(DEFAULT_CHAPTERS,31.9,32),{
    index:3,count:4,progress:.9874999999999998,next:null
  });
});

test('Loupe degrades honestly when there are no actual chapters',()=>{
  assert.deepEqual(loupeChapterContext([],8,32),{index:-1,count:0,progress:.25,next:null});
  assert.equal(loupeChapterContext([],8,NaN),null);
  assert.equal(loupeChapterContext([],8,0),null);
});

test('chapter shortcut navigates authored boundaries without hijacking ordinary arrows',()=>{
  assert.equal(chapterJumpTarget(DEFAULT_CHAPTERS,12,1,32),16);
  assert.equal(chapterJumpTarget(DEFAULT_CHAPTERS,12,-1,32),8);
  assert.equal(chapterJumpTarget(DEFAULT_CHAPTERS,8,-1,32),0);
  assert.equal(chapterJumpTarget(DEFAULT_CHAPTERS,31,1,32),null);
  assert.equal(chapterJumpTarget([],12,1,32),null);
  assert.equal(chapterJumpTarget(DEFAULT_CHAPTERS,12,1,NaN),null);
  assert.equal(chapterJumpTarget(DEFAULT_CHAPTERS,12,0,32),null);
});

test('showcase and portable skin expose identical Loupe markup and navigation features',()=>{
  const showcase=content('src/prism-player.js');
  const standalone=content('skin/prism-player.js');
  for(const markup of [showcase,standalone]){
    for(const selector of ['prism-loupe-scan-label','prism-loupe-reticle','prism-loupe-ruler','prism-loupe-position','prism-loupe-status','prism-loupe-next']){
      assert.ok(markup.includes(selector),`missing Loupe feature ${selector}`);
    }
    assert.match(markup,/<media-slider-thumbnail/);
    assert.match(markup,/<media-time-slider/);
  }
  assert.equal(content('src/optical-touch.js'),content('skin/optical-touch.js'));
  const css=content('src/styles.css');
  assert.match(css,/prism-loupe-ruler-fill/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/@media\(forced-colors:active\)/);
  assert.match(content('src/optical-touch.js'),/on\(rail,'keydown',[\s\S]*?shiftKey/);
});
