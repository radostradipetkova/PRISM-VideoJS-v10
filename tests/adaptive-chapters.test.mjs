import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeChapters, chaptersFromTextTracks, timeMarkers, resolveIndex,
  indexLayout, parseChapterVTT, formatIndexTime, transcriptMarkers} from '../src/chapter-index.js';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const mk=n=>Array.from({length:n},(_,i)=>({time:i*90,title:`Chapter ${i+1}`}));

test('WebVTT chapter cues parse with named scenes and no imaginary chapters',()=>{
  const chapters=parseChapterVTT(read('assets/prism-cinematic-chapters.vtt'));
  assert.deepEqual(chapters,[{time:0,title:'NIGHT CITY'},{time:8,title:'SUNRISE'},{time:16,title:'LIQUID'},{time:24,title:'GOLDEN HOUR'}]);
  assert.deepEqual(parseChapterVTT('not WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nFake'),[]);
  assert.deepEqual(parseChapterVTT('WEBVTT\n\nNOTE Ignore this\n\nscene-id\n01:00:00.000 --> 01:20:00.000 align:start\nLong Scene'),[{time:3600,title:'Long Scene'}]);
});
test('native text tracks expose chapter cues without reading caption cues',()=>{
  const track={kind:'chapters',cues:[{startTime:0,text:'Opening'},{startTime:60,text:'Middle'}]};
  const media={textTracks:[{kind:'captions',cues:[{startTime:0,text:'Caption text'}]},track]};
  assert.deepEqual(chaptersFromTextTracks(media),[{time:0,title:'Opening'},{time:60,title:'Middle'}]);
});
test('chapter normalization sorts, deduplicates and excludes invalid/out-of-range cues',()=>{
  const raw=[{time:75,title:' B '},{time:0,title:'A'},{time:75,title:'Dup'},{time:150,title:'Outside'},{time:-1,title:'Negative'},{time:30,title:''}];
  assert.deepEqual(normalizeChapters(raw,100),[{time:0,title:'A'},{time:75,title:'B'}]);
});
test('authored chapters win, including twenty chapters; there is no 12-chapter cap',()=>{
  const authored=mk(20);
  const result=resolveIndex({configured:authored,duration:3000,mode:'time'});
  assert.equal(result.entries.length,20);
  assert.deepEqual(result.entries[18],{time:1620,title:'Chapter 19'});
  assert.equal(result.type,'chapters');
  assert.equal(indexLayout(result.entries.length),'library');
});
test('tracks are used automatically and creator config takes precedence',()=>{
  const tracked=mk(8);
  assert.equal(resolveIndex({tracked,duration:1800,mode:'auto'}).entries.length,8);
  assert.deepEqual(resolveIndex({configured:[{time:2,title:'Direct'}],tracked,duration:1800}).entries,[{time:2,title:'Direct'}]);
});
test('default auto hides absent metadata; explicit none opts out even with chapters',()=>{
  assert.deepEqual(resolveIndex({duration:1800,mode:'auto'}),{entries:[],type:'none'});
  assert.deepEqual(resolveIndex({configured:mk(4),duration:1800,mode:'none'}),{entries:[],type:'none'});
  assert.equal(resolveIndex({duration:Infinity,mode:'time'}).entries.length,0);
});
test('explicit time mode generates real times, never labels invented scenes',()=>{
  const r=resolveIndex({duration:7200,mode:'time'});
  assert.equal(r.type,'time');assert.equal(r.entries.length,12);
  assert.deepEqual(r.entries[1],{time:600,title:'10:00'});
  assert.equal(r.entries.at(-1).time,6600);
  assert.equal(timeMarkers(32).length,4);
  assert.equal(formatIndexTime(3661),'01:01:01');
});
test('adaptive layouts preserve radial for two-four and scrollable variants for many chapters',()=>{
  assert.equal(indexLayout(2),'radial');assert.equal(indexLayout(4),'radial');
  assert.equal(indexLayout(5),'list');assert.equal(indexLayout(12),'list');
  assert.equal(indexLayout(13),'library');assert.equal(indexLayout(80),'library');
  const css=read('src/styles.css');
  assert.match(css,/data-index-layout="library"/);
  assert.match(css,/max-height:min\(49dvh,420px\)/);
  assert.match(css,/\.prism-index-search/);
});
test('integration reads chapter tracks and renders navigation dynamically with textContent',()=>{
  const player=read('src/prism-player.js');
  const touch=read('src/optical-touch.js');
  assert.match(player,/kind="chapters"/);
  assert.match(player,/chaptersVtt/);
  assert.match(touch,/refreshIndex\(\)/);
  assert.match(touch,/fetch\(new URL\(address,document.baseURI\)/);
  assert.match(touch,/button\.dataset\.prismChapter/);
  assert.match(touch,/button\.append\(number,title,time\)/);
  assert.doesNotMatch(player,/\.slice\(0,\s*12\)/);
  assert.doesNotMatch(player,/32\.01\*100/);
});

test('chapter boundaries before a late first chapter do not mark it active',async()=>{
  const {chapterAtTime}=await import('../src/optical-touch.js');
  const chapters=[{time:30,title:'Actual first chapter'},{time:60,title:'Next'}];
  assert.equal(chapterAtTime(chapters,0),-1);
  assert.equal(chapterAtTime(chapters,29),-1);
  assert.equal(chapterAtTime(chapters,30),0);
  assert.equal(chapterAtTime(chapters,75),1);
});

test('smart index provides working navigation for arbitrary Mux video durations',()=>{
 const r=resolveIndex({duration:540,mode:'smart'});
 assert.equal(r.type,'time');
 assert.equal(r.entries.length,6);
 assert.equal(r.entries[0].time,0);
 assert.equal(r.entries[4].time,360);
 assert.equal(resolveIndex({duration:540,mode:'none'}).type,'none');
});
test('smart index prefers caption-derived dialogue beats and never replaces authored chapters',()=>{
 const cues=[
  {time:10,title:'First conversation'},
  {time:38,title:'The signal goes out'},
  {time:92,title:'A breakthrough'},
  {time:128,title:'Preparing a response'},
  {time:176,title:'The surprise'},
  {time:221,title:'A second plan'},
  {time:258,title:'Confrontation'},
  {time:307,title:'A resolution'}
 ];
 const derived=transcriptMarkers(cues,360);
 assert.ok(derived.length>=3);
 assert.equal(derived[0].time,0);
 const r=resolveIndex({duration:360,derived,mode:'smart'});
 assert.equal(r.type,'transcript');
 assert.deepEqual(r.entries,derived);
 const explicit=resolveIndex({configured:[{time:0,title:'Director cut'},{time:120,title:'Final'}],derived,mode:'smart',duration:360});
 assert.equal(explicit.type,'chapters');
 assert.equal(explicit.entries.length,2);
});
