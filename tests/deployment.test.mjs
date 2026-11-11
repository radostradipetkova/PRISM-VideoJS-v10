import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=f=>readFile(path.join(root,f),'utf8');
test('Cloudflare launch includes a root index and safe headers',async()=>{
 const data=await read('_headers');
 assert.match(data,/X-Content-Type-Options:\s*nosniff/);
 assert.match(data,/Referrer-Policy:/);
 assert.match(data,/Cache-Control:/);
 assert.ok((await stat(path.join(root,'index.html'))).isFile());
 const build=await read('scripts/build.mjs');
 assert.match(build,/'_headers'/);
});
test('public verifier tests ranged MP4 delivery without claiming Video.js controls pass',async()=>{
 const code=await read('scripts/verify-public.mjs');
 assert.match(code,/'Range':\s*'bytes=0-1023'/);
 assert.match(code,/prism-cinematic\.mp4/);
 assert.match(code,/captions/);
 assert.match(code,/NOT TESTED: Video\.js CDN loading/);
 assert.ok((await stat(path.join(root,'VERIFY-PRISM-LIVE.bat'))).isFile());
});
