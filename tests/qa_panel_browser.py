"""Real MP4 QA-widget behavior, without claiming full Video.js integration."""
import base64, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
clip='data:video/mp4;base64,'+base64.b64encode((root/'assets/coast-sunrise.mp4').read_bytes()).decode()
code=(root/'src/qa-panel.js').read_text().replace('export function','function')
code+='\nwindow.initPlayerQA=initPlayerQA;'
with sync_playwright() as p:
    path=shutil.which('chromium') or shutil.which('google-chrome')
    browser=p.chromium.launch(headless=True,executable_path=path if path else None,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    page=browser.new_page(accept_downloads=True)
    page.set_content('<html><body><div id="after"></div><div id="root"><video playsinline muted preload="auto"></video></div></body></html>')
    page.add_script_tag(content=code)
    page.evaluate('''(src)=>{const root=document.querySelector('#root');const media=root.querySelector('video');media.src=src;window.qa=initPlayerQA(document.querySelector('#after'));window.qa.setMedia(media,root,root);}''',clip)
    page.wait_for_function("document.querySelector('video').readyState>=1",timeout=12000)
    assert 'LOCAL MP4' in page.locator('#prism-qa-source').inner_text()
    assert page.locator('[data-qa-check="play"] .qa-status').inner_text()=='WAITING'
    page.locator('video').evaluate('(v)=>v.play()')
    page.wait_for_function("document.querySelector('[data-qa-check=\"play\"] .qa-status').textContent === 'PASSED'",timeout=12000)
    print('PASS / QA play requires genuinely advancing video, not merely play event')
    with page.expect_download() as download:
        page.locator('#prism-export-audit').click()
    assert download.value.suggested_filename=='prism-browser-audit.txt'
    print('PASS / QA report downloads through an actual browser button')
    browser.close()
