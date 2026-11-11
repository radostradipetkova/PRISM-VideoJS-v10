import {mountPrismPlayer} from './prism-player.js';
import {initFeatureDemos} from './feature-demos.js';
import {initPlayerQA} from './qa-panel.js';
import {initTypeMotion} from './text-motion.js';
import {initKeyboardAid} from './keyboard-aid.js';
const films={
 'cinematic':{src:'./assets/prism-cinematic.mp4',poster:'./assets/prism-cinematic.jpg',captions:'./assets/prism-cinematic.vtt',title:'A Study in Motion',eyebrow:'PRISM / CINEMATIC SHOWCASE',chaptersVtt:'./assets/prism-cinematic-chapters.vtt',storyboard:'./assets/prism-cinematic-storyboard.vtt'},
 'night':{src:'./assets/night-city.mp4',poster:'./assets/night-city.jpg',captions:'./assets/night-city.vtt',title:'After Hours',eyebrow:'SCENE 01 / LOW LIGHT',chapters:[{time:0,title:'AFTER HOURS'}],storyboard:'./assets/night-city-storyboard.vtt'},
 'coast':{src:'./assets/coast-sunrise.mp4',poster:'./assets/coast-sunrise.jpg',captions:'./assets/coast-sunrise.vtt',title:'First Light',eyebrow:'SCENE 02 / HIGH LIGHT',chapters:[{time:0,title:'FIRST LIGHT'}],storyboard:'./assets/coast-sunrise-storyboard.vtt'},
 'liveaction':{captionsDefault:true,src:'https://video.blender.org/download/web-videos/8533ea43-4271-4a57-9694-e9d0b35e1aa1-720.mp4',poster:'./assets/tears-of-steel-fallback.svg',captions:'./assets/tears-of-steel-full.vtt',captionLabel:'English / original film',title:'Tears of Steel — Open Film',eyebrow:'OPEN FILM / REAL-WORLD FOOTAGE',chapters:[],chapterMode:'none',storyboard:null}
};
const mount=document.querySelector('#prism-mount');
// A real public open movie provides an immediate optional demo. Running
// `npm run prepare:film` upgrades it to the self-hosted 65-second excerpt,
// with exact captions and storyboard tiles for the Optical Loupe.
const filmCredit=document.querySelector('#prism-film-credit');
const filmCutStatus=document.querySelector('#prism-film-cut-status');
Promise.all([
 fetch('./assets/tears-of-steel-excerpt.mp4',{method:'HEAD',cache:'no-store'}),
 fetch('./assets/tears-of-steel-excerpt.vtt',{method:'HEAD',cache:'no-store'})
]).then(([response,subtitles])=>{
 if(response.ok && (response.headers.get('content-type')||'').toLowerCase().includes('video/') &&
    subtitles.ok && (subtitles.headers.get('content-type')||'').toLowerCase().includes('text/vtt')){
  films.liveaction={captionsDefault:true,src:'./assets/tears-of-steel-excerpt.mp4',poster:'./assets/tears-of-steel-poster.jpg',captions:'./assets/tears-of-steel-excerpt.vtt',captionLabel:'English / excerpt',title:'Tears of Steel — 65-second excerpt',eyebrow:'OPEN FILM / REAL-WORLD FOOTAGE',chaptersVtt:'./assets/tears-of-steel-chapters.vtt',storyboard:'./assets/tears-of-steel-storyboard.vtt'};
  if(filmCutStatus)filmCutStatus.textContent='OPEN FILM / 65-SECOND EDIT';
 }
}).catch(()=>{/* Stream the full open film if the optional local excerpt is absent. */});
const query=new URLSearchParams(location.search);
// Public Mux playback ID used for the primary four-chapter competition film.
// The optional ?mux=ID preview stays available; ?source=local uses the original MP4.
export const PRISM_MUX_PLAYBACK_ID='i4NN2nQSVFk5TDkOtoLIfUUt2e6h5ah02j9ebYxzXxDM';
const muxOverride=query.get('mux');
const muxId=muxOverride && /^[A-Za-z0-9]+$/.test(muxOverride) ? muxOverride : PRISM_MUX_PLAYBACK_ID;
let useLocalCinematic=query.get('source')==='local';
// Optical Index defaults to authored chapters; ?index=time opts into neutral
// duration-based markers, and ?index=none hides navigation altogether.
const indexMode=['auto','time','none'].includes(query.get('index'))?query.get('index'):'auto';
let current=null;
let currentFilm='cinematic';
let playerPreferences={};
const featureDemos=initFeatureDemos();
const textMotion=initTypeMotion();
mount.addEventListener('prism:preferenceschange',event=>{
 playerPreferences={...event.detail.overrides};
 textMotion.setMinimal(event.detail.effective.motion);
});
// Display an honest recovery route if the remote stream fails; never silently
// substitute local media while claiming Mux playback is working.
const runtimeNote=document.createElement('div');
runtimeNote.id='runtime-status';
runtimeNote.className='runtime-note';
runtimeNote.setAttribute('role','alert');
runtimeNote.hidden=true;
document.querySelector('#player-wrap').after(runtimeNote);
const qa=query.get('qa')==='1' ? initPlayerQA(document.querySelector('.player-region')) : null;
// Showcase-only Space shortcut works after clicking blank page content.
// Native Video.js v10 owns all shortcuts when the player itself is focused.
initKeyboardAid({mount,getPlayer:()=>current?.player,getMedia:()=>current?.media});
function load(film='cinematic'){
 if(!Object.hasOwn(films,film))return;
 currentFilm=film;
 const old=current?.media;
 const previousVolume=old && Number.isFinite(old.volume)?old.volume:1;
 const previousRate=old && Number.isFinite(old.playbackRate)?old.playbackRate:null;
 // Keep the current in-page preferences when changing films, even if the
 // user has just disabled persistence and the saved record was cleared.
 if(current)playerPreferences={...current.getPreferences()};
 if(current)current.destroy();
 const isMuxCinematic=film==='cinematic' && !useLocalCinematic;
 const foreignMux=isMuxCinematic && muxId!==PRISM_MUX_PLAYBACK_ID;
 // Four original scene buttons belong only to the 32-second reel.
 document.querySelector('.chapter-bar').hidden=film!=='cinematic'||foreignMux;
 if(filmCredit)filmCredit.hidden=film!=='liveaction';
 current=mountPrismPlayer(mount,{...films[film], chapterMode:indexMode, preferences:playerPreferences, playbackRate:previousRate,
   ...(foreignMux?{chapters:[],chaptersVtt:null}:{}),
   ...(isMuxCinematic?{muxPlaybackId:muxId}:{})});
 runtimeNote.hidden=true;
 runtimeNote.replaceChildren();
 featureDemos.setMedia(current.media);
 qa?.setMedia(current.media,current.player,mount);
 const activeMedia=current.media;
 try { activeMedia.volume=previousVolume; } catch(_) { /* device may own volume */ }
 activeMedia.addEventListener('error',()=>{
  if(current?.media!==activeMedia)return;
  runtimeNote.hidden=false;
  runtimeNote.textContent=isMuxCinematic
    ? 'The Mux stream could not play. Check your connection or use the original local film.'
    : 'This video could not be loaded. Please try a different film.';
  if(isMuxCinematic){
   const fallback=document.createElement('button');
   fallback.type='button';
   fallback.className='prism-retry';
   fallback.textContent='PLAY LOCAL BACKUP';
   fallback.addEventListener('click',()=>{useLocalCinematic=true;load('cinematic');attachChapterReadout();});
   runtimeNote.append(' ',fallback);
  }
 });
 document.querySelectorAll('[data-film]').forEach(button=>{
  const active=button.dataset.film===film;
  button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));
 });
 // Only changing the selected film remounts media; the player settings remain in the skin.
}
load();
document.querySelectorAll('[data-film]').forEach(btn=>btn.addEventListener('click',()=>load(btn.dataset.film)));
// These are real chapter seeks into the 32-second media, not separate visual simulations.
// They stay paused when the media was paused and respect the underlying media timeline.
const chapterButtons=[...document.querySelectorAll('[data-chapter]')];
function syncChapterButtons(){
  if(!current?.media)return;
  const t=Number(current.media.currentTime)||0;
  const chapter=Math.max(0,Math.min(3,Math.floor(t/8)));
  chapterButtons.forEach(b=>{
    const active=currentFilm==='cinematic'&&Number(b.dataset.chapter)===chapter;
    b.setAttribute('aria-current',active?'true':'false');
  });
}
chapterButtons.forEach(b=>b.addEventListener('click',()=>{
  const goal=Number(b.dataset.chapter)*8+0.3;
  if(currentFilm!=='cinematic'){load('cinematic');attachChapterReadout();}
  const media=current.media;
  const seek=()=>{
    if(current?.media!==media)return;
    const ranges=media.seekable;
    const max=Number.isFinite(media.duration)?media.duration-.15:goal;
    const target=Math.min(goal,Math.max(0,max));
    try{media.currentTime=target;}catch(e){console.warn('PRISM chapter seek unavailable',e);}
    syncChapterButtons();
  };
  if(media.readyState>=1)seek();
  else media.addEventListener('loadedmetadata',seek,{once:true});
}));
// Re-attach after the film selection remounts a media element.
function attachChapterReadout(){
 if(!current?.media)return;
 current.media.addEventListener('timeupdate',syncChapterButtons);
 current.media.addEventListener('seeked',syncChapterButtons);
 syncChapterButtons();
}
attachChapterReadout();
const filmSwitcherButtons=document.querySelectorAll('[data-film]');
filmSwitcherButtons.forEach(button=>button.addEventListener('click',()=>queueMicrotask(attachChapterReadout)));

