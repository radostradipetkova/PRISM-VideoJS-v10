"""Independent Chromium test of Optical Deck layout and media-derived readouts.

Runs against real moving MP4 audio/video but WITHOUT Video.js loaded. This is
not evidence that the v10 controls run correctly: native Video.js registration
requires the network in the separate browser_smoke.py integration test.
"""
from pathlib import Path
import base64
import re
import shutil
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent
html=(ROOT/'index.html').read_text(encoding='utf-8')
css=(ROOT/'src/styles.css').read_text(encoding='utf-8')
js=(ROOT/'src/prism-player.js').read_text(encoding='utf-8').replace("import {initOpticalTouch} from './optical-touch.js';",'')
js=(ROOT/'src/optical-touch.js').read_text(encoding='utf-8')+'\n'+js
html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S)
html=re.sub(r'<link\b[^>]*rel="stylesheet"[^>]*>','',html)
html=html.replace('</head>','<style>'+css+'</style></head>')
js=js.replace('export const ', 'const ').replace('export function ', 'function ')
js=(ROOT/'src/chapter-index.js').read_text(encoding='utf-8').replace('export const ','const ').replace('export function ','function ')+'\n'+re.sub(r"^import .*?chapter-index\.js';?\s*$",'',js,flags=re.M)
js += '\nwindow.mountPrismPlayer = mountPrismPlayer;'
clip='data:video/mp4;base64,'+base64.b64encode((ROOT/'assets/after-dark.mp4').read_bytes()).decode()
poster='data:image/jpeg;base64,'+base64.b64encode((ROOT/'assets/after-dark.jpg').read_bytes()).decode()
with sync_playwright() as p:
    chrome=shutil.which('chromium') or shutil.which('google-chrome')
    browser=p.chromium.launch(headless=True,executable_path=chrome if chrome else None,
        args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    page=browser.new_page(viewport={'width':1280,'height':900})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html,wait_until='domcontentloaded')
    page.add_script_tag(content=js)
    page.evaluate('''({clip,poster})=>{
        window.prismInstance=mountPrismPlayer(document.querySelector('#prism-mount'),{src:clip,poster});
    }''',{'clip':clip,'poster':poster})
    media=page.locator('.prism-media')
    page.wait_for_function('document.querySelector(".prism-media").readyState >= 1',timeout=15000)
    assert page.locator('.prism-top-status').inner_text()=='PAUSED'
    assert page.locator('.prism-transport-state').inner_text()=='TRANSPORT / PAUSED'
    assert page.locator('.prism-timecode-display').inner_text()=='00:00'
    assert not page.locator('#prism-mount').evaluate('(el)=>el.classList.contains("is-ready")')
    print('PASS / native media state readouts, Video.js readiness safeguard')

    # Native playback in Chromium genuinely advances media.currentTime.
    media.evaluate('(video)=>video.play()')
    page.wait_for_function('document.querySelector(".prism-media").currentTime >= 1.1',timeout=15000)
    assert page.locator('.prism-top-status').inner_text()=='PLAYING'
    assert page.locator('.prism-transport-state').inner_text()=='TRANSPORT / ACTIVE'
    page.wait_for_function('document.querySelector(".prism-timecode-display").innerText!=="00:00"',timeout=5000)
    media.evaluate('(video)=>video.pause()')
    page.wait_for_function('document.querySelector(".prism-top-status").innerText==="PAUSED"')
    media.evaluate('(video)=>{video.currentTime=9}')
    page.wait_for_function('document.querySelector(".prism-timecode-display").innerText==="00:09"',timeout=10000)
    page.wait_for_function('document.querySelector(".prism-top-status").innerText==="PAUSED"',timeout=8000)
    print('PASS / real moving media play, pause and seek readouts')

    # Visual layout is simulated because the CDN components cannot register.
    page.evaluate('''()=>{
        document.querySelector('#prism-mount').classList.add('is-ready');
        document.querySelector('.prism-controls').setAttribute('data-visible','');
        document.querySelector('.prism-center-play').setAttribute('data-paused','');
    }''')
    page.wait_for_timeout(500)
    (ROOT/'screenshots').mkdir(exist_ok=True)
    for w in [320,375,480,640,768,1080,1280,1440]:
        page.set_viewport_size({'width':w,'height':900})
        assert not page.evaluate('document.documentElement.scrollWidth > window.innerWidth'),f'Page overflow at {w}'
        positions=page.evaluate('''()=>['.prism-topline','.prism-top-status','.prism-center-play','.prism-dock','.prism-play','.prism-time','.prism-mute','button[aria-label="Playback speed"]','button[aria-label="Caption track"]','.prism-fullscreen'].map(sel=>{
          const el=document.querySelector(sel),r=el.getBoundingClientRect(),s=getComputedStyle(el);
          return {sel,left:r.left,right:r.right,top:r.top,bottom:r.bottom,visible:s.display!=='none'&&s.visibility!=='hidden'&&r.width>0};
        })''')
        shown=[x for x in positions if x['visible']]
        assert all(x['left']>=-2 and x['right']<=w+2 for x in shown),f'Offscreen UI at {w}: {shown}'
        # Test only peers within the control row, not deliberate layered overlays.
        controls=[x for x in shown if x['sel'] in ['.prism-play','.prism-time','.prism-mute','button[aria-label="Playback speed"]','button[aria-label="Caption track"]','.prism-fullscreen']]
        for a,b in zip(controls,controls[1:]):
            y_overlap=min(a['bottom'],b['bottom'])-max(a['top'],b['top'])>5
            assert not (y_overlap and b['left']<a['right']-1),f'Controls overlap at {w}: {a} / {b}'
        if w in [320,375,1080,1280]:
            page.locator('#player-wrap').screenshot(path=str(ROOT/'screenshots'/f'optical-deck-{w}-static.png'))
        print(f'PASS / {w}px visual geometry and control separation')
    assert not errors,errors
    print('PASS / no uncaught JavaScript errors')
    browser.close()
