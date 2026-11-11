import {normalizeChapters, chaptersFromTextTracks, parseChapterVTT, resolveIndex, indexLayout, formatIndexTime, transcriptMarkers} from './chapter-index.js';
import {initOpticalFramePreview} from './frame-preview.js';
/** PRISM 2 / Optical Touch.
 * Progressive enhancements around a genuine Video.js v10 player.
 * The native media element remains the single source of playback truth.
 * Does not replace Video.js seeking, captions, speed menus or keyboard controls.
 */
export const DEFAULT_CHAPTERS = Object.freeze([
  {time:0,title:'NIGHT CITY'}, {time:8,title:'SUNRISE'},
  {time:16,title:'LIQUID'}, {time:24,title:'GOLDEN HOUR'}
]);
export const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
export function chapterAtTime(chapters,time){
  if (!chapters.length) return -1;
  for (let i=chapters.length-1;i>=0;i--) if(time>=chapters[i].time) return i;
  return time<chapters[0].time?-1:0;
}
export function seekTarget(current,delta,duration){
  if(!Number.isFinite(duration) || duration<=0) return null;
  return clamp(current+delta,0,Math.max(0,duration-.08));
}
/** Time-window metadata is derived from actual chapters (or explicitly enabled markers).
 * It never pretends that an arbitrary video contains authored scenes.
 */
export function loupeChapterContext(chapters,time,duration){
  const length=Number(duration);
  if(!Number.isFinite(length) || length<=0) return null;
  const at=clamp(Number(time)||0,0,length);
  const index=chapterAtTime(chapters,at);
  if(index<0)return {index:-1,count:chapters.length,progress:at/length,next:null};
  const start=chapters[index].time;
  const next=index+1<chapters.length?chapters[index+1].time:length;
  const span=Math.max(.001,next-start);
  return {index,count:chapters.length,progress:clamp((at-start)/span,0,1),next:index+1<chapters.length?next:null};
}
/** Chapter jumping only runs with Shift+Arrow on a focused timeline.
 * Ordinary Arrow seeking and all Video.js pointer seeking remain native.
 */
export function chapterJumpTarget(chapters,time,direction,duration){
  if(!Array.isArray(chapters) || !chapters.length || !Number.isFinite(duration) || duration<=0 || ![-1,1].includes(direction))return null;
  const at=clamp(Number(time)||0,0,duration);
  if(direction>0){
    const next=chapters.find(entry=>entry.time>at+.35);
    return next?seekTarget(next.time,0,duration):null;
  }
  const previous=[...chapters].reverse().find(entry=>entry.time<at-.35);
  return previous?seekTarget(previous.time,0,duration):null;
}
export function touchRegion(x,left,width){
  const n=(x-left)/Math.max(1,width);
  return n<.42?'left':n>.58?'right':'middle';
}
export function isInteractionTarget(element){
  return element instanceof Element && Boolean(element.closest(
    'button,input,a,media-play-button,media-mute-button,media-seek-button,media-pip-button,'+
    'media-fullscreen-button,media-time-slider,media-volume-slider,media-menu,'+
    'media-menu-content,.prism-chapter-dialog,.prism-explore-launch'
  ));
}

