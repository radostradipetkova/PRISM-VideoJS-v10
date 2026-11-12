import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{normalizeMuxChapters} from '../worker/index.js';
import {readFileSync} from 'node:fs';

test('Mux chapter bridge maps and sorts AI-attached chapter tracks safely',()=>{
  const rows=normalizeMuxChapters([
    {chapter:2,'start-time':120,titles:[{language:'en',title:'Second scene'}]},
    {chapter:1,'start-time':0,titles:[{language:'en',title:'Opening'}]},
    {chapter:3,'start-time':120,titles:[{language:'en',title:'Duplicate'}]},
    {chapter:4,'start-time':-4,titles:[{language:'en',title:'Invalid'}]}
  ]);
  assert.deepEqual(rows,[{time:0,title:'Opening'},{time:120,title:'Second scene'}]);
});

test('Mux chapter API rejects invalid IDs and never starts paid AI jobs',async()=>{
  const bad=await worker.fetch(new Request('https://prism.test/api/mux/chapters?playback_id=../etc'),{});
  assert.equal(bad.status,400);
  const missing=await worker.fetch(new Request('https://prism.test/api/mux/chapters?playback_id=ABCDE12345'),{});
  assert.equal(missing.status,200);
  const body=await missing.json();
  assert.equal(body.source,'not-configured');
  assert.deepEqual(body.chapters,[]);
  const notfound=await worker.fetch(new Request('https://prism.test/api/does-not-exist'),{});
  assert.equal(notfound.status,404);
});

test('Mux bridge preserves static Cloudflare asset serving and scopes API routing',async()=>{
  const url='https://prism.test/examples/reusable.html';
  const response=await worker.fetch(new Request(url),{ASSETS:{fetch:request=>new Response(request.url)}});
  assert.equal(await response.text(),url);
  const config=readFileSync(new URL('../wrangler.toml',import.meta.url),'utf8');
  assert.ok(config.includes('name = "prism-opticaldeck"'));
  assert.ok(config.includes('main = "./worker/index.js"'));
  assert.ok(config.includes('run_worker_first = ["/api/*"]'));
  for(const file of ['src/optical-touch.js','skin/optical-touch.js']){
    const content=readFileSync(new URL('../'+file,import.meta.url),'utf8');
    assert.ok(content.includes("new URL('/api/mux/chapters',location.origin)"));
    assert.ok(content.includes('const remote=normalizeChapters(body?.chapters)'));
    assert.ok(content.includes('muxChapters=remote'));
    assert.ok(content.includes('refreshIndex()'));
  }
});

test('Mux bridge exposes verified duration for pre-metadata Optical Index',()=>{
 const code=readFileSync(new URL('../worker/index.js',import.meta.url),'utf8');
 assert.match(code,/const assetDuration=Number\(asset\?\.duration\)/);
 assert.match(code,/chapters:\[\],duration,source:'awaiting-chapters'/);
 assert.match(code,/chapters,duration,source:'mux-chapter-track'/);
});
test('Optical Index stays available and switches from time markers to Mux chapters',()=>{
 for(const file of ['src/optical-touch.js','skin/optical-touch.js']){
  const code=readFileSync(new URL('../'+file,import.meta.url),'utf8');
  assert.match(code,/launch\.hidden=chapterMode==='none'/);
  assert.match(code,/checkMuxChapterTrack/);
  assert.match(code,/muxDuration=verifiedDuration/);
  assert.match(code,/muxChapters=remote/);
  assert.match(code,/clearTimeout\(muxChapterTimer\)/);
  assert.match(code,/AI CHAPTERS PROCESSING/);
 }
});