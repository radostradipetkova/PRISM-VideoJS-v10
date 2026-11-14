/** Independent portfolio use of PRISM's *reusable* Video.js v10 skin.
 * This page does not iframe the challenge showcase, load its site-level CSS,
 * import its demo application, or simulate playback. The mounted skin owns
 * genuine Video.js v10 media controls and a real locally hosted MP4.
 */
import {registerVideoJS} from '../skin/register-videojs.js';
import {mountPrismPlayer,parseMomentSeconds,restoreMomentToMedia} from '../skin/index.js';

const mount=document.getElementById('portfolio-prism');
const status=document.getElementById('player-status');
let instance=null;
let cancelRestore=()=>{};

async function start(){
  if(!mount)return;
  try{
    await registerVideoJS();
    instance=mountPrismPlayer(mount,{
      src:'../assets/prism-cinematic.mp4',
      poster:'../assets/prism-cinematic.jpg',
      title:'A Study in Motion',
      eyebrow:'PRISM / SELECTED WORK',
      captions:'../assets/prism-cinematic.vtt',
      captionLabel:'English / descriptive',
      captionLang:'en',
      captionsDefault:true,
      chaptersVtt:'../assets/prism-cinematic-chapters.vtt',
      storyboard:'../assets/prism-cinematic-storyboard.vtt',
      chapterMode:'auto',
      momentLink:seconds=>{
        if(!Number.isFinite(seconds) || seconds<0)return null;
        const url=new URL(location.href);
        url.searchParams.set('t',String(Math.round(seconds*100)/100));
        url.hash='portfolio-prism';
        return url.toString();
      }
    });
    const seconds=parseMomentSeconds(new URLSearchParams(location.search).get('t'));
    if(seconds!==null)cancelRestore=restoreMomentToMedia(instance.media,seconds);
    if(status)status.textContent='';
    // Preserve the real, initially paused video; user decides when to play.
    instance.media.addEventListener('error',()=>{
      const code=instance?.media?.error?.code;
      if(status)status.textContent='Video unavailable'+(code?' (media error '+code+')':'')+'. Try the original film link below.';
    });
  }catch(error){
    console.error('Portfolio PRISM integration could not start',error);
    if(status){
      status.replaceChildren();
      const message=document.createElement('span');
      message.textContent='The interactive player could not initialize. ';
      const fallback=document.createElement('a');
      fallback.href='../assets/prism-cinematic.mp4';
      fallback.textContent='Watch the original film directly';
      status.append(message,fallback);
    }
  }
}
addEventListener('pagehide',()=>{
  cancelRestore();
  instance?.destroy();
},{once:true});

start();
