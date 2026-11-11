/**
 * PRISM / Cinematic Character Reveal
 * The authored text stays fully intact (kerning, wrapping, italic serif,
 * semantics). Individual visual glyphs are measured with DOM Ranges and
 * animated in an aria-hidden overlay; the original is restored at the end.
 * No changes to media, playback, or existing interaction elements.
 */
export function initTypeMotion({root=document,viewport=window}={}) {
  const doc=root.documentElement || document.documentElement;
  const headings=[...root.querySelectorAll(
    '.hero-heading-area h1, .feature-title h2, .feature-card-bottom h3'
  )];
  const reduced=viewport.matchMedia?.('(prefers-reduced-motion: reduce)');
  // The option now lives inside each player, not the showcase workbench.
  // Keep the page's editorial text motion synchronized with the active player.
  let manualMinimal=null;
  const isMinimal=()=>Boolean(manualMinimal ?? reduced?.matches);
  const toGraphemes=(text)=>{
    if (typeof Intl!=='undefined' && Intl.Segmenter) {
      return [...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)]
        .map(part=>part.segment);
    }
    return Array.from(text);
  };
  const observed=new Set();
  const records=new Map();
  const timers=new Set();
  let queued=false;

  function collect(source,hero,quote,small,stagger) {
    const items=[];
    const accents=[];
    let step=0;
    function visit(node,italic=false){
      if(node.nodeType===3){
        const text=node.nodeValue;
        let offset=0;
        for(const grapheme of toGraphemes(text)){
          const start=offset;
          offset+=grapheme.length;
          if(/^\s+$/u.test(grapheme)){
            step+=Math.min(grapheme.length,1.25);
            continue;
          }
          items.push({node,start,end:offset,glyph:grapheme,italic,delay:Math.round(step*stagger)});
          step++;
        }
      } else if(node.nodeType===1){
        if(node.classList?.contains('type-line') && node.previousElementSibling){
          step+=hero?2.2:1.2;
        }
        if(node.localName==='br'){
          step+=hero?2.2:1.2;
          return;
        }
        const isEm=node.localName==='em';
        if(isEm)step+=hero?1.5:.45;
        for(const child of [...node.childNodes])visit(child,italic||isEm);
        if(isEm){
          const last=items.length?items[items.length-1].delay:0;
          const duration=hero?820:quote?640:small?670:750;
          accents.push({element:node,delay:Math.round(last+duration+110)});
        }
      }
    }
    for(const child of [...source.childNodes])visit(child);
    return {items,accents};
  }

  function measureAndPosition(heading){
    const rec=records.get(heading);
    if(!rec)return;
    const base=heading.getBoundingClientRect();
    const range=root.createRange();
    for(const item of rec.items){
      range.setStart(item.node,item.start);
      range.setEnd(item.node,item.end);
      const rect=range.getBoundingClientRect();
      const css=viewport.getComputedStyle(item.node.parentElement);
      const el=item.element;
      el.style.left=`${(rect.left-base.left).toFixed(3)}px`;
      el.style.top=`${(rect.top-base.top).toFixed(3)}px`;
      el.style.width=`${rect.width.toFixed(3)}px`;
      el.style.height=`${rect.height.toFixed(3)}px`;
      el.style.fontFamily=css.fontFamily;
      el.style.fontSize=css.fontSize;
      el.style.fontWeight=css.fontWeight;
      el.style.fontStyle=css.fontStyle;
      el.style.letterSpacing=css.letterSpacing;
      el.style.lineHeight=css.lineHeight;
      el.style.fontVariant=css.fontVariant;
    }
  }
  function measureAll(){
    queued=false;
    if(isMinimal())return;
    for(const heading of headings){
      if(!heading.classList.contains('type-finished'))measureAndPosition(heading);
    }
  }
  function queueMeasure(){
    if(queued)return;
    queued=true;
    viewport.requestAnimationFrame(measureAll);
  }
  const observer=viewport.IntersectionObserver
    ? new viewport.IntersectionObserver(entries=>{
        for(const entry of entries)if(entry.isIntersecting)reveal(entry.target);
      },{threshold:.08,rootMargin:'0px 0px -5% 0px'})
    :null;
  const resizeObserver=viewport.ResizeObserver?new viewport.ResizeObserver(queueMeasure):null;
  function reveal(heading){
    const rec=records.get(heading);
    if(!rec)return;
    if(!heading.classList.contains('type-inview')){
      heading.classList.add('type-inview');
      // Exactly one timed handoff from the overlay to the original text.
      // The final rendered typography remains the author's unmodified DOM.
      if(!isMinimal()){
        const timeout=viewport.setTimeout(()=>{
          timers.delete(timeout);
          heading.classList.add('type-finished');
        },rec.finishAfter);
        timers.add(timeout);
      }
    }
    observer?.unobserve(heading);
    observed.delete(heading);
  }

  for(const heading of headings){
    if(heading.dataset.typePrepared==='true')continue;
    const hero=heading.matches('.hero-heading-area h1');
    const quote=heading.matches('.manifesto-body p');
    const small=heading.matches('.feature-card-bottom h3');
    const stagger=hero?47:quote?23:small?31:40;
    const duration=hero?820:quote?640:small?670:740;
    const originalLabel=heading.innerText.replace(/\s+/g,' ').trim();
    if(originalLabel&&!heading.hasAttribute('aria-label'))heading.setAttribute('aria-label',originalLabel);
    // Preserve PRISM's existing editorial line wrappers exactly for its four
    // original large titles. They are part of the current layout metrics.
    // Feature-card heading typography stays untouched.
    if(!quote&&!small){
      const originalNodes=[...heading.childNodes];
      const lines=root.createDocumentFragment();
      let inner=root.createElement('span');
      const appendLine=()=>{
        const outer=root.createElement('span');
        outer.className='type-line';
        inner.className='type-line-inner';
        outer.append(inner);
        lines.append(outer);
        inner=root.createElement('span');
      };
      for(const child of originalNodes){
        if(child.nodeName==='BR')appendLine();
        else inner.append(child);
      }
      appendLine();
      heading.replaceChildren(lines);
    }
    const source=root.createElement('span');
    source.className='type-source';
    source.replaceChildren(...heading.childNodes);
    const overlay=root.createElement('span');
    overlay.className='type-overlay';
    overlay.setAttribute('aria-hidden','true');
    const {items,accents}=collect(source,hero,quote,small,stagger);
    for(const item of items){
      const el=root.createElement('span');
      el.className='type-char';
      el.textContent=item.glyph;
      el.style.setProperty('--char-delay',`${item.delay}ms`);
      if(item.italic)el.dataset.italic='true';
      overlay.append(el);
      item.element=el;
    }
    for(const accent of accents){
      accent.element.style.setProperty('--underline-delay',`${accent.delay}ms`);
    }
    heading.style.setProperty('--type-duration',`${duration}ms`);
    heading.classList.add('type-stagger',hero?'type-hero':small?'type-small':quote?'type-quote':'type-section');
    heading.append(source,overlay);
    heading.dataset.typePrepared='true';
    const lastDelay=items.at(-1)?.delay??0;
    const finishAfter=Math.max(lastDelay+duration+120,
      ...accents.map(accent=>accent.delay+680+90));
    records.set(heading,{items,duration,lastDelay,finishAfter});
    resizeObserver?.observe(heading);
  }
  // Read DOM positions only once after setup and subsequently on resize or
  // font readiness. All per-glyph mutations remain absolutely positioned.
  measureAll();
  root.fonts?.ready?.then(queueMeasure);
  viewport.addEventListener?.('resize',queueMeasure,{passive:true});

  function sync(){
    const minimal=isMinimal();
    doc.classList.toggle('type-motion-enabled',!minimal);
    doc.classList.toggle('minimal-type-motion',minimal);
    doc.classList.remove('type-booting');
    if(minimal||!observer){
      for(const heading of headings){
        reveal(heading);
        heading.classList.add('type-finished');
      }
    }else{
      queueMeasure();
      for(const heading of headings){
        if(heading.classList.contains('type-inview')||observed.has(heading))continue;
        observer.observe(heading);
        observed.add(heading);
      }
    }
  }
  reduced?.addEventListener?.('change',sync);
  sync();
  return {
    setMinimal(value){manualMinimal=typeof value==='boolean'?value:null;sync();},
    destroy(){
      observer?.disconnect();resizeObserver?.disconnect();
      reduced?.removeEventListener?.('change',sync);
      viewport.removeEventListener?.('resize',queueMeasure);
      for(const timer of timers)viewport.clearTimeout(timer);
      doc.classList.remove('type-motion-enabled','minimal-type-motion','type-booting');
    }
  };
}
