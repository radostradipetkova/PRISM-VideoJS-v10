# PRISM — public Mux playback integration

The default Cinematic Reel uses official Video.js v10 `mux-video` and a **public** Mux playback ID:

`i4NN2nQSVFk5TDkOtoLIfUUt2e6h5ah02j9ebYxzXxDM`

Playback URL: `https://stream.mux.com/i4NN2nQSVFk5TDkOtoLIfUUt2e6h5ah02j9ebYxzXxDM.m3u8`.

- Default showcase uses Mux; `?source=local` opts into the original MP4.
- Adaptive Video Quality comes from the actual Mux renditions, with Auto available; no fake 1080p options.
- Live Action uses Blender's public separate MP4 files, offering **manual** 1080p/720p/480p/360p/240p switching. It does **not** advertise fake adaptive bitrate.
- Caption appearance, chapter navigation, Optical Loupe and player preferences are independent of the streaming provider.
- Do not put a Mux secret key, API token or private URL into the client. Only public playback IDs belong in the browser.

For the Video.js challenge bonus, the Mux asset must be live through judging, the player must genuinely play it, and its public playback ID must be entered into Contra's submission. The separate live-site bonus also requires a working URL in the submission. Configuration alone does not confirm that form was submitted.
