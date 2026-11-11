"""Browser check for PRISM Liquid Glass overlay and automatic playback idle fade.
Runs with native video (does not require remote Video.js CDN)."""
from pathlib import Path
import re,shutil,base64
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
html=(ROOT/'index.html').read_text()
html=re.sub(r'<script\b[^>]*>.*?</script>', '', html,flags=re.S)
html=re.sub(r'<link\b[^>]*rel="stylesheet"[^>]*>','',html)
html=html.replace('</head>','<style>'+(ROOT/'src/styles.css').read_text()+'</style></head>')
js=(ROOT/'src/optical-touch.js').read_text()+'\n'+(ROOT/'src/prism-player.js').read_text().replace("import {initOpticalTouch} from './optical-touch.js';",'')
js=js.replace('export const ','const ').replace('export function ','function ')+'\nwindow.mountPrismPlayer=mountPrismPlayer;'
js=(ROOT/'src/chapter-index.js').read_text(encoding='utf-8').replace('export const ','const ').replace('export function ','function ')+'\n'+re.sub(r"^import .*?chapter-index\.js';?\s*$",'',js,flags=re.M)
clip='data:video/mp4;base64,'+base64.b64encode((ROOT/'assets/prism-cinematic.mp4').read_bytes()).decode()
poster='data:image/jpeg;base64,'+base64.b64encode((ROOT/'assets/prism-cinematic.jpg').read_bytes()).decode()
chapters=[{'time':0,'title':'NIGHT CITY'},{'time':8,'title':'SUNRISE'},{'time':16,'title':'LIQUID'},{'time':24,'title':'GOLDEN HOUR'}]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path=shutil.which('chromium'),args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    page=browser.new_page(viewport={'width':1280,'height':900})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html,wait_until='domcontentloaded')
    page.add_script_tag(content=js)
    page.evaluate('''({clip,poster,chapters})=>{
      window.demo=mountPrismPlayer(document.querySelector('#prism-mount'),{src:clip,poster,chapters});
      document.querySelector('#prism-mount').classList.add('is-ready');
      document.querySelector('.prism-controls').setAttribute('data-visible','');
    }''',{'clip':clip,'poster':poster,'chapters':chapters})
    page.wait_for_function('document.querySelector(".prism-media").readyState>=1',timeout=15000)
    assert page.locator('.prism-skin').get_attribute('data-glass-idle') is None
    before=page.locator('.prism-dock').evaluate('''el=>({background:getComputedStyle(el).backgroundImage+getComputedStyle(el).backgroundColor,blur:getComputedStyle(el).backdropFilter,opacity:Number(getComputedStyle(el).opacity)})''')
    assert 'blur' in before['blur'],before
    assert '.39' in before['background'] or '0.39' in before['background'],before
    page.locator('#player-wrap').screenshot(path=str(ROOT/'screenshots'/'liquid-glass-visible-desktop.png'))
    print('PASS: glass is translucent and backdrop blur enabled')
    page.locator('.prism-media').evaluate('el=>el.play()')
    page.wait_for_function('document.querySelector(".prism-skin").dataset.glassIdle==="true"',timeout=5500)
    page.wait_for_timeout(420)
    isHidden=page.locator('.prism-bottom').evaluate('el=>getComputedStyle(el).opacity')
    assert isHidden=='0',isHidden
    page.locator('#player-wrap').screenshot(path=str(ROOT/'screenshots'/'liquid-glass-idle-desktop.png'))
    print('PASS: controls fade away automatically during playback')
    page.locator('.prism-skin').evaluate('''el=>el.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse'}))''')
    page.wait_for_function('!document.querySelector(".prism-skin").dataset.glassIdle',timeout=1000)
    print('PASS: moving mouse reveals controls')
    page.locator('.prism-media').evaluate('el=>el.pause()')
    page.wait_for_timeout(3200)
    assert not page.locator('.prism-skin').get_attribute('data-glass-idle')
    print('PASS: paused controls remain visible')
    page.locator('#player-wrap').evaluate('el=>el.classList.add("prism-solid-surface")')
    solid=page.locator('.prism-dock').evaluate('el=>getComputedStyle(el).backgroundColor')
    assert solid=='rgb(25, 29, 31)',solid
    print('PASS: solid accessibility alternative is opaque')
    page.locator('#player-wrap').evaluate('el=>el.classList.remove("prism-solid-surface")')
    for width in [320,375,390,640,1280]:
      page.set_viewport_size({'width':width,'height':900})
      assert page.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1'),width
      if width==375:
        page.locator('#player-wrap').screenshot(path=str(ROOT/'screenshots'/'liquid-glass-visible-mobile.png'))
      print(f'PASS: no horizontal overflow at {width}px')
    assert not errors,errors
    print('PASS: no uncaught browser exceptions')
    browser.close()