export function initOpticalTouch({skin,media,chapters=[],chapterMode='auto',muxPlaybackId=null,storyboard=null}){
  const rail=skin.querySelector('.prism-rail');
  const framePreview=initOpticalFramePreview({skin,media,muxPlaybackId,hasStoryboard:Boolean(storyboard),storyboard});
  skin.querySelector('.prism-preview')?.classList.add('prism-optical-loupe');
  const lensLabel=skin.querySelector('.prism-loupe-chapter');
  const lensPosition=skin.querySelector('.prism-loupe-position');
  const lensStatus=skin.querySelector('.prism-loupe-status');
  const lensNext=skin.querySelector('.prism-loupe-next');
  const lensRuler=skin.querySelector('.prism-loupe-ruler');
  const ticksWrap=skin.querySelector('.prism-chapter-ticks');
  const launch=skin.querySelector('.prism-explore-launch');
  const dialog=skin.querySelector('.prism-chapter-dialog');
  const close=skin.querySelector('.prism-chapter-close');
  const list=skin.querySelector('.prism-chapter-choice-list');
  const heading=skin.querySelector('.prism-index-heading');
  const searchWrap=skin.querySelector('.prism-index-search-wrap');
  const search=skin.querySelector('.prism-index-search');
  const resultCount=skin.querySelector('.prism-index-result-count');
  const emptyResults=skin.querySelector('.prism-index-empty');
  const indexHelp=skin.querySelector('.prism-chapter-dialog-help');
  const irisThumbnail=skin.querySelector('.prism-iris-thumbnail');
  const irisLabel=skin.querySelector('.prism-iris-label');
  const hud=skin.querySelector('.prism-gesture-feedback');
  const cleanup=[];
  const on=(node,type,handler,options)=>{
    if(!node)return;
    node.addEventListener(type,handler,options);
    cleanup.push(()=>node.removeEventListener(type,handler,options));
  };
  let hudTimer=0;
  let longTimer=0;
  let press=null;
  let lastTap=null;
  let savedRate=null;
  let crossingIndex=-1;
  let lastScrubIndex=-1;
  let gestureMode='none';
  let entries=[];
  let entryType='none';
  let entrySignature='';
  let pulseTimer=0;
  let fetchedChapters=[];
  let muxChapters=[];
  let muxDuration=0;
  let muxChapterStatus='';
  let muxChapterTimer=null;
  let muxChapterAttempts=0;
  let fetchedCaptions=[];
  let destroyed=false;
  const abortTracks=new AbortController();

  const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches || !!skin.closest('.minimal-motion');
  function showFeedback(message){
    if(!hud)return;
    hud.textContent=message;
    hud.classList.add('is-visible');
    clearTimeout(hudTimer);
    hudTimer=setTimeout(()=>hud.classList.remove('is-visible'),900);
  }
  function vibrate(){
    try{if(navigator.vibrate)navigator.vibrate(9);}catch(_){/* optional haptic */}
  }
  function duration(){
    const reported=Number(media.duration);
    if(Number.isFinite(reported)&&reported>0)return reported;
    // A remote Mux asset may be ready before its custom media element
    // exposes duration. Use server-verified metadata for navigation only.
    return muxDuration;
  }
  function chapterOf(time){return chapterAtTime(entries,time);}
  function updateChapterIndex(time=Number(media.currentTime)||0){
    const index=chapterOf(time);
    list?.querySelectorAll('.prism-chapter-choice').forEach((b,i)=>{
      if(index===i)b.setAttribute('aria-current','true');
      else b.removeAttribute('aria-current');
    });
  }
  const getPointerTime=event=>{
    const rect=rail.getBoundingClientRect();
    return clamp((event.clientX-rect.left)/Math.max(1,rect.width),0,1)*duration();
  };
  function syncLoupe(time){
    framePreview.show(Number(time));
    const context=loupeChapterContext(entries,time,duration());
    const index=context?.index??-1;
    const progress=context?.progress??0;
    lensRuler?.style.setProperty('--loupe-chapter-progress',`${(progress*100).toFixed(2)}%`);
    if(lensPosition)lensPosition.textContent=index>=0
      ? `${String(index+1).padStart(2,'0')} / ${String(entries.length).padStart(2,'0')}`
      : 'FRAME';
    if(lensStatus)lensStatus.textContent=index>=0
      ? `${Math.round(progress*100)}% OF ${entryType==='time'?'INTERVAL':entryType==='transcript'?'DIALOGUE':'CHAPTER'}`
      : 'PREVIEW POSITION';
    if(lensNext)lensNext.textContent=context?.next!=null
      ? `NEXT ${formatIndexTime(context.next)}`
      : (index>=0?'FINAL CHAPTER':'DRAG TO SEEK');
    if(index<0){
      if(lensLabel)lensLabel.textContent='OPTICAL / FRAME';
      delete skin.dataset.loupeAtMarker;
      lastScrubIndex=-1;
      return;
    }
    const marker=entries[index];
    if(lensLabel)lensLabel.textContent=entryType==='time'
      ? `TIME / ${formatIndexTime(marker.time)}`
      : `${String(index+1).padStart(2,'0')} / ${marker.title}`;
    // A visual calibration cue near an authored marker, never a seek snap.
    // Scrubbing remains pixel-accurate and never unexpectedly jumps.
    const near=Math.abs(time-marker.time)<=Math.min(.75,Math.max(.20,duration()*.008));
    if(near)skin.dataset.loupeAtMarker='true';
    else delete skin.dataset.loupeAtMarker;
    if(index!==lastScrubIndex && lastScrubIndex>=0 && gestureMode==='scrub' && index!==crossingIndex){
      crossingIndex=index;
      vibrate();
      showFeedback(`${marker.title} / ${entryType==='time'?'TIME MARK':entryType==='transcript'?'DIALOGUE MARK':'CHAPTER MARK'}`);
      skin.dataset.chapterPulse='true';
      clearTimeout(pulseTimer);
      pulseTimer=setTimeout(()=>delete skin.dataset.chapterPulse,250);
    }
    lastScrubIndex=index;
  }
  function renderTicks(){
    const length=duration();
    ticksWrap?.replaceChildren();
    if(!length || !ticksWrap)return;
    const fragment=document.createDocumentFragment();
    for(const marker of entries.slice(1)){
      const tick=document.createElement('span');
      tick.style.left=`${clamp(marker.time/length,0,1)*100}%`;
      tick.title=`${entryType==='time'?'Time marker':'Chapter'}: ${marker.title}`;
      fragment.append(tick);
    }
    ticksWrap.append(fragment);
  }
  function previewChapter(index){
    const marker=entries[index];
    if(!marker)return;
    irisThumbnail?.setAttribute('time',String(marker.time));
    framePreview.showChapter?.(marker.time);
    if(irisLabel)irisLabel.textContent=marker.title;
  }
  function applySearch(){
    const term=(search?.value||'').trim().toLowerCase();
    let count=0;
    list?.querySelectorAll('.prism-chapter-choice').forEach(button=>{
      // Match real metadata fields separately: concatenating title and time
      // made 'SECTION 20' falsely match 'SECTION 2' + '00:00'.
      const index=Number(button.dataset.prismChapter);
      const entry=entries[index];
      const match=!term || Boolean(entry && (
        entry.title.toLowerCase().includes(term) ||
        formatIndexTime(entry.time).includes(term)
      ));
      button.hidden=!match;
      if(match)count++;
    });
    if(emptyResults)emptyResults.hidden=count>0;
    if(resultCount && dialog.open){
      resultCount.textContent=term
        ? `${count} of ${entries.length} navigation points found`
        : `${entries.length} navigation points available`;
    }
  }
  function updateIndexHelp(){
    if(!indexHelp)return;
    if(muxChapterStatus==='awaiting-chapters'){
      indexHelp.textContent='AI CHAPTERS PROCESSING · TIME MARKERS ARE AVAILABLE · SELECT TO SEEK';
    }else if(muxChapterStatus==='not-configured'){
      indexHelp.textContent='TIME MARKERS ONLY · MUX CHAPTER GENERATION NOT CONFIGURED';
    }else if(muxChapterStatus==='mux-chapter-track' && entryType==='chapters'){
      indexHelp.textContent='MUX CHAPTERS READY · SELECT A CHAPTER TO SEEK · ESC TO CLOSE';
    }else if(entryType==='time'){
      indexHelp.textContent='TIME MARKERS ONLY · NO SCENE LABELS INVENTED · ESC TO CLOSE';
    }else{
      indexHelp.textContent='SELECT A FRAME TO SEEK · ESC TO CLOSE';
    }
  }
  function renderIndex(){
    // Explore is a permanent navigation control. Do not hide it merely
    // because the video/remote Mux metadata has not finished loading.
    // The explicit "none" mode is the only way to hide navigation.
    if(launch)launch.hidden=chapterMode==='none';
    const mode=indexLayout(entries.length);
    dialog.dataset.indexLayout=mode;
    dialog.dataset.indexType=entryType;
    launch?.setAttribute('aria-label',entryType==='time'?'Explore video time markers':entryType==='transcript'?'Explore dialogue navigation':entries.length?'Explore the video chapters':'Explore video navigation');
    if(heading)heading.textContent=entryType==='time'?'PRISM / TIME INDEX':entryType==='transcript'?'PRISM / DIALOGUE INDEX':'PRISM / OPTICAL INDEX';
    if(searchWrap)searchWrap.hidden=mode!=='library';
    if(search)search.value='';
    const fragment=document.createDocumentFragment();
    entries.forEach((marker,index)=>{
      const button=document.createElement('button');
      button.type='button';button.className='prism-chapter-choice';
      button.dataset.prismChapter=String(index);
      button.setAttribute('aria-label',`Seek to ${entryType==='time'?'time':'chapter'} ${marker.title} at ${formatIndexTime(marker.time)}`);
      const number=document.createElement('span');number.className='prism-chapter-choice-no';number.textContent=String(index+1).padStart(2,'0');
      const title=document.createElement('span');title.className='prism-chapter-choice-title';title.textContent=marker.title;
      const time=document.createElement('span');time.className='prism-chapter-choice-time';time.textContent=formatIndexTime(marker.time);
      button.append(number,title,time);fragment.append(button);
    });
    list.replaceChildren(fragment);
    if(emptyResults){
      emptyResults.textContent=entries.length?'No matching navigation points.':
        chapterMode==='auto'?'This film has no authored chapters yet.':
        'Preparing the video index. Navigation points appear when metadata is ready.';
      emptyResults.hidden=entries.length>0;
    }
    if(resultCount)resultCount.textContent=entries.length?'':
      'Navigation will update automatically when chapter or video metadata arrives.';
    updateIndexHelp();
    updateChapterIndex();
    if(entries.length)previewChapter(Math.max(0,chapterOf(Number(media.currentTime)||0)));
    syncLoupe(Number(media.currentTime)||0);
    renderTicks();
  }
  function refreshIndex(){
    if(destroyed)return;
    const nativeChapters=chaptersFromTextTracks(media);
    const realCaptionCues=Array.from(media.textTracks||[])
      .filter(track=>track.kind==='captions'||track.kind==='subtitles')
      .flatMap(track=>Array.from(track.cues||[]).map(cue=>({time:cue.startTime,title:cue.text})));
    const derived=chapterMode==='smart'
      ? transcriptMarkers(realCaptionCues.length?realCaptionCues:fetchedCaptions,duration())
      : [];
    const resolved=resolveIndex({
      configured:chapters,
      tracked:nativeChapters.length?nativeChapters:fetchedChapters.length?fetchedChapters:muxChapters,
      derived,duration:duration(),mode:chapterMode
    });
    const signature=JSON.stringify([resolved.type,resolved.entries]);
    if(signature!==entrySignature){
      entrySignature=signature;
      entries=resolved.entries;
      entryType=resolved.type;
      renderIndex();
      // Scene Loop and integrations subscribe to the same genuine chapter data.
      skin.dispatchEvent(new CustomEvent('prism:indexchange',{
        detail:{type:entryType,entries:entries.map(c=>({...c}))}
      }));
    }else {renderTicks();updateIndexHelp();}
  }
  // Force native chapter tracks to load while keeping their cues visually hidden.
  // Native cues are preferred; fetching the VTT is a fallback for custom media tags.
  const chapterTags=Array.from(media.querySelectorAll('track[kind="chapters"]'));
  for(const el of chapterTags){
    try{if(el.track && el.track.mode==='disabled')el.track.mode='hidden';}catch(_){/* browser limitation */}
    on(el,'load',refreshIndex);
    on(el,'error',refreshIndex);
    const address=el.getAttribute('src');
    if(address && chapterMode!=='none'){
      fetch(new URL(address,document.baseURI),{signal:abortTracks.signal})
        .then(response=>response.ok?response.text():'')
        .then(raw=>{
          if(destroyed || !raw)return;
          fetchedChapters=normalizeChapters(parseChapterVTT(raw));
          refreshIndex();
        }).catch(()=>{/* native tracks may still load */});
    }
  }
  // The Mux Robots Directive generates chapters during ingest, NOT when a
  // visitor loads this page. Poll the read-only bridge for assets without an
  // authored track; display time markers until real chapter metadata arrives.
  // Never expose Mux API credentials or run billable jobs from the player.
  if(chapterMode==='smart' && muxPlaybackId && /^[A-Za-z0-9]+$/.test(muxPlaybackId)
     && !chapters.length && !chapterTags.length){
    const url=new URL('/api/mux/chapters',location.origin);
    url.searchParams.set('playback_id',muxPlaybackId);
    async function checkMuxChapterTrack(){
      if(destroyed || abortTracks.signal.aborted)return;
      muxChapterAttempts++;
      let retry=false;
      try{
        const response=await fetch(url,{signal:abortTracks.signal,cache:'no-store'});
        if(!response.ok)throw new Error('Mux chapter metadata request failed');
        const body=await response.json();
        if(destroyed)return;
        const verifiedDuration=Number(body?.duration);
        if(Number.isFinite(verifiedDuration)&&verifiedDuration>0)muxDuration=verifiedDuration;
        muxChapterStatus=typeof body?.source==='string'?body.source:'';
        const remote=normalizeChapters(body?.chapters);
        if(remote.length){
          muxChapters=remote;
          refreshIndex();
          return;
        }
        refreshIndex();
        retry=muxChapterStatus==='awaiting-chapters'||muxChapterStatus==='temporarily-unavailable';
      }catch(_){
        if(destroyed||abortTracks.signal.aborted)return;
        retry=true;
      }
      if(retry && muxChapterAttempts<12){
        // Avoid hammering the Mux API and stop polling after a bounded period.
        const delay=Math.min(45000,15000+(muxChapterAttempts-1)*5000);
        muxChapterTimer=setTimeout(checkMuxChapterTrack,delay);
      }
    }
    checkMuxChapterTrack();
  }
  // In smart mode, subtitle timestamps can identify useful dialogue beats
  // without claiming AI scene recognition or fabricating authored chapters.
  if(chapterMode==='smart'){
    for(const el of Array.from(media.querySelectorAll('track[kind="captions"],track[kind="subtitles"]'))){
      const address=el.getAttribute('src');
      if(!address)continue;
      fetch(new URL(address,document.baseURI),{signal:abortTracks.signal})
        .then(response=>response.ok?response.text():'')
        .then(raw=>{
          if(destroyed || !raw)return;
          fetchedCaptions=normalizeChapters(parseChapterVTT(raw));
          refreshIndex();
        }).catch(()=>{/* Time markers remain available if transcript can't load. */});
    }
  }
  // Chapter tracks may be added to an existing media element programmatically.
  on(media,'loadedmetadata',()=>{refreshIndex();syncLoupe(Number(media.currentTime)||0);});
  on(media,'durationchange',refreshIndex);
  if(media.textTracks){
    const observed=new WeakSet();
    const observeTrack=track=>{
      if(!track || observed.has(track))return;
      if(track.kind==='chapters'){
        observed.add(track);
        on(track,'cuechange',refreshIndex);
        try{if(track.mode==='disabled')track.mode='hidden';}catch(_){/* browser restriction */}
      }else if(chapterMode==='smart' && (track.kind==='captions'||track.kind==='subtitles')){
        observed.add(track);
        on(track,'cuechange',refreshIndex);
      }
    };
    Array.from(media.textTracks).forEach(observeTrack);
    on(media.textTracks,'addtrack',event=>{observeTrack(event.track);refreshIndex();});
    on(media.textTracks,'removetrack',refreshIndex);
    on(media.textTracks,'change',refreshIndex);
  }
  on(media,'timeupdate',()=>updateChapterIndex());
  on(media,'seeked',()=>updateChapterIndex());
  on(rail,'pointerdown',e=>{
    if(!duration())return;
    gestureMode=e.pointerType==='touch'?'scrub':'none';
    crossingIndex=-1;
    lastScrubIndex=chapterOf(getPointerTime(e));
    syncLoupe(getPointerTime(e));
  });
  on(rail,'pointermove',e=>{
    if(!duration())return;
    if(e.pointerType==='mouse' || gestureMode==='scrub' || e.buttons)syncLoupe(getPointerTime(e));
  });
  on(rail,'pointerup',()=>{gestureMode='none';crossingIndex=-1;});
  on(rail,'pointercancel',()=>{gestureMode='none';crossingIndex=-1;});
  on(rail,'pointerleave',()=>{delete skin.dataset.loupeAtMarker;});
  on(rail,'focusin',()=>syncLoupe(Number(media.currentTime)||0));
  // Keyboard precision navigator: Shift+Left/Right jumps to real chapter
  // boundaries. This is intentionally scoped to the focused time slider.
  // Capture before the native slider's ordinary Arrow handling; do not
  // interfere with non-shift Arrow keys or screen-reader navigation elsewhere.
  on(rail,'keydown',e=>{
    if(!e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || !['ArrowLeft','ArrowRight'].includes(e.key))return;
    const direction=e.key==='ArrowRight'?1:-1;
    const next=chapterJumpTarget(entries,Number(media.currentTime)||0,direction,duration());
    if(next===null)return;
    e.preventDefault();e.stopImmediatePropagation();
    try{media.currentTime=next;}catch(_){return;}
    const destination=chapterOf(next);
    if(destination>=0)showFeedback(`CHAPTER ${String(destination+1).padStart(2,'0')} / ${entries[destination].title}`);
    syncLoupe(next);
    updateChapterIndex(next);
  },{capture:true});
  on(rail,'keydown',()=>queueMicrotask(()=>{if(!destroyed)syncLoupe(Number(media.currentTime)||0)}));
  refreshIndex();

  // Native dialog: modal focus containment, Escape and return focus to trigger.
  function closeDialog(){if(dialog?.open)dialog.close();}
  function openDialog(){
    if(!dialog || dialog.open || chapterMode==='none')return;
    updateChapterIndex();
    previewChapter(Math.max(0,chapterOf(Number(media.currentTime)||0)));
    launch.setAttribute('aria-expanded','true');
    dialog.showModal();
    // Populate a real video frame after dialog.open becomes true.
    previewChapter(Math.max(0,chapterOf(Number(media.currentTime)||0)));
    // For a library of 13+ chapters, searching is more efficient than
    // tabbing through dozens of entries. Keep the radial dial's original
    // active-chapter focus for short videos.
    if(!searchWrap?.hidden){
      search.focus();
      applySearch();
    }else{
      (list.querySelector('[aria-current="true"]')||list.querySelector('button')||close)?.focus();
    }
  }
  on(launch,'click',openDialog);
  on(close,'click',closeDialog);
  on(dialog,'close',()=>{
    launch?.setAttribute('aria-expanded','false');
    if(!destroyed && launch?.isConnected)launch.focus({preventScroll:true});
  });
  on(dialog,'click',e=>{if(e.target===dialog)closeDialog();});
  on(search,'input',applySearch);
  function getButtonIndex(target){
    const button=target instanceof Element?target.closest('.prism-chapter-choice'):null;
    if(!button || !list.contains(button))return -1;
    return Number(button.dataset.prismChapter);
  }
  on(list,'pointerover',e=>{
    const i=getButtonIndex(e.target);if(i>=0)previewChapter(i);
  });
  on(list,'focusin',e=>{
    const i=getButtonIndex(e.target);if(i>=0)previewChapter(i);
  });
  on(list,'pointerout',e=>{
    if(getButtonIndex(e.target)>=0)previewChapter(Math.max(0,chapterOf(Number(media.currentTime)||0)));
  });
  on(list,'click',e=>{
    const i=getButtonIndex(e.target);
    if(i<0 || !entries[i])return;
    const marker=entries[i];
    const seek=()=>{
      if(destroyed)return;
      const t=seekTarget(marker.time,0,duration());
      if(t!==null){try{media.currentTime=t;}catch(_){/* unavailable */}}
      updateChapterIndex(marker.time);
    };
    if(seekTarget(marker.time,0,duration())!==null)seek();
    else on(media,'loadedmetadata',seek,{once:true});
    closeDialog();
    showFeedback(`${marker.title} / ${formatIndexTime(marker.time)}`);
  });

  const eligibleTouch=e=>e.pointerType==='touch' && e.isPrimary !== false && !isInteractionTarget(e.target);
  function stopLongPress(){
    clearTimeout(longTimer);
    longTimer=0;
    if(savedRate!==null){
      try{media.playbackRate=savedRate;}catch(_){/* browser limits rate */}
      savedRate=null;
      skin.classList.remove('prism-holding-speed');
      showFeedback('NORMAL PLAYBACK');
    }
  }
  function gesturesAreEnabled(){
    // Vertical swipes are deliberately fullscreen-only unless user opts in.
    return Boolean(document.fullscreenElement && (document.fullscreenElement===skin || document.fullscreenElement.contains(skin)))
      || Boolean(skin.closest('.prism-allow-embed-swipes'));
  }
  function getMediaViewport(){return skin.getBoundingClientRect();}
  function onTouchDown(e){
    if(!eligibleTouch(e))return;
    const rect=getMediaViewport();
    const region=touchRegion(e.clientX,rect.left,rect.width);
    press={pointerId:e.pointerId,x:e.clientX,y:e.clientY,region,
      time:performance.now(),initialVolume:Number(media.volume)||0,
      initialDim:parseFloat(skin.style.getPropertyValue('--prism-dim'))||0,
      swipe:false};
    if (!media.paused && !media.ended){
      clearTimeout(longTimer);
      longTimer=setTimeout(()=>{
        if(!press || press.swipe || savedRate!==null)return;
        savedRate=media.playbackRate;
        try{media.playbackRate=2;}catch(_){savedRate=null;return;}
        skin.classList.add('prism-holding-speed');
        showFeedback('2× / HOLD TO SCAN');
      },420);
    }
  }
  function onTouchMove(e){
    if(!press || press.pointerId!==e.pointerId)return;
    const dx=e.clientX-press.x,dy=e.clientY-press.y;
    if(Math.hypot(dx,dy)>14) clearTimeout(longTimer);
    if(!gesturesAreEnabled() || press.region==='middle' || savedRate!==null)return;
    if(!press.swipe && (Math.abs(dy)<24 || Math.abs(dy)<Math.abs(dx)*1.35))return;
    press.swipe=true;
    const delta=-dy/Math.max(170,getMediaViewport().height);
    if(press.region==='right'){
      const requested=clamp(press.initialVolume+delta,0,1);
      try{media.volume=requested;}catch(_){/* iOS hardware volume */}
      if(Math.abs(Number(media.volume)-requested)>.05){
        showFeedback('USE DEVICE VOLUME BUTTONS');
      }else{
        if(media.muted && requested>0)media.muted=false;
        showFeedback(`VOLUME / ${Math.round(media.volume*100)}%`);
      }
    }else{
      // Web apps cannot modify physical display brightness. This is video dimming.
      const dim=clamp(press.initialDim-delta*.9,0,.58);
      skin.style.setProperty('--prism-dim',dim.toFixed(2));
      showFeedback(`IMAGE DIM / ${Math.round(dim/.58*100)}%`);
    }
  }
  function onTouchUp(e){
    if(!press || e.pointerId!==press.pointerId)return;
    const last=press;
    press=null;
    const wasHolding=savedRate!==null;
    stopLongPress();
    if(wasHolding || last.swipe || Math.hypot(e.clientX-last.x,e.clientY-last.y)>24){lastTap=null;return;}
    const now=performance.now();
    if(last.region==='middle'){lastTap=null;return;}
    if(lastTap && lastTap.region===last.region && now-lastTap.time<340 &&
      Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<80){
      const shift=last.region==='left'?-5:5;
      const next=seekTarget(Number(media.currentTime)||0,shift,duration());
      if(next!==null){
        try{media.currentTime=next;}catch(_){/* unavailable */}
        showFeedback(`${shift>0?'+':''}${shift} SEC / SEEK`);
        vibrate();
      }
      lastTap=null;
    }else{
      lastTap={region:last.region,time:now,x:e.clientX,y:e.clientY};
    }
  }
  function onTouchCancel(){press=null;lastTap=null;stopLongPress();}
  on(skin,'pointerdown',onTouchDown);
  on(skin,'pointermove',onTouchMove);
  on(skin,'pointerup',onTouchUp);
  on(skin,'pointercancel',onTouchCancel);
  on(skin,'contextmenu',e=>{if(savedRate!==null)e.preventDefault();});
  on(window,'blur',onTouchCancel);
  on(document,'visibilitychange',()=>{if(document.hidden)onTouchCancel();});
  on(document,'fullscreenchange',()=>{if(!gesturesAreEnabled())onTouchCancel();});

  // LIQUID GLASS / auto-hide. Native Video.js keeps its own playback state;
  // this merely presents our ornamental surface when the user needs it.
  // The source remains operable even when the transport is visually hidden.
  let glassTimer=0;
  function clearGlassTimer(){clearTimeout(glassTimer);glassTimer=0;}
  function glassIsBusy(){
    return Boolean(dialog?.open || press || savedRate!==null ||
      skin.querySelector('media-time-slider[data-dragging],media-menu[data-open],media-menu:popover-open') ||
      skin.matches(':focus-visible') || skin.querySelector(':focus-visible'));
  }
  function hideGlassAfterIdle(){
    glassTimer=0;
    if(media.paused || media.ended || media.error || glassIsBusy() || !skin.isConnected)return;
    skin.dataset.glassIdle='true';
  }
  function revealGlass(){
    delete skin.dataset.glassIdle;
    clearGlassTimer();
    if(!media.paused && !media.ended && !media.error){
      glassTimer=setTimeout(hideGlassAfterIdle,2700);
    }
  }
  function holdGlass(){clearGlassTimer();delete skin.dataset.glassIdle;}
  on(media,'play',revealGlass);
  on(media,'playing',revealGlass);
  on(media,'pause',holdGlass);
  on(media,'ended',holdGlass);
  on(media,'error',holdGlass);
  on(media,'waiting',holdGlass);
  on(media,'seeking',revealGlass);
  on(skin,'pointermove',e=>{if(e.pointerType==='mouse')revealGlass();});
  on(skin,'pointerdown',revealGlass);
  on(skin,'pointerup',revealGlass);
  on(skin,'pointercancel',revealGlass);
  on(skin,'pointerenter',e=>{if(e.pointerType==='mouse')revealGlass();});
  on(skin,'keydown',revealGlass);
  on(skin,'focusin',revealGlass);
  on(skin,'focusout',()=>queueMicrotask(revealGlass));
  on(dialog,'close',revealGlass);
  // Menus and dialogs may gain focus after the trigger is clicked.
  on(skin,'click',revealGlass);
  revealGlass();

  return {
    getIndex(){return {type:entryType,entries:entries.map(c=>({...c}))};},
    destroy(){
    destroyed=true;
    abortTracks.abort();
    clearTimeout(muxChapterTimer);
    framePreview.destroy();
    closeDialog();
    onTouchCancel();
    clearTimeout(hudTimer);clearTimeout(pulseTimer);clearGlassTimer();
    cleanup.forEach(fn=>fn());
    delete skin.dataset.chapterPulse;
  }};
}
