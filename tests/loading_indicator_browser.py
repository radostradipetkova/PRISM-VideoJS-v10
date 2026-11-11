"""Browser check for PRISM's branded buffering overlay.

This mounts the real player markup and CSS in a local Playwright page,
stubs the non-loading-related modules, and then simulates the same native
waiting/playing events the browser emits when a weak connection interrupts
playback.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import re

ROOT = Path(__file__).resolve().parents[1]


def strip_module(path: Path) -> str:
    source = path.read_text()
    source = re.sub(r'^import .*?;\n', '', source, flags=re.M)
    source = re.sub(r'\bexport (?=(?:function|const)\b)', '', source)
    return source

script = "\n".join([
    strip_module(ROOT / 'src' / 'media-status.js'),
    strip_module(ROOT / 'src' / 'prism-player.js'),
    """
const initOpticalTouch=()=>({getIndex:()=>({type:'chapters',entries:[]}),destroy(){}});
const initFullscreenOrientation=()=>({setEnabled(){},destroy(){}});
const initWebKitFullscreenKeyboard=()=>({destroy(){}});
const normalizePreferences=(value={})=>({
  surface:value.surface ?? 'liquid',
  captionSize:value.captionSize ?? 'medium',
  captionBackground:value.captionBackground ?? 'solid',
  videoFit:value.videoFit ?? null,
  autoRotate:value.autoRotate ?? false,
  keyboardGuide:value.keyboardGuide ?? false,
  reducedMotion:value.reducedMotion ?? false
});
const initPlayerPreferences=()=>({
  getOverrides(){return {};},
  getEffective(){return normalizePreferences({});},
  setRememberState(){},
  open(){},
  destroy(){}
});
const initSceneLoop=()=>({getState:()=>({active:false}),hasChapter:()=>false,toggleChapter(){},stop(){},destroy(){}});
const DEFAULT_REMEMBER_KEY='prism-remember-settings';
const safeStorage=()=>({persistenceAvailable:false});
const readRememberedSettings=()=>null;
const saveRememberedSettings=()=>true;
const clearRememberedSettings=()=>true;
const normalizePlaybackRate=(value)=>Number.isFinite(value)&&value>0?value:null;
const normalizeChapters=(entries)=>entries ?? [];
window.__mount = () => {
  window.__prism?.destroy?.();
  window.__prism = mountPrismPlayer(document.getElementById('root'), {
    src:'demo.mp4', poster:'demo.jpg', title:'Loading State Test', captions:null, chapters:[]
  });
  const media = window.__prism.media;
  window.__paused = false;
  Object.defineProperty(media, 'paused', { configurable:true, get(){ return window.__paused; } });
  Object.defineProperty(media, 'readyState', { configurable:true, get(){ return 4; } });
  Object.defineProperty(media, 'error', { configurable:true, get(){ return null; } });
  Object.defineProperty(media, 'ended', { configurable:true, get(){ return false; } });
  Object.defineProperty(media, 'seeking', { configurable:true, get(){ return false; } });
  Object.defineProperty(media, 'currentTime', { configurable:true, get(){ return 4; } });
  media.dispatchEvent(new Event('playing'));
  return true;
};
window.__mount();
"""
])

css = (ROOT / 'src' / 'styles.css').read_text()

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    errors = []
    page.on('pageerror', lambda err: errors.append(str(err)))
    try:
        page.set_content(f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
        html,body{{margin:0;background:#edebe5}}*,*::before,*::after{{box-sizing:border-box}}
        #root{{width:1080px;max-width:100%;margin:24px auto}}
        .prism-skin{{display:block;width:100%;height:608px;position:relative;container-type:inline-size}}
        </style><style>{css}</style></head><body><div id="root"></div></body></html>''')
        page.add_script_tag(content=script)
        page.wait_for_selector('.prism-skin')
        page.wait_for_function("document.querySelector('.prism-skin')?.dataset.viewState === 'playing'")

        visible = page.locator('.prism-buffering').evaluate("(el)=>{const s=getComputedStyle(el);const r=el.getBoundingClientRect();return s.visibility!=='hidden'&&s.opacity!=='0'&&r.width>0&&r.height>0;}")
        assert not visible, 'Loading overlay should be hidden during healthy playback'

        page.evaluate("""() => {
          const media = document.querySelector('.prism-media');
          media.dispatchEvent(new Event('waiting'));
        }""")
        page.wait_for_function("document.querySelector('.prism-skin')?.dataset.viewState === 'buffering'")
        page.wait_for_timeout(300)
        visible = page.locator('.prism-buffering').evaluate("(el)=>{const s=getComputedStyle(el);const r=el.getBoundingClientRect();return s.visibility!=='hidden'&&s.opacity!=='0'&&r.width>0&&r.height>0;}")
        assert visible, 'Loading overlay did not appear during buffering'
        text = page.locator('.prism-buffering').inner_text()
        assert 'PRISM / SIGNAL HOLD' in text and 'BUFFERING' in text and 'connection' in text.lower(), text
        print('PASS: branded loading overlay appears during buffering', flush=True)

        page.evaluate("""() => {
          const media = document.querySelector('.prism-media');
          media.dispatchEvent(new Event('playing'));
        }""")
        page.wait_for_function("document.querySelector('.prism-skin')?.dataset.viewState === 'playing'")
        page.wait_for_timeout(300)
        visible = page.locator('.prism-buffering').evaluate("(el)=>{const s=getComputedStyle(el);const r=el.getBoundingClientRect();return s.visibility!=='hidden'&&s.opacity!=='0'&&r.width>0&&r.height>0;}")
        assert not visible, 'Loading overlay did not clear after playback resumed'
        print('PASS: branded loading overlay clears after playback resumes', flush=True)

        assert not errors, f'Uncaught JS errors: {errors}'
        print('PASS: no uncaught JS errors', flush=True)
    finally:
        browser.close()
