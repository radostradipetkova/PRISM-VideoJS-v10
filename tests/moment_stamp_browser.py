"""End-to-end Moment Stamp share → open → restore test in actual Video.js.
Runs in Chromium, Firefox and WebKit against locally served source and video.
"""
from __future__ import annotations
import argparse
import asyncio
import os
import subprocess
import urllib.request
from urllib.parse import urlsplit,parse_qs
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]

async def check(browser_type,name,base):
    browser=await browser_type.launch(headless=True)
    try:
        page=await browser.new_page(viewport={'width':390,'height':844},reduced_motion='reduce')
        # A deterministic clipboard for all engines: exercises the actual
        # in-page click/copy code without requiring OS clipboard privileges.
        await page.add_init_script("""(() => {
          Object.defineProperty(navigator,'clipboard',{
            configurable:true,value:{writeText:async value=>{
              window.__momentCopied=value;
            }}
          });
        })()""")
        start_url=base+'/?film=night&t=2.25&source=local#player-wrap'
        response=await page.goto(start_url,wait_until='domcontentloaded',timeout=30000)
        assert response.status==200
        await page.locator('#prism-mount.is-ready').wait_for(timeout=35000)
        await page.wait_for_function("""() => {
          const v=document.querySelector('#prism-mount video.prism-media');
          return v?.readyState>=1 && Math.abs(v.currentTime-2.25)<.35;
        }""",timeout=25000)
        assert await page.locator('[data-film="night"]').get_attribute('aria-pressed')=='true'
        video=page.locator('#prism-mount video.prism-media')
        assert await video.evaluate('v=>v.paused'), 'Shared link must never autoplay'
        stamp=page.locator('#prism-mount .prism-moment-stamp')
        await stamp.wait_for(state='visible',timeout=10000)
        assert await stamp.get_attribute('aria-label') is not None
        await video.evaluate('v=>{v.muted=true;return v.play()}')
        await page.wait_for_function("""() => {
          const v=document.querySelector('#prism-mount video.prism-media');
          return !v.paused && v.currentTime>2.5;
        }""",timeout=20000)
        await stamp.wait_for(state='hidden',timeout=5000)
        await video.evaluate('v=>v.pause()')
        await stamp.wait_for(state='visible',timeout=8000)
        await stamp.click(timeout=10000)
        await page.wait_for_function("typeof window.__momentCopied==='string'",timeout=10000)
        copied=await page.evaluate('window.__momentCopied')
        params=parse_qs(urlsplit(copied).query)
        assert params.get('film')==['night'],f'Copied link lost film: {copied}'
        assert 't' in params and abs(float(params['t'][0]) -
            await video.evaluate('v=>v.currentTime'))<.1, f'Incorrect time: {copied}'
        assert urlsplit(copied).fragment=='player-wrap',f'Copied link does not focus player: {copied}'
        assert 'qa' not in params
        copied_time=float(params['t'][0])
        await page.goto(copied,wait_until='domcontentloaded',timeout=30000)
        await page.locator('#prism-mount.is-ready').wait_for(timeout=35000)
        await page.wait_for_function("""(time) => {
          const v=document.querySelector('#prism-mount video.prism-media');
          return v?.readyState>=1 && Math.abs(v.currentTime-time)<.35;
        }""",arg=copied_time,timeout=25000)
        assert await page.locator('[data-film="night"]').get_attribute('aria-pressed')=='true'
        assert await page.locator('#prism-mount video.prism-media').evaluate('v=>v.paused')
        await stamp.wait_for(state='visible',timeout=10000)
        print('MOMENT STAMP '+name+' PASS: pause, copy, linked film and exact timestamp')
    finally:
        await browser.close()

async def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--browser',choices=['chromium','firefox','webkit'],default='chromium')
    parser.add_argument('--port',type=int,default=4193)
    args=parser.parse_args()
    base=f'http://127.0.0.1:{args.port}'
    env={**os.environ,'PORT':str(args.port)}
    server=subprocess.Popen(['node','scripts/dev.mjs'],cwd=ROOT,env=env,
                            stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
    try:
        for _ in range(100):
            try:
                with urllib.request.urlopen(base+'/',timeout=.5) as response:
                    if response.status==200:break
            except Exception:
                await asyncio.sleep(.15)
        else:
            raise RuntimeError('Moment Stamp test server failed to start')
        async with async_playwright() as p:
            await check(getattr(p,args.browser),args.browser,base)
    finally:
        server.terminate()
        try:server.wait(timeout=3)
        except subprocess.TimeoutExpired:server.kill()

if __name__=='__main__':
    asyncio.run(main())
