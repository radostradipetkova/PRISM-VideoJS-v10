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
    currentTime.textContent = duration ? shortTime(time) : '--:--';
    durationLabel.textContent = duration ? shortTime(duration) : '--:--';
    slider.setAttribute('aria-valuetext', duration ? `${shortTime(time)} of ${shortTime(duration)}` : 'Seeking unavailable');

    const playing = !!media && !media.paused && !media.ended;
    apertureCard.classList.toggle('is-playing', playing);
    apertureButton.setAttribute('aria-label', playing ? 'Pause video' : 'Play video');
    apertureButton.setAttribute('aria-pressed', String(playing));
    apertureButton.disabled = !media;
    if (media) announce(apertureState, playing ? 'PLAYING / LIVE PLAYER' : media.ended ? 'ENDED / PRESS TO REPLAY' : 'PAUSED / PRESS TO PLAY');
    else announce(apertureState, 'WAITING FOR THE LIVE PLAYER');
    if (!duration) announce(railFeedback, media ? 'WAITING FOR SEEKABLE VIDEO' : 'CONNECTING TO THE LIVE VIDEO');
  }

  function seekTo(seconds) {
    const duration = finiteDuration(media);
    if (!duration || !media.seekable?.length) {
      railFeedback.textContent = 'SEEKING IS NOT AVAILABLE';
      return false;
    }
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
    if (!media.paused && !media.ended) {
      media.pause();
      sync();
      return true;
    }
    try {
      // The promise resolves only if the browser permits real playback.
      await media.play();
      sync();
      return true;
    } catch {
      apertureState.textContent = 'PLAYBACK BLOCKED / TRY THE PLAYER ABOVE';
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
    if (key === 'toggle') {
      const worked = await togglePlayback();
      accessFeedback.textContent = worked ? `SPACE / ${media.paused ? 'PAUSED' : 'PLAYING'}` : 'SPACE / PLAYBACK BLOCKED';
    } else {
      const amount = key === 'back' ? -5 : 5;
      const worked = seekRelative(amount);
      accessFeedback.textContent = worked ? `${amount < 0 ? '← BACK' : '→ FORWARD'} / ${shortTime(media.currentTime)}` : 'SEEK UNAVAILABLE';
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
      media = nextMedia || null;
      dragging = false;
      rail.classList.remove('is-dragging');
      railFeedback.textContent = 'CONNECTING TO THE LIVE VIDEO';
      accessFeedback.textContent = 'READY / YOUR MOVE';
      if (media) {
        const events = ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'pause', 'ended', 'seeked', 'progress', 'emptied'];
        events.forEach(name => media.addEventListener(name, sync));
        detachMedia = () => events.forEach(name => media?.removeEventListener(name, sync));
      } else detachMedia = () => {};
      sync();
      // Already-loaded media may have seekable ranges but no subsequent metadata event.
      if (media?.readyState >= 1 && finiteDuration(media)) railFeedback.textContent = 'DRAG THE DIAMOND TO SEEK';
      else if (media) media.addEventListener('loadedmetadata', () => {
        if (media === nextMedia) railFeedback.textContent = 'DRAG THE DIAMOND TO SEEK';
      }, {once: true});
    }
  };
}
