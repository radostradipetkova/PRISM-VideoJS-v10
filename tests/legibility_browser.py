"""Chromium layout and touch-size audit for PRISM's accessible scale.

This test loads the authored CSS and player HTML but intentionally does NOT
register Video.js v10 CDN custom elements. Therefore it verifies *hit areas and
responsive layout*, not the actual native player interactions.
"""
from pathlib import Path
import re, shutil, base64
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent
html=(ROOT/'index.html').read_text(encoding='utf8')
css=(ROOT/'src/styles.css').read_text(encoding='utf8')
js=(ROOT/'src/prism-player.js').read_text(encoding='utf8').replace("import {initOpticalTouch} from './optical-touch.js';",'')
js=(ROOT/'src/optical-touch.js').read_text(encoding='utf-8')+'\n'+js
html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S)
html=re.sub(r'<link\b[^>]*rel="stylesheet"[^>]*>','',html)
html=html.replace('</head>','<style>'+css+'</style></head>')
js=js.replace('export const ','const ').replace('export function ','function ')
js=(ROOT/'src/chapter-index.js').read_text(encoding='utf-8').replace('export const ','const ').replace('export function ','function ')+'\n'+re.sub(r"^import .*?chapter-index\.js';?\s*$",'',js,flags=re.M)
js+='\nwindow.mountPrismPlayer=mountPrismPlayer;'
clip='data:video/mp4;base64,'+base64.b64encode((ROOT/'assets/after-dark.mp4').read_bytes()).decode()
poster='data:image/jpeg;base64,'+base64.b64encode((ROOT/'assets/after-dark.jpg').read_bytes()).decode()

with sync_playwright() as p:
    executable=shutil.which('chromium') or shutil.which('google-chrome')
    browser=p.chromium.launch(headless=True,executable_path=executable if executable else None,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda err: errors.append(str(err)))
    page.set_content(html,wait_until='domcontentloaded')
    page.add_script_tag(content=js)
    page.evaluate("""({clip,poster})=>{
      window.prism=window.mountPrismPlayer(document.querySelector('#prism-mount'),{
        src:clip,poster:poster,captions:'./assets/prism-cinematic.vtt'
      });
      const mount=document.querySelector('#prism-mount');
      mount.classList.add('is-ready');
      document.querySelector('.prism-controls').setAttribute('data-visible','');
      // The CDN component is deliberately unregistered here; populate its
      // visible time text to test real-world text occupancy in layout.
      document.querySelector('media-time[type="current"]').textContent='0:00';
      document.querySelector('media-time[type="duration"]').textContent='0:32';
    }""",{'clip':clip,'poster':poster})
    selectors=['.prism-play','.prism-mute','.prism-settings-trigger',
      'button[aria-label="Caption track"]','.prism-fullscreen']
    # Hit target and component responsive testing. Root 320px creates 290px embed.
    for width in [320,340,375,400,480,640,768,1080,1440]:
        page.set_viewport_size({'width':width,'height':920})
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),f'PAGE overflow {width}'
        data=page.evaluate("""(selectors)=>{
          const rect=(e)=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);
             return {x:r.left,y:r.top,w:r.width,h:r.height,right:r.right,bottom:r.bottom,
              visible:s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0,
              font:parseFloat(s.fontSize)};};
          const wrap=rect(document.querySelector('.prism-skin'));
          const controls=selectors.map(sel=>({sel,...rect(document.querySelector(sel))}));
          const time=rect(document.querySelector('.prism-time'));
          const rail=rect(document.querySelector('.prism-rail'));
          const chapter=rect(document.querySelector('.chapter-bar button'));
          const note=rect(document.querySelector('.player-footer'));
          return {wrap,controls,time,rail,chapter,note};
        }""",selectors)
        active=[c for c in data['controls'] if c['visible']]
        for c in active:
            assert c['w']>=43.9 and c['h']>=43.9,(width,c)
            assert c['x']>=data['wrap']['x']-1 and c['right']<=data['wrap']['right']+1,(width,c,data['wrap'])
        assert data['rail']['h']>=43.9,(width,data['rail'])
        # The time label is not a button but must not intersect buttons.
        time=data['time']
        for c in active:
            x_overlap=min(c['right'],time['right'])-max(c['x'],time['x'])
            y_overlap=min(c['bottom'],time['bottom'])-max(c['y'],time['y'])
            assert not (x_overlap>1 and y_overlap>1),(width,'TIME-OVERLAP',c,time)
        for i,a in enumerate(active):
            for b in active[i+1:]:
                xo=min(a['right'],b['right'])-max(a['x'],b['x'])
                yo=min(a['bottom'],b['bottom'])-max(a['y'],b['y'])
                assert not (xo>1 and yo>1),(width,a,b)
        assert data['time']['font']>=11.9,(width,data['time'])
        assert data['chapter']['font']>=10.9,(width,data['chapter'])
        assert data['note']['font']>=10.9,(width,data['note'])
        if width in (320,375,480,1080):
            (ROOT/'screenshots').mkdir(exist_ok=True)
            page.locator('#player-wrap').screenshot(path=str(ROOT/'screenshots'/f'legible-player-{width}.png'))
        print(f'PASS / viewport {width}px; embed {data["wrap"]["w"]:.0f}px; {len(active)} touch targets >=44; readable time {data["time"]["font"]}px')
    # Container query responds to an embedded player narrower than the viewport.
    page.set_viewport_size({'width':1440,'height':920})
    page.locator('#player-wrap').evaluate('(e)=>e.style.setProperty("--preferred-width","320px")')
    page.wait_for_timeout(550)
    result=page.evaluate("""()=>({size:document.querySelector('.prism-skin').getBoundingClientRect().width,
      play:document.querySelector('.prism-play').getBoundingClientRect().height,
      mute:document.querySelector('.prism-mute').getBoundingClientRect().height})""")
    assert result['size']<=321 and result['play']>=44 and result['mute']>=44,result
    print('PASS / player-specific container sizing at 320px embedded on desktop')
    assert not errors,errors
    print('PASS / no uncaught script errors')
    browser.close()
