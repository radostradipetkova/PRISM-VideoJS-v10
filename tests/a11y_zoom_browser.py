"""Independent Chromium CSS/DOM audit, not a Video.js runtime or screen-reader test.

At 200% zoom on a 1280px monitor, the layout viewport is about 640 CSS
pixels. Test both that viewport and the narrow mobile breakpoints.
"""
from pathlib import Path
import re, shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
html=(ROOT/'index.html').read_text(encoding='utf-8')
css=(ROOT/'src/styles.css').read_text(encoding='utf-8')
player_js=(ROOT/'src/optical-touch.js').read_text(encoding='utf-8')+'\n'+(ROOT/'src/prism-player.js').read_text(encoding='utf-8').replace("import {initOpticalTouch} from './optical-touch.js';",'')
player_js=player_js.replace('export const ', 'const ').replace('export function ', 'function ')
player_js=(ROOT/'src/chapter-index.js').read_text(encoding='utf-8').replace('export const ','const ').replace('export function ','function ')+'\n'+re.sub(r"^import .*?chapter-index\.js';?\s*$",'',player_js,flags=re.M)
player_js+='\nwindow.mountPrismPlayer=mountPrismPlayer;'
html=re.sub(r'<script\b[^>]*>.*?</script>', '', html,flags=re.S)
html=re.sub(r'<link\b[^>]*rel="stylesheet"[^>]*>', '', html)
html=html.replace('</head>',f'<style>{css}</style></head>')

def luminance(rgb):
    ch=[int(rgb[i:i+2],16)/255 for i in (1,3,5)]
    l=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in ch]
    return .2126*l[0]+.7152*l[1]+.0722*l[2]
def contrast(c1,c2):
    a,b=sorted([luminance(c1),luminance(c2)])
    return (b+.05)/(a+.05)
with sync_playwright() as p:
    binary=shutil.which('chromium') or shutil.which('google-chrome')
    browser=p.chromium.launch(headless=True,executable_path=binary,args=['--no-sandbox'])
    for width,scale in [(320,1),(375,1),(640,2),(1280,1)]:
        page=browser.new_page(viewport={'width':width,'height':850},device_scale_factor=scale,reduced_motion='reduce')
        page.set_content(html,wait_until='domcontentloaded')
        page.add_script_tag(content=player_js)
        page.evaluate('''()=>{window.demo=mountPrismPlayer(document.querySelector('#prism-mount'),{src:'./assets/prism-cinematic.mp4',captions:'./assets/prism-cinematic.vtt'});document.querySelector('#prism-mount').classList.add('is-ready');}''')
        page.locator('body').evaluate('(el)=>el.offsetWidth')
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'),f'horizontal overflow at {width}px'
        assert page.locator('media-status-announcer').count() == 1,'missing announcer'
        announcer=page.locator('media-status-announcer').evaluate('e=>({display:getComputedStyle(e).display,visibility:getComputedStyle(e).visibility,width:e.getBoundingClientRect().width})')
        assert announcer['display']!='none' and announcer['visibility']!='hidden','announcer removed from a11y tree'
        assert announcer['width'] <= 2,f'not visually hidden: {announcer}'
        assert page.locator('media-container').get_attribute('tabindex')=='0'
        assert page.locator('.prism-rail').get_attribute('aria-label')=='Seek in video'
        assert page.locator('#focus-prism-player').count()==1
        print(f'PASS: {width}px CSS layout (device scale {scale}x), no overflow, accessible announcer + player focus target')
        if width==640:
            page.locator('.prism-skin').screenshot(path=str(ROOT/'screenshots'/'a11y-200percent-player.png'))
        if width==1280:
            page.locator('.prism-skin').screenshot(path=str(ROOT/'screenshots'/'a11y-standard-player.png'))
        page.close()
    for surface in ('light','dark'):
        paper,paper2,text= ('#eae7df','#dfdcd4','#a23c29') if surface=='light' else ('#222521','#252824','#ef714b')
        assert contrast(text,paper)>=4.5,(surface,'paper',contrast(text,paper))
        assert contrast(text,paper2)>=4.5,(surface,'paper2',contrast(text,paper2))
        print(f'PASS: {surface} small orange text contrast >= 4.5:1 ({contrast(text,paper):.2f}, {contrast(text,paper2):.2f})')
    assert contrast('#5c5d55','#dfdcd4')>=4.5,'small grey text contrast'
    assert contrast('#ffffff','#9b3827')>=4.5,'keyboard focus hover text contrast'
    print('PASS: grey secondary text and white hover labels >= 4.5:1')
    browser.close()
