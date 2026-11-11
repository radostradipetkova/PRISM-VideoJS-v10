"""Release engine smoke test: real Video.js v10 custom elements and local video decode.

Run on a machine/CI with Playwright browsers installed:
  python -m pip install playwright
  python -m playwright install --with-deps chromium firefox webkit
  python tests/release_crossbrowser.py --browser firefox

This file is not counted as passed until it has actually executed successfully.
"""
from __future__ import annotations
import argparse, asyncio, json, os, subprocess, time, urllib.request
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]

async def check(browser_type, name, url, reportdir):
    reportdir.mkdir(exist_ok=True)
    browser=await browser_type.launch(headless=True)
    ctx=await browser.new_context(viewport={'width':1280,'height':800},reduced_motion='reduce')
    page=await ctx.new_page()
    outcomes={}
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    try:
        response=await page.goto(url+'/examples/reusable.html',wait_until='domcontentloaded',timeout=25000)
        assert response.status==200, f'HTTP {response.status}'
        await page.locator('#player-a.prism-mount.is-ready').wait_for(timeout=30000)
        await page.locator('#player-b.prism-mount.is-ready').wait_for(timeout=30000)
        outcomes['genuine_videojs_controls']=await page.locator('media-time-slider').count()==2
        assert outcomes['genuine_videojs_controls'], 'Video.js sliders were not registered'
        # Play real local MP4s (muted, avoiding autoplay restrictions).
        for ident in ('a','b'):
            selector=f'#player-{ident} video.prism-media'
            await page.wait_for_function('(s)=>document.querySelector(s)?.readyState>=1',arg=selector,timeout=18000)
            await page.locator(selector).evaluate('v=>{v.muted=true;}')
            await page.locator(selector).evaluate('v=>v.play()')
            await page.wait_for_function('(s)=>document.querySelector(s)?.currentTime > .15',arg=selector,timeout=16000)
            state=await page.locator(selector).evaluate('v=>({time:v.currentTime,duration:v.duration,error:v.error?.message||null,width:v.videoWidth,height:v.videoHeight,paused:v.paused})')
            assert not state['error'] and state['time']>.15 and not state['paused'],f'{ident} playback: {state}'
            outcomes[f'{ident}_real_video_playback']=state
        # Portrait video: no cropping; authored chapter metadata and captions.
        fit=await page.locator('#player-b video.prism-media').evaluate('v=>getComputedStyle(v).objectFit')
        assert fit=='contain',f'Portrait crop risk: {fit}'
        outcomes['portrait_contain']=fit
        tracks=await page.locator('#player-b video.prism-media').evaluate("v=>[...v.textTracks].map(t=>({kind:t.kind,language:t.language,cues:t.cues?.length||0}))")
        assert any(t['kind']=='captions' for t in tracks),f'Caption tracks missing: {tracks}'
        outcomes['caption_track_detected']=tracks
        await page.locator('#player-b .prism-explore-launch').wait_for(state='visible',timeout=20000)
        await page.locator('#player-b .prism-explore-launch').click()
        dialog=page.locator('#player-b .prism-chapter-dialog')
        assert await dialog.evaluate('e=>e.open'), 'Optical Index dialog failed to open'
        await page.keyboard.press('Escape')
        assert not await dialog.evaluate('e=>e.open'), 'Escape did not close Optical Index'
        outcomes['chapters_and_esc']=True
        # Media A has no captions or chapters; avoid misleading controls.
        assert await page.locator('#player-a .prism-explore-launch').is_hidden()
        outcomes['missing_chapters_hidden']=True
        await page.set_viewport_size({'width':375,'height':812})
        await page.wait_for_timeout(300)
        overflow=await page.evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth+1')
        assert not overflow,'Mobile viewport scrolls horizontally'
        outcomes['mobile_no_horizontal_overflow']=True
        targets=await page.locator('#player-b .prism-control').evaluate_all('els=>els.filter(e=>getComputedStyle(e).display!=="none"&&e.getBoundingClientRect().width>0).map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}))')
        assert targets and all(x['w']>=43.5 and x['h']>=43.5 for x in targets),f'Touch targets too small: {targets}'
        outcomes['touch_targets_44px']=True
        # Reduced motion should cut animation durations in the dock.
        transition=await page.locator('#player-b .prism-bottom').evaluate('e=>getComputedStyle(e).transitionDuration')
        assert all(float(part.rstrip('s'))==0 for part in transition.split(', ')),f'Unexpected reduced-motion transition {transition}'
        outcomes['reduced_motion']=True
        assert not errors,f'Page JS errors: {errors}'
        outcomes['runtime_errors']=0
    except Exception as e:
        outcomes['FAILURE']=str(e)
        try:await page.screenshot(path=str(reportdir/f'release-{name}-failure.png'),full_page=True)
        except Exception:pass
    finally:
        await ctx.close()
        await browser.close()
    reportdir.mkdir(exist_ok=True)
    (reportdir/f'release-{name}.json').write_text(json.dumps(outcomes,indent=2)+'\n')
    print(name,json.dumps(outcomes))
    return 'FAILURE' not in outcomes

async def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--browser',choices=['chromium','firefox','webkit'],default='chromium')
    parser.add_argument('--port',type=int,default=4177)
    args=parser.parse_args()
    url=f'http://127.0.0.1:{args.port}'
    env={**os.environ,'PORT':str(args.port)}
    process=subprocess.Popen(['node','scripts/dev.mjs'],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
    try:
        for _ in range(70):
            try:
                with urllib.request.urlopen(url+'/examples/reusable.html',timeout=.5) as response:
                    if response.status==200:break
            except Exception:await asyncio.sleep(.15)
        else:raise RuntimeError('Local PRISM dev server did not start')
        async with async_playwright() as p:
            result=await check(getattr(p,args.browser),args.browser,url,ROOT/'release-reports')
        if not result:raise SystemExit(1)
    finally:
        process.terminate()
        try:process.wait(timeout=3)
        except subprocess.TimeoutExpired:process.kill()
if __name__=='__main__':asyncio.run(main())
