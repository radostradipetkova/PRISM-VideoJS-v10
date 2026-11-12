/** PRISM / Moment Stamp
 * A small, optional pause-time link control. The embedder supplies its URL
 * builder so links always restore the correct film in the host application.
 * It does not seek on its own or override native Video.js controls.
 */
export function parseMomentSeconds(value){
  if(typeof value!=='string' || !/^\d{1,6}(?:\.\d{1,2})?$/.test(value))return null;
  const seconds=Number(value);
  return Number.isFinite(seconds)&&seconds>=0&&seconds<=86400?seconds:null;
}
export function formatMomentTime(seconds){
  const time=Math.max(0,Math.floor(Number(seconds)||0));
  const parts=[Math.floor(time/3600),Math.floor(time%3600/60),time%60];
  if(!parts[0])parts.shift();
  return parts.map(n=>String(n).padStart(2,'0')).join(':');
}
export function createMomentUrl(href,seconds,film,{localCinematic=false}={}){
  if(!Number.isFinite(seconds)||seconds<0||seconds>86400)return null;
  if(!['cinematic','night','coast','liveaction'].includes(film))return null;
  const url=new URL(href);
  if(!['https:','http:'].includes(url.protocol))return null;
  url.searchParams.set('film',film);
  url.searchParams.set('t',String(Math.round(seconds*100)/100));
  url.searchParams.delete('qa');
  if(film==='cinematic'){
    if(localCinematic)url.searchParams.set('source','local');
    else url.searchParams.delete('source');
  }
  url.hash='player-wrap';
  return url.toString();
}
export async function copyMomentLink(link){
  if(globalThis.navigator?.clipboard?.writeText){
    try{await globalThis.navigator.clipboard.writeText(link);return true;}
    catch(_){/* Some Safari contexts block the Clipboard API. */}
  }
  const doc=globalThis.document;
  if(!doc?.body || typeof doc.execCommand!=='function')return false;
  const field=doc.createElement('textarea');
  field.value=link;
  field.setAttribute('readonly','');
  field.style.cssText='position:fixed;left:-9999px;top:0;opacity:0';
  doc.body.append(field);
  field.select();
  field.setSelectionRange(0,field.value.length);
  let copied=false;
  try{copied=doc.execCommand('copy');}catch(_){copied=false;}
  field.remove();
  return copied;
}
export function initMomentStamp({skin,media,getLink,copyLink=copyMomentLink}){
  const button=skin.querySelector('.prism-moment-stamp');
  if(!button || typeof getLink!=='function')return {destroy(){}};
  const timeDisplay=button.querySelector('.prism-moment-time');
  const actionDisplay=button.querySelector('.prism-moment-action');
  const feedback=button.querySelector('.prism-moment-feedback');
  const listeners=[];
  let destroyed=false;
  let copySerial=0;
  let played=false;
  let feedbackTimer=null;
  const listen=(node,type,handler)=>{
    node.addEventListener(type,handler);
    listeners.push([node,type,handler]);
  };
  const resetFeedback=()=>{
    if(feedbackTimer!==null){clearTimeout(feedbackTimer);feedbackTimer=null;}
    if(actionDisplay)actionDisplay.textContent='COPY MOMENT';
  };
  function update(){
    if(destroyed)return;
    const seconds=Number(media.currentTime)||0;
    const label=formatMomentTime(seconds);
    if(timeDisplay)timeDisplay.textContent=label;
    button.setAttribute('aria-label','Copy a link to this film at '+label);
    button.hidden=!media.paused||media.ended||!(played||seconds>.05);
  }
  const onPlay=()=>{played=true;resetFeedback();update();};
  const onPause=()=>update();
  const onTime=()=>update();
  const onClick=async()=>{
    if(destroyed||button.hidden)return;
    const seconds=Number(media.currentTime);
    let link;
    try{link=getLink(seconds);}catch(_){link=null;}
    if(typeof link!=='string'||!/^https?:\/\//.test(link)){
      if(feedback)feedback.textContent='Could not create a moment link.';
      if(actionDisplay)actionDisplay.textContent='UNAVAILABLE';
      return;
    }
    const serial=++copySerial;
    let copied=false;
    try{copied=Boolean(await copyLink(link));}catch(_){copied=false;}
    if(destroyed||serial!==copySerial)return;
    if(actionDisplay)actionDisplay.textContent=copied?'COPIED':'COPY FAILED';
    if(feedback)feedback.textContent=copied
      ? 'Link copied for '+formatMomentTime(seconds)
      : 'Clipboard unavailable. Check browser permissions.';
    if(feedbackTimer!==null)clearTimeout(feedbackTimer);
    feedbackTimer=setTimeout(resetFeedback,1900);
  };
  listen(media,'play',onPlay);
  for(const name of ['pause','seeked','timeupdate','loadedmetadata','ended']){
    listen(media,name,onTime);
  }
  listen(button,'click',onClick);
  update();
  return {
    destroy(){
      destroyed=true;copySerial++;
      if(feedbackTimer!==null)clearTimeout(feedbackTimer);
      for(const [node,type,fn] of listeners)node.removeEventListener(type,fn);
    }
  };
}
/** Restore one URL moment once metadata and a seekable timeline are ready.
 * No autoplay, and no seek outside actual available ranges. Returns cleanup.
 */
export function restoreMomentToMedia(media,seconds){
  if(!Number.isFinite(seconds)||seconds<0||seconds>86400)return ()=>{};
  let active=true;
  let expected=null;
  let timeout=null;
  const events=['loadedmetadata','loadeddata','canplay','durationchange','progress','seeked'];
  const stop=()=>{
    if(!active)return;
    active=false;
    for(const event of events)media.removeEventListener(event,attempt);
    clearTimeout(timeout);
  };
  function attempt(){
    if(!active)return;
    if(media.error){stop();return;}
    const duration=Number(media.duration);
    if(!Number.isFinite(duration)||duration<=0||media.readyState<1)return;
    const available=media.seekable;
    const count=available?.length??0;
    if(!count && media.readyState<3)return;
    let goal=Math.max(0,Math.min(seconds,duration-.08));
    if(count){
      try{
        let closest=null;
        for(let i=0;i<count;i++){
          const from=available.start(i),to=available.end(i);
          if(goal>=from&&goal<=to){closest=goal;break;}
          const at=Math.max(from,Math.min(goal,to));
          if(closest===null||Math.abs(goal-at)<Math.abs(goal-closest))closest=at;
        }
        if(closest!==null)goal=closest;
      }catch(_){return;}
    }
    if(Math.abs(Number(media.currentTime)-goal)<.24){
      if(!media.seeking){stop();return;}
    }else{
      expected=goal;
      try{media.currentTime=goal;}catch(_){/* retry at the next readiness event */}
    }
    if(expected!==null && !media.seeking &&
      Math.abs(Number(media.currentTime)-expected)<.24)stop();
  }
  for(const event of events)media.addEventListener(event,attempt);
  timeout=setTimeout(stop,18000);
  attempt();
  return stop;
}
