// Uses the Python launcher available on Windows, macOS, or Linux.
import {spawnSync} from 'node:child_process';
const candidates = process.platform === 'win32'
  ? [['py',['-3']],['python',[]],['python3',[]]]
  : [['python3',[]],['python',[]]];
let result;
for (const [command, args] of candidates) {
  const mode = process.env.PRISM_MEDIA_MODE || (process.env.npm_lifecycle_event === 'test:browser:mux' ? 'mux' : 'local');
  result = spawnSync(command,[...args,'tests/browser_smoke.py'],{stdio:'inherit',env:{...process.env, PRISM_MEDIA_MODE:mode}});
  if (!result.error || result.error.code !== 'ENOENT') break;
}
if (result.error) {
  console.error('Python/Playwright not available:', result.error.message);
  console.error('Install Playwright: py -m pip install playwright; py -m playwright install chromium');
  process.exit(1);
}
process.exit(result.status ?? 1);
