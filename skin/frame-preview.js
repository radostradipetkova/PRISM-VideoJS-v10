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
      destroy(){
        disposed=true;clear();
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
    destroy(){disposed=true;clear();preview.removeAttribute('src');preview.remove();}
  };
}
