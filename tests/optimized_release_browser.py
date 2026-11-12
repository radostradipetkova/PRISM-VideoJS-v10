"""Smoke test the actual optimized dist/ bundle, not only authored source.
Works across Chromium, Firefox and WebKit. Requires npm run build first.
"""
from __future__ import annotations
import argparse
import asyncio
import os
import subprocess
import urllib.request
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]

async def verify(name, browser_type, base):
    browser=await browser_type.launch(headless=True)
    try:
        page=await browser.new_page(viewport={'width':412,'height':823},reduced_motion='reduce')
        response=await page.goto(base+'/?source=local',wait_until='domcontentloaded',timeout=25000)
        assert response.status==200, f'optimized index returned {response.status}'
        await page.locator('#prism-mount.is-ready').wait_for(timeout=35000)
        assert await page.locator('#prism-mount media-time-slider').count()==1, 'Missing native Video.js seek control'
        assert await page.locator('#prism-mount .prism-rail').count()==1, 'Optical Deck is absent'
        video=page.locator('#prism-mount video.prism-media')
        await video.wait_for(state='attached',timeout=10000)
        await page.wait_for_function("""() => {
          const v=document.querySelector('#prism-mount video.prism-media');
          return v?.readyState>=1 && v.duration>20 && !v.error;
        }""",timeout=20000)
        await video.evaluate('(v)=>{v.muted=true;return v.play()}')
        await page.wait_for_function("""() => {
          const v=document.querySelector('#prism-mount video.prism-media');
          return v?.currentTime>.15 && !v.paused && !v.error;
        }""",timeout=20000)
        css=await page.locator('#prism-mount .prism-skin').evaluate('el=>({
          display:getComputedStyle(el).display,
          width:el.getBoundingClientRect().width,
          background:getComputedStyle(el).backgroundColor
        })')
        assert css['width']>250 and css['display']!='none', f'Production CSS failed: {css}'
        print(f'OPTIMIZED RELEASE {name} PASS: playback, seek, Optical Deck, mobile layout')
    finally:
        await browser.close()

async def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--browser',choices=['chromium','firefox','webkit'],default='chromium')
    args=parser.parse_args()
    assert (ROOT/'dist/src/styles.css').is_file(), 'Build dist before smoke testing'
    port=4189
    env={**os.environ,'PORT':str(port),'PRISM_SERVE_ROOT':'dist'}
    process=subprocess.Popen(['node','scripts/dev.mjs'],cwd=ROOT,env=env,
                             stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
    try:
        base=f'http://127.0.0.1:{port}'
        for _ in range(100):
            try:
                with urllib.request.urlopen(base+'/',timeout=.5) as response:
                    if response.status==200:break
            except Exception:
                await asyncio.sleep(.15)
        else:
            raise RuntimeError('Production build server failed to start')
        async with async_playwright() as p:
            await verify(args.browser,getattr(p,args.browser),base)
    finally:
        process.terminate()
        try:process.wait(timeout=3)
        except subprocess.TimeoutExpired:process.kill()

if __name__=='__main__':
    asyncio.run(main())
