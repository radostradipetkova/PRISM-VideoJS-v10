/** PRISM Scene Loop — optional chapter or A–B looping for seekable on-demand media.
 * Takes actual media times and chapter metadata, never showcase-specific scenes.
 * Does not modify Video.js controls or claim live/unseekable content is loopable.
 */
import {normalizeChapters,formatIndexTime} from './chapter-index.js';

export const MIN_LOOP_SECONDS=0.5;
const EPSILON=0.045;
const END_LEAD=0.075;
const number=v=>Number(v);

export function mediaDuration(media){
  const duration=number(media?.duration);
  return Number.isFinite(duration) && duration>MIN_LOOP_SECONDS ? duration : null;
}
export function isLoopRangeSeekable(media,start,end){
  const duration=mediaDuration(media);
  if(duration===null || !Number.isFinite(start) || !Number.isFinite(end) ||
     start<0 || end>duration+.015 || end-start<MIN_LOOP_SECONDS)return false;
  const seekable=media?.seekable;
  if(!seekable || !Number.isFinite(seekable.length) || seekable.length===0){
    // Metadata can be available before the browser exposes its ranges. We
    // allow an attempted seek but still verify the result; never enable live.
    return Number(media?.readyState)>=1;
  }
  try{
    for(let i=0;i<seekable.length;i++){
      const lower=seekable.start(i),upper=seekable.end(i);
      if(start>=lower-.025 && end<=upper+.025)return true;
    }
  }catch(_){return false;}
  return false;
}
/** A chapter ends at the next authored start, or the actual media duration. */
export function chapterLoopRange(chapters,at,duration){
  if(!Number.isFinite(duration) || duration<=MIN_LOOP_SECONDS)return null;
  const entries=normalizeChapters(chapters,duration);
  if(!entries.length)return null;
  const time=Number.isFinite(at)?at:0;
  let index=entries.findLastIndex(c=>c.time<=time+.001);
  if(index<0)index=0;
  const from=entries[index].time;
  const to=index<entries.length-1?entries[index+1].time:duration;
  if(to-from<MIN_LOOP_SECONDS)return null;
  return {from,to,title:entries[index].title,index,count:entries.length};
}
export function isValidAB(a,b,media){
  return Number.isFinite(a) && Number.isFinite(b) && isLoopRangeSeekable(media,a,b);
}

