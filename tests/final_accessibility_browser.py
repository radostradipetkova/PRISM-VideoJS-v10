"""Independent PRISM a11y interaction audit against native Chromium + real short MP4.
The Video.js CDN is not loaded; these tests cover the skin's own UI, not a full
Video.js/HLS/screen-reader sign-off. Use on your own machine for this isolated audit.
"""
from pathlib import Path
import re, os, shutil, base64, subprocess, tempfile, json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
html=(ROOT/'index.html').read_text(encoding='utf-8')
css=(ROOT/'src/styles.css').read_text(encoding='utf-8')
html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S|re.I)
html=re.sub(r'<link\b[^>]*rel="stylesheet"[^>]*>','',html)
html=html.replace('</head>',f'<style>{css}</style></head>')
files=['chapter-index.js','optical-touch.js','prism-player.js']
scripts=[]
for name in files:
    code=(ROOT/'src'/name).read_text(encoding='utf-8')
    code=re.sub(r'^import .*?;\s*$', '', code, flags=re.M)
    code=re.sub(r'^export\s+(?=(?:const|function|class)\b)', '', code,flags=re.M)
    scripts.append(code)
js='\n'.join(scripts)+'\nwindow.mountPrismPlayer=mountPrismPlayer;'

def make_sample():
    with tempfile.TemporaryDirectory() as t:
        out=Path(t)/'sample.mp4'
        subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-f','lavfi',
          '-i','color=c=royalblue:s=320x180:r=12:d=3','-c:v','libx264','-pix_fmt','yuv420p',
          '-movflags','+faststart',str(out)],check=True,timeout=20)
        return 'data:video/mp4;base64,'+base64.b64encode(out.read_bytes()).decode('ascii')

sample=make_sample()
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    run_count=0
    for width in [320,375,390,640,1280]:
        context=browser.new_context(viewport={'width':width,'height':840},reduced_motion='reduce')
        page=context.new_page()
        errors=[]
        page.on('pageerror',lambda exc: errors.append(str(exc)))
        page.set_content(html,wait_until='domcontentloaded')
        page.add_script_tag(content=js)
        chapters=[{'time':i*3/20,'title':f'SECTION {i+1:02}'} for i in range(20)]
        page.evaluate('''opts=>{
          window.demo=mountPrismPlayer(document.querySelector('#prism-mount'),opts);
          document.querySelector('#prism-mount').classList.add('is-ready');
          document.querySelector('.prism-controls').setAttribute('data-visible','');
        }''',{'src':sample,'poster':'','captions':None,'chapters':chapters})
        page.wait_for_function('document.querySelector(".prism-media").readyState>=1',timeout=12000)
        assert page.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+2'),('horizontal overflow',width)
        launch=page.locator('.prism-explore-launch')
        assert launch.is_visible(),('missing launch',width)
        assert launch.evaluate('e=>e.getBoundingClientRect().width>=44&&e.getBoundingClientRect().height>=44'),('launch too small',width)
        launch.focus();page.keyboard.press('Enter')
        assert page.locator('.prism-chapter-dialog').evaluate('e=>e.open'),('dialog not opened',width)
        assert page.locator('.prism-chapter-dialog').get_attribute('aria-label')
        assert page.locator('.prism-chapter-dialog').get_attribute('data-index-layout')=='library'
        assert page.locator('.prism-index-search').evaluate('e=>document.activeElement===e'),('search should get initial focus',width)
        assert page.locator('.prism-chapter-choice').count()==20
        for _ in range(5):
            page.keyboard.press('Tab')
            is_inside=page.evaluate('''()=>document.querySelector('.prism-chapter-dialog').contains(document.activeElement)''')
            assert is_inside,('focus escaped modal',width)
        page.keyboard.press('Escape')
        assert not page.locator('.prism-chapter-dialog').evaluate('e=>e.open'),('Escape did not close',width)
        assert launch.evaluate('e=>document.activeElement===e'),('focus did not return',width)
        page.wait_for_function("document.querySelector('.prism-explore-launch').getAttribute('aria-expanded')==='false'",timeout=3000)
        assert page.locator('.prism-chapter-dialog').evaluate('''e=>getComputedStyle(e).animationName==='none' || !e.open''')
        assert not errors,('JS errors',width,errors)
        print('PASS: modal keyboard, Esc, focus return, width, reduced motion at',width)
        run_count+=1
        context.close()
    # Test no chapters = no explore; 4 chapters = radial
    for count,expected in [(0,None),(4,'radial'),(8,'list'),(20,'library')]:
        page=browser.new_page(viewport={'width':1000,'height':850})
        page.set_content(html,wait_until='domcontentloaded');page.add_script_tag(content=js)
        chapters=[{'time':i*3/max(count,1),'title':f'SECTION {i+1}'} for i in range(count)]
        page.evaluate('''o=>{window.demo=mountPrismPlayer(document.querySelector('#prism-mount'),o);document.querySelector('#prism-mount').classList.add('is-ready')}''',{'src':sample,'poster':'','captions':None,'chapters':chapters})
        page.wait_for_function('document.querySelector(".prism-media").readyState>=1',timeout=12000)
        if count==0:
            assert page.locator('.prism-explore-launch').is_hidden()
        else:
            page.locator('.prism-explore-launch').click()
            assert page.locator('.prism-chapter-dialog').get_attribute('data-index-layout')==expected
            if count==20:
                s=page.locator('.prism-index-search')
                s.fill('SECTION 20')
                assert page.locator('.prism-chapter-choice:visible').count()==1
                assert '1 of 20' in page.locator('.prism-index-result-count').inner_text()
                s.fill('does not exist')
                assert page.locator('.prism-index-empty').is_visible()
                s.fill('')
                page.locator('.prism-chapter-choice').nth(15).click()
                page.wait_for_function('document.querySelector(".prism-media").currentTime>=2.2',timeout=6000)
        print('PASS: chapter count layout',count,expected)
        run_count+=1
        page.close()
    browser.close()
    print('INDEPENDENT BROWSER AUDIT PASSED',run_count,'scenarios (Video.js CDN not loaded)')
