/** PRISM's per-player preferences. Does not replace native Video.js controls.
 * Explicit viewer choices last for the life of the mounted page; defaults follow
 * OS accessibility preferences until a choice is made.
 */
const bool = value => typeof value === 'boolean' ? value : null;
const modes = new Set(['glass', 'solid']);
const captionSizes = new Set(['small','medium','large']);
const captionBackgrounds = new Set(['transparent','solid']);
const videoFits = new Set(['fit','fill']);
const captionPixels = Object.freeze({small:'18px',medium:'21px',large:'26px'});
export function normalizePreferences(value={}) {
  return {
    surface: modes.has(value?.surface) ? value.surface : null,
    motion: bool(value?.motion),
    captionSize: captionSizes.has(value?.captionSize) ? value.captionSize : null,
    captionBackground: captionBackgrounds.has(value?.captionBackground) ? value.captionBackground : null,
    videoFit: videoFits.has(value?.videoFit) ? value.videoFit : null,
    touchSwipes: bool(value?.touchSwipes),
    autoRotate: bool(value?.autoRotate)
  };
}
export function resolvePreferences(overrides={}, system={}) {
  const user=normalizePreferences(overrides);
  return {
    surface:system.reducedTransparency || system.forcedColors ? 'solid' :
      (user.surface ?? (system.highContrast ? 'solid' : 'glass')),
    motion:!!system.reducedMotion || (user.motion ?? false),
    captionSize:user.captionSize ?? 'medium',
    captionBackground:(system.forcedColors || system.highContrast) ? 'solid' : (user.captionBackground ?? 'solid'),
    videoFit:user.videoFit ?? 'fit',
    touchSwipes:user.touchSwipes ?? false,
    autoRotate:user.autoRotate ?? true
  };
}
export function isTouchCapable({windowObject=globalThis.window, navigatorObject=globalThis.navigator}={}) {
  return !!(navigatorObject?.maxTouchPoints > 0 || windowObject?.matchMedia?.('(any-pointer: coarse)')?.matches || windowObject?.matchMedia?.('(pointer: coarse)')?.matches);
}

