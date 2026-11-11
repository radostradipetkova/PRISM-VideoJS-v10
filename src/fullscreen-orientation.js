/** PRISM — optional fullscreen-only mobile orientation enhancement.
 * Never substitutes for Video.js fullscreen controls. Browser rejection is normal.
 */
export function orientationForVideo(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  const ratio = w / h;
  if (ratio >= 1.1) return 'landscape';
  if (ratio <= 0.9) return 'portrait';
  return null; // Square and near-square: respect the viewer's natural orientation.
}

export function isFullscreenPlayer(fullscreenElement, player, skin) {
  return !!fullscreenElement && (fullscreenElement === player || fullscreenElement === skin ||
    fullscreenElement.contains?.(skin) || skin.contains?.(fullscreenElement));
}

/** Only request a rotation after *this* player's real fullscreen entry. */
export function initFullscreenOrientation({player, skin, media, enabled = true, doc = document,
  orientation = globalThis.screen?.orientation, mobile = () =>
    !!globalThis.matchMedia?.('(pointer: coarse)').matches} = {}) {
  let disposed = false;
  let wanted = !!enabled;
  let ownsLock = false;
  let lockedType = null;
  let generation = 0;

  function fullscreen() {
    return isFullscreenPlayer(doc.fullscreenElement, player, skin);
  }
  function unlock() {
    generation++;
    if (!ownsLock) return;
    ownsLock = false;
    lockedType = null;
    try { orientation?.unlock?.(); } catch (_) { /* platform-controlled */ }
  }
  function dimensions() {
    // mux-video uses a shadow DOM <video> internally on some versions.
    const inner = media?.shadowRoot?.querySelector?.('video');
    return [Number(media?.videoWidth) || Number(inner?.videoWidth) || 0,
      Number(media?.videoHeight) || Number(inner?.videoHeight) || 0];
  }
  async function tryLock() {
    if (disposed || !wanted || !fullscreen() || !mobile() || typeof orientation?.lock !== 'function') return;
    const [w, h] = dimensions();
    const type = orientationForVideo(w, h);
    if (!type || (ownsLock && type === lockedType)) return;
    const ticket = ++generation;
    try {
      await orientation.lock(type);
      if (ticket !== generation || disposed || !wanted || !fullscreen()) {
        try { orientation.unlock?.(); } catch (_) { /* safe fallback */ }
        return;
      }
      ownsLock = true;
      lockedType = type;
    } catch (_) {
      // Unsupported API, rotation lock, iframe permissions, or platform restrictions.
      // Never fail fullscreen or interfere with playback.
    }
  }
  function onFullscreen() {
    if (!fullscreen() || !wanted) unlock();
    else void tryLock();
  }
  function onMetadata() {
    if (fullscreen()) void tryLock();
  }
  doc.addEventListener('fullscreenchange', onFullscreen);
  media?.addEventListener('loadedmetadata', onMetadata);
  // No fake 90-degree CSS rotation: fallback keeps ordinary Video.js fullscreen.
  return {
    setEnabled(value) {
      wanted = !!value;
      if (!wanted) unlock();
      else if (fullscreen()) void tryLock();
    },
    get enabled() { return wanted; },
    destroy() {
      disposed = true;
      unlock();
      doc.removeEventListener('fullscreenchange', onFullscreen);
      media?.removeEventListener('loadedmetadata', onMetadata);
    }
  };
}


/** WebKit keyboard fallback for Video.js v10's real fullscreen component.
 * On some Safari/WebKit builds, a focused custom-element button accepts pointer
 * clicks yet doesn't synthesize its keyboard click when Enter/Space is pressed.
 * Only intercept in WebKit; Chromium/Firefox retain the upstream v10 behavior.
 * Runs inside the trusted key event (fullscreen requires user activation).
 */
export function initWebKitFullscreenKeyboard({player, button, userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''}) {
  const webkit = /AppleWebKit\//.test(userAgent) && !/(?:Chrome|Chromium|Edg|OPR)\//.test(userAgent);
  if (!webkit || !player || !button) return { destroy() {} };
  function onKeyDown(event) {
    if (!['Enter', ' ', 'Spacebar'].includes(event.key) || event.defaultPrevented ||
        event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    const store = player.store;
    if (!store?.target || button.hidden || button.hasAttribute('data-disabled') ||
        button.getAttribute('aria-disabled') === 'true') return;
    const action = store.isFullscreen ? store.exitFullscreen : store.requestFullscreen;
    if (typeof action !== 'function') return;
    // Suppress the custom element's default keyboard activation (and v10's
    // player-scoped Space hotkey) so a key press cannot toggle twice.
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      const result = action.call(store);
      if (result?.catch) result.catch(() => {}); // The browser may deny fullscreen.
    } catch (_) { /* Unsupported or denied fullscreen must not break playback. */ }
  }
  button.addEventListener('keydown', onKeyDown, true);
  return { destroy() { button.removeEventListener('keydown', onKeyDown, true); } };
}
