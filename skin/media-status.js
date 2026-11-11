/** Minimal, browser-independent transport state tracker.
 * Tracks waiting/stalled events; a paused video is never called buffering.
 * The authoritative source of playback state remains the native media element.
 */
export function createTransportTracker() {
  let stalled = false;
  return (media, event) => {
    const type = event?.type || event || '';
    if (type === 'waiting' || type === 'stalled') stalled = true;
    if (['playing','canplay','canplaythrough','loadedmetadata','pause','ended','error','emptied'].includes(type)) stalled = false;
    if (media.error) return 'ERROR';
    if (media.ended) return 'ENDED';
    if (media.seeking) return 'SEEKING';
    if (media.paused) return 'PAUSED';
    return stalled || media.readyState < 3 ? 'BUFFERING' : 'PLAYING';
  };
}

/** HH:MM:SS on long recordings, MM:SS on short videos. */
export function formatMediaTime(value) {
  if (!Number.isFinite(value) || value < 0) return '--:--';
  const seconds = Math.floor(value);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const secs = seconds % 60;
  return hours ? `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}`
    : `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
}
