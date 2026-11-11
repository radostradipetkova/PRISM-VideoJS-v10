# PRISM Optical Touch — portable Video.js v10 skin

**Author:** radostradi  
**Video.js:** v10.3.0 (pinned CDN helper; equivalent local `@videojs/html` registrations supported)  
**License for this skin's source:** Apache-2.0 (see `LICENSE`). Demo videos, images, and any third-party trademarks have separate rights and are not covered by the skin license.

## What is included?

The `skin/` directory contains **only the player**—not the PRISM editorial landing page, showcase typography or page-wide CSS resets. Its core is the actual Video.js v10 UI (`media-container`, `media-play-button`, `media-time-slider`, `media-menu`, etc.).

| File | Purpose |
|---|---|
| `prism-skin.css` | Isolated player CSS and public design tokens |
| `index.js` | Public `mountPrismPlayer(target, options)` export |
| `register-videojs.js` | Optional pinned CDN component registration helper |
| `prism-player.js` | Native Video.js v10 skin markup and media plumbing |
| `optical-touch.js`, `chapter-index.js` | Loupe, gestures, adaptive Optical Index |
| `player-preferences.js` | Built-in appearance, motion and touch settings with automatic accessibility defaults |
| `scene-loop.js` | Video-independent chapter / IN-OUT looping; no dependency on demo media |
| `fullscreen-orientation.js` | Optional smart fullscreen orientation |
| `media-status.js` | Buffering/ended/error state tracking and long-form time formatting |

A self-contained copy is also produced by `npm.cmd run build:skin` in `skin-dist/`.

## Use it in any static website

Copy `skin/` beside your HTML. Then load the official Video.js v10 global stylesheet plus PRISM's stylesheet:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@videojs/cdn@10.3.0/global.css">
<link rel="stylesheet" href="./skin/prism-skin.css">
<div id="viewer" style="max-width:960px;--media-accent-color:#ffc176;--media-accent-text-color:#20150d"></div>
<script type="module">
  import {registerVideoJS} from './skin/register-videojs.js';
  import {mountPrismPlayer} from './skin/index.js';
  await registerVideoJS();
  const instance=mountPrismPlayer(document.querySelector('#viewer'), {
    src:'./my-video.mp4', title:'My film', poster:'./poster.jpg',
    captions:'./captions.vtt',captionLang:'en',captionLabel:'English',
    chaptersVtt:'./chapters.vtt', chapterMode:'auto'
  });
  // When removing this player or switching sources: instance.destroy();
</script>
```

Replace the example video and metadata paths with **your own media**. There is no dependency on PRISM's original 32-second film. For Mux, pass `muxPlaybackId:'YOUR_PUBLIC_PLAYBACK_ID'` instead of `src` (no secret keys). If there are no captions, supply `captions:null`. If there are no chapters, leave `chapters` empty and `chaptersVtt:null`; `EXPLORE` remains hidden. For neutral time markers, set `chapterMode:'time'`; to hide navigation set `chapterMode:'none'`.

**Example:** `examples/reusable.html` mounts TWO separate instances, with distinct accent colors and media (wide MP4 without chapters/captions and portrait spoken MP4 with chapters/captions). Load at `http://localhost:4173/examples/reusable.html` after `npm.cmd run dev`.

## The eight public Video.js customization properties

All values are inherited from the mount wrapper and can differ per player:

| Custom property | Meaning | PRISM default |
|---|---|---|
| `--media-accent-color` | Rail fill, optical highlights, selected chapter and focus | copper `#f07850` |
| `--media-accent-text-color` | Foreground text on accent-filled controls | white on default deep-copper selected chapter |
| `--media-border-color` | Optional player outline | transparent |
| `--media-border-radius` | Corners of player and glass dock | `0px` player, `12px` dock |
| `--media-font-family` | Transport/menu typography | serif-free/monospace design defaults |
| `--media-object-fit` | Initial native video fit; the viewer’s Fit/Fill preference takes priority once initialized | `contain` |
| `--media-object-position` | Framing within the video element | `center` |
| `--media-scale-unit` | Control sizing (never below 44px) | `16px` |

If you change accent color, **set accent text color too**, particularly on older browsers. A very light accent usually needs dark text. Public tokens are intentionally opt-in; the original PRISM showcase appearance is preserved when they are omitted.

CSS applies to `.prism-*` player elements only. It does **not** style `body`, headings, general buttons, site navigation, page backgrounds, or the showcase workbench.

## Config options

`src`, `muxPlaybackId`, `poster`, `title`, `eyebrow`, `captions`, `captionLang`, `captionLabel`, `chapters`, `chaptersVtt`, `chapterMode` (`auto` / `time` / `none`), `storyboard`, `muted`, `autoRotateFullscreen`, and `preferences` (optional `{surface, motion, videoFit: 'fit' | 'fill', captionSize, captionBackground, touchSwipes, autoRotate}`).

Requirements: a real media URL (either `src` or `muxPlaybackId`), HTTPS or localhost, browser support for the chosen source/container, and Video.js v10 registrations. The skin does not transcode unsupported codecs or auto-generate speech transcripts. Some gestures, mobile volume setting, haptics and orientation locking are browser-dependent. Caption and chapter track URLs must be same-origin or CORS-accessible.

