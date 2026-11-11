"""Isolated Chromium CSS regression for the width-slider scroll jump.

Run from project root: python tests/player_width_stability_browser.py
A real Video.js/Mux playback check remains separate. This verifies the real
page's DOM/CSS layout with a placeholder matching the player sizing rules.
"""
from pathlib import Path
import re
import shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
html=(ROOT/'index.html').read_text(encoding='utf-8')
css=(ROOT/'src/styles.css').read_text(encoding='utf-8')
html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S)
html=re.sub(r'<link\b[^>]*rel="stylesheet"[^>]*>','',html)
html=html.replace('</head>','<style>'+css+'</style></head>')
html=html.replace('id="prism-mount" class="prism-mount" aria-label="PRISM player demonstration"></div>',
 'id="prism-mount" class="prism-mount" aria-label="PRISM player demonstration"><div class="prism-vjs-player"><div class="prism-skin"></div></div></div>')

with sync_playwright() as p:
    chrome=shutil.which('chromium') or shutil.which('google-chrome')
    browser=p.chromium.launch(headless=True,executable_path=chrome,args=['--no-sandbox'])
    for width in (640,720,760,1280):
        page=browser.new_page(viewport={'width':width,'height':850})
        page.set_content(html)
        page.evaluate('''() => {
          document.documentElement.style.scrollBehavior='auto';
          document.getElementById('player-width').scrollIntoView({block:'center',behavior:'instant'});
        }''')
        page.wait_for_timeout(200)
        metrics=lambda:page.evaluate('''() => ({
          top: window.scrollY,
          slider:document.getElementById('player-width').getBoundingClientRect().top,
          stage: document.querySelector('.player-size-stage').getBoundingClientRect().height,
          overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth
        })''')
        start=metrics()
        for px in (950,730,480,320,1080):
            page.evaluate('(px)=>document.getElementById("player-wrap").style.setProperty("--preferred-width",px+"px")',px)
            page.wait_for_timeout(280)
            current=metrics()
            assert abs(current['top']-start['top'])<2,(width,px,start,current)
            assert abs(current['slider']-start['slider'])<2,(width,px,start,current)
            assert abs(current['stage']-start['stage'])<2,(width,px,start,current)
            assert current['overflow']<=1,(width,px,current)
        print(f'PASS: {width}px viewport: player size changes without page scrolling')
        page.close()
    # Keep the original phone layout rather than leaving a big empty stage.
    for width in (320,375,390):
        page=browser.new_page(viewport={'width':width,'height':850})
        page.set_content(html)
        stage=page.locator('.player-size-stage')
        assert stage.evaluate('(el)=>getComputedStyle(el).display')=='block',width
        assert page.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1'),width
        print(f'PASS: {width}px phone layout preserved')
        page.close()
    browser.close()
