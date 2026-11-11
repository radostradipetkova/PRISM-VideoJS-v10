/** PRISM's optional read-only Mux AI chapter bridge.
 * Mux Robots Directives perform generation when uploads are ready. This Worker
 * ONLY reads chapter tracks already attached to assets; it never starts a
 * billable AI job from a public visitor request.
 * MUX_TOKEN_ID / MUX_TOKEN_SECRET are server-side Worker secrets.
 */
const json=(body,status=200,maxAge=0)=>new Response(JSON.stringify(body),{
  status,
  headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':maxAge>0?`public, max-age=${maxAge}`:'no-store',
    'x-content-type-options':'nosniff',
    'access-control-allow-origin':'same-origin'
  }
});
export function normalizeMuxChapters(items){
  if(!Array.isArray(items))return [];
  const chapters=items.map(item=>{
    const time=Number(item?.['start-time']??item?.start_time??item?.time);
    const title=item?.titles?.find?.(x=>typeof x?.title==='string')?.title??item?.title;
    return {time,title:typeof title==='string'?title.trim().slice(0,180):''};
  }).filter(x=>Number.isFinite(x.time)&&x.time>=0&&x.title);
  chapters.sort((a,b)=>a.time-b.time);
  return chapters.filter((x,i)=>i===0||x.time-chapters[i-1].time>.01);
}
async function muxRequest(path,authorization){
  const res=await fetch(`https://api.mux.com${path}`,{
    headers:{authorization},signal:AbortSignal.timeout(9000)
  });
  if(!res.ok)throw new Error(`Mux API request failed (${res.status})`);
  return (await res.json())?.data;
}
async function muxChapters(request,env){
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  const id=new URL(request.url).searchParams.get('playback_id')||'';
  if(!/^[A-Za-z0-9]{5,128}$/.test(id))return json({error:'Invalid Mux playback ID'},400);
  if(!env.MUX_TOKEN_ID||!env.MUX_TOKEN_SECRET)return json({chapters:[],source:'not-configured'});
  const authorization='Basic '+btoa(env.MUX_TOKEN_ID+':'+env.MUX_TOKEN_SECRET);
  try{
    const lookup=await muxRequest(`/video/v1/playback-ids/${id}`,authorization);
    if(lookup?.object?.type!=='asset')return json({chapters:[],source:'not-video-on-demand'});
    // Restrict metadata to public assets belonging to this Mux account.
    const asset=await muxRequest(`/video/v1/assets/${encodeURIComponent(lookup.object.id)}`,authorization);
    const publicPlayback=asset?.playback_ids?.some(x=>x.id===id && x.policy==='public');
    if(!publicPlayback)return json({chapters:[],source:'not-public'},403);
    const track=asset?.tracks?.find(x=>x.type==='text'&&x.text_type==='chapters'&&x.status==='ready');
    if(!track)return json({chapters:[],source:'awaiting-chapters'},200,30);
    const res=await fetch(`https://stream.mux.com/${id}/chapters/${encodeURIComponent(track.id)}.json`,{
      signal:AbortSignal.timeout(9000)
    });
    if(!res.ok)throw new Error(`Mux chapters delivery failed (${res.status})`);
    const chapters=normalizeMuxChapters(await res.json());
    return json({chapters,source:'mux-chapter-track'},200,chapters.length?180:30);
  }catch(_){
    // Never expose API tokens, upstream responses or internal account details.
    return json({chapters:[],source:'temporarily-unavailable'},200,15);
  }
}
export default {
  async fetch(request,env){
    const path=new URL(request.url).pathname;
    if(path==='/api/mux/chapters')return muxChapters(request,env);
    if(path.startsWith('/api/'))return json({error:'Unknown API endpoint'},404);
    return env.ASSETS.fetch(request);
  }
};
