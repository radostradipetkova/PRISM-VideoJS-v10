/**
 * The three Anatomy cards are functional companions to the REAL media element.
 * They never pretend that their state is independent of playback.
 * Calling setMedia on every source change detaches listeners from the old video.
 */
const shortTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const remaining = String(total % 60).padStart(2, '0');
  return `${String(minutes).padStart(2, '0')}:${remaining}`;
};
const finiteDuration = media => {
  const duration = Number(media?.duration);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
};
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

export function initFeatureDemos(root = document) {
  const rail = root.querySelector('.rail-mini-line');
  const slider = root.querySelector('#rail-demo-range');
  const currentTime = root.querySelector('#rail-demo-current');
  const durationLabel = root.querySelector('#rail-demo-duration');
  const railFeedback = root.querySelector('#rail-demo-hint');
  const apertureCard = root.querySelector('.aperture-card');
  const apertureButton = root.querySelector('.aperture-toggle');
  const apertureState = root.querySelector('.aperture-demo-state');
  const accessCard = root.querySelector('.access-card');
  const accessFeedback = root.querySelector('.access-demo-feedback');
  const accessButtons = [...root.querySelectorAll('[data-demo-key]')];

  let media = null;
  let dragging = false;
  let detachMedia = () => {};
  let flashTimeout = null;
  let mediaGeneration = 0;
  let pendingSeek = null;

  const announce = (element, message) => {
    // Only announce actual state changes: avoid repeating an aria-live message
    // on every video timeupdate event.
    if (element.textContent !== message) element.textContent = message;
  };

  function sync() {
    const duration = finiteDuration(media);
    const time = media ? Number(media.currentTime) || 0 : 0;
    slider.disabled = !duration || !media?.seekable?.length;
    slider.max = String(duration ?? 1);
    if (!dragging) slider.value = String(duration ? clamp(time, 0, duration) : 0);
    rail.style.setProperty('--demo-progress', `${duration ? (clamp(time, 0, duration) / duration) * 100 : 0}%`);
    currentTime.textContent = duration ? shortTime(time) : '00:00';
    durationLabel.textContent = duration ? shortTime(duration) : '—';
    slider.setAttribute('aria-valuetext', duration ? `${shortTime(time)} of ${shortTime(duration)}` : 'Seeking unavailable');

    const playing = !!media && !media.paused && !media.ended;
    apertureCard.classList.toggle('is-playing', playing);
    apertureButton.setAttribute('aria-label', playing ? 'Pause video' : 'Play video');
    apertureButton.setAttribute('aria-pressed', String(playing));
    apertureButton.disabled = !media;
    if (media) announce(apertureState, playing ? 'PLAYING / LIVE PLAYER' : media.ended ? 'ENDED / PRESS TO REPLAY' : 'PAUSED / PRESS TO PLAY');
    else announce(apertureState, 'PLAYER IS PREPARING');
    if (!duration) announce(railFeedback, media ? 'PREPARING SEEKABLE TIMELINE' : 'CHOOSE A FILM TO ENABLE SEEKING');
  }

  function seekTo(seconds) {
    const duration = finiteDuration(media);
    if (!duration || !media.seekable?.length) {
      // iOS may expose seekable intervals after metadata/canplay even though
      // the viewer already tapped the control. Retain that deliberate seek.
      if (media && !media.error && !media.ended && media.readyState < 3) {
        pendingSeek = { media, seconds, generation: mediaGeneration };
        railFeedback.textContent = 'WAITING FOR VIDEO TO BECOME SEEKABLE';
      } else {
        railFeedback.textContent = 'SEEKING IS NOT AVAILABLE';
      }
      return false;
    }
    pendingSeek = null;
    // Do not seek outside the browser-provided seekable intervals (e.g. live windows).
    let target = clamp(Number(seconds) || 0, 0, duration);
    const ranges = media.seekable;
    let nearest = target;
    let distance = Infinity;
    for (let i = 0; i < ranges.length; i++) {
      const from = ranges.start(i), to = ranges.end(i);
      const candidate = clamp(target, from, to);
      if (Math.abs(candidate - target) < distance) { nearest = candidate; distance = Math.abs(candidate - target); }
    }
    target = nearest;
    try { media.currentTime = target; }
    catch { railFeedback.textContent = 'SEEK COULD NOT BE COMPLETED'; return false; }
    railFeedback.textContent = `SEEKED TO ${shortTime(target)} / ${shortTime(duration)}`;
    sync();
    return true;
  }

  async function togglePlayback() {
    if (!media) return false;
    const activeMedia = media;
    if (!activeMedia.paused && !activeMedia.ended) {
      activeMedia.pause();
      if (media === activeMedia) sync();
      return true;
    }
    try {
      // The promise resolves only if the browser permits real playback.
      await activeMedia.play();
      if (media === activeMedia) sync();
      return true;
    } catch {
      if (media === activeMedia) apertureState.textContent = 'PLAYBACK BLOCKED / TRY THE PLAYER ABOVE';
      return false;
    }
  }

  function seekRelative(amount) {
    const before = Number(media?.currentTime) || 0;
    return seekTo(before + amount);
  }

  function flashKey(key) {
    for (const button of accessButtons) button.classList.toggle('is-pressed', button.dataset.demoKey === key);
    if (flashTimeout) clearTimeout(flashTimeout);
    flashTimeout = setTimeout(() => accessButtons.forEach(button => button.classList.remove('is-pressed')), 170);
  }

  async function runKey(key) {
    flashKey(key);
    if (!media) { accessFeedback.textContent = 'PLAYER UNAVAILABLE'; return; }
    const activeMedia = media;
    if (key === 'toggle') {
      const worked = await togglePlayback();
      if (media !== activeMedia) return;
      accessFeedback.textContent = worked ? `SPACE / ${media.paused ? 'PAUSED' : 'PLAYING'}` : 'SPACE / PLAYBACK BLOCKED';
    } else {
      const amount = key === 'back' ? -5 : 5;
      const worked = seekRelative(amount);
      accessFeedback.textContent = worked ? `${amount < 0 ? '← BACK' : '→ FORWARD'} / ${shortTime(media.currentTime)}`
        : pendingSeek?.media === media ? 'WAITING FOR VIDEO / SEEK QUEUED' : 'SEEK UNAVAILABLE';
    }
  }

  slider.addEventListener('input', () => seekTo(Number(slider.value)));
  slider.addEventListener('pointerdown', () => { dragging = true; rail.classList.add('is-dragging'); });
  const finishDrag = () => { dragging = false; rail.classList.remove('is-dragging'); sync(); };
  slider.addEventListener('pointerup', finishDrag);
  slider.addEventListener('pointercancel', finishDrag);
  slider.addEventListener('blur', finishDrag);
  slider.addEventListener('keydown', event => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    seekRelative(event.key === 'ArrowRight' ? 5 : -5);
  });
  apertureButton.addEventListener('click', togglePlayback);
  for (const button of accessButtons) button.addEventListener('click', () => runKey(button.dataset.demoKey));
  accessCard.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      runKey(event.key === 'ArrowLeft' ? 'back' : 'forward');
    } else if ((event.key === ' ' || event.key === 'Spacebar') && event.target === accessCard) {
      // Native buttons already implement Space/Enter. Avoid double activation.
      event.preventDefault();
      runKey('toggle');
    }
  });

  return {
    setMedia(nextMedia) {
      detachMedia();
      mediaGeneration++;
      pendingSeek = null;
      media = nextMedia || null;
      dragging = false;
      rail.classList.remove('is-dragging');
      railFeedback.textContent = 'PREPARING THE PRECISION RAIL';
      accessFeedback.textContent = 'READY / YOUR MOVE';
      if (media) {
        const boundMedia = media;
        const checkPendingSeek = () => {
          if (media !== boundMedia || !pendingSeek ||
              pendingSeek.media !== boundMedia || pendingSeek.generation !== mediaGeneration) return;
          if (!finiteDuration(boundMedia) || !boundMedia.seekable?.length) return;
          const request = pendingSeek;
          seekTo(request.seconds);
          accessFeedback.textContent = 'SEEK READY / ' + shortTime(boundMedia.currentTime);
        };
        const events = ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'pause', 'ended', 'seeked', 'progress', 'emptied', 'canplay'];
        const handler = () => { sync(); checkPendingSeek(); };
        events.forEach(name => boundMedia.addEventListener(name, handler));
        detachMedia = () => events.forEach(name => boundMedia.removeEventListener(name, handler));
      } else detachMedia = () => {};
      sync();
      // Already-loaded media may have seekable ranges but no subsequent metadata event.
      if (media?.readyState >= 1 && finiteDuration(media)) railFeedback.textContent = 'DRAG THE DIAMOND TO SEEK';
      else if (media) {
        // The lifecycle listener above updates the timeline as the media loads.
        // Avoid leaving a one-shot listener on a replaced iOS media element.
        railFeedback.textContent = 'PREPARING SEEKABLE TIMELINE';
      }
    }
  };
}
