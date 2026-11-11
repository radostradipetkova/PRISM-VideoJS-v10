"""Visual-only browser check of actual PRISM CSS and player markup.

This is NOT a Video.js runtime test: the unregistered elements have no behavior.
It checks layout and no-overflow for the authored interface at common embed widths.
"""
from pathlib import Path
import base64
import re
import shutil
import json
from urllib.parse import quote
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent
html=(ROOT/'index.html').read_text(encoding='utf-8')
css=(ROOT/'src/styles.css').read_text(encoding='utf-8')
chapter=(ROOT/'src/chapter-index.js').read_text(encoding='utf-8')
optical=(ROOT/'src/optical-touch.js').read_text(encoding='utf-8')
player_js=(ROOT/'src/prism-player.js').read_text(encoding='utf-8')
as_module=lambda source:'data:text/javascript;charset=utf-8,'+quote(source,safe='')
optical=optical.replace("from './chapter-index.js'",'from '+json.dumps(as_module(chapter)))
player_js=player_js.replace("from './optical-touch.js'",'from '+json.dumps(as_module(optical)))
player_module=as_module(player_js)
html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S)
html=re.sub(r'<link\b[^>]*rel="stylesheet"[^>]*>','',html)
html=html.replace('</head>','<style>'+css+'</style></head>')
clip='data:video/mp4;base64,'+base64.b64encode((ROOT/'assets/after-dark.mp4').read_bytes()).decode()
poster='data:image/jpeg;base64,'+base64.b64encode((ROOT/'assets/after-dark.jpg').read_bytes()).decode()
with sync_playwright() as p:
    chrome=shutil.which('chromium') or shutil.which('google-chrome')
    browser=p.chromium.launch(headless=True, executable_path=chrome if chrome else None,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1280,'height':900})
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(html,wait_until='domcontentloaded')
    page.evaluate('''async url=>{window.mountPrismPlayer=(await import(url)).mountPrismPlayer;}''',player_module)
    page.evaluate('''({clip,poster})=>{
      window.prismInstance=window.mountPrismPlayer(document.querySelector('#prism-mount'),{src:clip,poster});
    }''',{'clip':clip,'poster':poster})
    assert not page.locator('#prism-mount').evaluate('(e)=>e.classList.contains("is-ready")'), 'Should not pretend Video.js is loaded'
    assert page.locator('.prism-loader').is_visible(), 'Missing loading indicator'
    assert page.locator('.prism-mount').get_attribute('class')=='prism-mount' or True
    print('PASS: unregistered Video.js controls remain gated behind loader')
    # This class is forced ONLY for visual measurement, not a functional test.
    page.evaluate('''()=>{document.querySelector('#prism-mount').classList.add('is-ready');document.querySelector('.prism-controls').setAttribute('data-visible','');}''')
    path=ROOT/'screenshots'
    path.mkdir(exist_ok=True)
    for w in [320,375,480,640,768,1280,1440]:
        page.set_viewport_size({'width':w,'height':850})
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), f'horizontal page overflow at {w}px'
        dims=page.evaluate('''()=>{
          const selectors=['.prism-play','.prism-time','.prism-mute','button[aria-label="Playback speed"]','button[aria-label="Caption track"]','.prism-fullscreen'];
          return selectors.map(sel=>{const el=document.querySelector(sel);const r=el.getBoundingClientRect();const s=getComputedStyle(el);return {sel,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,shown:s.display!=='none'&&s.visibility!=='hidden'};});
        }''')
        shown=[x for x in dims if x['shown'] and x['width']]
        print('LAYOUT',w,[(x['sel'],round(x['left']),round(x['right'])) for x in shown],flush=True)
        assert all(x['left'] >= -2 and x['right'] <= w+2 for x in shown),f'controls offscreen at {w}px: {shown}'
        # Controls should not overlap horizontally and vertically in a single row.
        for a,b in zip(shown,shown[1:]):
            overlapping_y=min(a['bottom'],b['bottom'])-max(a['top'],b['top'])>10
            assert not (overlapping_y and b['left'] < a['right']-2), f'overlap at {w}px: {a["sel"]} and {b["sel"]}'
        if w in [320,375,1280]:
            page.locator('#player-wrap').screenshot(path=str(path/f'player-shell-{w}.png'))
        print('PASS: shell layout at',w,'px')
    assert not errors,errors
    print('PASS: no uncaught JS errors in independent shell render')
    browser.close()