export function initPlayerPreferences({target,skin,trigger,panel,initial={},remembered=false,onRememberChange=()=>({enabled:false}),onChange=()=>{},win=window}={}) {
  if(!target || !skin || !trigger || !panel) return {destroy(){},getOverrides(){return normalizePreferences(initial)}};
  const overrides=normalizePreferences(initial);
  const subscriptions=[];
  const query = expression => win.matchMedia?.(expression) ?? {matches:false};
  const mediaQueries={
    highContrast:query('(prefers-contrast: more)'),
    reducedTransparency:query('(prefers-reduced-transparency: reduce)'),
    forcedColors:query('(forced-colors: active)'),
    reducedMotion:query('(prefers-reduced-motion: reduce)'),
    touch:query('(any-pointer: coarse)')
  };
  const system=()=>Object.fromEntries(['highContrast','reducedTransparency','forcedColors','reducedMotion'].map(k=>[k,mediaQueries[k].matches]));
  const touchCapable=()=>isTouchCapable({windowObject:win,navigatorObject:win.navigator});
  const surfaceButtons=[...panel.querySelectorAll('[data-pref-surface]')];
  const captionSizeButtons=[...skin.querySelectorAll('[data-pref-caption-size]')];
  const captionBackgroundButtons=[...skin.querySelectorAll('[data-pref-caption-background]')];
  const videoFitButtons=[...panel.querySelectorAll('[data-pref-video-fit]')];
  const motion=panel.querySelector('[data-pref-motion]');
  const swipes=panel.querySelector('[data-pref-touch-swipes]');
  const rotate=panel.querySelector('[data-pref-auto-rotate]');
  const captionMenu=skin.querySelector('.prism-captions-menu');
  const captionTrigger=skin.querySelector('.prism-captions-trigger');
  const captionGear=captionMenu?.querySelector('.prism-caption-gear');
  const captionAppearance=captionMenu?.querySelector('[data-caption-appearance]');
  const captionTrackList=captionMenu?.querySelector('[data-caption-track-list]');
  const captionBack=captionMenu?.querySelector('.prism-caption-back');
  const remember=panel.querySelector('[data-pref-remember]');
  const rememberStatus=panel.querySelector('[data-pref-remember-status]');
  let rememberEnabled=!!remembered;
  if(remember)remember.checked=rememberEnabled;
  function updateRememberNote(message){
    if(remember)remember.checked=rememberEnabled;
    if(rememberStatus)rememberStatus.textContent=message ?? (rememberEnabled
      ? 'Saved on this device for this website.'
      : 'Off by default. Your settings are not stored between visits.');
  }
  updateRememberNote();
  const touchOnly=[...panel.querySelectorAll('[data-pref-touch-only]')];
  const help=panel.querySelector('[data-pref-system-note]');
  const close=panel.querySelector('.prism-preferences-close');
  const guideFocusPlayer=panel.querySelector('[data-guide-focus-player]');
  const guideFocusTimeline=panel.querySelector('[data-guide-focus-timeline]');
  const abort=new AbortController();
  const listen=(node,event,fn,opts={})=>node?.addEventListener(event,fn,{...opts,signal:abort.signal});
  let shown=false;
  function apply(announce=false){
    const os=system();
    const effective=resolvePreferences(overrides,os);
    // Class on skin is essential for standalone use; target also supports the
    // showcase's existing wrapper rules and optical-touch's ancestor lookup.
    for(const node of [target,skin]){
      node.classList.toggle('prism-solid-surface',effective.surface==='solid');
      node.classList.toggle('minimal-motion',effective.motion);
      node.classList.toggle('prism-allow-embed-swipes',effective.touchSwipes);
    }
    surfaceButtons.forEach(button=>{
      const selected=button.dataset.prefSurface===effective.surface;
      button.setAttribute('aria-pressed',String(selected));
      button.classList.toggle('selected',selected);
      button.disabled=button.dataset.prefSurface==='glass' && !!(os.reducedTransparency || os.forcedColors);
    });
    // CSS ::cue styles the actual WebVTT/subtitle text painted by the media
    // engine (including mux-video's exported video part). Never replace the
    // native TextTrack with a fake caption overlay or lose language selection.
    skin.style.setProperty('--prism-caption-font-size',captionPixels[effective.captionSize]);
    skin.style.setProperty('--prism-caption-background',effective.captionBackground==='solid'?'rgba(5,8,12,.92)':'transparent');
    skin.style.setProperty('--prism-caption-shadow',effective.captionBackground==='solid'?'none':'0 2px 3px #000, 0 0 5px #000');
    skin.dataset.captionSize=effective.captionSize;
    skin.dataset.captionBackground=effective.captionBackground;
    // Only the actual media is cropped. The optical loupe, frame, dock and captions stay intact.
    // The embedder's --media-object-fit: cover default is recognized on mount.
    skin.style.setProperty('--prism-video-fit',effective.videoFit==='fill'?'cover':'contain');
    skin.dataset.videoFit=effective.videoFit;
    videoFitButtons.forEach(button=>{
      const selected=button.dataset.prefVideoFit===effective.videoFit;
      button.setAttribute('aria-pressed',String(selected));
      button.classList.toggle('selected',selected);
    });
    captionSizeButtons.forEach(button=>{
      const selected=button.dataset.prefCaptionSize===effective.captionSize;
      button.setAttribute('aria-pressed',String(selected));
      button.classList.toggle('selected',selected);
    });
    captionBackgroundButtons.forEach(button=>{
      const selected=button.dataset.prefCaptionBackground===effective.captionBackground;
      button.setAttribute('aria-pressed',String(selected));
      button.classList.toggle('selected',selected);
      button.disabled=button.dataset.prefCaptionBackground==='transparent' && !!(os.forcedColors || os.highContrast);
    });
    if(motion){motion.checked=effective.motion;motion.disabled=!!os.reducedMotion;}
    if(swipes)swipes.checked=effective.touchSwipes;
    if(rotate)rotate.checked=effective.autoRotate;
    const touch=touchCapable();
    touchOnly.forEach(el=>{el.hidden=!touch});
    if(help)help.textContent=(os.reducedTransparency || os.forcedColors || os.reducedMotion)
      ? 'Your device requires reduced transparency or motion. Those accessibility settings take priority while enabled.'
      : (overrides.surface===null || overrides.motion===null
        ? 'Automatically follows your device contrast and motion preferences until you choose otherwise.'
        : 'Your custom choices apply to this player.');
    if(announce)onChange({...overrides},{...effective});
    return effective;
  }
  function hide(restoreFocus=false){
    if(!shown)return;
    shown=false;
    panel.hidden=true;
    trigger.setAttribute('aria-expanded','false');
    skin.classList.remove('prism-preferences-open');
    if(restoreFocus && trigger.isConnected)trigger.focus({preventScroll:true});
  }
  function show(){
    if(shown)return;
    shown=true;
    panel.hidden=false;
    trigger.setAttribute('aria-expanded','true');
    skin.classList.add('prism-preferences-open');
    apply();
    close?.focus({preventScroll:true});
  }
  function showCaptionAppearance(open,{focus=true}={}){
    if(!captionAppearance || !captionTrackList)return;
    captionAppearance.hidden=!open;
    captionTrackList.hidden=open;
    captionGear?.setAttribute('aria-expanded',String(open));
    if(focus)(open ? captionBack : captionGear)?.focus({preventScroll:true});
  }
  // A focused caption control must not trigger the player's Space/K hotkeys.
  listen(captionMenu,'keydown',event=>{if(!['Escape','Tab'].includes(event.key))event.stopPropagation();});
  listen(captionGear,'click',event=>{event.stopPropagation();showCaptionAppearance(captionAppearance.hidden);});
  listen(captionBack,'click',event=>{event.stopPropagation();showCaptionAppearance(false);});
  listen(captionMenu,'keydown',event=>{
    // Escape from the appearance subpanel returns to language selection first.
    if(event.key==='Escape' && captionAppearance && !captionAppearance.hidden){
      event.preventDefault();event.stopImmediatePropagation();showCaptionAppearance(false);
    }
  },{capture:true});
  listen(captionTrigger,'click',()=>showCaptionAppearance(false,{focus:false}));
  // A closing Video.js menu should never reopen on its old appearance subview.
  if(captionMenu && typeof win.MutationObserver==='function'){
    const observer=new win.MutationObserver(()=>{
      if(!captionMenu.hasAttribute('data-open'))showCaptionAppearance(false,{focus:false});
    });
    observer.observe(captionMenu,{attributes:true,attributeFilter:['data-open']});
    subscriptions.push(()=>observer.disconnect());
  }
  listen(trigger,'click',()=>shown?hide(true):show());
  listen(close,'click',()=>hide(true));
  // These are real focus targets, not simulated keyboard demos. Closing the
  // menu first ensures the player hotkeys aren't intercepted by the overlay.
  function focusFromGuide(selector){
    const targetElement=selector==='.prism-skin' ? skin : skin.querySelector(selector);
    if(!targetElement)return;
    hide();
    // Video.js time sliders are custom elements; use an explicit tab stop
    // only when the particular integration has not registered one.
    if(selector==='.prism-rail' && targetElement.tabIndex<0)targetElement.tabIndex=0;
    targetElement.focus({preventScroll:true});
    if(win.document.activeElement===targetElement){
      targetElement.scrollIntoView?.({block:'nearest',behavior:'auto'});
    }
  }
  listen(guideFocusPlayer,'click',()=>focusFromGuide('.prism-skin'));
  listen(guideFocusTimeline,'click',()=>focusFromGuide('.prism-rail'));
  listen(panel,'pointerdown',event=>event.stopPropagation());
  listen(panel,'click',event=>event.stopPropagation());
  listen(skin,'pointerdown',event=>{
    if(shown && !panel.contains(event.target) && !trigger.contains(event.target))hide();
  },{capture:true});
  listen(win.document,'keydown',event=>{
    if(shown && event.key==='Escape'){
      event.preventDefault();event.stopPropagation();hide(true);
    }
  },{capture:true});
  listen(win.document,'pointerdown',event=>{
    if(shown && !skin.contains(event.target))hide();
  },{capture:true});
  listen(panel,'keydown',event=>{
    // Keep the nonmodal preferences overlay from firing playback hotkeys.
    if(!['Escape','Tab'].includes(event.key))event.stopPropagation();
  });
  listen(panel,'focusout',event=>{
    // Nonmodal dialog: dismiss only when focus actually moves outside.
    const next=event.relatedTarget;
    if(shown && next && !panel.contains(next) && next!==trigger)hide();
  });
  surfaceButtons.forEach(button=>listen(button,'click',()=>{overrides.surface=button.dataset.prefSurface;apply(true)}));
  captionSizeButtons.forEach(button=>listen(button,'click',()=>{overrides.captionSize=button.dataset.prefCaptionSize;apply(true)}));
  captionBackgroundButtons.forEach(button=>listen(button,'click',()=>{overrides.captionBackground=button.dataset.prefCaptionBackground;apply(true)}));
  videoFitButtons.forEach(button=>listen(button,'click',()=>{overrides.videoFit=button.dataset.prefVideoFit;apply(true)}));
  // Space is the native checkbox shortcut. Also accept Enter for PRISM's
  // keyboard-first player menu, without interfering with normal Space, Tab,
  // labels, or screen-reader-driven click/change events.
  for(const checkbox of [motion,swipes,rotate,remember]){
    listen(checkbox,'keydown',event=>{
      if(event.key!=='Enter')return;
      event.preventDefault();
      event.stopPropagation();
      if(!event.repeat && !checkbox.disabled)checkbox.click();
    });
  }
  listen(motion,'change',()=>{overrides.motion=motion.checked;apply(true)});
  listen(swipes,'change',()=>{overrides.touchSwipes=swipes.checked;apply(true)});
  listen(rotate,'change',()=>{overrides.autoRotate=rotate.checked;apply(true)});
  listen(remember,'change',()=>{
    const result=onRememberChange(remember.checked,{...overrides})??{};
    rememberEnabled=!!result.enabled;
    updateRememberNote(result.message);
  });
  for(const mq of Object.values(mediaQueries)){
    const onSystemChange=()=>{if(!target.isConnected)return;apply(true)};
    if(mq.addEventListener){mq.addEventListener('change',onSystemChange);subscriptions.push(()=>mq.removeEventListener('change',onSystemChange));}
    else if(mq.addListener){mq.addListener(onSystemChange);subscriptions.push(()=>mq.removeListener(onSystemChange));}
  }
  apply();
  return {
    setRememberState(enabled,message){rememberEnabled=!!enabled;updateRememberNote(message);},
    getOverrides:()=>({...overrides}),
    getEffective:()=>resolvePreferences(overrides,system()),
    open(section=null){
      show();
      if(section){
        const element=panel.querySelector(section);
        if(element){element.focus({preventScroll:true});element.scrollIntoView?.({block:'nearest'});}
      }
    },
    destroy(){hide();abort.abort();subscriptions.forEach(dispose=>dispose());}
  };
}
