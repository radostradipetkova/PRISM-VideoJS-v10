# PRISM — GitHub → Cloudflare deployment

- **Repository:** https://github.com/radostradipetkova/PRISM-VideoJS-v10
- **Production Worker:** `prism-opticaldeck`
- **Public URL:** https://prism-opticaldeck.radostradi-pogo.workers.dev/
- **Wrangler configuration:** `wrangler.toml`, using `name = "prism-opticaldeck"` and static assets from `./dist`

## Important difference: testing vs. deployment

GitHub Actions currently runs the PRISM release build, tests, and uploads a `prism-static-site` artifact. **That action does not publish the Cloudflare Worker.** A successful GitHub check cannot establish that the public URL is updated. Cloudflare must be connected separately to this repository or deployed with an authenticated Wrangler session.

## Recommended Cloudflare Workers Builds setup

In the Cloudflare dashboard, select your **existing** `prism-opticaldeck` Worker and locate its Builds / Git integration settings. Connect `radostradipetkova/PRISM-VideoJS-v10`, branch `main`. Keep the current production Worker rather than creating a duplicate. Use:

| Setting | Value |
|---|---|
| Repository | `radostradipetkova/PRISM-VideoJS-v10` |
| Branch | `main` |
| Root | repository root `/` |
| Build | `npm test && npm run build` |
| Deploy | `npx wrangler deploy` |
| Worker | `prism-opticaldeck` |

Save and initiate a deploy from the dashboard. The exact dashboard labels can change.

Alternatively, after authenticating Wrangler for your own Cloudflare account, run locally:

```bash
git clone https://github.com/radostradipetkova/PRISM-VideoJS-v10.git
cd PRISM-VideoJS-v10
npm install
npm test
npm run build
npx wrangler deploy
```

Don't publish if tests fail. Do not put Cloudflare tokens or Mux private credentials into `wrangler.toml` or the repository. Deploying requires access to the existing Cloudflare account.

## Confirm the correct release is live

1. Check that Cloudflare's most recent deployed commit matches GitHub `main`.
2. Open the exact public URL in an incognito browser.
3. Check for the icon-only Playback control, hover/focus tooltips, quality selection for Mux and Live Action, and the updated Anatomy states.
4. Inspect the public `/src/styles.css` to confirm it contains `PRISM 3.1 / ACCESSIBILITY SIGN-OFF`; this is an asset-version smoke check, not a full UI test.
5. Test chapters, subtitles, fullscreen and the Optical Loupe on the deployed site.

**Cloudflare Builds is not activated merely by committing this guide.** You must verify the Git integration in the Cloudflare dashboard. The existing GitHub Actions workflow will continue to test and upload artifacts independently.
