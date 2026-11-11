"""PRISM integrated Video.js v10 keyboard/control regression test.

This deliberately uses the REAL Video.js web components and browser media APIs.
It does not mock playback or custom-element state.

Run from the project root while `npm run dev` is serving port 4173:
    npm run test:browser              # local MP4 (isolates the actual player)
    npm run test:browser:mux          # public Mux HLS (end-to-end stream)

Requirements: Python Playwright, installed Chromium, access to jsDelivr;
Mux test additionally needs access to stream.mux.com. Headless fullscreen/PiP
may be unavailable and are explicitly reported as skipped when unsupported.
"""
import os
import shutil
import sys
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parent.parent
BASE_URL = os.environ.get('PRISM_URL', 'http://127.0.0.1:4173/')
MODE = os.environ.get('PRISM_MEDIA_MODE', 'local').lower()
assert MODE in {'local', 'mux'}, 'PRISM_MEDIA_MODE must be local or mux'


def with_source(url):
    parsed = urlsplit(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    if MODE == 'local':
        query['source'] = 'local'
    else:
        query.pop('source', None)
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path or '/', urlencode(query), ''))


def report(name):
    print('PASS:', name, flush=True)


def run():
    with sync_playwright() as p:
        chrome = os.environ.get('CHROME_PATH') or shutil.which('chromium') or shutil.which('google-chrome')
        args = ['--autoplay-policy=no-user-gesture-required']
        if chrome:
            args.insert(0, '--no-sandbox')
        browser = p.chromium.launch(headless=True, executable_path=chrome if chrome else None, args=args)
        page = browser.new_page(viewport={'width':1280,'height':900})
        errors=[]
        failed_requests=[]
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('requestfailed', lambda request: failed_requests.append(request.url))
        source = with_source(BASE_URL)
        try:
            try:
                page.goto(source, wait_until='domcontentloaded', timeout=20000)
                page.locator('#prism-mount.is-ready').wait_for(timeout=25000)
            except Exception as error:
                raise AssertionError('Video.js player did not initialize. Check server availability, '
                     f'jsDelivr and (in Mux mode) stream.mux.com. URL: {source}. '
                     f'Requests failed: {failed_requests[-5:]}. Error: {error}') from error
            selector = 'mux-video.prism-media' if MODE == 'mux' else 'video.prism-media'
            media = page.locator(selector)
            expect(media).to_have_count(1)
            page.wait_for_function("document.querySelector('.prism-media')?.readyState >= 1",timeout=25000)
            duration = media.evaluate('(v)=>v.duration')
            assert 31 < duration < 34, f'Expected ~32-second cinematic film, got {duration}'
            expected=['video-player','media-container','media-controls','media-controls-content',
                      'media-time-slider','media-play-button','media-menu',
                      'media-volume-slider','media-fullscreen-button','media-captions-radio-group']
            if MODE=='mux': expected.append('mux-video')
            missing=page.evaluate('(tags)=>tags.filter((tag)=>!customElements.get(tag))',expected)
            assert not missing, f'Missing real v10 elements: {missing}'
            report(f'Video.js v10, {MODE} media, 32-second duration and components')

            page.locator('.prism-center-play').click()
            page.wait_for_function("!document.querySelector('.prism-media').paused",timeout=10000)
            before=media.evaluate('(v)=>v.currentTime')
            page.wait_for_timeout(750)
            assert media.evaluate('(v)=>v.currentTime') > before+.15, 'Media did not advance'
            page.locator('.prism-skin').hover()
            page.locator('.prism-play').click()
            page.wait_for_function("document.querySelector('.prism-media').paused",timeout=7000)
            report('Real Play/Pause and time advancement')

            page.locator('.prism-skin').hover()
            page.locator('.skip-forward').click()
            page.wait_for_function("document.querySelector('.prism-media').currentTime>=4",timeout=6500)
            page.locator('.skip-back').click()
            page.wait_for_function("document.querySelector('.prism-media').currentTime<3",timeout=6500)
            rail=page.locator('.prism-rail')
            rect=rail.bounding_box(); assert rect
            y=rect['y']+rect['height']/2
            page.mouse.move(rect['x']+rect['width']*.2,y)
            page.mouse.down()
            page.mouse.move(rect['x']+rect['width']*.7,y,steps=8)
            page.mouse.up()
            page.wait_for_function("document.querySelector('.prism-media').currentTime>17",timeout=6500)
            report('Skip buttons and actual timeline pointer drag')

            page.locator('.prism-skin').hover()
            page.locator('.prism-mute').click()
            page.wait_for_function("document.querySelector('.prism-media').muted",timeout=4000)
            page.locator('.prism-mute').click()
            page.wait_for_function("!document.querySelector('.prism-media').muted",timeout=4000)
            volume=page.locator('.prism-volume')
            if volume.is_visible() and not volume.evaluate('(e)=>e.hidden'):
                box=volume.bounding_box();assert box
                page.mouse.click(box['x']+box['width']*.3,box['y']+box['height']/2)
                page.wait_for_function("document.querySelector('.prism-media').volume < .7",timeout=4000)
                report('Real mute/unmute and volume control')
            else: report('Real mute/unmute (volume slider not available)')

            rate=page.locator('button[aria-label="Playback speed"]')
            page.locator('.prism-skin').hover()
            rate.click()
            rate_menu=page.locator('media-menu.prism-menu[data-open]').filter(
                has=page.locator('media-playback-rate-radio-group'))
            rate_menu.wait_for(timeout=6000)
            rate_menu.locator('media-menu-radio-item').filter(has_text='1.5').first.click()
            page.wait_for_function("Math.abs(document.querySelector('.prism-media').playbackRate-1.5)<0.01",timeout=5000)
            rate.click(); rate_menu.wait_for(timeout=5000)
            page.keyboard.press('Escape')
            expect(rate_menu).to_have_count(0,timeout=5000)
            report('Actual 1.5x speed change, Escape closes speed menu')

            captions=page.locator('button[aria-label="Caption track"]')
            page.locator('.prism-skin').hover()
            captions.click()
            cc_menu=page.locator('media-menu.prism-menu[data-open]').filter(
                has=page.locator('media-captions-radio-group'))
            cc_menu.wait_for(timeout=6000)
            cc_menu.locator('media-menu-radio-item').filter(has_text='English').first.click()
            page.wait_for_function("[...document.querySelector('.prism-media').textTracks].some(t=>t.mode==='showing')",timeout=6000)
            captions.click();cc_menu.wait_for(timeout=5000)
            page.keyboard.press('Escape')
            expect(cc_menu).to_have_count(0,timeout=5000)
            report('Actual descriptive caption track and Escape closes captions menu')

            # No page-wide shortcut trap. Focus the player explicitly.
            focus_button=page.locator('#focus-prism-player')
            focus_button.click()
            page.wait_for_function("document.activeElement?.matches('media-container')",timeout=3000)
            skin=page.locator('media-container.prism-skin')
            skin.press('k')
            page.wait_for_function("!document.querySelector('.prism-media').paused",timeout=5000)
            skin.press('Space')
            page.wait_for_function("document.querySelector('.prism-media').paused",timeout=5000)
            skin.press('k')
            page.wait_for_function("!document.querySelector('.prism-media').paused",timeout=5000)
            t=media.evaluate('(v)=>v.currentTime')
            skin.press('ArrowRight')
            page.wait_for_function(f"document.querySelector('.prism-media').currentTime>={t+4.5}",timeout=6000)
            skin.press('ArrowLeft')
            page.wait_for_function(f"document.querySelector('.prism-media').currentTime<={t+1}",timeout=6000)
            skin.press('m')
            page.wait_for_function("document.querySelector('.prism-media').muted",timeout=4000)
            skin.press('m')
            page.wait_for_function("!document.querySelector('.prism-media').muted",timeout=4000)
            start_vol=media.evaluate('(v)=>v.volume')
            if start_vol>=0.1:
                skin.press('ArrowDown')
                page.wait_for_function(f"document.querySelector('.prism-media').volume < {start_vol-0.035}",timeout=5000)
                skin.press('ArrowUp')
                page.wait_for_function(f"document.querySelector('.prism-media').volume > {start_vol-0.025}",timeout=5000)
            report('Focused keyboard shortcuts: K, Space, Left/Right while playing, M and Up/Down')
            page.locator('.prism-play').focus()
            page.locator('.prism-play').press('Enter')
            page.wait_for_function("document.querySelector('.prism-media').paused",timeout=5000)
            page.locator('.prism-play').press('Enter')
            page.wait_for_function("!document.querySelector('.prism-media').paused",timeout=5000)
            report('Enter activates the real focused Play/Pause control')

            if page.evaluate('document.fullscreenEnabled'):
                page.locator('.prism-skin').hover()
                page.locator('.prism-fullscreen').click()
                page.wait_for_function('document.fullscreenElement!==null',timeout=6000)
                page.keyboard.press('Escape')
                page.wait_for_function('document.fullscreenElement===null',timeout=6000)
                report('Native fullscreen and Escape exit')
            else:print('SKIP: Browser does not enable native fullscreen')

            if page.evaluate('document.pictureInPictureEnabled && typeof document.querySelector(".prism-media")?.requestPictureInPicture === "function"') and page.locator('.prism-pip').is_visible():
                page.locator('.prism-skin').hover()
                page.locator('.prism-pip').click()
                page.wait_for_function('document.pictureInPictureElement!==null',timeout=6000)
                page.evaluate('document.exitPictureInPicture()')
                report('Native picture-in-picture')
            else: print('SKIP: PiP unsupported in test browser')

            before=media.evaluate('(v)=>v.currentTime')
            page.locator('[data-theme=dark]').click()
            assert abs(media.evaluate('(v)=>v.currentTime')-before)<.6
            page.locator('#player-width').fill('480')
            assert page.locator('.prism-media').count()==1
            page.locator('[data-film=coast]').click()
            page.wait_for_function('document.querySelector("video.prism-media")?.readyState>=1',timeout=12000)
            assert page.locator('#prism-mount.is-ready').count()==1
            report('Theme/size retain playback, switching film remounts media')

            for width in [320,375,480,640,768,1280]:
                page.set_viewport_size({'width':width,'height':850})
                assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),f'Overflow at width {width}'
                assert page.locator('button[aria-label="Playback speed"]').is_visible()
                # Compact transport remains thumb friendly.
                targets=page.locator('.prism-control:visible')
                for index in range(targets.count()):
                    rect=targets.nth(index).bounding_box()
                    if rect: assert rect['height']>=43.9 and rect['width']>=43.9, (width,index,rect)
            report('Six responsive sizes: no overflow, >=44px visible touch controls')
            assert not errors, f'Uncaught JS exceptions: {errors}'
            report('No uncaught JavaScript exceptions')
        except Exception:
            try:
                (ROOT/'screenshots').mkdir(exist_ok=True)
                page.screenshot(path=str(ROOT/'screenshots'/'browser-integration-failure.png'),full_page=True,timeout=5000)
            except Exception: pass
            raise
        finally:
            browser.close()

if __name__=='__main__':
    try:run()
    except Exception as error:
        print('FAIL:',error,file=sys.stderr)
        sys.exit(1)
