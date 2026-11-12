# PRISM — release validation

## Baseline verified before this polish pass

- [Release checks](https://github.com/radostradipetkova/PRISM-VideoJS-v10/actions/runs/43261860228) — success, including package/build tests.
- [Chromium + Firefox + WebKit browser verification](https://github.com/radostradipetkova/PRISM-VideoJS-v10/actions/runs/43261860006) — success; all three browser engines reported 0 runtime JavaScript errors.
- Browser evidence covers actual Mux rendition changes (480p to Auto), Live Action MP4 quality (480p back to 720p), caption persistence, fast optical storyboard seeking, chapter navigation, responsive transport, readable labels, visible tooltips and keyboard handling.
- Current changes must be evaluated against **their own** release and browser runs; results from a prior commit do not certify a new deployment.

## Run the code

```bash
npm install
npm test
npm run build
npm run build:skin
npm run dev
```

The preview is served over HTTP; don't open `index.html` as `file://`.

## Verify the deployed website

1. Open the actual Cloudflare URL and play Mux Cinematic Reel and Blender Live Action.
2. Scrub quickly while inspecting the real frame previews; ensure there is no gray flash.
3. Open Explore, select chapters, close with Escape and check keyboard focus.
4. Choose Mux Quality 480p, then Auto; choose Live Action 480p then 720p without losing playhead/captions.
5. Use mobile and desktop layouts, bright/dark footage, reduced motion and keyboard focus; check console errors.
6. Confirm the public Mux playback ID and live-site URL are provided in the official Contra submission fields.

Automated CI uses controlled media fixtures for some remote video operations. It does not substitute for testing real remote delivery, a physical phone, or assistive technology.
