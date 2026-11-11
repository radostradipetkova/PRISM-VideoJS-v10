import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prismChaptersDirective,prismUploadConfig} from '../scripts/mux-auto-chapters.mjs';

test('Mux AI directive analyzes visual structure and writes a real chapter track',()=>{
 const directive=prismChaptersDirective();
 assert.equal(directive.subject.type,'video.asset');
 assert.deepEqual(directive.resources,[]);
 assert.equal(directive.bindings[0].workflow,'analyze-structure');
 assert.equal(directive.bindings[0].parameters.update_asset_chapters,true);
 assert.equal(directive.bindings[0].parameters.output_steering.granularity,'balanced');
});
test('Mux Direct Upload attaches the chosen directive but has no public AI trigger',()=>{
 const upload=prismUploadConfig('drv_ABC123','https://prism.example');
 assert.deepEqual(upload.new_asset_settings.directives,[{id:'drv_ABC123'}]);
 assert.deepEqual(upload.new_asset_settings.playback_policies,['public']);
 assert.equal(upload.cors_origin,'https://prism.example');
 assert.throws(()=>prismUploadConfig('../secret','https://prism.example'));
 assert.throws(()=>prismUploadConfig('drv_ABC123','http://untrusted.example'));
 const worker=readFileSync(new URL('../worker/index.js',import.meta.url),'utf8');
 assert.doesNotMatch(worker,/\/robots\/v1\/jobs\/generate-chapters/);
 assert.match(worker,/request.method!=='GET'/);
});
test('Explore is not hidden when metadata is still loading',()=>{
 const sources=['src/optical-touch.js','skin/optical-touch.js'].map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'));
 assert.equal(sources[0],sources[1]);
 assert.match(sources[0],/launch.hidden=chapterMode==='none'/);
 assert.match(sources[0],/if\(!dialog \|\| dialog.open \|\| chapterMode==='none'\)return;/);
 assert.match(sources[0],/muxChapterAttempts<12/);
 assert.match(sources[0],/cache:'no-store'/);
});
