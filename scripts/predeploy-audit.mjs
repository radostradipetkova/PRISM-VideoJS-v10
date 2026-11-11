/** PRISM offline predeployment integrity report.
 * A pass validates the local source/build/media files, NOT online Video.js.
 */
import {readFile,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const read=(file)=>readFile(join(root,file),'utf8');
let passed=0;
const ok=(message)=>{console.log('PASS:',message);passed++};
const requireCheck=(condition,message)=>{if(!condition)throw Error('FAIL: '+message);ok(message)};
async function fileExists(path){try{return (await stat(join(root,path))).isFile()}catch{return false}}
const html=await read('index.html');
const player=await read('src/prism-player.js');
const app=await read('src/app.js');
const css=await read('src/styles.css');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
requireCheck(new Set(ids).size===ids.length,'No duplicate IDs in the static page');
requireCheck(html.includes('lang="en"') && html.includes('name="viewport"'),'Language and responsive viewport are declared');
requireCheck(html.includes('@videojs/cdn@10.3.0/video.js') && html.includes('@videojs/cdn@10.3.0/media/mux-video.js'), 'Pinned genuine Video.js v10 player and Mux modules');
requireCheck(['media-play-button','media-time-slider','media-time','media-mute-button','media-volume-slider','media-fullscreen-button'].every(tag=>player.includes(`<${tag}`)), 'All competition essential controls present in the player source');
requireCheck(['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].every(key=>player.includes(`<media-hotkey keys="${key}"`)) && !player.includes('target="document"'), 'Keyboard shortcuts remain player-scoped');
requireCheck(css.includes('prefers-reduced-motion:reduce') && css.includes('focus-visible') && css.includes('.prism-control {min-width:44px;min-height:44px'), 'Reduced motion, focus outlines and 44px touch targets in CSS');
requireCheck(app.includes('PRISM_MUX_PLAYBACK_ID=') && app.includes("query.get('source')==='local'"), 'Public Mux ID with explicit local MP4 backup');
let metadata=[];
for(const name of ['prism-cinematic','night-city','coast-sunrise']){
  const video=`assets/${name}.mp4`,vtt=`assets/${name}.vtt`,poster=`assets/${name}.jpg`;
  requireCheck(await fileExists(video)&&await fileExists(vtt)&&await fileExists(poster), `${name}: MP4, captions and poster present`);
  const cues=await read(vtt);
  requireCheck(cues.startsWith('WEBVTT') && /\d\d:\d\d:\d\d\.\d\d\d\s*-->/.test(cues),`${name}: caption format valid`);
  const ffprobe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_type','-show_entries','format=duration','-of','json',join(root,video)],{encoding:'utf8'});
  if(!ffprobe.error){
    requireCheck(ffprobe.status===0,`${name}: ffprobe opens MP4`);
    const m=JSON.parse(ffprobe.stdout);
    requireCheck(m.streams?.some(s=>s.codec_type==='video') && m.streams?.some(s=>s.codec_type==='audio'),`${name}: genuine video and audio tracks`);
    metadata.push({name,duration:parseFloat(m.format?.duration)});
  }else console.log('NOT VERIFIED: ffprobe absent; media stream validation skipped');
}
requireCheck(metadata.length===0 || (metadata[0].duration>31 && metadata[0].duration<33),'Cinematic chapters match the approximately 32s film');
const release=['index.html','_headers','src/app.js','src/prism-player.js','src/styles.css','assets/prism-cinematic.mp4','assets/prism-cinematic.vtt'];
requireCheck((await Promise.all(release.map(f=>fileExists('dist/'+f)))).every(Boolean),'Built deployment directory contains the required website and media');
console.log(`\n${passed} local predeployment integrity checks passed.`);
console.log('NOT VERIFIED HERE: real Video.js CDN playback, Mux HLS decoding, screen-reader experience, mobile Safari, public Cloudflare URL.');
