/** PRISM public-release HTTP preflight — does not execute Video.js in a browser. */
const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/verify-public.mjs https://your-prism.pages.dev/');
  process.exit(2);
}
let site;
try { site = new URL(input); }
catch { console.error('Not a valid URL.'); process.exit(2); }
if (!['https:','http:'].includes(site.protocol) || (site.protocol === 'http:' && !['localhost','127.0.0.1','[::1]'].includes(site.hostname))) {
  console.error('Use an HTTPS public URL, or http://localhost for local testing.');
  process.exit(2);
}
site.pathname='/';site.search='';site.hash='';
const base=site.href;
const results=[];
async function fetchCheck(path,{range=false,expect='',bodyContains=null,contentType=''}={}) {
  const url=new URL(path,base);
  const opts={signal:AbortSignal.timeout(12000),headers:range?{'Range':'bytes=0-1023'}:{}};
  try {
    const res=await fetch(url,opts);
    const okStatus=range?[200,206].includes(res.status):res.status===200;
    const mime=res.headers.get('content-type')||'';
    const statusRange=range&&res.status!==206?' (range not honoured; seeking needs manual verification)':'';
    let contentOk=true;
    if(bodyContains!==null) {const text=await res.text();contentOk=text.includes(bodyContains)}
    else await res.body?.cancel();
    const passed=okStatus && contentOk && (!contentType || mime.includes(contentType));
    results.push({name:expect||path,passed,details:`HTTP ${res.status}, ${mime||'missing MIME'}${statusRange}${!contentOk?' (expected content missing)':''}`});
    console.log(`${passed?'PASS':'FAIL'}  ${expect||path} — ${results.at(-1).details}`);
  } catch(err) {
    const detail=String(err?.message||err);
    results.push({name:expect||path,passed:false,details:detail});
    console.log(`FAIL  ${expect||path} — ${detail}`);
  }
}
console.log(`PRISM public preflight: ${base}`);
await fetchCheck('/',{expect:'Landing page',bodyContains:'PRISM',contentType:'text/html'});
await fetchCheck('/?qa=1',{expect:'Diagnostics entry',bodyContains:'PRISM',contentType:'text/html'});
await fetchCheck('/src/app.js',{expect:'App runtime',bodyContains:'mountPrismPlayer',contentType:'javascript'});
await fetchCheck('/src/prism-player.js',{expect:'Video.js skin source',bodyContains:'VIDEOJS_VERSION',contentType:'javascript'});
await fetchCheck('/src/styles.css',{expect:'Skin stylesheet',bodyContains:'prism-',contentType:'text/css'});
await fetchCheck('/assets/prism-cinematic.vtt',{expect:'English captions',bodyContains:'WEBVTT',contentType:'text/vtt'});
await fetchCheck('/assets/prism-cinematic.jpg',{expect:'Poster artwork',contentType:'image/jpeg'});
for(const file of ['prism-cinematic.mp4','night-city.mp4','coast-sunrise.mp4']) {
 await fetchCheck(`/assets/${file}`,{expect:`MP4 HTTP delivery: ${file}`,range:true,contentType:'video/mp4'});
}
// Mux streaming is a separate CDN from the Cloudflare-hosted static files.
// The test checks the public HLS manifest, not actual decoded playback.
const muxPlaybackId='i4NN2nQSVFk5TDkOtoLIfUUt2e6h5ah02j9ebYxzXxDM';
if (process.argv.includes('--skip-mux')) {
 console.log('SKIP  Public Mux HLS master playlist — explicit offline/static check');
} else try {
 const muxURL=`https://stream.mux.com/${muxPlaybackId}.m3u8`;
 const res=await fetch(muxURL,{signal:AbortSignal.timeout(15000)});
 const body=res.ok?await res.text():'';
 const passed=res.status===200 && body.startsWith('#EXTM3U') && body.includes('#EXT-X-STREAM-INF');
 results.push({name:'Public Mux HLS master playlist',passed,details:`HTTP ${res.status}, ${res.headers.get('content-type')||'unknown MIME'}`});
 console.log(`${passed?'PASS':'FAIL'}  Public Mux HLS master playlist — ${results.at(-1).details}`);
} catch (err) {
 results.push({name:'Public Mux HLS master playlist',passed:false,details:String(err?.message||err)});
 console.log(`FAIL  Public Mux HLS master playlist — ${results.at(-1).details}`);
}
const failures=results.filter(x=>!x.passed);
console.log(`\nHTTP preflight: ${results.length-failures.length}/${results.length} passed.`);
console.log('NOT TESTED: Video.js CDN loading, play/pause, dragging, captions menu, playback speed, PiP, fullscreen, mobile, screen readers. Open the public /?qa=1 URL in Chrome to verify those manually.');
if(failures.length) process.exitCode=1;
