/** PRISM showcase keyboard entry point.
 * The reusable Video.js v10 skin retains its native, player-scoped hotkeys.
 * On this player-centric showcase only, Space also toggles the current video
 * after a click on noninteractive page content (YouTube-style behavior).
 */
export function initKeyboardAid({mount, getPlayer, getMedia=()=>getPlayer()?.querySelector('.prism-media'), root=document}) {
  const button=root.querySelector('#focus-prism-player');
  const skip=root.querySelector('#skip-to-prism');
  const state=root.querySelector('#prism-keyboard-state');
  if(!mount || !button || !skip || !state) return { destroy() {} };
  const idle='SPACE: PLAY / PAUSE ANYWHERE · FOCUS FOR MORE';
  const active='PLAYER FOCUSED / ALL SHORTCUTS ACTIVE';
  const setState=(value)=>{if(state.textContent!==value)state.textContent=value;};
  setState(idle);
  const onFocusIn=()=>setState(active);
  const onFocusOut=(event)=>{
    if(!mount.contains(event.relatedTarget)) {
      getPlayer()?.querySelector('media-container')?.classList.remove('prism-keyboard-engaged');
      setState(idle);
    }
  };
  const focusPlayer=(event)=>{
    event.preventDefault();
    const player=getPlayer();
    const container=player?.querySelector('media-container');
    const ready=mount.classList.contains('is-ready');
    if(!container || !ready) {
      // Accessible fallback: focus a real element, do not imply hotkeys loaded.
      mount.tabIndex=-1;
      mount.focus({preventScroll:true});
      mount.scrollIntoView({block:'center',behavior:'auto'});
      setState('PLAYER IS STILL LOADING');
      return;
    }
    container.scrollIntoView({block:'center',behavior:'auto'});
    container.focus({preventScroll:true});
    // Click-initiated programmatic focus does not match :focus-visible in Chrome.
    container.classList.add('prism-keyboard-engaged');
    setState(document.activeElement===container ? active : 'USE TAB TO FOCUS THE PLAYER');
  };

  const interactive='button, input, textarea, select, a[href], summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="checkbox"], [role="combobox"], [role="link"], [role="menuitem"], [role="option"], [role="radio"], [role="slider"], [role="switch"], [role="tab"], [role="textbox"]';
  const onPageSpace=(event)=>{
    if(event.key!==' ' && event.key!=='Spacebar' && event.code!=='Space')return;
    if(event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)return;
    const player=getPlayer();
    const media=getMedia();
    if(!player || !media || !mount.classList.contains('is-ready'))return;

    // Native Video.js hotkeys (and its menus/controls) must handle their own
    // focused events. Never double-toggle playback from a player interaction.
    const path=typeof event.composedPath==='function'?event.composedPath():[event.target];
    if(path.includes(player) || player.contains(event.target))return;
    // Space activates focused buttons and form controls; it also types inside
    // editable fields. Preserve those standard accessibility expectations.
    if(path.some(node=>node?.nodeType===1 && (node.matches?.(interactive) || node.isContentEditable)))return;
    // A modal dialog takes priority over background-player shortcuts.
    if(root.querySelector('dialog[open], [role="dialog"][aria-modal="true"]'))return;

    event.preventDefault(); // prevent the page from scrolling on Space
    if(media.paused || media.ended){
      try{
        const result=media.play();
        if(result?.catch)result.catch(()=>{}); // autoplay restrictions or load errors
      }catch(_){/* the video may not yet be playable */}
    } else {
      media.pause();
    }
  };
  button.addEventListener('click',focusPlayer);
  skip.addEventListener('click',focusPlayer);
  mount.addEventListener('focusin',onFocusIn);
  mount.addEventListener('focusout',onFocusOut);
  root.addEventListener('keydown',onPageSpace);
  return {destroy(){
    button.removeEventListener('click',focusPlayer);
    skip.removeEventListener('click',focusPlayer);
    mount.removeEventListener('focusin',onFocusIn);
    mount.removeEventListener('focusout',onFocusOut);
    root.removeEventListener('keydown',onPageSpace);
  }};
}
