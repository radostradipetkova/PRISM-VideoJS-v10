# PRISM — automatic AI chapters for Mux uploads

PRISM reads Mux's **real chapters text tracks** through the read-only Cloudflare Worker endpoint `/api/mux/chapters`. It never invents scene names for arbitrary videos. While an upload is being analyzed, Explore offers clearly labeled duration-based time navigation. It switches to the actual titled chapters when they arrive, without reloading the player.

## One-time setup (required; cannot be done solely by committing code)

Mux [Robots Directives](https://www.mux.com/docs/guides/robots-directives) can run the **Analyze Structure** AI workflow and write timestamped chapters back to the asset. It uses video shot evidence (and available captions) so speechless footage is supported, unlike transcript-only chaptering. PRISM includes a tested, reviewable directive specification in `scripts/mux-auto-chapters.mjs`.

**Important:** Mux runs these AI workflows only on assets to which you attach the directive. Simply pasting a public playback ID — especially from someone else's account — does NOT authorize PRISM to generate chapters. The AI service has its own pricing and availability limits.

1. Create a Mux API token with the permissions needed for Video and Robots API operations. Store its ID and secret as **local environment variables**, never in GitHub source or public JavaScript.
2. Preview the directive without making any API calls:

   ```powershell
   node scripts/mux-auto-chapters.mjs
   ```

3. Create the directive once:

   ```powershell
   $env:MUX_TOKEN_ID = "YOUR_MUX_TOKEN_ID"
   $env:MUX_TOKEN_SECRET = "YOUR_MUX_TOKEN_SECRET"
   node scripts/mux-auto-chapters.mjs --create-directive
   ```

   Save the returned `drv_...` ID. This action creates a reusable definition; AI processing is billable only when it runs on an asset.

4. For **Mux Dashboard uploads**, choose that directive in the asset-upload Settings > Directives field. It will run automatically once the video is ready.
5. For **Mux Direct Upload API** uploads, attach the directive ID to the upload's `new_asset_settings.directives`. The helper can create a one-time upload URL with the attachment already set:

   ```powershell
   node scripts/mux-auto-chapters.mjs --create-upload --directive=drv_YOUR_ID --cors=https://prism-videojs-v10.YOUR_SUBDOMAIN.workers.dev
   ```

   Use the generated URL with your authenticated upload client. Do not publish it. This helper creates an upload URL; it does not itself upload files.

6. For an existing Mux asset in your account, trigger that directive once using its **asset ID**, not the playback ID:

   ```powershell
   node scripts/mux-auto-chapters.mjs --run=YOUR_ASSET_ID --directive=drv_YOUR_ID
   ```

7. Add **MUX_TOKEN_ID** and **MUX_TOKEN_SECRET** as encrypted Cloudflare Worker secrets for `prism-videojs-v10`. Never commit them. The Worker only uses them for read-only metadata retrieval, never for creating billable jobs. You can add them in the Cloudflare dashboard or via `npx wrangler secret put MUX_TOKEN_ID` / `npx wrangler secret put MUX_TOKEN_SECRET` when authenticated to the right Worker.

After deployment, open the PRISM showcase with a public Mux playback ID, e.g. `/?liveMux=YOUR_PLAYBACK_ID`, choose LIVE ACTION, and open Explore. The client polls the read-only bridge for several minutes. Authored chapter tracks take priority; real Mux chapter titles appear when ready.

## How it works

The directive invokes Mux Robots `analyze-structure` with visual shot analysis and a balanced level of scene/chapter detail. If subtitles already exist, they provide additional spoken context; captions are not required for video assets. `update_asset_chapters: true` stores the generated results in Mux as a chapters text track. **Warning:** this setting replaces existing chapters on that asset. Only attach the directive to videos for which this overwrite is acceptable.

You can also create the same directive in the [Mux Dashboard](https://dashboard.mux.com/) rather than using a CLI.

The PRISM Worker validates ownership and public playback policy before returning chapter metadata. Anonymous viewers cannot invoke AI workflows or access API tokens.

## Limits and fallback behavior

- Auto chaptering requires a ready on-demand video asset. Silent footage CAN be analyzed visually, but clips shorter than about 60 seconds, poor visual evidence, processing failures, signed playback IDs, videos outside your connected Mux account, or uploads without the directive may not receive meaningful AI chapters. Mux's structure analysis may also create and bill for shot detection.
- Explore remains available regardless; when duration is known it shows **TIME INDEX** rather than pretending those markers are AI-detected scenes.
- The locally hosted *Tears of Steel* film already has an authored WebVTT chapter track. Its real chapter names remain available without Mux AI.
- New Mux tracks can appear asynchronously. The player polls a limited number of times and cancels polling when the video is changed. Reload the page if the AI job completes after the polling period.

References: [Mux Robots Directives](https://www.mux.com/docs/guides/robots-directives), [Analyze Structure](https://www.mux.com/docs/guides/robots-analyze-structure), [Create Direct Upload API](https://www.mux.com/docs/api-reference/video/direct-uploads/create-direct-upload).
