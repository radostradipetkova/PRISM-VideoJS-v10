"""Standalone real-Chromium + real-MP4 test for interactive Anatomy cards.

Loads the authored HTML/CSS/feature JS into a browser without the remote
Video.js CDN. These checks verify the three companion controls against a real
HTMLVideoElement but DO NOT verify the complete Video.js integration.

Run: python tests/anatomy_browser_media.py
Dependencies: Python playwright and Chromium.
"""
from pathlib import Path
import base64
import re
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
html = (ROOT / 'index.html').read_text(encoding='utf-8')
css = (ROOT / 'src/styles.css').read_text(encoding='utf-8')
js = (ROOT / 'src/feature-demos.js').read_text(encoding='utf-8')
# The full app imports Video.js via jsDelivr, which is blocked in this test
# environment. Run only the unchanged, real Anatomy component source.
html = re.sub(r'<script\b[^>]*>.*?</script>', '', html, flags=re.S)
html = re.sub(r'<link\b[^>]*rel="stylesheet"[^>]*>', '', html)
html = html.replace('</head>', '<style>' + css + '</style></head>')
js = js.replace('export function initFeatureDemos', 'function initFeatureDemos')
js += '\nwindow.initFeatureDemos=initFeatureDemos;'
mp4 = 'data:video/mp4;base64,' + base64.b64encode((ROOT / 'assets/after-dark.mp4').read_bytes()).decode()
mp4_second = 'data:video/mp4;base64,' + base64.b64encode((ROOT / 'assets/daybreak.mp4').read_bytes()).decode()

with sync_playwright() as pw:
    browser_bin = shutil.which('chromium') or shutil.which('google-chrome')
    browser = pw.chromium.launch(
        headless=True,
        executable_path=browser_bin if browser_bin else None,
        args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] if browser_bin else ['--autoplay-policy=no-user-gesture-required']
    )
    page = browser.new_page(viewport={'width':1440, 'height':900}, has_touch=True)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_content(html, wait_until='domcontentloaded')
    page.add_script_tag(content=js)
    page.evaluate('''source => {
        const v = document.createElement('video');
        v.id = 'verified-native-video';
        v.preload = 'auto';
        v.playsInline = true;
        v.style.cssText='position:fixed;top:0;left:0;width:40px;height:22px';
        document.body.appendChild(v);
        window.demos=window.initFeatureDemos();
        window.demos.setMedia(v);
        v.src=source;v.load();
    }''', mp4)
    page.wait_for_function("document.querySelector('#verified-native-video').readyState >= 1 && !document.querySelector('#rail-demo-range').disabled")
    media = page.locator('#verified-native-video')
    rail = page.locator('#rail-demo-range')
    assert page.locator('#rail-demo-duration').inner_text() == '00:18'
    print('PASS 1 / Native MP4 metadata and enabled rail')

    # Native click-to-seek and keyboard seeking.
    rail.scroll_into_view_if_needed()
    box = rail.bounding_box()
    rail.click(position={'x':box['width']/2,'y':box['height']/2})
    assert abs(media.evaluate('(m)=>m.currentTime') - 9) < 0.7
    rail.focus()
    rail.press('ArrowRight')
    assert 13.3 < media.evaluate('(m)=>m.currentTime') < 14.7
    print('PASS 2 / Timeline pointer click and keyboard step seeking')

    # Real pointer drag to a new location (not programmatically changing range.value).
    box = rail.bounding_box()
    x1=box['x']+box['width']*.75
    x2=box['x']+box['width']*.25
    y=box['y']+box['height']*.5
    page.mouse.move(x1,y)
    page.mouse.down()
    page.mouse.move(x2,y,steps=8)
    page.mouse.up()
    assert 3.4 < media.evaluate('(m)=>m.currentTime') < 5.6
    print('PASS 3 / Pointer drag changes real playback position')

    # Aperture playback and state reflect native media, no fake animation state.
    page.locator('.aperture-toggle').click()
    page.wait_for_function("!document.querySelector('#verified-native-video').paused")
    page.wait_for_function("document.querySelector('.aperture-toggle').getAttribute('aria-pressed')==='true'")
    before=media.evaluate('(m)=>m.currentTime')
    page.wait_for_timeout(350)
    assert media.evaluate('(m)=>m.currentTime') > before
    page.locator('.aperture-toggle').click()
    page.wait_for_function("document.querySelector('#verified-native-video').paused")
    print('PASS 4 / Aperture play, advancing frames, pause, accessible state')

    # Real buttons and keyboard shortcut card.
    page.locator('[data-demo-key=forward]').click()
    value=media.evaluate('(m)=>m.currentTime')
    assert value >= 8
    page.locator('[data-demo-key=back]').click()
    assert media.evaluate('(m)=>m.currentTime') < value
    card=page.locator('.access-card')
    card.focus()
    before=media.evaluate('(m)=>m.currentTime')
    page.keyboard.press('ArrowRight')
    assert media.evaluate('(m)=>m.currentTime') >= before+4.9
    page.keyboard.press('Space')
    page.wait_for_function("!document.querySelector('#verified-native-video').paused")
    page.wait_for_function("document.querySelector('.access-demo-feedback').textContent.includes('SPACE')")
    print('PASS 5 / Clickable keys, focused card arrow keys and Space')

    # Source switches must detach listeners from old video and reconnect to new.
    page.evaluate('''source => {
        const original=document.querySelector('#verified-native-video');
        original.pause();
        const next=document.createElement('video');
        next.id='second-native-video';next.preload='auto';
        next.style.cssText='position:fixed;top:0;left:45px;width:40px;height:22px';
        document.body.appendChild(next);
        window.demos.setMedia(next);
        next.src=source;next.load();
    }''',mp4_second)
    page.wait_for_function("document.querySelector('#second-native-video').readyState>=1 && !document.querySelector('#rail-demo-range').disabled")
    rail.fill('6')
    assert abs(page.locator('#second-native-video').evaluate('(m)=>m.currentTime')-6)<.3
    original_time=media.evaluate('(m)=>m.currentTime')
    page.locator('.aperture-toggle').click()
    page.wait_for_function("!document.querySelector('#second-native-video').paused")
    assert media.evaluate('(m)=>m.paused')
    assert abs(media.evaluate('(m)=>m.currentTime')-original_time)<.3
    print('PASS 6 / Switching real media rebinds the controls')

    for width in [320, 375, 480, 640, 768, 1280, 1440]:
        page.set_viewport_size({'width':width, 'height':780})
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), f'Horizontal overflow at {width}px'
        for selector in ['#rail-demo-range', '.aperture-toggle', '[data-demo-key=back]', '[data-demo-key=toggle]', '[data-demo-key=forward]']:
            element=page.locator(selector)
            assert element.is_visible(), f'Hidden element {selector} at {width}px'
            assert element.bounding_box()['height']>=30, f'Undersized element {selector} at {width}px'
    print('PASS 7 / Seven viewport widths, no overflow, all controls visible')

    assert errors == [], 'Uncaught JavaScript errors: ' + repr(errors)
    print('PASS 8 / No uncaught JavaScript exceptions')
    browser.close()
