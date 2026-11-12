/** PRISM Optical Deck — contextual control explanations.
 * One tooltip per mounted player, shared by mouse hover and keyboard focus.
 * Tooltips live directly in the media container so menus and controls never
 * overflow their own clipped parents. All text is set with textContent.
 */
export function initControlHints({skin,media}){
  if(!skin || !media)return {destroy(){}};
  const hint=document.createElement('div');
  hint.className='prism-control-hint';
  hint.setAttribute('role','tooltip');
  hint.hidden=true;
  skin.append(hint);
  let anchor=null,mode=null;
  function labelFor(element){
    switch(element?.dataset.prismHint){
      case 'play':return media.paused?'Play video':'Pause video';
      case 'mute':return media.muted || media.volume===0?'Unmute audio':'Mute audio';
      case 'fullscreen':return (document.fullscreenElement||document.webkitFullscreenElement)?'Exit fullscreen':'Enter fullscreen';
      case 'playback':return element.getAttribute('aria-label') || 'Playback speed';
      case 'seek':return 'Seek timeline · hover to preview';
      default:return element?.dataset.prismHint || '';
    }
  }
  function hide(){
    hint.hidden=true;
    anchor=null;mode=null;
  }
  function blocked(){
    return !!skin.querySelector('media-menu[data-open],.prism-preferences-panel:not([hidden]),dialog[open]');
  }
  function position(){
    if(!anchor || hint.hidden)return;
    const view=skin.getBoundingClientRect();
    const box=anchor.getBoundingClientRect();
    if(box.width===0 || box.height===0 || getComputedStyle(anchor).visibility==='hidden'){
      hide();return;
    }
    const tip=hint.getBoundingClientRect();
    const x=Math.max(6,Math.min(view.width-tip.width-6,box.left-view.left+box.width/2-tip.width/2));
    let y=box.top-view.top-tip.height-9;
    if(y<6)y=box.bottom-view.top+9;
    if(y+tip.height>view.height-6)y=Math.max(6,view.height-tip.height-6);
    hint.style.left=Math.round(x)+'px';
    hint.style.top=Math.round(y)+'px';
  }
  function show(element,nextMode){
    if(!element?.hasAttribute?.('data-prism-hint') || blocked())return;
    const label=labelFor(element);
    if(!label)return;
    anchor=element;mode=nextMode;
    hint.textContent=label;
    hint.hidden=false;
    position();
  }
  function onPointerOver(event){
    if(event.pointerType==='touch')return;
    const element=event.target.closest?.('[data-prism-hint]');
    if(!element || !skin.contains(element))return;
    if(element===anchor && mode==='hover')return;
    show(element,'hover');
  }
  function onPointerOut(event){
    if(mode!=='hover' || !anchor)return;
    const next=event.relatedTarget;
    if(next && anchor.contains(next))return;
    if(next && next.closest?.('[data-prism-hint]')===anchor)return;
    hide();
  }
  function onFocus(event){
    const element=event.target.closest?.('[data-prism-hint]');
    if(element && skin.contains(element))show(element,'focus');
  }
  function onBlur(event){
    if(mode==='focus' && anchor && (event.target===anchor || anchor.contains(event.target)))hide();
  }
  function update(){
    if(anchor && !hint.hidden){
      if(blocked()){hide();return;}
      hint.textContent=labelFor(anchor);
      position();
    }
  }
  function onKey(event){if(event.key==='Escape')hide();}
  skin.addEventListener('pointerover',onPointerOver);
  skin.addEventListener('pointerout',onPointerOut);
  skin.addEventListener('focusin',onFocus);
  skin.addEventListener('focusout',onBlur);
  skin.addEventListener('pointerdown',hide);
  skin.addEventListener('click',hide);
  skin.addEventListener('keydown',onKey);
  media.addEventListener('play',update);
  media.addEventListener('pause',update);
  media.addEventListener('volumechange',update);
  document.addEventListener('fullscreenchange',update);
  document.addEventListener('webkitfullscreenchange',update);
  window.addEventListener('resize',update);
  return {destroy(){
    skin.removeEventListener('pointerover',onPointerOver);
    skin.removeEventListener('pointerout',onPointerOut);
    skin.removeEventListener('focusin',onFocus);
    skin.removeEventListener('focusout',onBlur);
    skin.removeEventListener('pointerdown',hide);
    skin.removeEventListener('click',hide);
    skin.removeEventListener('keydown',onKey);
    media.removeEventListener('play',update);
    media.removeEventListener('pause',update);
    media.removeEventListener('volumechange',update);
    document.removeEventListener('fullscreenchange',update);
    document.removeEventListener('webkitfullscreenchange',update);
    window.removeEventListener('resize',update);
    hint.remove();
  }};
}
