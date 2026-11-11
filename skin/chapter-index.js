/** PRISM adaptive Optical Index — reusable chapter data, independent of playback UI.
 * Author-supplied chapters or standard HTML <track kind="chapters"> cues are
 * authoritative. Time markers are an explicit opt-in, NEVER scene detection.
 */
export const formatIndexTime = (seconds) => {
  const n = Math.max(0, Math.floor(Number(seconds) || 0));
  const pad = v => String(v).padStart(2, '0');
  return n >= 3600
    ? `${pad(Math.floor(n / 3600))}:${pad(Math.floor(n / 60) % 60)}:${pad(n % 60)}`
    : `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;
};

export function normalizeChapters(items, duration=NaN) {
  const max = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
  const source = Array.isArray(items) ? items : [];
  const normalized = source.map((entry, index) => {
    const t = Number(entry?.time ?? entry?.startTime);
    const raw = String(entry?.title ?? entry?.text ?? '').trim();
    if (!Number.isFinite(t) || t < 0 || t >= max || !raw) return null;
    return {time:t, title:raw.slice(0, 180), originalIndex:index};
  }).filter(Boolean).sort((a,b) => a.time-b.time || a.originalIndex-b.originalIndex);
  const result=[];
  for(const entry of normalized){
    if(result.length && Math.abs(result[result.length-1].time-entry.time) < .001) continue;
    result.push({time:entry.time,title:entry.title});
  }
  return result;
}

export function chaptersFromTextTracks(media) {
  const tracks=[];
  // HTMLMediaElement.textTracks supports programmatically-added chapters.
  // <track> elements cover native <video> and Mux's custom media element.
  for (const track of Array.from(media?.textTracks || [])) if(track?.kind==='chapters') tracks.push(track);
  for (const el of Array.from(media?.querySelectorAll?.('track[kind="chapters"]') || [])) {
    if(el.track && !tracks.includes(el.track)) tracks.push(el.track);
  }
  for(const track of tracks){
    const cues=Array.from(track.cues || []).map(cue=>({time:cue.startTime,title:cue.text}));
    const normalized=normalizeChapters(cues);
    if(normalized.length) return normalized;
  }
  return [];
}

/** No auto scene recognition. Markers are accurate times derived from duration. */
export function timeMarkers(duration) {
  if(!Number.isFinite(duration) || duration<=0) return [];
  const count=duration<120?4:duration<1200?6:duration<3600?8:12;
  return Array.from({length:count},(_,index)=>{
    const t=duration*index/count;
    return {time:t,title:formatIndexTime(t)};
  });
}

/** Modes: auto = authored only; time = authored or time markers; none = hidden. */
export function resolveIndex({configured=[],tracked=[],duration=NaN,mode='auto'}={}) {
  if(mode==='none') return {entries:[],type:'none'};
  const explicit=normalizeChapters(configured,duration);
  if(explicit.length) return {entries:explicit,type:'chapters'};
  const fromTrack=normalizeChapters(tracked,duration);
  if(fromTrack.length) return {entries:fromTrack,type:'chapters'};
  if(mode==='time') return {entries:timeMarkers(duration),type:'time'};
  return {entries:[],type:'none'};
}

export function indexLayout(count) {
  if(count>=2 && count<=4) return 'radial';
  if(count>=13) return 'library';
  return 'list';
}

/** WebVTT fallback parser for custom media elements that don't expose native cues.
 * Native TextTrackCue is preferred; this handles ordinary chapter cue text,
 * optional cue IDs and cue settings without reading subtitle tracks.
 */
export function parseChapterVTT(raw) {
  if (typeof raw !== 'string' || !/^\uFEFF?WEBVTT(?:\s|$)/.test(raw)) return [];
  const parseClock = value => {
    const parts=value.split(':');
    if(parts.length!==2 && parts.length!==3) return NaN;
    const tail=parts.pop();
    if(!/^\d{2}\.\d{3}$/.test(tail)) return NaN;
    const sec=Number(tail);
    const minute=Number(parts.pop());
    const hour=parts.length?Number(parts[0]):0;
    if(!Number.isFinite(minute)||minute>59||sec>=60||(!parts.length && minute<0))return NaN;
    return hour*3600+minute*60+sec;
  };
  const blocks=raw.replace(/\r/g,'').split(/\n\s*\n/).slice(1);
  const entries=[];
  for(const block of blocks){
    const lines=block.split('\n').map(x=>x.trim()).filter(Boolean);
    if(!lines.length || /^(NOTE|STYLE|REGION)(?:\s|$)/.test(lines[0]))continue;
    const timeIndex=lines.findIndex(x=>x.includes('-->'));
    if(timeIndex<0)continue;
    const header=lines[timeIndex].split('-->');
    if(header.length!==2)continue;
    const time=parseClock(header[0].trim());
    const end=parseClock(header[1].trim().split(/\s+/)[0]);
    const text=lines.slice(timeIndex+1).join(' ').trim();
    if(Number.isFinite(time)&&Number.isFinite(end)&&end>time&&text) entries.push({time,title:text});
  }
  return normalizeChapters(entries);
}
