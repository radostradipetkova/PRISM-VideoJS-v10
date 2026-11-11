> **Deployment note (11 November 2026):** The complete PRISM source is now on `main`. Cloudflare Workers Builds should run `npm test && npm run build`, then `npx wrangler deploy`, targeting `prism-videojs-v10` through `wrangler.toml`.

> **GitHub + Cloudflare:** This repository is prepared for automatic deployments to a **new, separate** Cloudflare Worker named `prism-videojs-v10`. See [PRISM-GITHUB-CLOUDFLARE-SETUP.md](PRISM-GITHUB-CLOUDFLARE-SETUP.md) for the one-time connection and build settings.

## New optional live-action showcase film

The default is still **A Study in Motion** (32-second cinematic reel). The compact video selector now adds **LIVE ACTION** (Blender Institute's *Tears of Steel*, CC BY 3.0), with an on-page credit link. Without preparation, the player streams the complete Blender-hosted movie. To create an optimized 65-second local excerpt with full Optical Loupe thumbnails and precisely timed English captions, run:

```powershell
npm.cmd install
npm.cmd run prepare:film
npm.cmd run build
npm.cmd run dev
```

Visit `http://localhost:4173/compare-openings.html` to compare the first 10 seconds of both films after preparing the clip. The main reel remains the default until you decide otherwise. See `OPEN-FILM-RELEASE-NOTES.md` for licensing and troubleshooting.

---

## REUSABLE SKIN PACKAGE — NEW

PRISM is now also packaged as a standalone skin in [`skin/`](skin/README.md).
It exposes the eight Video.js styling properties, does not load the editorial
showcase stylesheet, and can mount on any site with its own media source.
**Try the independent two-video example:** `http://localhost:4173/examples/reusable.html`.
Generate a portable library folder using `npm run build:skin` (output: `skin-dist/`).
The original competition showcase remains in `index.html`.

---

> **Latest audit (9 November 2026):** See [FINAL-ACCESSIBILITY-AUDIT.md](./FINAL-ACCESSIBILITY-AUDIT.md) for results, fixes, and remaining manual screen-reader checks.

# PRISM 2.2 — Universal Video Fit

**The video cropping issue is fixed.** Widescreen, square and portrait sources now use a crop-free `contain` fit over a soft graphite optical matte, without changing the stable player shell or width-slider behavior. See [media-fit decision, three-option comparison, and tests](PRISM-VIDEO-FIT-DECISION.md). All previous Optical Touch and Adaptive Optical Index features are included.

---

# PRISM 2.0 — OPTICAL TOUCH

See [PRISM 2.0 release notes](PRISM-2-OPTICAL-TOUCH-RELEASE.md) for the five new features, installation, tests and limits. This is a separate test build; PRISM v1 remains live until you deploy v2.

# PRISM — Optical Deck + Cinematic Showcase

Custom Video.js v10.3.0 player skin with an editorial showcase website and four interactive cinematographic chapters.

## What's new in this release

- **32-second original cinematic animation**, H.264 video and stereo AAC audio, now hosted on **Mux** as the default Cinematic Reel. Four moving scenes: rainy city at night, ocean sunrise, water caustics, golden desert. This is *locally rendered computer-generated motion art*, not a camera-shot stock video.
- **Four quick chapter buttons** below the player. They seek the real video to 0.3, 8.3, 16.3 or 24.3 seconds. Current scene highlighting follows media time.
- **Night** and **Daylight** sample variants (real clips with their own audio, poster, captions) in the Experiment panel.
- Original Video.js Optical Deck controls, interactive Anatomy section and settings are preserved. Typography now has the sequential letter materialisation: 47 ms hero-character spacing, a gentle vertical drift, soft 6 px blur and an underline that draws after the last italic letter. The original authored text is restored after each reveal.
- Source generator `assets/generate_cinematic.py` and `ASSET-PROVENANCE.md` explain the original media creation.

## Start locally on Windows

Extract the *complete* ZIP. In the directory directly containing `package.json`, double-click **`START-PRISM.bat`** or run:

```powershell
npm.cmd run dev
```

Open **http://localhost:4173/**. Don't close the terminal while using the site. The QA diagnostics are at **http://localhost:4173/?qa=1**. **No `npm install` is needed**, because the local dev server uses built-in Node.js modules and the page loads its Video.js runtime from jsDelivr. Internet access is required for that runtime.

### Small update installation

Extract `PRISM-CINEMATIC-UPDATE.zip` **directly into the same directory containing `package.json`**, allowing Windows to replace the old `index.html`, JavaScript and CSS files. Keep the `src/` and `assets/` subdirectories. Refresh Chrome with **Ctrl + Shift + R**. The server doesn't need to be restarted if it was already running.

## Tests

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
```

- **37/37** source/media/unit tests pass, including proof of frame-to-frame motion within every scene.
- **Independent Chromium chapter test passes**, with the actual MP4, all four seek points, switching back from a focused clip, no JS errors and responsive layouts (320–1440px). Optional: `py -3 tests/cinematic_chapters_browser.py` (requires `playwright` and Chromium).
- Static production site builds successfully. The `dist/` release includes the three actually selected playable films and omits legacy media/generators.
- **Full Video.js v10.3.0 integration is still not browser-verified in this build environment** because the local browser/CDN are blocked. On your Chrome installation, use `?qa=1` to test seek, speed, captions, volume, fullscreen, PiP and keyboard access. Avoid claiming complete accessibility conformance until screen reader/mobile checks are done.

## Structure

- `index.html`: showcase and official pinned Video.js v10.3.0 custom-element CDN imports
- `src/prism-player.js`: reusable skin made of real Video.js v10 components
- `src/app.js`: selected film, scene navigation, theme/size/motion settings, remounting, QA panel
- `src/styles.css`: Optical Deck + chapter-strip responsive layout
- `assets/prism-cinematic.mp4`: 32s original four-scene video
- `assets/night-city.mp4` / `assets/coast-sunrise.mp4`: focussed selections
- `assets/*.vtt`: real WebVTT caption tracks; `*.jpg`: posters
- `assets/generate_cinematic.py`: offline procedural animation/audio generator
- `screenshots/cinematic-contact-sheet.jpg`: video frames at eight timestamps
- `tests/cinematic_chapters_browser.py`: independent real-media browser test (not a Video.js test)
- `CINEMATIC-SCENE-GUIDE.md`: scenes, timestamps and testing rationale
- `DEPLOYMENT-GUIDE.md`, `PUBLIC-LAUNCH-CHECKLIST.md`, `DEPLOY-CLOUDFLARE.bat`: Cloudflare Pages deployment

## Publish

Run `npm.cmd run build`, then upload the content of `dist/` to Cloudflare Pages. Or double-click `DEPLOY-CLOUDFLARE.bat` and authenticate with your own Cloudflare account. No public URL is claimed in this ZIP. The user-provided public Mux playback ID is configured by default for Cinematic Reel. Its HLS master manifest returned HTTP 200, but real Video.js streaming and captions still need Chrome verification before a bonus claim.

Video.js runtime/API integration depends on genuine v10.3.0 modules. Do not use the file directly via `file://`; serve the site from a local or public HTTP server.

See `QA-REPORT.md` for verification evidence and limitations. See `ASSET-PROVENANCE.md` for copyright/asset notes.

## Public launch verification (new)

`VERIFY-PRISM-LIVE.bat` checks a real published HTTPS URL for the website, Video.js skin source, caption track and ranged MP4 delivery. This is a **network preflight only**, not proof of end-to-end Video.js control functionality. See `PUBLIC-LAUNCH-CHECKLIST.md` and run the actual `?qa=1` controls test in Chrome. The production package includes a minimal Cloudflare Pages `_headers` file to set cache lifetime and basic safety headers without restricting fullscreen or PiP.

## Cinematic character typography (new)

The large hero, Experiment, Anatomy and closing headings, the Philosophy quotation and the three Anatomy card titles reveal their letters in sequence **once** as they enter the viewport. The hero introduces `THE ART`, then `OF`, then the italic `WATCHING.`; its orange underline draws only after the final letter settles. The effect is implemented with CSS keyframes and a measured, aria-hidden DOM Range overlay rather than altering the original heading text. This preserves kerning, line wrapping, inline serif emphasis, semantics and final layout.

The user-supplied reference video is not bundled or used as site media. The clip was studied solely for timing and motion direction. Disable the effect with **MINIMAL MOTION** under Experiment, or the operating system's reduced-motion setting. If app JavaScript fails, the heading remains readable after a short first-paint safety timeout.

Run the typography-only Chromium test with `python tests/text_motion_browser.py` (requires Python Playwright and Chromium). This does not verify the full Video.js runtime.

### Legibility and touch-friendly controls (November 2026)

The latest edition increases small labels, timecodes, chapter buttons, and control targets throughout the existing Optical Deck without changing Video.js components. All actionable transport buttons and the timeline have 44px minimum hit areas. Very narrow (≤330px) player containers present an unobstructed 16:9 video stage above a separate two-row control deck. See [`LEGIBILITY-UPDATE.md`](./LEGIBILITY-UPDATE.md) for details and Chromium checks.

## Keyboard shortcuts (showcase-wide Space fix — 10 November 2026)

The first Tab stop remains **Skip to video player**; the **Focus player for all
shortcuts** button beneath the player still transfers keyboard focus to the
native Video.js `media-container`. The Video.js v10 player handles these keys
when focused:

- Space / K — play or pause
- Left / Right — seek 5 seconds (while the player container is focused)
- Up / Down — volume by 5 percentage points (where browser-supported)
- M — mute; F — fullscreen
- Escape — close an open menu or exit fullscreen

**Showcase-only enhancement:** Space now also plays/pauses the current video
when the viewer clicks blank/ordinary page content outside the player; the page
no longer scrolls on that particular keypress. Focused buttons, links, sliders,
text fields, menus and dialogs retain normal Space behavior. Shift+Space,
modifier shortcuts and arrow-key scrolling are not changed. The standalone skin
in `skin/` keeps only native, player-scoped shortcuts.

When a seek slider has focus, its native keys take precedence: Left / Right
seek by 1 second, Page Up / Page Down by 10 seconds, Home / End seek to ends.
Enter activates focused buttons, and Tab advances document focus.

Run `npm test` and `python tests/keyboard-aid-browser.py`. The browser fixture
verifies focus, blank-page Space, normal focused controls, prevention of double
toggles, media switching and cleanup **without downloading Video.js**. Validate
real Video.js/Mux playback separately in Firefox and Chrome before submission.
See [`KEYBOARD-ACCESS-UPDATE.md`](./KEYBOARD-ACCESS-UPDATE.md).

## Mux hosting (public asset configured)

The default **Cinematic Reel** uses the public Mux asset with Playback ID `i4NN2nQSVFk5TDkOtoLIfUUt2e6h5ah02j9ebYxzXxDM` via the official Video.js v10 `<mux-video>` media component. Night and Daylight remain local MP4 clips. Four timeline chapters and the English descriptive WebVTT are kept in source. See [`MUX-INTEGRATION.md`](./MUX-INTEGRATION.md) for the Mux manifest verification, install instructions, explicit local backup, and outstanding browser QA.

## Pre-deployment audit (latest)

See [`PRE-DEPLOY-AUDIT.md`](./PRE-DEPLOY-AUDIT.md) for the pass/fail results and mandatory live-browser sign-off.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run audit:static
```

Open `http://localhost:4173/?qa=1` to inspect your public Mux source and export a **real-browser QA report**. Use `?qa=1&source=local` for the local MP4 control comparison. For integrated browser tests (`Python Playwright` required), `npm.cmd run test:browser` tests local MP4 and `npm.cmd run test:browser:mux` tests the Mux HLS source. Do not interpret passing Node tests or Chromium static-layout tests as proof of live Video.js playback.


## Final accessibility audit (8 Nov 2026)

See [`A11Y-SIGNOFF.md`](./A11Y-SIGNOFF.md) for the verified keyboard/touch/contrast evidence and the still-required manual sign-off. This update explicitly registers and visually hides Video.js's `media-status-announcer` and improves small-text contrast in both themes. It preserves the same Mux stream, Optical Deck and website layout.


## Release verification (v2.3.1)
See [`RELEASE-QUALITY-REPORT.md`](./RELEASE-QUALITY-REPORT.md) for verified browser/server checks, resolved bright-footage and buffering issues, and the outstanding Firefox/WebKit and new public staging sign-offs. The real-engine CI workflow is `.github/workflows/release-crossbrowser.yml`.

### Fit / Fill — Video Fit

Inside Player Settings, **09 / Video Fit** switches between **Fit** (default: complete image, letterboxes where necessary) and **Fill** (crop edges to use the available area). This works on real native video and Mux’s exported video part without changing player dimensions. With Remember My Settings enabled, video fit persists between visits. See `VIDEO-FIT-CONTROLS-RELEASE-NOTES.md` for test details.

## Live-action chapters and automatic Mux navigation

The **LIVE ACTION** option now has a working optical frame preview and a cinematic Explore index. Any public Mux asset can be previewed with `?liveMux=PLAYBACK_ID`. To enable real AI-authored chapter tracks for every Mux upload, see [Mux Robots chapter integration](docs/MUX-AI-CHAPTERS.md); until configured, PRISM uses transcript or time-based navigation rather than pretending to detect scenes.


## Mux AI chapters (opt-in)

The Explore Optical Index now stays usable while remote metadata loads. To automatically produce **real AI chapter titles** for newly ingested Mux videos, configure a Mux Robots Directive for visual structure analysis → real chapter tracks. Full setup and security notes: [Mux AI Chapters](docs/MUX-AI-CHAPTERS.md). This integration requires your Mux API credentials and explicit directive attachment per upload; it is not activated merely by deploying this source.
