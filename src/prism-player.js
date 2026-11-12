import {createTransportTracker, formatMediaTime} from './media-status.js';
import {initOpticalTouch} from './optical-touch.js';
import {initFullscreenOrientation, initWebKitFullscreenKeyboard} from './fullscreen-orientation.js';
import {initPlayerPreferences,normalizePreferences} from './player-preferences.js';
import {initSceneLoop} from './scene-loop.js';
import {DEFAULT_REMEMBER_KEY,safeStorage,readRememberedSettings,saveRememberedSettings,clearRememberedSettings,normalizePlaybackRate} from './remember-settings.js';
import {normalizeChapters} from './chapter-index.js';
import {initControlHints} from './control-hints.js';
/** PRISM — reusable HTML custom-element skin for genuine Video.js v10.
 * Requires @videojs/cdn@10.3.0/video.js (or equivalent @videojs/html package
 * registrations) before mounting. The media itself is the state source.
 */
export const VIDEOJS_VERSION = '10.3.0';
const escapeHTML = (s='') => String(s).replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const svg = (body, size=24) => `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const icon = {
  play: svg('<path d="M8 5.5 19 12 8 18.5V5.5Z" fill="currentColor" stroke="none"/>',30),
  pause: svg('<rect x="6" y="5" width="4" height="14" rx=".5" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx=".5" fill="currentColor" stroke="none"/>'),
  sound: svg('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a5 5 0 0 1 0 6m2.5-9a9 9 0 0 1 0 12"/>'),
  mute: svg('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="m16 9 5 6m0-6-5 6"/>'),
  fullscreen: svg('<path d="M8 3H3v5M16 3h5v5M3 16v5h5m13-5v5h-5"/>'),
  fullscreenExit: svg('<path d="M3 8h5V3m13 5h-5V3M8 21v-5H3m13 5v-5h5"/>'),
  pip: svg('<rect x="3" y="5" width="18" height="14" rx="1"/><rect x="12" y="11" width="7" height="5" fill="currentColor" stroke="none"/>'),
  left: svg('<path d="M10 7 5 12l5 5M5 12h12"/>'),
  right: svg('<path d="m14 7 5 5-5 5M19 12H7"/>'),
  speed: svg('<circle cx="12" cy="12" r="9"/><path d="m12 12 4-4"/><path d="M5 16h2m10 0h2"/>'),
  captions: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M6.5 12.5h4m2 0h4M6.5 15.5h5m2 0h4"/>'),
  gear: svg('<path d="M10.5 2h3l.6 2.5 1.35.55 2.15-1.35 2.1 2.1-1.35 2.15.55 1.35L21.5 10.5v3l-2.6.6-.55 1.35 1.35 2.15-2.1 2.1-2.15-1.35-1.35.55L13.5 21.5h-3l-.6-2.6-1.35-.55-2.15 1.35-2.1-2.1 1.35-2.15-.55-1.35L2.5 13.5v-3l2.6-.6.55-1.35L4.3 6.4l2.1-2.1 2.15 1.35 1.35-.55L10.5 2Z"/><circle cx="12" cy="12" r="3.1"/>',20),
  preferences: svg('<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="11" cy="17" r="2" fill="currentColor" stroke="none"/>'),
  loop: svg('<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>')
};
const state = (klass, a, b) => `<span class="${klass}-a">${a}</span><span class="${klass}-b">${b}</span>`;

/** Mount in an existing element; all player controls are native v10 components. */
export function mountPrismPlayer(target, options={}) {
  if (!(target instanceof Element)) throw new TypeError('mountPrismPlayer expects an Element');
  const { src='./assets/prism-cinematic.mp4', poster='./assets/prism-cinematic.jpg',
    title='A Study in Motion', eyebrow='PRISM / CINEMATIC SHOWCASE', captions='./assets/prism-cinematic.vtt',
    captionLabel='English / descriptive', captionLang='en', captionsDefault=false,
    muxPlaybackId=null, qualitySources=[], muted=false, chapters=[], chaptersVtt=null, chapterMode='auto', storyboard=null,
    autoRotateFullscreen=true, preferences={}, playbackRate=null, preferencesStorageKey=DEFAULT_REMEMBER_KEY } = options;
  if (muxPlaybackId && !/^[A-Za-z0-9]+$/.test(muxPlaybackId)) throw new Error('Invalid public Mux playback ID');
  // Separate MP4 encodes can only switch quality by changing sources.
  // Never misrepresent a plain MP4 as a Mux-like adaptive Auto stream.
  const nativeQualitySources = !muxPlaybackId && Array.isArray(qualitySources) ?
    qualitySources.filter(item=>item && typeof item.label==='string' &&
      typeof item.src==='string' && /^https?:\/\//i.test(item.src) &&
      /^\d{3,4}p$/.test(item.label)) : [];
  const nativeQualityEnabled=nativeQualitySources.length>1;
  let selectedNativeQuality=nativeQualitySources.findIndex(item=>item.src===src);
  if(selectedNativeQuality<0)selectedNativeQuality=0;

  const uid = `prism-${Math.random().toString(36).slice(2,9)}`;
  const rateMenu=`${uid}-rate`, ccMenu=`${uid}-cc`, loopMenu=`${uid}-loop`, prefMenu=`${uid}-preferences`;
  const store=safeStorage();
  const remembered=readRememberedSettings(store,preferencesStorageKey);
  // Explicit embedder/player options take precedence over stored defaults.
  const initialPreferences=normalizePreferences({...remembered?.preferences,...preferences});
  // Honor an existing embedder --media-object-fit: cover default until the
  // viewer makes an explicit Fit/Fill choice (or restores a saved preference).
  // This preserves the public skin token for sites already using PRISM.
  if(initialPreferences.videoFit===null){
    const hostFit=globalThis.getComputedStyle?.(target)?.getPropertyValue('--media-object-fit')?.trim();
    if(hostFit==='cover')initialPreferences.videoFit='fill';
  }
  const preferredRate=normalizePlaybackRate(playbackRate)??remembered?.playbackRate??1;
  let rememberEnabled=!!remembered;
  if(initialPreferences.autoRotate===null)initialPreferences.autoRotate=autoRotateFullscreen;
  const hasCaptions = Boolean(captions);
  const storyboardTrack = !muxPlaybackId && storyboard ? `<track kind="metadata" label="thumbnails" src="${escapeHTML(storyboard)}" default>` : '';
  const chapterTrack = chaptersVtt ? `<track kind="chapters" srclang="en" label="Chapters" src="${escapeHTML(chaptersVtt)}">` : '';
  const captionTrack = hasCaptions ? `<track kind="captions" srclang="${escapeHTML(captionLang)}" label="${escapeHTML(captionLabel)}" src="${escapeHTML(captions)}" ${captionsDefault ? 'default' : ''}>` : '';
  const media = muxPlaybackId
    ? `<mux-video class="prism-media" playsinline crossorigin="anonymous" preload="metadata" poster="${escapeHTML(poster)}" src="https://stream.mux.com/${encodeURIComponent(muxPlaybackId)}.m3u8" ${muted?'muted':''}>${captionTrack}${chapterTrack}</mux-video>`
    : `<video class="prism-media" ${!/^https?:\/\//i.test(src) ? 'crossorigin="anonymous"' : ''} src="${escapeHTML(src)}" poster="${escapeHTML(poster)}" preload="metadata" playsinline ${muted?'muted':''}>${captionTrack}${chapterTrack}${storyboardTrack}</video>`;
  target.innerHTML = `
  <video-player class="prism-vjs-player" default-playback-rates="0.5 0.75 1 1.25 1.5 1.75 2">
    <media-container class="prism-skin" tabindex="0" aria-label="PRISM video player: ${escapeHTML(title)}">
      ${media}
      <div class="prism-topline" aria-hidden="true">
        <div class="prism-viewfinder-brand">
          <span class="prism-optical-symbol"><i></i><i></i><i></i></span>
          <span class="prism-brand-word">PRISM<span class="prism-brand-point">.</span><small>OPTICAL PLAYER / V10</small></span>
        </div>
        <span class="prism-film-identity"><span class="prism-film-dot"></span>${escapeHTML(eyebrow)}</span>
        <span class="prism-top-status"><span class="prism-status-led"></span><span class="prism-status-copy">STANDBY</span></span>
      </div>
      <div class="prism-optical-frame" aria-hidden="true"><i class="top-left"></i><i class="top-right"></i><i class="bottom-left"></i><i class="bottom-right"></i></div>
      <div class="prism-edge-mark" aria-hidden="true"><span>VIEWFINDER</span><span>35 MM / OPTICAL</span></div>
      <div class="prism-side-ruler" aria-hidden="true"><span>01</span><i></i><span>24</span></div>
      <media-controls>
        <media-controls-content class="prism-controls">
          <media-play-button class="prism-center-play" data-prism-hint="play">
            <span class="prism-center-aperture" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
            <span class="prism-center-icon state-paused">${icon.play}</span><span class="prism-center-icon state-playing">${icon.pause}</span>
          </media-play-button>
          <button class="prism-explore-launch" data-prism-hint="Explore video chapters" type="button" aria-haspopup="dialog" aria-label="Explore the video chapters" hidden aria-expanded="false"><span aria-hidden="true"><svg class="prism-mark-svg" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M24 2v44M2 24h44M8.5 8.5l31 31m0-31-31 31"/></svg></span> EXPLORE</button>
          <div class="prism-gesture-feedback" aria-hidden="true"></div>
          <div class="prism-bottom">
            <div class="prism-dock">
              <div class="prism-dock-header" aria-hidden="true">
                <span class="prism-dock-index">01 <span>/</span> TIMELINE</span>
                <span class="prism-dock-rule"></span>
                <span class="prism-dock-state"><i></i><span class="prism-transport-state">STANDBY</span></span>
              </div>
            <div class="prism-rail-meta" aria-hidden="true"><span>00</span><span class="prism-rail-code">PRISM PRECISION RAIL <span class="prism-rail-arrow">↔</span> DRAG TO SEEK</span><span>END</span></div>
            <media-time-slider class="prism-rail" data-prism-hint="seek" step="1" large-step="10" thumb-alignment="edge" aria-label="Seek in video" aria-keyshortcuts="Shift+ArrowLeft Shift+ArrowRight">
              <media-slider-track class="prism-rail-track">
                <media-slider-buffer class="prism-buffer"></media-slider-buffer>
                <media-slider-fill class="prism-fill"></media-slider-fill>
              </media-slider-track>
              <media-slider-thumb class="prism-thumb"><span></span></media-slider-thumb>
              <div class="prism-chapter-ticks" aria-hidden="true"></div>
              <media-slider-preview class="prism-preview" overflow="clamp">
                <div class="prism-loupe-header" aria-hidden="true"><span class="prism-loupe-scan-label">PRISM / OPTICAL SCAN</span><span class="prism-loupe-scan-led"></span></div>
                <div class="prism-loupe-housing"><media-slider-thumbnail class="prism-loupe-image" crossorigin="anonymous"></media-slider-thumbnail><span class="prism-loupe-reticle" aria-hidden="true"></span><span class="prism-loupe-rim" aria-hidden="true"></span></div>
                <span class="prism-preview-index prism-loupe-chapter">OPTICAL / FRAME</span>
                <div class="prism-loupe-time"><media-slider-value type="pointer"></media-slider-value><span class="prism-loupe-position">FRAME</span></div>
                <div class="prism-loupe-ruler" aria-hidden="true"><span class="prism-loupe-ruler-fill"></span><span class="prism-loupe-ruler-needle"></span></div>
                <div class="prism-loupe-footer" aria-hidden="true"><span class="prism-loupe-status">PREVIEW POSITION</span><span class="prism-loupe-next">DRAG TO SEEK</span></div>
              </media-slider-preview>
            </media-time-slider>
            <media-controls-group class="prism-control-row" aria-label="Playback controls">
              <div class="prism-group-left">
                <media-play-button class="prism-control prism-play" data-prism-hint="play">
                  <span class="state-paused">${icon.play}</span><span class="state-playing">${icon.pause}</span>
                </media-play-button>
                <media-seek-button class="prism-control prism-skip skip-back" data-prism-hint="Back 5 seconds" seconds="-5" aria-label="Back five seconds">${icon.left}<small>5</small></media-seek-button>
                <media-seek-button class="prism-control prism-skip skip-forward" data-prism-hint="Forward 5 seconds" seconds="5" aria-label="Forward five seconds">${icon.right}<small>5</small></media-seek-button>
                <div class="prism-time" data-prism-hint="Playback time · elapsed / total" aria-label="Playback time"><media-time type="current"></media-time><span class="prism-time-divider">/</span><media-time type="duration"></media-time></div>
              </div>
              <div class="prism-group-right">
                <media-mute-button class="prism-control prism-mute" data-prism-hint="mute">${state('mute-state',icon.mute,icon.sound)}</media-mute-button>
                <media-volume-slider class="prism-volume" data-prism-hint="Adjust volume" step="5" aria-label="Volume"><media-slider-track><media-slider-fill></media-slider-fill></media-slider-track><media-slider-thumb></media-slider-thumb></media-volume-slider>
                <div class="prism-separator" aria-hidden="true"></div>
                <button class="prism-control prism-settings-trigger" data-prism-hint="playback" type="button" commandfor="${rateMenu}" aria-label="${muxPlaybackId||nativeQualityEnabled?'Playback speed and quality':'Playback speed'}">${icon.speed}</button>
                <media-menu id="${rateMenu}" class="prism-menu" side="top" align="end">
                  <media-menu-content><div class="prism-menu-title">PLAYBACK RATE</div><media-playback-rate-radio-group aria-label="Playback speed"><template><media-menu-radio-item class="prism-menu-item"><span data-part="label"></span><media-menu-item-indicator force-mount>◆</media-menu-item-indicator></media-menu-radio-item></template></media-playback-rate-radio-group>
                    ${muxPlaybackId ? `<section class="prism-quality-section" aria-label="Video quality settings">
                      <div class="prism-menu-title prism-quality-title">VIDEO QUALITY</div>
                      <media-quality-radio-group class="prism-quality-group" label="Video quality">
                        <template><media-menu-radio-item class="prism-menu-item"><span data-part="label"></span><span data-part="tier" class="prism-quality-tier"></span><span data-part="badge" class="prism-quality-badge"></span><media-menu-item-indicator force-mount>◆</media-menu-item-indicator></media-menu-radio-item></template>
                      </media-quality-radio-group>
                    </section>` : nativeQualityEnabled ? `<section class="prism-quality-section prism-quality-native" aria-label="Video quality settings">
                      <div class="prism-menu-title prism-quality-title">VIDEO QUALITY</div>
                      <div class="prism-native-quality-options" role="group" aria-label="Video quality">
                        ${nativeQualitySources.map((choice,index)=>`<button type="button" class="prism-menu-item prism-quality-option" data-prism-quality-index="${index}" aria-pressed="${index===selectedNativeQuality?'true':'false'}"><span>${escapeHTML(choice.label)}</span><span class="prism-quality-check" aria-hidden="true">◆</span></button>`).join('')}
                      </div>
                      <p class="prism-quality-status" role="status" aria-live="polite" data-quality-status>Manual quality · playback position preserved.</p>
                    </section>` : ''}</media-menu-content>
                </media-menu>
                ${hasCaptions ? `<button class="prism-control prism-settings-trigger prism-captions-trigger" data-prism-hint="Subtitles and caption settings" type="button" commandfor="${ccMenu}" aria-label="Caption tracks and settings">${icon.captions}</button>
                <media-menu id="${ccMenu}" class="prism-menu prism-captions-menu" side="top" align="end"><media-menu-content>
                  <div class="prism-caption-menu-heading"><button class="prism-caption-gear" data-prism-hint="Caption appearance settings" type="button" aria-label="Caption appearance settings" aria-controls="${uid}-caption-appearance" aria-expanded="false" >${icon.gear}</button><span class="prism-menu-title">SUBTITLES</span></div>
                  <div class="prism-caption-track-list" data-caption-track-list>
                    <media-captions-radio-group label="Captions"><template><media-menu-radio-item class="prism-menu-item"><span data-part="label"></span><media-menu-item-indicator force-mount>◆</media-menu-item-indicator></media-menu-radio-item></template></media-captions-radio-group>
                    <p class="prism-caption-track-status" data-caption-track-status role="status" aria-live="polite"></p>
                  </div>
                  <div class="prism-caption-appearance" id="${uid}-caption-appearance" data-caption-appearance hidden>
                    <button type="button" class="prism-caption-back">← BACK TO SUBTITLES</button>
                    <div class="prism-caption-setting-label" id="${uid}-caption-size-label">CAPTION SIZE</div>
                    <div class="prism-preferences-choices prism-caption-size-choices" role="group" aria-labelledby="${uid}-caption-size-label">
                      <button type="button" data-pref-caption-size="small" aria-pressed="false">SMALL</button>
                      <button type="button" data-pref-caption-size="medium" aria-pressed="true">MEDIUM</button>
                      <button type="button" data-pref-caption-size="large" aria-pressed="false">LARGE</button>
                    </div>
                    <div class="prism-caption-setting-label" id="${uid}-caption-bg-label">CAPTION BACKGROUND</div>
                    <div class="prism-preferences-choices prism-caption-bg-choices" role="group" aria-labelledby="${uid}-caption-bg-label">
                      <button type="button" data-pref-caption-background="transparent" aria-pressed="false">TRANSPARENT</button>
                      <button type="button" data-pref-caption-background="solid" aria-pressed="true">SOLID</button>
                    </div>
                    <div class="prism-caption-preview" aria-hidden="true"><span class="prism-caption-sample">Every frame tells a story.</span></div>
                  </div>
                </media-menu-content></media-menu>` : ''}
                <button class="prism-control prism-loop-trigger" data-prism-hint="Scene Loop · repeat a chapter" type="button" commandfor="${loopMenu}" aria-label="Scene loop controls" >${icon.loop}</button>
                <media-menu id="${loopMenu}" class="prism-menu prism-loop-menu" side="top" align="end"><media-menu-content>
                  <section class="prism-loop-group" data-loop-panel aria-label="Scene loop controls">
                    <div class="prism-loop-menu-heading"><div class="prism-menu-title">SCENE LOOP</div></div>
                    <p data-loop-context>Waiting for media information…</p>
                    <p class="prism-loop-status" data-loop-status role="status" aria-live="polite">Choose a chapter or mark two positions to repeat.</p>
                    <button class="prism-loop-action prism-loop-primary" type="button" data-loop-chapter aria-pressed="false">↻ LOOP THIS CHAPTER</button>
                    <div class="prism-loop-divider" aria-hidden="true">IN / OUT</div>
                    <p class="prism-loop-hint">Seek to your scene's start and end to mark a custom repeat.</p>
                    <div class="prism-loop-mark-actions"><button class="prism-loop-action" type="button" data-loop-in>MARK IN (A)</button><button class="prism-loop-action" type="button" data-loop-out>MARK OUT (B)</button></div>
                    <p class="prism-loop-range" data-loop-range>IN --:-- → OUT --:--</p>
                    <button class="prism-loop-action prism-loop-primary" type="button" data-loop-ab aria-pressed="false">↻ LOOP A–B</button>
                    <button class="prism-loop-action prism-loop-stop" type="button" data-loop-off disabled>STOP LOOP</button>
                  </section>
                </media-menu-content></media-menu>
                <button class="prism-control prism-preferences-trigger" data-prism-hint="Player settings" type="button" aria-haspopup="dialog" aria-label="Player preferences" aria-expanded="false" aria-controls="${prefMenu}" >${icon.preferences}</button>
                <media-pip-button class="prism-control prism-pip" data-prism-hint="Picture in Picture">${icon.pip}</media-pip-button>
                <media-fullscreen-button class="prism-control prism-fullscreen" data-prism-hint="fullscreen">${state('fs-state',icon.fullscreenExit,icon.fullscreen)}</media-fullscreen-button>
              </div>
            </media-controls-group>
            <div class="prism-dock-foot" aria-hidden="true"><span>PRISM / TRANSPORT</span><span class="prism-tape-mark">◆ &nbsp; IMAGE FIRST &nbsp; / &nbsp; CONTROL ALWAYS</span><span class="prism-timecode-display">00:00</span></div>
            </div>
          </div>
        </media-controls-content>
      </media-controls>
      <section id="${prefMenu}" class="prism-preferences-panel" role="dialog" aria-modal="false" aria-label="PRISM player preferences" hidden>
        <header class="prism-preferences-heading"><div><span>PRISM / PERSONALIZE</span><strong>PLAYER SETTINGS</strong></div><button class="prism-preferences-close" type="button" aria-label="Close player settings">CLOSE ×</button></header>
        <p class="prism-preferences-more" aria-hidden="true">SCROLL FOR MORE SETTINGS ↓</p>
        <fieldset class="prism-preferences-group"><legend>01 / CONTROL SURFACE</legend><p>Improve legibility over bright footage.</p><div class="prism-preferences-choices" role="group" aria-label="Control surface"><button type="button" data-pref-surface="glass" aria-pressed="true">LIQUID GLASS</button><button type="button" data-pref-surface="solid" aria-pressed="false">SOLID</button></div></fieldset>
        <label class="prism-preferences-toggle"><span><strong>03 / MINIMAL MOTION</strong><small>Reduce nonessential animation.</small></span><input type="checkbox" data-pref-motion aria-label="Minimal motion"></label>
        <label class="prism-preferences-toggle" data-pref-touch-only hidden><span><strong>04 / TOUCH SWIPES</strong><small>Allow seek gestures outside fullscreen.</small></span><input type="checkbox" data-pref-touch-swipes aria-label="Touch swipes outside fullscreen"></label>
        <label class="prism-preferences-toggle" data-pref-touch-only hidden><span><strong>05 / SMART ROTATION</strong><small>Try to orient fullscreen with the video on compatible devices.</small></span><input type="checkbox" data-pref-auto-rotate aria-label="Smart fullscreen rotation"></label>
        <details class="prism-keyboard-guide" data-keyboard-guide>
          <summary><span>07 / KEYBOARD SHORTCUTS</span><span class="prism-keyboard-guide-expand" aria-hidden="true"><span class="prism-keyboard-guide-view">VIEW KEYS</span><span class="prism-keyboard-guide-hide">HIDE KEYS</span><span class="prism-keyboard-guide-chevron">⌄</span></span></summary>
          <div class="prism-keyboard-guide-content">
            <p class="prism-keyboard-guide-intro">Playback shortcuts work when the player surface is focused. Use the buttons below to focus the right area.</p>
            <div class="prism-shortcut-list" role="list" aria-label="PRISM keyboard shortcuts">
              <div class="prism-shortcut-row" role="listitem"><span class="prism-shortcut-keys"><kbd>SPACE</kbd><span>/</span><kbd>K</kbd></span><span>Play / pause</span></div>
              <div class="prism-shortcut-row" role="listitem"><span class="prism-shortcut-keys"><kbd>←</kbd><kbd>→</kbd></span><span>Seek back / ahead 5s*</span></div>
              <div class="prism-shortcut-row" role="listitem"><span class="prism-shortcut-keys"><kbd>↑</kbd><kbd>↓</kbd></span><span>Volume up / down 5%*</span></div>
              <div class="prism-shortcut-row" role="listitem"><span class="prism-shortcut-keys"><kbd>M</kbd></span><span>Mute / unmute</span></div>
              <div class="prism-shortcut-row" role="listitem"><span class="prism-shortcut-keys"><kbd>F</kbd></span><span>Enter / exit fullscreen</span></div>
              <div class="prism-shortcut-row" role="listitem"><span class="prism-shortcut-keys"><kbd>SHIFT</kbd><span>+</span><kbd>←</kbd><kbd>→</kbd></span><span>Previous / next chapter**</span></div>
              <div class="prism-shortcut-row" role="listitem"><span class="prism-shortcut-keys"><kbd>TAB</kbd></span><span>Move between controls</span></div>
              <div class="prism-shortcut-row" role="listitem"><span class="prism-shortcut-keys"><kbd>ENTER</kbd><span>/</span><kbd>SPACE</kbd></span><span>Activate focused control</span></div>
              <div class="prism-shortcut-row" role="listitem"><span class="prism-shortcut-keys"><kbd>ESC</kbd></span><span>Close menus / clear Tab focus</span></div>
            </div>
            <p class="prism-keyboard-guide-note">* With the player surface focused; focused sliders use their own arrow-key steps. ** Only on the focused timeline when the video provides chapters.</p>
            <p class="prism-keyboard-guide-note">On this showcase only, Space also plays or pauses after clicking noninteractive page content. Embedded PRISM skins keep shortcuts scoped to the player.</p>
            <div class="prism-keyboard-guide-actions"><button type="button" data-guide-focus-player>FOCUS PLAYER</button><button type="button" data-guide-focus-timeline>FOCUS TIMELINE</button></div>
            <p class="prism-keyboard-guide-hint">Choosing a focus target closes Settings, so you can try the keys immediately.</p>
          </div>
        </details>
        <label class="prism-preferences-toggle prism-remember-settings"><span><strong>08 / REMEMBER MY SETTINGS</strong><small>Keep video fit, caption style, control surface, motion and playback speed on this device.</small></span><input type="checkbox" data-pref-remember aria-label="Remember my settings"></label>
        <p class="prism-remember-status" data-pref-remember-status role="status" aria-live="polite">Off by default. Your settings are not stored between visits.</p>
        <fieldset class="prism-preferences-group prism-video-fit-group" data-video-fit-group>
          <legend>09 / VIDEO FIT</legend>
          <p>FIT shows the entire frame. FILL uses the available space and may crop the edges.</p>
          <div class="prism-preferences-choices prism-video-fit-choices" role="group" aria-label="Video framing mode">
            <button type="button" data-pref-video-fit="fit" aria-pressed="true">FIT · FULL FRAME</button>
            <button type="button" data-pref-video-fit="fill" aria-pressed="false">FILL · CROP</button>
          </div>
          <p class="prism-video-fit-hint">Changes the image only — not the player's size or controls.</p>
        </fieldset>
        <p class="prism-preferences-note" data-pref-system-note>Automatically respects your device accessibility preferences.</p>
      </section>
      <media-buffering-indicator class="prism-buffering" aria-live="polite" aria-atomic="true" aria-label="Buffering video">
        <div class="prism-buffering-card" role="status">
          <div class="prism-buffering-head" aria-hidden="true">
            <span class="prism-buffering-mark"><i></i><i></i><i></i><i></i></span>
            <span class="prism-buffering-kicker">PRISM / SIGNAL HOLD</span>
            <span class="prism-buffering-led"></span>
          </div>
          <div class="prism-buffering-content">
            <div class="prism-buffering-bars" aria-hidden="true"><span></span><span></span><span></span></div>
            <div class="prism-buffering-copy"><strong>BUFFERING</strong><small>Waiting for the connection to catch up…</small></div>
          </div>
        </div>
      </media-buffering-indicator>
      <media-gesture type="tap" pointer="touch" action="toggleControls"></media-gesture>
      <media-gesture type="tap" pointer="mouse" region="center" action="togglePaused"></media-gesture>
      <media-hotkey keys="Space" action="togglePaused"></media-hotkey>
      <media-hotkey keys="k" action="togglePaused"></media-hotkey>
      <media-hotkey keys="m" action="toggleMuted"></media-hotkey>
      <media-hotkey keys="f" action="toggleFullscreen"></media-hotkey>
      <media-hotkey keys="ArrowLeft" action="seekStep" value="-5"></media-hotkey>
      <media-hotkey keys="ArrowRight" action="seekStep" value="5"></media-hotkey>
      <media-hotkey keys="ArrowUp" action="volumeStep" value="0.05"></media-hotkey>
      <media-hotkey keys="ArrowDown" action="volumeStep" value="-0.05"></media-hotkey>
      <media-status-announcer class="prism-a11y-announcer"></media-status-announcer>
      <div class="prism-dim-layer" aria-hidden="true"></div>
      <dialog class="prism-chapter-dialog" aria-label="Explore video navigation" aria-describedby="${uid}-index-help" data-index-layout="list">
        <div class="prism-chapter-dialog-head"><span class="prism-index-heading">PRISM / OPTICAL INDEX</span><button class="prism-chapter-close" data-prism-hint="Close chapter navigator" type="button" aria-label="Close chapter navigator">CLOSE ×</button></div>
        <div class="prism-chapter-navigator">
          <div class="prism-iris" aria-hidden="true"><media-thumbnail class="prism-iris-thumbnail" time="0"></media-thumbnail><span class="prism-iris-center"><svg class="prism-mark-svg" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M24 2v44M2 24h44M8.5 8.5l31 31m0-31-31 31"/></svg></span><span class="prism-iris-label">SELECT A FRAME</span></div>
          <div class="prism-index-search-wrap" hidden><label for="${uid}-search">FIND A CHAPTER</label><input id="${uid}-search" class="prism-index-search" type="search" placeholder="Search chapters or time" autocomplete="off" aria-label="Search video chapters"><span class="prism-index-result-count" role="status" aria-live="polite" aria-atomic="true"></span></div>
          <div class="prism-chapter-choice-list" role="group" aria-label="Video navigation points"></div>
          <p class="prism-index-empty" role="status" hidden>No matching chapters.</p>
        </div>
        <p id="${uid}-index-help" class="prism-chapter-dialog-help">SELECT A FRAME TO SEEK · ESC TO CLOSE</p>
      </dialog>
      <media-error-dialog><media-dialog-popup class="prism-error"><span class="prism-error-mark">!</span><media-dialog-title></media-dialog-title><media-dialog-description></media-dialog-description><media-dialog-close class="prism-error-close">DISMISS</media-dialog-close></media-dialog-popup></media-error-dialog>
    </media-container>
  </video-player>
  <div class="prism-loader" role="status" aria-live="polite">
    <span class="prism-loader-title">PREPARING THE VIEWER</span>
    <span class="prism-loader-detail">Loading the genuine Video.js v10 controls…</span>
    <button class="prism-retry" type="button" hidden>RELOAD PLAYER</button>
  </div>`;
  target.classList.remove('is-ready','failed');
  // Never suggest that unregistered custom tags are functioning playback controls.
  // Checking the entire visible control surface catches partial CDN loads.
  const requiredTags = [
    'video-player','media-container','media-controls','media-controls-content',
    'media-play-button','media-time-slider','media-slider-thumb','media-seek-button',
    'media-mute-button','media-volume-slider','media-fullscreen-button',
    'media-menu','media-playback-rate-radio-group','media-pip-button',...(muxPlaybackId ? ['media-quality-radio-group'] : []),
    'media-hotkey','media-gesture','media-status-announcer','media-slider-thumbnail','media-thumbnail',...(muxPlaybackId ? ['mux-video'] : []),...(hasCaptions ? ['media-captions-radio-group'] : [])
  ];
  const retry = target.querySelector('.prism-retry');
  retry.addEventListener('click', () => location.reload());
  const loadFailureTimer = setTimeout(() => {
    if (!target.isConnected || !target.contains(player) || target.classList.contains('is-ready')) return;
    target.classList.add('failed');
    const missing = requiredTags.filter(tag => !customElements.get(tag));
    target.querySelector('.prism-loader-title').textContent = 'VIDEO.JS IS UNAVAILABLE';
    target.querySelector('.prism-loader-detail').textContent =
      `The player modules did not load (${missing.length} missing). Check your network and retry.`;
    retry.hidden = false;
  }, 12000);
  Promise.all(requiredTags.map(tag => customElements.whenDefined(tag))).then(() => {
    if (!target.isConnected || !target.contains(player)) return;
    clearTimeout(loadFailureTimer);
    target.classList.add('is-ready');
    target.classList.remove('failed');
  });
  // The Mux element proxies its INTERNAL video's textTracks. Its light-DOM
  // <track>.track and readyState do not represent the active rendered cues.
  // Use the media adapter's actual textTracks for both Mux and native video.
  const mediaElement = target.querySelector('.prism-media');
  // MP4 quality switch: same Video.js player and video element, so the
  // Optical Loupe, chapter timeline, loop state and control handlers survive.
  const nativeQualitySection=target.querySelector('.prism-quality-native');
  const nativeQualityStatus=nativeQualitySection?.querySelector('[data-quality-status]');
  let qualityTransition=null;
  function markNativeQuality(index){
    selectedNativeQuality=index;
    nativeQualitySection?.querySelectorAll('[data-prism-quality-index]').forEach(button=>{
      button.setAttribute('aria-pressed',String(Number(button.dataset.prismQualityIndex)===index));
    });
  }
  function captureQualityPlayback(){
    return {
      time:Number.isFinite(mediaElement.currentTime)?mediaElement.currentTime:0,
      playing:!mediaElement.paused&&!mediaElement.ended,
      volume:mediaElement.volume,muted:mediaElement.muted,
      rate:mediaElement.playbackRate,
      captions:[...(mediaElement.textTracks||[])].map(track=>({kind:track.kind,lang:track.language,mode:track.mode}))
    };
  }
  function restoreQualityPlayback(snapshot){
    if(!snapshot)return;
    if(Number.isFinite(snapshot.rate))mediaElement.playbackRate=snapshot.rate;
    if(Number.isFinite(snapshot.volume))mediaElement.volume=snapshot.volume;
    mediaElement.muted=snapshot.muted;
    const duration=Number(mediaElement.duration);
    const position=Number.isFinite(duration)?Math.min(snapshot.time,Math.max(0,duration-.15)):snapshot.time;
    try{mediaElement.currentTime=position;}catch{}
    // Preserve an explicit captions-off choice as well as captions-on.
    const tracks=[...(mediaElement.textTracks||[])];
    for(let i=0;i<snapshot.captions.length;i++){
      const prior=snapshot.captions[i];
      const track=tracks.find(t=>t.kind===prior.kind && t.language===prior.lang) || tracks[i];
      if(track)track.mode=prior.mode;
    }
    if(snapshot.playing)mediaElement.play().catch(()=>{});
  }
  function onNativeQualityMetadata(){
    const transition=qualityTransition;
    if(!transition)return;
    qualityTransition=null;
    restoreQualityPlayback(transition.snapshot);
    if(nativeQualityStatus)nativeQualityStatus.textContent=`${nativeQualitySources[selectedNativeQuality]?.label} selected · position preserved.`;
  }
  function onNativeQualityError(){
    const transition=qualityTransition;
    if(!transition)return;
    qualityTransition=null;
    // Recover the already working stream if a higher/lower encode fails.
    markNativeQuality(transition.previousIndex);
    if(nativeQualityStatus)nativeQualityStatus.textContent='Quality unavailable. Restoring previous stream.';
    mediaElement.src=transition.previousSrc;
    mediaElement.addEventListener('loadedmetadata',function restored(){
      mediaElement.removeEventListener('loadedmetadata',restored);
      restoreQualityPlayback(transition.snapshot);
    },{once:true});
    mediaElement.load();
  }
  function onNativeQualityClick(event){
    const button=event.target.closest?.('[data-prism-quality-index]');
    if(!button || !nativeQualitySection?.contains(button))return;
    const index=Number(button.dataset.prismQualityIndex);
    const candidate=nativeQualitySources[index];
    if(!candidate || index===selectedNativeQuality)return;
    const previousSrc=mediaElement.getAttribute('src');
    if(!previousSrc)return;
    const snapshot=qualityTransition?.snapshot||captureQualityPlayback();
    qualityTransition={snapshot,previousSrc,previousIndex:selectedNativeQuality};
    markNativeQuality(index);
    if(nativeQualityStatus)nativeQualityStatus.textContent=`Loading ${candidate.label}…`;
    mediaElement.src=candidate.src;
    mediaElement.load();
  }
  nativeQualitySection?.addEventListener('click',onNativeQualityClick);
  if(nativeQualityEnabled){
    mediaElement.addEventListener('loadedmetadata',onNativeQualityMetadata);
    mediaElement.addEventListener('error',onNativeQualityError);
  }
  const captionMenu=target.querySelector('.prism-captions-menu');
  const captionTrigger=target.querySelector('.prism-captions-trigger');
  const captionStatus=captionMenu?.querySelector('[data-caption-track-status]');
  const captionTrackNode=target.querySelector('.prism-media track[kind="captions"]');
  const actualCaptionNode=mediaElement?.shadowRoot?.querySelector('video track[kind="captions"]') || captionTrackNode;
  const captionTrackList=mediaElement?.textTracks;
  let captionsWereExplicitlyChanged=false;
  const captionTracks=()=>[...(mediaElement?.textTracks||[])].filter(track=>['captions','subtitles'].includes(track.kind));
  function captionTrackState(){
    if(!captionStatus)return;
    const active=captionTracks().find(track=>track.mode==='showing');
    const node=mediaElement?.shadowRoot?.querySelector('video track[kind="captions"],video track[kind="subtitles"]') || actualCaptionNode;
    if(!active){captionStatus.textContent='';return;}
    if(node?.readyState===3)captionStatus.textContent='Subtitle track could not load. Check the VTT file.';
    else if(node?.readyState===1 || (node?.readyState===0 && !(active.cues?.length>0)))
      captionStatus.textContent='Loading subtitles…';
    else captionStatus.textContent='';
  }
  captionTrackNode?.addEventListener('load',captionTrackState);
  captionTrackNode?.addEventListener('error',captionTrackState);
  if(actualCaptionNode!==captionTrackNode){
    actualCaptionNode?.addEventListener('load',captionTrackState);
    actualCaptionNode?.addEventListener('error',captionTrackState);
  }
  // Initial captions must activate the real media track, NOT Mux's inert light-DOM node.
  function initializeDefaultCaptions(){
    if(!captionsDefault || captionsWereExplicitlyChanged)return;
    const tracks=captionTracks();
    const chosen=tracks.find(track=>track.language===captionLang)||tracks[0];
    if(chosen){
      for(const track of tracks)track.mode=track===chosen?'showing':'disabled';
    }else if(captionTrackNode && mediaElement?.tagName==='VIDEO'){
      // Before native metadata, touching the HTMLTrackElement requests VTT loading.
      const track=captionTrackNode.track;
      if(track && track.mode==='disabled')track.mode='showing';
    }
    captionTrackState();
  }
  const onCaptionClick=event=>{
    const item=event.target.closest?.('media-menu-radio-item');
    if(!item || !item.closest('media-captions-radio-group'))return;
    captionsWereExplicitlyChanged=true;
    const label=item.querySelector('[data-part="label"]')?.textContent?.trim() || item.textContent?.trim() || '';
    const choosingOff=item===item.closest('media-captions-radio-group')?.querySelector('media-menu-radio-item') || /^off$/i.test(label);
    queueMicrotask(()=>{
      const tracks=captionTracks();
      if(choosingOff){for(const track of tracks)track.mode='disabled';}
      else{
        const preferred=tracks.find(track=>track.label===label || track.language===captionLang)||tracks[0];
        if(preferred)for(const track of tracks)track.mode=track===preferred?'showing':'disabled';
      }
      captionTrackState();
    });
  };
  captionMenu?.addEventListener('click',onCaptionClick);
  captionTrigger?.addEventListener('click',captionTrackState);
  captionTrackList?.addEventListener?.('addtrack',initializeDefaultCaptions);
  // In Mux and native VIDEO the subtitle file can finish loading after
  // metadata. Re-apply the default when that happens; never override a
  // viewer's explicit On/Off selection.
  captionTrackNode?.addEventListener('load',initializeDefaultCaptions);
  if(actualCaptionNode!==captionTrackNode)
    actualCaptionNode?.addEventListener('load',initializeDefaultCaptions);
  const player = target.querySelector('video-player');
  const skin = target.querySelector('.prism-skin');
  const controlHints=initControlHints({skin,media:mediaElement});
  // Escape dismisses a Tab-focused control's outline when no overlay is
  // active. Keep native Video.js menus, PRISM dialogs and fullscreen first.
  // Capture lets this work on Web Components that stop bubbling key events.
  const clearTabFocusOnEscape=(event)=>{
    if(event.key!=='Escape' || event.defaultPrevented || event.repeat ||
       event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)return;
    const doc=skin.ownerDocument;
    const focused=doc.activeElement;
    if(!focused || (focused!==skin && !skin.contains(focused)))return;
    if(doc.fullscreenElement || doc.webkitFullscreenElement ||
       skin.querySelector('dialog[open], media-menu[data-open], media-menu:popover-open, media-dialog-popup:popover-open, .prism-preferences-panel:not([hidden]), [role="dialog"][aria-modal="true"]'))return;
    event.preventDefault();
    event.stopPropagation();
    focused.blur();
    skin.classList.remove('prism-keyboard-engaged');
  };
  skin.addEventListener('keydown',clearTabFocusOnEscape,true);
  const mediaForCaptionDefault=mediaElement;
  mediaForCaptionDefault?.addEventListener('loadedmetadata',initializeDefaultCaptions);
  mediaForCaptionDefault?.addEventListener('canplay',initializeDefaultCaptions);
  if(captionsDefault)initializeDefaultCaptions();
  const statusCopy = target.querySelector('.prism-status-copy');
  const transportCopy = target.querySelector('.prism-transport-state');
  const timecode = target.querySelector('.prism-timecode-display');
  const observers = ['play','pause','waiting','stalled','canplay','canplaythrough','playing','seeking','seeked','ended','loadedmetadata','emptied','timeupdate','error'];
  const trackTransport = createTransportTracker();
  function syncTransport(event){
    if (!target.contains(mediaElement)) return;
    const status = trackTransport(mediaElement, event);
    skin.dataset.viewState = status.toLowerCase();
    statusCopy.textContent = status;
    transportCopy.textContent = status === 'PLAYING' ? 'TRANSPORT / ACTIVE' : `TRANSPORT / ${status}`;
    timecode.textContent = formatMediaTime(mediaElement.currentTime);
  }
  for (const event of observers) mediaElement.addEventListener(event,syncTransport);
  syncTransport();
  const opticalTouch = initOpticalTouch({skin,media:mediaElement,chapters,chapterMode,muxPlaybackId,storyboard});
  const sceneLoop=initSceneLoop({skin,media:mediaElement,getChapters:()=>{
    const index=opticalTouch.getIndex();
    return index.type!=='none'?index:{type:'chapters',entries:normalizeChapters(chapters,Number(mediaElement.duration)||NaN)};
  }});
  const autoOrientation = initFullscreenOrientation({player,skin,media:mediaElement,enabled:initialPreferences.autoRotate});
  const fullscreenKeyboard = initWebKitFullscreenKeyboard({player,button:skin.querySelector('.prism-fullscreen')});
  function currentPlaybackRate(){return normalizePlaybackRate(mediaElement.playbackRate)??1;}
  const rememberStatusMessage=()=>store.persistenceAvailable
    ? 'Saved on this device for this website.'
    : 'Browser storage is blocked. Settings are kept only for this open page.';
  let lastRememberPersistence=store.persistenceAvailable;
  function persist(overrides){
    if(!rememberEnabled)return;
    // The adapter saves to memory even when browser persistence is blocked.
    if(!saveRememberedSettings(store,preferencesStorageKey,{preferences:overrides,playbackRate:currentPlaybackRate()})){
      rememberEnabled=false;
      playerPreferences?.setRememberState(false,'Settings could not be saved. Playback is unaffected.');
      return;
    }
    if(lastRememberPersistence!==store.persistenceAvailable){
      lastRememberPersistence=store.persistenceAvailable;
      playerPreferences?.setRememberState(true,rememberStatusMessage());
    }
  }
  const playerPreferences=initPlayerPreferences({target,skin,
    trigger:skin.querySelector('.prism-preferences-trigger'),
    panel:skin.querySelector('.prism-preferences-panel'),
    initial:initialPreferences,
    remembered:rememberEnabled,
    onRememberChange:(enabled,overrides)=>{
      if(enabled){
        const saved=saveRememberedSettings(store,preferencesStorageKey,{preferences:overrides,playbackRate:currentPlaybackRate()});
        rememberEnabled=saved;
        lastRememberPersistence=store.persistenceAvailable;
        return {enabled:saved,message:saved ? rememberStatusMessage() : 'Settings could not be saved. Playback is unaffected.'};
      }
      rememberEnabled=false;
      const cleared=clearRememberedSettings(store,preferencesStorageKey);
      const message=store.persistenceAvailable
        ? 'Memory off. Current choices remain until you leave; no settings will be saved.'
        : 'Memory off for this page. Browser storage could not be cleared; clear site data to remove any older saved settings.';
      return {enabled:false,message:cleared ? message : 'Could not clear settings. Clear this site’s stored data to remove them.'};
    },
    onChange:(overrides,effective)=>{
      autoOrientation.setEnabled(effective.autoRotate);
      persist(overrides);
      target.dispatchEvent(new CustomEvent('prism:preferenceschange',{
        bubbles:true,detail:{overrides,effective}
      }));
    }
  });
  if(rememberEnabled && !store.persistenceAvailable){
    playerPreferences.setRememberState(true,rememberStatusMessage());
  }
  // Playback speed belongs to the real HTMLMediaElement / mux-video. Listen
  // to native ratechange so changes made in Video.js's speed menu are saved.
  const onRateChange=()=>persist(playerPreferences.getOverrides());
  // Announce the effective initial state as well as later user changes.
  // In particular this keeps the showcase's typography motion in sync with
  // a preference restored from a previous visit before the first paint.
  target.dispatchEvent(new CustomEvent('prism:preferenceschange',{
    bubbles:true,detail:{overrides:playerPreferences.getOverrides(),effective:playerPreferences.getEffective()}
  }));
  mediaElement.addEventListener('ratechange',onRateChange);
  // Wait until the media exists before applying the saved rate. Mux and normal
  // MP4 both expose playbackRate; source changes mount a fresh media element.
  let rateRestored=false;
  function restorePlaybackRate(){
    if(rateRestored || mediaElement.readyState<1)return;
    rateRestored=true;
    if(Math.abs(currentPlaybackRate()-preferredRate)>0.001){
      try{mediaElement.playbackRate=preferredRate;}catch{} // unsupported media remains at 1×
    }
  }
  mediaElement.addEventListener('loadedmetadata',restorePlaybackRate);
  mediaElement.addEventListener('canplay',restorePlaybackRate);
  restorePlaybackRate();
  return { player, media:mediaElement,
    getSceneLoopState(){return sceneLoop.getState();},
    setAutoRotateFullscreen(value){autoOrientation.setEnabled(value);},
    getPreferences(){return playerPreferences.getOverrides();},
    isRememberingSettings(){return rememberEnabled;},
    destroy(){
    sceneLoop.destroy();
    controlHints.destroy();
    nativeQualitySection?.removeEventListener('click',onNativeQualityClick);
    mediaElement.removeEventListener('loadedmetadata',onNativeQualityMetadata);
    mediaElement.removeEventListener('error',onNativeQualityError);
    skin.removeEventListener('keydown',clearTabFocusOnEscape,true);
    mediaElement.removeEventListener('ratechange',onRateChange);
    mediaElement.removeEventListener('loadedmetadata',restorePlaybackRate);
    mediaElement.removeEventListener('canplay',restorePlaybackRate);
    captionMenu?.removeEventListener('click',onCaptionClick);
    captionTrigger?.removeEventListener('click',captionTrackState);
    captionTrackNode?.removeEventListener('load',captionTrackState);
    captionTrackNode?.removeEventListener('error',captionTrackState);
    if(actualCaptionNode!==captionTrackNode){
      actualCaptionNode?.removeEventListener('load',captionTrackState);
      actualCaptionNode?.removeEventListener('error',captionTrackState);
    }
    captionTrackList?.removeEventListener?.('addtrack',initializeDefaultCaptions);
    captionTrackNode?.removeEventListener('load',initializeDefaultCaptions);
    if(actualCaptionNode!==captionTrackNode)
      actualCaptionNode?.removeEventListener('load',initializeDefaultCaptions);
    mediaForCaptionDefault?.removeEventListener('loadedmetadata',initializeDefaultCaptions);
    mediaForCaptionDefault?.removeEventListener('canplay',initializeDefaultCaptions);
    playerPreferences.destroy();
    fullscreenKeyboard.destroy();
    autoOrientation.destroy();
    opticalTouch.destroy();
    clearTimeout(loadFailureTimer);
    for (const event of observers) mediaElement.removeEventListener(event,syncTransport);
    if (target.contains(player)) target.replaceChildren();
  } };
}
