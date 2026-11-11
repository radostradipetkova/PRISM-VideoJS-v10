/** Real-frame previews when a clip has no authored storyboard.
 * Native MP4: seek an independent muted, never-playing preview video.
 * Mux: prefer Video.js's generated storyboard; use Mux thumbnail service
 * only while storyboard metadata is unavailable (no user API secrets).
 */
export function initOpticalFramePreview({skin,media,muxPlaybackId=null,hasStoryboard=false}={}){
  const housing=skin?.querySelector('.prism-loupe-housing');
  const nativeThumb=housing?.querySelector('.prism-loupe-image');
  if(!housing || !media || !nativeThumb)return {show(){},destroy(){}};
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