## Testing

From the full project root:

```powershell
npm.cmd run test:skin
npm.cmd test
npm.cmd run audit:static
npm.cmd run build:skin
npm.cmd run build
```

Open `examples/reusable.html` and check play, pause, seek, chapters, captions, mobile layout, keyboard, screen reader and accessibility states on actual hardware. A separate skin package does not certify every browser automatically.


**Release note v2.3.1:** Consistent bright-footage glass contrast, buffering-state handling, and long-media time formatting. See the complete project's `RELEASE-QUALITY-REPORT.md` for scope and remaining browser sign-offs.

## Built-in Player Preferences

Open the sliders icon in the player's transport dock. Control Surface offers Liquid Glass / Solid, Motion offers a reduced-motion toggle, and touch-capable devices also see Touch Swipes and Smart Rotation. The player defaults to **Solid** if the browser reports `prefers-contrast: more`, `prefers-reduced-transparency: reduce`, or forced-colors; reduced motion follows `prefers-reduced-motion`. Viewer overrides persist across film switches when passed in `preferences` and otherwise last for the player's mounted lifetime. OS-enforced reduced motion, reduced transparency and forced-colors still take priority. These controls never replace Video.js's native speed/captions controls. On narrow displays the preferences panel scrolls inside the player.

## Scene Loop — works with your own videos

The repeat-arrow button beside Player Settings toggles **Loop Current Chapter** on/off when chapter metadata is available; for videos without chapters it opens the IN/OUT settings. On narrow screens, access **05 / SCENE LOOP** inside Player Settings. The end of a chapter comes from the next chapter boundary, or from the media duration for the last chapter. Chapters can come from the `chapters` option, an HTML chapters text track, or an accessible `chaptersVtt`. The feature never assumes PRISM's original four scenes.

For videos **without** chapter metadata, any viewer can manually set **MARK IN (A)** at the desired starting position, **MARK OUT (B)** at a later position, then click **LOOP A–B**. Select **STOP LOOP** to return to ordinary playback. Segment markers stay local to the mounted media element and are reset on source changes. Keyboard activation works through native buttons (Tab, Enter, Space). Looping is only offered on seekable finite-duration on-demand media; unseekable/live or DRM-restricted streams, external iframe videos, unsupported codecs, and playback environments that reject seeking cannot be guaranteed. Video.js remains responsible for ordinary play, pause and scrubbing.

### Interactive Keyboard Guide

Open **Player Settings → 07 / Keyboard Shortcuts** (a native, keyboard-operable disclosure). The guide lists the actual player-scoped Video.js shortcuts: Space or K for play/pause; Left/Right for 5-second seeks; Up/Down for volume; M for mute; F for fullscreen; Escape to close a menu; and Tab / Enter / Space for navigating controls. With the **timeline focused**, Shift+Left/Right jumps to the previous/next chapter boundary **when chapter metadata exists**; slider-native arrow steps take priority while a slider itself has focus. **FOCUS PLAYER** and **FOCUS TIMELINE** close Settings and move keyboard focus to those real controls. Embedding sites do not receive showcase-wide Spacebar interception.

## Remember My Settings (optional)

In **Player Settings → 08 / Remember My Settings**, viewers can explicitly
opt in to saving their control surface, minimal-motion preference, caption size,
caption background, and native Video.js playback speed. The toggle is **off by
default**. Changes are saved to this browser's `localStorage`, scoped to the
embedding website's origin; no server account, viewing history, video source,
or chapter/loop data are stored. Turning the toggle off removes the stored
record, without resetting the active player's choices. If local storage is
blocked (including when reading the storage property itself throws), PRISM
uses an in-memory fallback and displays a **session-only** status. Those
choices survive player remounts within the same page, but not a full reload.
If removing an older persisted record is blocked, the UI warns that site data
may still need to be cleared.

On a later visit, saved choices are restored for any PRISM video on the same
origin, including unrelated MP4s and Mux media. Device-enforced reduced motion,
reduced transparency and forced-color settings still override user choices.
A host can supply `preferencesStorageKey` as an optional mount argument to
separate saved settings for different embedded players, and `playbackRate`
to set a session-specific initial speed. User preferences explicitly supplied
via the `preferences` mount argument override the saved values for those fields.

## Video Fit — Fit / Fill controls

Open **Player Settings → 09 / Video Fit**. **Fit** (the default) uses `object-fit: contain` to preserve the entire video including square and portrait footage. **Fill** uses `object-fit: cover` and crops as necessary to fill the video area. Neither mode changes the player geometry, chapter markers, captions, or playback. The same preference applies to native HTML `<video>` and exported Mux video parts. An embedding site can pass `preferences: { videoFit: 'fill' }` to choose Fill initially, or use the existing `--media-object-fit: cover` token when the viewer has no explicit choice. Once a viewer chooses a mode, that choice takes priority for the mounted player.

When **Remember My Settings** is on, the mode is saved along with other appearance preferences; otherwise it lasts only for the current session. Real 16:9, 4:3, 3:4, 9:16 and 1:1 H.264 fixtures are regression-tested in the complete repository under `tests/video_fit_controls_browser.py`.
