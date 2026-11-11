/** Decode WebVTT sprite regions without tying preview rendering to MP4 ranges. */
export function parseStoryboardCues(raw,baseUrl){
  if(typeof raw!=='string'||!/^\\uFEFF?WEBVTT(?:\\s|$)/.test(raw))return [];
  const clock=value=>{
    const numbers=value.trim().split(':');
    if(numbers.length!==2&&numbers.length!==3)return NaN;
    const seconds=Number(numbers.pop()),minutes=Number(numbers.pop()),hours=numbers.length?Number(numbers.pop()):0;
    if(!Number.isFinite(seconds)||!Number.isFinite(minutes)||!Number.isFinite(hours)||seconds>=60||minutes>=60)return NaN;
    return hours*3600+minutes*60+seconds;
  };
  const cues=[];
  for(const block of raw.replace(/\\r/g,'').split(/\\n\\s*\\n/).slice(1)){
    const lines=block.split('\\n').map(s=>s.trim()).filter(Boolean);
    const separator=lines.findIndex(s=>s.includes('-->'));
    if(separator<0||separator+1>=lines.length)continue;
    const [a,b]=lines[separator].split('-->').map(s=>s.trim().split(/\\s+/)[0]);
    const from=clock(a),to=clock(b);
    const frame=lines[separator+1].match(/^(.+?)#xywh=(\\d+),(\\d+),(\\d+),(\\d+)$/i);
    if(!(Number.isFinite(from)&&Number.isFinite(to)&&to>from&&frame))continue;
    const [x,y,w,h]=frame.slice(2).map(Number);
    if(w<1||h<1||w>4096||h>4096)continue;
    let src;
    try{src=new URL(frame[1],baseUrl).href;}catch(_){continue;}
    cues.push({from,to,src,x,y,w,h});
  }
  return cues.sort((a,b)=>a.from-b.from);
}
/** One browser-cached sprite powers both Optical Loupe and Explore.
 * A canvas draws only the selected tile; it never seeks playback or loads
 * a second copy of a 12-minute remote movie.
 */
function initStoryboardSpritePreview({skin,storyboard}){
  const housing=skin.querySelector('.prism-loupe-housing');
  const iris=skin.querySelector('.prism-iris');
  if(!housing)return {show(){},showChapter(){},destroy(){}};
  const loupe=document.createElement('canvas');
  loupe.className='prism-loupe-sprite-preview';
  loupe.width=160;loupe.height=90;
  loupe.setAttribute('aria-hidden','true');
  housing.append(loupe);
  const irisCanvas=iris?document.createElement('canvas'):null;
  if(irisCanvas){
    irisCanvas.className='prism-iris-sprite-preview';
    irisCanvas.width=160;irisCanvas.height=90;
    irisCanvas.setAttribute('aria-hidden','true');
    iris.append(irisCanvas);
  }
  let cues=[],pointerTime=null,chapterTime=null,disposed=false;
  const images=new Map();
  const abort=new AbortController();
  function findCue(time){
    if(!Number.isFinite(time))return null;
    // Sorted cues, deterministic nearest cue even when the seek is on a boundary.
    for(let i=cues.length-1;i>=0;i--)if(time>=cues[i].from)return cues[i];
    return cues[0]||null;
  }
  function paint(canvas,time){
    if(disposed||!canvas)return;
    const cue=findCue(time);
    if(!cue)return;
    let image=images.get(cue.src);
    if(!image){
      image=new Image();
      image.decoding='async';
      images.set(cue.src,image);
      image.onload=()=>{
        if(disposed)return;
        paint(loupe,pointerTime);
        if(irisCanvas&&skin.querySelector('.prism-chapter-dialog')?.open)paint(irisCanvas,chapterTime);
      };
      image.onerror=()=>{if(!disposed)canvas.dataset.frameReady='false';};
      image.src=cue.src;
      return;
    }
    if(!image.complete||!image.naturalWidth)return;
    try{
      if(canvas.width!==cue.w)canvas.width=cue.w;
      if(canvas.height!==cue.h)canvas.height=cue.h;
      const ctx=canvas.getContext('2d',{alpha:false});
      if(!ctx)return;
      ctx.drawImage(image,cue.x,cue.y,cue.w,cue.h,0,0,cue.w,cue.h);
      canvas.dataset.frameReady='true';
    }catch(_){canvas.dataset.frameReady='false';}
  }
  const vttUrl=new URL(storyboard,document.baseURI);
  fetch(vttUrl,{signal:abort.signal})
    .then(response=>response.ok?response.text():'')
    .then(raw=>{
      if(disposed)return;
      cues=parseStoryboardCues(raw,vttUrl);
      if(pointerTime!==null)paint(loupe,pointerTime);
      if(chapterTime!==null && skin.querySelector('.prism-chapter-dialog')?.open)paint(irisCanvas,chapterTime);
    }).catch(()=>{/* On a missing storyboard the original native thumbnail remains. */});
  return {
    show(time){
      if(!Number.isFinite(time)||disposed)return;
      pointerTime=Math.max(0,time);
      paint(loupe,pointerTime);
    },
    showChapter(time){
      if(!Number.isFinite(time)||disposed||!irisCanvas)return;
      chapterTime=Math.max(0,time);
      if(skin.querySelector('.prism-chapter-dialog')?.open)paint(irisCanvas,chapterTime);
    },
    destroy(){
      disposed=true;abort.abort();
      for(const image of images.values()){image.onload=null;image.onerror=null;}
      loupe.remove();irisCanvas?.remove();
      images.clear();
    }
  };
}

/** Real-frame previews when a clip has no authored storyboard.
 * Native MP4: seek an independent muted, never-playing preview video.
 * Mux: prefer Video.js's generated storyboard; use Mux thumbnail service
 * only while storyboard metadata is unavailable (no user API secrets).
 */
export function initOpticalFramePreview({skin,media,muxPlaybackId=null,hasStoryboard=false,storyboard=null}={}){
  const housing=skin?.querySelector('.prism-loupe-housing');
  const nativeThumb=housing?.querySelector('.prism-loupe-image');
  if(!housing || !media || !nativeThumb)return {show(){},destroy(){}};
  // A supplied storyboard is the reliable fast path, especially for remote MP4s.
  if(storyboard && !muxPlaybackId)return initStoryboardSpritePreview({skin,storyboard});
  const canUseVideo=!muxPlaybackId && !hasStoryboard && media.tagName==='VIDEO';
  const canUseMux=!!muxPlaybackId && /^[A-Za-z0-9]+$/.test(muxPlaybackId);
  if(!canUseVideo && !canUseMux)return {show(){},destroy(){}};

  let requested=null, timer=null, disposed=false, waiting=false, lastTime=NaN;
  let preview=null, fallback=null;
  const clear=()=>{if(timer!==null)clearTimeout(timer);timer=null;};

  // Explore's central iris needs a real thumbnail too, not an empty dial.
  // It is mounted lazily only once the chapter dialog opens.
  const iris=skin.querySelector('.prism-iris');
  const irisThumb=iris?.querySelector('.prism-iris-thumbnail');
  let irisPreview=null,irisWanted=null,irisTimer=null,irisLast=NaN;
  function seekIris(){
    if(disposed || !irisPreview || irisPreview.tagName!=='VIDEO'||irisWanted===null)return;
    if(irisPreview.seeking || !Number.isFinite(irisPreview.duration)||irisPreview.duration<=0)return;
    const at=Math.max(0,Math.min(irisWanted,irisPreview.duration-.08));
    if(Number.isFinite(irisLast)&&Math.abs(at-irisLast)<.2)return;
    irisLast=at;
    try{irisPreview.currentTime=at;}catch(_){/* unavailable remote seek */}
  }
  function showChapter(time){
    if(disposed || !iris || !Number.isFinite(time))return;
    if(!skin.querySelector('.prism-chapter-dialog')?.open)return;
    irisWanted=Math.max(0,time);
    if(!irisPreview){
      if(canUseVideo){
        irisPreview=document.createElement('video');
        irisPreview.muted=true;
        irisPreview.defaultMuted=true;
        irisPreview.playsInline=true;
        irisPreview.preload='metadata';
        irisPreview.setAttribute('playsinline','');
        irisPreview.disablePictureInPicture=true;
        const source=media.currentSrc||media.getAttribute('src')||'';
        if(source)irisPreview.src=source;
        irisPreview.addEventListener('loadedmetadata',seekIris);
        irisPreview.addEventListener('seeked',()=>{
          if(irisPreview.readyState>=2)irisPreview.dataset.frameReady='true';
          if(Math.abs(Number(irisPreview.currentTime)-irisWanted)>.25)seekIris();
        });
        irisPreview.addEventListener('loadeddata',()=>{
          if(irisPreview.readyState>=2)irisPreview.dataset.frameReady='true';
        });
      }else{
        irisPreview=document.createElement('img');
        irisPreview.addEventListener('load',()=>{if(!disposed)irisPreview.dataset.frameReady='true';});
        irisPreview.addEventListener('error',()=>{irisPreview.dataset.frameReady='false';});
      }
      irisPreview.className='prism-iris-liveframe';
      irisPreview.setAttribute('aria-hidden','true');
      irisPreview.setAttribute('tabindex','-1');
      iris.append(irisPreview);
    }
    if(irisTimer!==null)clearTimeout(irisTimer);
    irisTimer=setTimeout(()=>{
      irisTimer=null;
      if(canUseVideo)seekIris();
      else if(irisThumb?.hasAttribute('data-hidden')){
        const sample=Math.floor(irisWanted/10)*10;
        irisPreview.dataset.frameReady='false';
        irisPreview.src=`https://image.mux.com/${muxPlaybackId}/thumbnail.webp?width=300&time=${sample}`;
      }else irisPreview.dataset.frameReady='false';
    },85);
  }
  function destroyIris(){
    if(irisTimer!==null)clearTimeout(irisTimer);
    irisTimer=null;
    if(irisPreview?.tagName==='VIDEO'){
      irisPreview.pause();
      irisPreview.removeAttribute('src');
      irisPreview.load();
    }
    irisPreview?.remove();
  }

  if(canUseVideo){
    // The video is only decoded on demand, never played or used as a track.
    // No canvas extraction: cross-origin MP4 frames can be displayed safely.
    preview=document.createElement('video');
    preview.className='prism-loupe-liveframe';
    preview.muted=true;
    preview.defaultMuted=true;
    preview.playsInline=true;
    preview.preload='metadata';
    preview.setAttribute('playsinline','');
    preview.setAttribute('aria-hidden','true');
    preview.setAttribute('tabindex','-1');
    preview.disablePictureInPicture=true;
    const source=media.currentSrc||media.getAttribute('src')||'';
    if(source)preview.src=source;
    const poster=media.getAttribute('poster');
    if(poster){
      fallback=document.createElement('img');
      fallback.className='prism-loupe-liveframe prism-loupe-fallback';
      fallback.alt='';
      fallback.setAttribute('aria-hidden','true');
      fallback.src=poster;
      housing.append(fallback);
    }
    housing.append(preview);
    const markReady=()=>{
      if(disposed || preview.readyState<2)return;
      preview.dataset.frameReady='true';
      if(fallback)fallback.dataset.frameReady='false';
    };
    const attempt=()=>{
      if(disposed || requested===null || !Number.isFinite(preview.duration) || preview.duration<=0)return;
      if(preview.seeking){waiting=true;return;}
      const time=Math.max(0,Math.min(requested,preview.duration-.08));
      if(Number.isFinite(lastTime)&&Math.abs(time-lastTime)<.2)return;
      lastTime=time;
      try{preview.currentTime=time;}catch(_){/* seek may not be supported */}
    };
    preview.addEventListener('loadedmetadata',attempt);
    preview.addEventListener('loadeddata',markReady);
    preview.addEventListener('seeked',()=>{
      markReady();
      if(waiting){
        waiting=false;
        if(requested!==null && Math.abs(Number(preview.currentTime)-requested)>.22)attempt();
      }
    });
    preview.addEventListener('error',()=>{
      if(fallback)fallback.dataset.frameReady='true';
    });
    if(fallback)fallback.dataset.frameReady='true';
    return {
      show(time){
        if(disposed || !Number.isFinite(time))return;
        requested=Math.max(0,time);
        clear();
        // Keep scrubbing responsive without issuing seeks for every pixel.
        timer=setTimeout(attempt,85);
      },
      showChapter,
      destroy(){
        disposed=true;clear();destroyIris();
        preview.pause();
        preview.removeAttribute('src');
        preview.load();
        preview.remove();
        fallback?.remove();
      }
    };
  }

  // A public Mux asset normally provides a native storyboard. This fallback
  // avoids an empty gray circle if its metadata has not arrived or is absent.
  preview=document.createElement('img');
  preview.className='prism-loupe-liveframe prism-loupe-muxframe';
  preview.alt='';
  preview.setAttribute('aria-hidden','true');
  housing.append(preview);
  let displayed=null;
  preview.addEventListener('load',()=>{
    if(disposed)return;
    preview.dataset.frameReady='true';
    displayed=preview.src;
  });
  preview.addEventListener('error',()=>{preview.dataset.frameReady='false';});
  const paint=()=>{
    if(disposed || requested===null)return;
    // Native sprite/VTT previews are more precise and should take priority.
    if(!nativeThumb.hasAttribute('data-hidden')){
      preview.dataset.frameReady='false';
      return;
    }
    const time=Math.max(0,Math.floor(requested/10)*10);
    const url=`https://image.mux.com/${muxPlaybackId}/thumbnail.webp?width=240&time=${time}`;
    if(preview.src!==url){preview.dataset.frameReady='false';preview.src=url;}
    else if(displayed===url)preview.dataset.frameReady='true';
  };
  return {
    show(time){
      if(disposed || !Number.isFinite(time))return;
      requested=time;
      clear();timer=setTimeout(paint,100);
    },
    showChapter,
    destroy(){disposed=true;clear();destroyIris();preview.removeAttribute('src');preview.remove();}
  };
}
