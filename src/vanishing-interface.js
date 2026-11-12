/** PRISM / Vanishing Interface.
 * Briefly spotlights the instrument in use without hiding functional controls.
 * Native media events remain the source of truth. Safe for reusable embeds.
 */
export function initVanishingInterface({skin,media,holdMs=1250}){
  const rail=skin.querySelector('.prism-rail');
  const mute=skin.querySelector('.prism-mute');
  const volume=skin.querySelector('.prism-volume');
  const gauge=skin.querySelector('.prism-volume-scale');
  const gaugeValue=gauge?.querySelector('.prism-volume-scale-value');
  const listeners=[];
  let timer=null;
  let destroyed=false;
  const listen=(node,type,callback)=>{
    if(!node)return;
    node.addEventListener(type,callback);
    listeners.push([node,type,callback]);
  };
  const clear=()=>{
    if(timer!==null){clearTimeout(timer);timer=null;}
    delete skin.dataset.opticalAttention;
  };
  const settle=()=>{
    if(destroyed)return;
    clear();
    // Keep the transport available after a real pause, not during playback.
    if(media.paused && !media.ended)skin.dataset.opticalAttention='transport';
  };
  const spotlight=(kind,sticky=false)=>{
    if(destroyed)return;
    clear();
    skin.dataset.opticalAttention=kind;
    if(!sticky)timer=setTimeout(settle,holdMs);
  };
  const syncVolume=()=>{
    if(!gauge)return;
    const raw=Number(media.volume);
    const level=media.muted?0:Math.round(Math.max(0,Math.min(1,Number.isFinite(raw)?raw:1))*100);
    gauge.style.setProperty('--prism-volume-level',level+'%');
    if(gaugeValue)gaugeValue.textContent=media.muted?'MUTED':String(level).padStart(2,'0')+'%';
  };
  const showVolume=()=>{syncVolume();spotlight('volume');};
  // A pointer hover still uses the genuine Video.js preview; this only changes
  // the emphasis. The preview decoder and seek timing are not modified.
  listen(rail,'pointerenter',()=>spotlight('seek'));
  listen(rail,'pointerdown',()=>spotlight('seek'));
  listen(rail,'focusin',()=>spotlight('seek'));
  listen(media,'seeking',()=>spotlight('seek'));
  listen(media,'seeked',()=>spotlight('seek'));
  listen(mute,'pointerdown',showVolume);
  listen(volume,'pointerenter',showVolume);
  listen(volume,'pointerdown',showVolume);
  listen(volume,'focusin',showVolume);
  listen(media,'volumechange',showVolume);
  listen(media,'pause',()=>spotlight('transport',true));
  listen(media,'play',()=>spotlight('transport'));
  // Show the real level on keyboard adjustments; never intercept native keys.
  listen(skin,'keydown',event=>{
    if(event.altKey || event.ctrlKey || event.metaKey)return;
    if(event.target?.closest?.('media-menu,dialog,.prism-preferences-panel'))return;
    if(['ArrowUp','ArrowDown','m','M'].includes(event.key))showVolume();
    else if(['ArrowLeft','ArrowRight'].includes(event.key))spotlight('seek');
  });
  syncVolume();
  return {
    destroy(){
      destroyed=true;
      clear();
      for(const [node,type,callback] of listeners)node.removeEventListener(type,callback);
    }
  };
}
