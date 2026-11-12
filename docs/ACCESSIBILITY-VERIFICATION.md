# PRISM — accessibility verification

This is a release checklist, **not an accessibility certification**. PRISM remains subject to manual NVDA/VoiceOver and physical touch-device verification.

## Implemented in the reusable Video.js skin

- Readable, contrast-backed dock over dark and bright footage; player preferences permit a solid control surface. Video fit remains user-controllable.
- Keyboard-operable native Video.js v10 play/pause, rail, volume, mute, captions, quality, fullscreen, and menus. Video.js's `media-status-announcer` is registered and kept in the accessibility tree.
- PRISM Optical Index is a native named dialog; Escape closes it and focus returns to its launcher. The search field has a label, and result counts are announced.
- Contextual control hints explain buttons on pointer hover **and keyboard focus**. The same controls have accessible names.
- Touch-sized transport controls (44 px minimum) and responsive mobile docking beneath the video; a larger thumb remains visually compact. The time slider is a real Video.js control, not a simulated gesture.
- Both OS `prefers-reduced-motion` and the per-player Minimal Motion option disable ornamental motion without forcibly pausing user-requested video.
- Visible two-tone keyboard focus on controls, chapter navigation, settings, and the rail; high-contrast environments retain system focus highlighting.
- Full captions menu and size/background preferences; system contrast/forced-color preferences take priority.

## Automated evidence

- [Three-engine release verification](https://github.com/radostradipetkova/PRISM-VideoJS-v10/actions/runs/43261860006): Chromium, Firefox and WebKit previously passed playback, keyboard navigation, menus, 320/375/440/560 px layouts, visible touch targets, reduced motion, quality switching, captions and runtime error checks. **The newest commit must pass its own checks** before a final claim.
- `tests/release_contrast_browser.py`: offline chromium contrast test with bright/black footage backdrops (not a real video or screen reader).
- `tests/release_crossbrowser.py`: genuine Video.js v10 player and native controls in three browser engines, including focus and tooltip checks.
- `tests/final-a11y.test.mjs` and `tests/final-optical-a11y.test.mjs`: static checks for the announcer, dialog, focus, and metadata.

## Manual sign-off still needed

1. NVDA with Firefox/Chrome or VoiceOver with Safari: explore play/pause, rail value, mute, volume, subtitles, chapters and all menus; ensure feedback is understandable.
2. Physical smartphone: tap to reveal controls, drag the rail beyond its edges, test chapter selection, rotate, enter/exit fullscreen and test compact layout.
3. White and black footage: visually check controls, captions, focus and dark surface at 320 px and desktop widths; inspect true player output rather than relying only on CSS samples.
4. Enable reduced motion at OS level, reload and separately enable the in-player toggle; confirm optical animations calm down while normal user-initiated video playback remains available.
5. Slow network, no network, invalid video: check buffering, media error dialog, recovery route, poster and live status.
6. Confirm Escape closes every menu, restoring focus where appropriate; tab through settings, playback/quality, captions and Optical Index.

## Showcase-wide Space exception

The **showcase page** deliberately supports Space to toggle video after interacting with noninteractive page content, because that behavior was explicitly requested. It avoids interactive controls, text fields, native player hotkeys and open dialogs. However, it prevents ordinary Space-to-scroll on the page in that context. The **standalone reusable skin** does not install this document-wide shortcut and keeps hotkeys scoped to Video.js. Reconsider the showcase-only behavior if a first-time usability test reveals scroll confusion.