/** Hook up reusable Scene Loop to a single media element and the compact Video.js transport popover. */
export function initSceneLoop({skin,media,getChapters=()=>[]}={}){
  const group=skin?.querySelector('[data-loop-panel]');
  const chapterButton=group?.querySelector('[data-loop-chapter]');
  const inButton=group?.querySelector('[data-loop-in]');
  const outButton=group?.querySelector('[data-loop-out]');
  const abButton=group?.querySelector('[data-loop-ab]');
  const offButton=group?.querySelector('[data-loop-off]');
  const status=group?.querySelector('[data-loop-status]');
  const context=group?.querySelector('[data-loop-context]');
  const range=group?.querySelector('[data-loop-range]');
  const dockButton=skin?.querySelector('.prism-loop-trigger');
  const listeners=[];
  let a=null,b=null,active=null,internalSeek=false,restartAfterSeek=false,seekTimer=null;
  let message='';
  const on=(node,type,handler)=>{
    if(!node)return;
    node.addEventListener(type,handler);
    listeners.push(()=>node.removeEventListener(type,handler));
  };
  const chapters=()=>{
    const result=getChapters();
    return result?.type==='chapters'?normalizeChapters(result.entries,mediaDuration(media)??NaN):[];
  };
  const supported=()=>mediaDuration(media)!==null && Number(media.readyState)>=1;
  const format=t=>Number.isFinite(t)?formatIndexTime(t):'--:--';
  function currentChapter(){return chapterLoopRange(chapters(),Number(media.currentTime)||0,mediaDuration(media)??NaN)}
  function setMessage(text){message=text;render();}
  function clearLoop(reason='Scene Loop is off.'){
    clearTimeout(seekTimer);seekTimer=null;
    active=null;internalSeek=false;restartAfterSeek=false;
    setMessage(reason);
  }
  function render(){
    if(!group)return;
    const duration=mediaDuration(media);
    const viable=supported();
    const scene=viable?currentChapter():null;
    const rangeOK=viable && isValidAB(a,b,media);
    if(chapterButton){
      chapterButton.disabled=!scene || !isLoopRangeSeekable(media,scene.from,scene.to);
      chapterButton.setAttribute('aria-pressed',String(active?.type==='chapter'));
      chapterButton.textContent=active?.type==='chapter'?'↻ STOP CHAPTER LOOP':'↻ LOOP THIS CHAPTER';
    }
    if(inButton)inButton.disabled=!viable;
    if(outButton)outButton.disabled=!viable;
    if(abButton){
      abButton.disabled=active?.type!=='ab' && !rangeOK;
      abButton.setAttribute('aria-pressed',String(active?.type==='ab'));
      abButton.textContent=active?.type==='ab'?'↻ STOP A–B LOOP':'↻ LOOP A–B';
    }
    if(offButton)offButton.disabled=!active;
    if(range)range.textContent=`IN ${format(a)}  →  OUT ${format(b)}`;
    if(context){
      context.textContent=!viable?'ON-DEMAND VIDEO REQUIRED':
        scene?`CURRENT CHAPTER / ${scene.title} · ${format(scene.from)}–${format(scene.to)}`:
        'NO AUTHORED CHAPTERS · USE IN / OUT';
    }
    if(status){
      status.textContent=active
        ? (active.type==='chapter'?`LOOPING / ${active.title} · ${format(active.from)}–${format(active.to)}`:
           `LOOPING / A–B · ${format(active.from)}–${format(active.to)}`)
        : (!viable?'Unavailable for live, unseekable or unloaded video.':message||'Choose a chapter or mark two positions to repeat.');
    }
    skin.classList.toggle('prism-loop-active',!!active);
    if(dockButton){
      dockButton.classList.toggle('is-looping',!!active);
      dockButton.setAttribute('aria-label',active?'Scene loop controls — loop active':'Scene loop controls');
      dockButton.setAttribute('aria-pressed',String(!!active));
    }
  }
  function chooseChapter(){
    if(active?.type==='chapter'){clearLoop();return;}
    const scene=currentChapter();
    if(!scene || !isLoopRangeSeekable(media,scene.from,scene.to)){
      setMessage('This chapter is not currently seekable.');return;
    }
    active={type:'chapter',...scene};
    if(Number(media.currentTime)<scene.from || Number(media.currentTime)>=scene.to-.005){
      try{internalSeek=true;media.currentTime=scene.from+EPSILON;}catch(_){clearLoop('Seeking was blocked for this video.');return;}
    }
    message='';render();
  }
  function setMarker(which){
    const at=Number(media.currentTime);
    if(!supported() || !Number.isFinite(at)){setMessage('Load a seekable on-demand video first.');return;}
    if(which==='a'){
      a=Math.max(0,Math.min(at,media.duration));
      // An outdated OUT point must not silently form a different loop.
      if(b!==null && b-a<MIN_LOOP_SECONDS)b=null;
    }else{
      if(a===null){setMessage('Mark IN (A) before marking OUT (B).');return;}
      if(at-a<MIN_LOOP_SECONDS){setMessage('OUT must be at least half a second after IN.');return;}
      b=Math.min(at,media.duration);
      if(!isValidAB(a,b,media)){b=null;setMessage('The range must be within one seekable section.');return;}
    }
    if(active?.type==='ab')active=null;
    message=which==='a'?'IN point saved. Seek forward and set OUT.':'OUT point saved. Select LOOP A–B.';
    render();
  }
  function toggleAB(){
    if(active?.type==='ab'){clearLoop();return;}
    if(!isValidAB(a,b,media)){setMessage('Mark a valid IN and OUT first.');return;}
    active={type:'ab',from:a,to:b};
    const at=Number(media.currentTime);
    if(at<a || at>=b-.005){
      try{internalSeek=true;media.currentTime=a+EPSILON;}catch(_){clearLoop('Seeking was blocked for this video.');return;}
    }
    message='';render();
  }
  function loopBack(fromEnd=false){
    if(!active || internalSeek)return;
    if(!isLoopRangeSeekable(media,active.from,active.to)){
      clearLoop('The selected range is no longer seekable.');return;
    }
    try{
      internalSeek=true;
      restartAfterSeek=fromEnd;
      const destination=Math.min(active.from+EPSILON,active.to-.04);
      media.currentTime=destination;
      // A source may report finite duration but still reject seeking without
      // throwing. Never leave the loop stuck or silently hammer the timeline.
      clearTimeout(seekTimer);
      if(internalSeek){
        seekTimer=setTimeout(()=>{
          if(!internalSeek)return;
          internalSeek=false;
          if(Math.abs(Number(media.currentTime)-destination)<.18)resumeAfterEnd();
          else clearLoop('This video did not accept the requested seek. Loop stopped.');
        },1400);
      }
      // Some browsers complete the assignment synchronously without seeked.
      if(!media.seeking && Math.abs(Number(media.currentTime)-destination)<.18){
        internalSeek=false;clearTimeout(seekTimer);seekTimer=null;
        if(restartAfterSeek)resumeAfterEnd();
      }
    }catch(_){clearLoop('The browser could not seek this video.');}
  }
  function resumeAfterEnd(){
    if(!restartAfterSeek)return;
    restartAfterSeek=false;
    if(media.ended || media.paused){
      try{Promise.resolve(media.play()).catch(()=>setMessage('Press Play to continue looping.'));}
      catch(_){setMessage('Press Play to continue looping.');}
    }
  }
  function onTimeUpdate(){
    if(!active || internalSeek || media.paused || media.seeking)return;
    if(Number(media.currentTime)>=active.to-END_LEAD)loopBack();
  }
  function onSeeked(){
    if(internalSeek){internalSeek=false;clearTimeout(seekTimer);seekTimer=null;resumeAfterEnd();return;}
    if(active && (media.currentTime<active.from-.12 || media.currentTime>active.to+.12)){
      clearLoop('Loop stopped after seeking outside the selected scene.');
    }
    render();
  }
  function onEnded(){if(active)loopBack(true);}
  function onDurationChange(){
    if(active?.type==='chapter'){
      const scene=chapterLoopRange(chapters(),active.from+EPSILON,mediaDuration(media)??NaN);
      if(!scene || scene.from!==active.from || Math.abs(scene.to-active.to)>.05){
        clearLoop('Chapter boundaries changed. Choose the scene again.');return;
      }
    }
    if(active && !isLoopRangeSeekable(media,active.from,active.to))clearLoop('The video timeline changed. Loop stopped.');
    else render();
  }
  function onReset(){clearTimeout(seekTimer);seekTimer=null;a=null;b=null;active=null;internalSeek=false;restartAfterSeek=false;message='';render();}
  // The native Video.js menu handles opening, closing and Escape.
  // A/B actions stay within the popover instead of bubbling into player gestures.
  on(group,'click',event=>event.stopPropagation());
  on(group,'pointerdown',event=>event.stopPropagation());
  on(group,'keydown',event=>{if(!['Escape','Tab'].includes(event.key))event.stopPropagation();});
  on(chapterButton,'click',chooseChapter);
  on(inButton,'click',()=>setMarker('a'));
  on(outButton,'click',()=>setMarker('b'));
  on(abButton,'click',toggleAB);
  on(offButton,'click',()=>clearLoop());
  on(media,'loadedmetadata',render);
  on(media,'durationchange',onDurationChange);
  on(media,'progress',render);
  on(media,'canplay',render);
  on(media,'timeupdate',onTimeUpdate);
  on(media,'seeked',onSeeked);
  on(media,'ended',onEnded);
  on(media,'loadstart',onReset);
  on(media,'emptied',onReset);
  on(media,'error',()=>clearLoop('Media unavailable. Loop stopped.'));
  on(skin,'prism:indexchange',()=>{
    if(active?.type==='chapter'){
      // In-place track edits invalidate the frozen chapter segment; don't
      // silently jump between unrelated chapters.
      const existing=chapterLoopRange(chapters(),active.from+EPSILON,mediaDuration(media)??NaN);
      if(!existing || existing.from!==active.from || existing.to!==active.to || existing.title!==active.title){
        clearLoop('Chapter list changed. Choose a scene again.');
      }
    }
    render();
  });
  render();
  return {
    getState:()=>({active:active?{...active}:null,in:a,out:b}),
    hasChapter:()=>{const scene=currentChapter();return !!(scene && isLoopRangeSeekable(media,scene.from,scene.to));},
    toggleChapter:chooseChapter,
    stop:()=>clearLoop(),
    destroy(){clearTimeout(seekTimer);listeners.forEach(fn=>fn());skin?.classList.remove('prism-loop-active')}
  };
}
