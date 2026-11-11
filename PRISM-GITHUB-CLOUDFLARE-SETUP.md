# PRISM — GitHub → Cloudflare automatic deployment

Repository: https://github.com/radostradipetkova/PRISM-VideoJS-v10
New Cloudflare Worker: `prism-videojs-v10` (separate from existing `orange-grass-f8a7`)

## One-time initial source upload

The attached GitHub-ready ZIP includes the complete PRISM source (including the most recent network-loading state update), project tests, and static media required for production. It excludes the generated `dist/`, temporary fixtures and local QA screenshots.

1. Extract the GitHub-ready ZIP to a new folder. The file `package.json` should appear directly inside that folder.
2. Open PowerShell in that folder and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\PUSH-PRISM-TO-GITHUB.ps1
```

The script clones the target repository, copies the project files, and makes an initial commit. Git may ask you to sign in. The script does **not** deploy to Cloudflare or modify your existing live Worker.

To verify:

```powershell
git clone https://github.com/radostradipetkova/PRISM-VideoJS-v10.git
cd PRISM-VideoJS-v10
npm.cmd install
npm.cmd test
npm.cmd run build
```

## One-time Cloudflare setup

After the complete PRISM project has appeared on GitHub, return to **Cloudflare Dashboard → Workers & Pages → Create → Import a repository**, choose `radostradipetkova/PRISM-VideoJS-v10`, and create the **new** Worker `prism-videojs-v10`, branch `main`. Do not deploy while the repository is still missing `package.json`.

Use:

- **Root directory:** `/` (repository root)
- **Build command:** `npm test && npm run build`
- **Deploy command:** `npx wrangler deploy`
- **Preview command:** leave Cloudflare default (if available)

`wrangler.toml` names the **new** Worker `prism-videojs-v10` and points static assets to `./dist`. The existing `orange-grass-f8a7` Worker stays untouched. Change the name in both Cloudflare and `wrangler.toml` if you choose a different project name.

## Future PRISM edits

Once the source is in the repository, edits made through the connected GitHub integration can be committed directly. Every push to `main` triggers a Cloudflare build; failed build steps stop deployment. No ZIP patch workflow is needed for ordinary source edits.

The local `assets/tears-of-steel-excerpt.mp4` is **not** included because the source film must be prepared separately. The current LIVE ACTION option uses an online fallback until `npm.cmd run prepare:film` is run and the optimized media is committed.

**Note:** This GitHub-ready package does *not* activate Cloudflare Git integration by itself; creating the new GitHub-connected Worker requires your Cloudflare dashboard authorization.
