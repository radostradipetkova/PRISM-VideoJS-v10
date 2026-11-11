/** Opt-in inspection of real Video.js/custom-media state. Open ?qa=1.
 * No test action is simulated: results only advance on observed media events.
 */
const CHECKS = [
  ['modules','Video.js v10','Custom elements registered'],
  ['metadata','Media loaded','Real media duration is available'],
  ['play','Play / progress','Media is playing AND time is advancing'],
  ['pause','Pause','Browser entered a paused state'],
  ['seek','Seek / scrub','Browser completed a seek'],
  ['volume','Mute / volume','Real volume or mute state changed'],
  ['rate','Playback speed','Real playbackRate changed'],
  ['captions','Captions','Text track switched to showing'],
  ['fullscreen','Fullscreen','Browser entered native fullscreen'],
  ['pip','Picture-in-picture','Browser entered native PiP']
];

export function initPlayerQA(afterElement) {
  const panel=document.createElement('section');
  panel.id='prism-qa'; panel.className='prism-qa';
  panel.setAttribute('aria-label','Video.js player diagnostics');
  panel.innerHTML=`<div class="prism-qa-header"><div><div class="section-index">LIVE VERIFICATION / ?qa=1</div><h2>CONTROL<br><em>CHECK.</em></h2></div><p>Use the REAL video controls above. Results below reflect browser playback, native media events and player registration—not a simulated player. Check the keyboard and menu behaviour manually too.</p></div>
  <div class="prism-qa-grid">${CHECKS.map(([id,title,desc])=>`<div class="prism-qa-check" data-qa-check="${id}"><span class="qa-status" data-state="pending">WAITING</span><strong>${title}</strong><small>${desc}</small></div>`).join('')}</div>
  <p class="prism-qa-note">A green result confirms the specific media state occurred, not that every control is accessible. WAITING means untested, not failed. Mux HLS, browser-wide keyboard navigation and physical-device touch still need explicit verification.</p>
  <div class="prism-qa-actions"><button type="button" id="prism-export-audit">DOWNLOAD QA REPORT</button><span id="prism-qa-source" aria-live="polite">Checking source…</span></div>`;
  afterElement.after(panel);

  let dispose=()=>{};
  let sequence=0;
  let activeMedia=null;
  const update=(id,state,detail)=>{
    const el=panel.querySelector(`[data-qa-check="${id}"]`);
    if(!el)return;
    const label=el.querySelector('.qa-status');
    label.dataset.state=state;
    label.textContent=state==='pass'?'PASSED':state==='skip'?'UNAVAILABLE':state==='fail'?'ERROR':'WAITING';
    if(detail)el.querySelector('small').textContent=detail;
  };
  const getReport=()=>{
    const rows=CHECKS.map(([id,title])=>{
      const el=panel.querySelector(`[data-qa-check="${id}"]`);
      return `${title}: ${el.querySelector('.qa-status').textContent} — ${el.querySelector('small').textContent}`;
    });
    return [
      'PRISM / LIVE CONTROL CHECK',
      `Captured: ${new Date().toISOString()}`,
      `Source: ${activeMedia?.localName?.toLowerCase() === 'mux-video' ? 'Mux HLS' : 'Local MP4'}`,
      `Browser: ${navigator.userAgent}`,
      `Duration: ${Number.isFinite(activeMedia?.duration) ? activeMedia.duration.toFixed(2)+'s' : 'unknown'}`,
      `Current media error: ${activeMedia?.error?.message||'none observed'}`,
      '', ...rows, '',
      'MANUAL CHECKS NOT MEASURED BY THIS REPORT:',
      '- Tab focus order, accessible names and Enter/Space activation',
      '- Arrow seeking while playing, volume with Up/Down',
      '- Esc closes open speed and caption menus and exits fullscreen',
      '- Touch targets, phone browser, screen reader, 200% zoom',
      '- Bright and dark video readability',
      '', 'WAITING does not mean a failure; only completed actions can pass.'
    ].join('\n');
  };
  const exportButton=panel.querySelector('#prism-export-audit');
  const exportReport=()=>{
    const blob=new Blob([getReport()],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;link.download='prism-browser-audit.txt';
    document.body.append(link);link.click();link.remove();
    // Release the temporary resource after the browser queues the download.
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  exportButton.addEventListener('click',exportReport);
  return {setMedia(media,player,mount){
    dispose();const generation=++sequence;
    activeMedia=media;
    for(const [id,,desc] of CHECKS)update(id,'pending',desc);
    if(!media || !player)return;
    const clean=[];
    const on=(el,event,fn)=>{el.addEventListener(event,fn);clean.push(()=>el.removeEventListener(event,fn));};
    const source=media.localName==='mux-video'?'MUX HLS STREAM':'LOCAL MP4';
    panel.querySelector('#prism-qa-source').textContent=`CURRENT SOURCE / ${source}`;
    const duration=()=>Number.isFinite(media.duration)&&media.duration>0;
    const captions=()=>{
      if([...media.textTracks||[]].some(track=>track.mode==='showing'))
        update('captions','pass','A real caption track is showing');
    };
    const modules=['video-player','media-play-button','media-time-slider','media-volume-slider','media-menu','media-fullscreen-button','media-playback-rate-radio-group','media-captions-radio-group',...(media.localName==='mux-video'?['mux-video']:[])];
    Promise.all(modules.map(tag=>customElements.whenDefined(tag))).then(()=>{
      if(generation===sequence && mount.contains(player))update('modules','pass','Real Video.js components are registered');
    });
    if(duration())update('metadata','pass',`Loaded: ${media.duration.toFixed(1)}s / ${source}`);
    on(media,'loadedmetadata',()=>{if(duration())update('metadata','pass',`Loaded: ${media.duration.toFixed(1)}s / ${source}`)});
    // A play event can fire before media actually advances. Do not claim success
    // until actual playback starts AND currentTime progresses.
    let playingFrom=null;
    on(media,'play',()=>{playingFrom=null;});
    on(media,'playing',()=>{playingFrom=media.currentTime;});
    on(media,'timeupdate',()=>{
      if(!media.paused && playingFrom!==null && media.currentTime>playingFrom+.15)
        update('play','pass',`Playback progressed to ${media.currentTime.toFixed(1)}s`);
    });
    on(media,'pause',()=>update('pause','pass','Browser dispatched pause'));
    on(media,'seeked',()=>update('seek','pass',`Position: ${media.currentTime.toFixed(1)}s`));
    on(media,'volumechange',()=>update('volume','pass',`Muted: ${media.muted?'yes':'no'} · Volume: ${Math.round(media.volume*100)}%`));
    on(media,'ratechange',()=>update('rate','pass',`Native playbackRate: ${media.playbackRate}×`));
    on(media,'enterpictureinpicture',()=>update('pip','pass','Native PiP entered'));
    on(media,'error',()=>update('metadata','fail',media.error?.message||'The video reported a playback error'));
    on(document,'fullscreenchange',()=>{
      if(document.fullscreenElement&&(player.contains(document.fullscreenElement)||document.fullscreenElement.contains(player)))
        update('fullscreen','pass','Native fullscreen entered');
    });
    if(media.textTracks?.addEventListener)on(media.textTracks,'change',captions);
    captions();
    if(!document.pictureInPictureEnabled||!media.requestPictureInPicture)update('pip','skip','Unavailable in this browser');
    if(!document.fullscreenEnabled)update('fullscreen','skip','Unavailable in this browser');
    dispose=()=>clean.forEach(off=>off());
  },destroy(){dispose();sequence++;exportButton.removeEventListener('click',exportReport);panel.remove();}};
}
