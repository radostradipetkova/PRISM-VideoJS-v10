"""Release engine smoke test: real Video.js v10 custom elements and local video decode.

Run on a machine/CI with Playwright browsers installed:
  python -m pip install playwright
  python -m playwright install --with-deps chromium firefox webkit
  python tests/release_crossbrowser.py --browser firefox

This file is not counted as passed until it has actually executed successfully.
"""
from __future__ import annotations
import argparse, asyncio, json, os, re, subprocess, time, urllib.request, traceback, tempfile
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
        # Tab focuses a real PRISM control. Escape should clear its focus
        # outline without clicking it, opening Settings or changing playback.
        prefs=page.locator('#player-a .prism-preferences-trigger')
        await prefs.focus()
        await page.keyboard.press('Shift+Tab')
        await page.keyboard.press('Tab')
        assert await prefs.evaluate('(e)=>document.activeElement===e'), 'Tab did not focus preferences'
        await page.keyboard.press('Escape')
        assert not await prefs.evaluate('(e)=>document.activeElement===e'), 'Escape left focus trapped on the control'
        assert await prefs.get_attribute('aria-expanded')=='false', 'Escape unexpectedly opened preferences'
        assert await page.locator('#player-a .prism-preferences-panel').is_hidden(), 'Escape opened the settings overlay'
        outcomes['escape_clears_tab_control_focus']=True
        # Escape must still close an open preferences panel, returning focus
        # to its trigger (rather than clearing the modal's focus prematurely).
        await prefs.click()
        panel=page.locator('#player-a .prism-preferences-panel')
        await panel.wait_for(state='visible',timeout=10000)
        await page.keyboard.press('Escape')
        await panel.wait_for(state='hidden',timeout=10000)
        assert await prefs.evaluate('(e)=>document.activeElement===e'), 'Settings Escape did not restore trigger focus'
        outcomes['escape_preserves_preferences_close']=True
        # Scene Loop lives in a compact native Video.js popover, not Player Settings.
        loop_trigger=page.locator('#player-a .prism-loop-trigger')
        await loop_trigger.evaluate('(button)=>button.click()')
        loop_menu=page.locator('#player-a .prism-loop-menu')
        await page.wait_for_function('document.querySelector("#player-a .prism-loop-menu")?.hasAttribute("data-open")',timeout=10000)
        assert await page.locator('#player-a [data-loop-panel]').count()==1
        assert await page.locator('#player-a .prism-preferences-panel [data-loop-panel]').count()==0
        video_a=page.locator('#player-a video.prism-media')
        await video_a.evaluate('(video)=>{video.pause();video.currentTime=1;}')
        await page.wait_for_function('document.querySelector("#player-a video.prism-media")?.currentTime>=.95',timeout=10000)
        await loop_menu.locator('[data-loop-in]').click(force=True)
        await video_a.evaluate('(video)=>{video.currentTime=4;}')
        await page.wait_for_function('document.querySelector("#player-a video.prism-media")?.currentTime>=3.95',timeout=10000)
        await loop_menu.locator('[data-loop-out]').click(force=True)
        await loop_menu.locator('[data-loop-ab]').click(force=True)
        assert await page.evaluate('window.PRISM_REUSABLE_DEMO.a.getSceneLoopState().active?.type')=='ab', 'A–B loop did not activate'
        await loop_menu.locator('[data-loop-off]').click(force=True)
        assert await page.evaluate('window.PRISM_REUSABLE_DEMO.a.getSceneLoopState().active') is None, 'Stop Loop did not work'
        outcomes['compact_loop_menu_and_ab_controls']=True
        await page.keyboard.press('Escape')
        # Frame-accurate preview for video with no WebVTT storyboard:
        # independent muted preview decoder must follow hover without seeking
        # the actual playing video.
        preview=page.locator('#player-a video.prism-loupe-liveframe')
        assert await preview.count()==1, 'Missing video-based Optical Loupe preview'
        original_time=await page.locator('#player-a video.prism-media').evaluate('v=>v.currentTime')
        await page.locator('#player-a .prism-rail').evaluate('''rail=>{
            const bounds=rail.getBoundingClientRect();
            rail.dispatchEvent(new PointerEvent('pointermove',{
                bubbles:true,pointerType:'mouse',clientX:bounds.left+bounds.width*.35,
                clientY:bounds.top+bounds.height/2
            }));
        }''')
        await page.wait_for_function('''() => {
            const preview=document.querySelector('#player-a video.prism-loupe-liveframe');
            return preview?.dataset.frameReady==='true'
                && Number.isFinite(preview.currentTime)
                && preview.currentTime>2.0 && preview.currentTime<3.6;
        }''',timeout=18000)
        player_time=await page.locator('#player-a video.prism-media').evaluate('v=>v.currentTime')
        assert abs(player_time-original_time)<.35, 'Preview accidentally sought main media'
        outcomes['true_liveframe_preview_without_playback_interference']=True
        # Portrait video: no cropping; authored chapter metadata and captions.
        fit=await page.locator('#player-b video.prism-media').evaluate('v=>getComputedStyle(v).objectFit')
        assert fit=='contain',f'Portrait crop risk: {fit}'
        outcomes['portrait_contain']=fit
        tracks=await page.locator('#player-b video.prism-media').evaluate("v=>[...v.textTracks].map(t=>({kind:t.kind,language:t.language,cues:t.cues?.length||0}))")
        assert any(t['kind']=='captions' for t in tracks),f'Caption tracks missing: {tracks}'
        outcomes['caption_track_detected']=tracks
        # Real subtitles check: activating English must load WebVTT cues and
        # actually place the matching TextTrack in showing mode. A populated
        # caption menu alone is not sufficient.
        caption_trigger=page.locator('#player-b .prism-captions-trigger')
        await caption_trigger.evaluate('(button)=>button.click()')
        await page.wait_for_function('document.querySelector("#player-b .prism-captions-menu")?.hasAttribute("data-open")',timeout=10000)
        caption_menu=page.locator('#player-b .prism-captions-menu')
        caption_radio=caption_menu.locator('media-captions-radio-group media-menu-radio-item').last
        await caption_radio.wait_for(state='visible',timeout=10000)
        await caption_radio.click()
        await page.wait_for_function('''() => {
            const media=document.querySelector('#player-b video.prism-media');
            const captions=[...media.textTracks].find(t=>t.kind==='captions');
            return captions?.mode==='showing' && captions.cues?.length>0;
        }''',timeout=12000)
        await page.locator('#player-b video.prism-media').evaluate('v=>{v.pause();v.currentTime=1.5;}')
        await page.wait_for_function('''() => {
            const media=document.querySelector('#player-b video.prism-media');
            const captions=[...media.textTracks].find(t=>t.kind==='captions');
            return captions?.mode==='showing' && (captions.activeCues?.length||0)>0;
        }''',timeout=12000)
        outcomes['captions_selected_showing_and_active'] = await page.locator('#player-b video.prism-media').evaluate('''v=>[...v.textTracks].map(t=>({kind:t.kind,mode:t.mode,cues:t.cues?.length||0,active:t.activeCues?.length||0}))''')
        await page.locator('#player-b .prism-explore-launch').wait_for(state='visible',timeout=20000)
        await page.locator('#player-b .prism-explore-launch').click()
        dialog=page.locator('#player-b .prism-chapter-dialog')
        assert await dialog.evaluate('e=>e.open'), 'Optical Index dialog failed to open'
        # Explore uses the matching actual decoded frame where no storyboard exists.
        iris_frame=page.locator('#player-b video.prism-iris-liveframe')
        await iris_frame.wait_for(timeout=8000)
        await page.wait_for_function('''() => {
            const frame=document.querySelector('#player-b video.prism-iris-liveframe');
            return frame?.dataset.frameReady==='true' && frame.readyState>=2;
        }''',timeout=18000)
        outcomes['explore_iris_real_frame']=True
        await page.keyboard.press('Escape')
        assert not await dialog.evaluate('e=>e.open'), 'Escape did not close Optical Index'
        outcomes['chapters_and_esc']=True
        # Media A has no authored chapters. Explore deliberately stays visible,
        # and its empty state explains the absence of chapter metadata.
        # An old test incorrectly required it to be hidden.
        empty_explore=page.locator('#player-a .prism-explore-launch')
        await empty_explore.wait_for(state='visible',timeout=10000)
        await empty_explore.click()
        empty_dialog=page.locator('#player-a .prism-chapter-dialog')
        assert await empty_dialog.evaluate('e=>e.open'), 'Empty Optical Index did not open'
        assert 'no authored chapters' in (await empty_dialog.locator('.prism-index-empty').inner_text()).lower()
        await page.keyboard.press('Escape')
        assert not await empty_dialog.evaluate('e=>e.open'), 'Empty Optical Index did not close'
        outcomes['missing_chapters_explained']=True
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
        # The default showcase uses mux-video rather than a native video tag.
        # Check its independent WebVTT path instead of assuming the reusable
        # native-video fixture proves the production captions work.
        await page.goto(url+'/',wait_until='domcontentloaded',timeout=25000)
        await page.locator('#prism-mount.prism-mount.is-ready').wait_for(timeout=30000)
        mux=page.locator('#prism-mount mux-video.prism-media')
        await mux.wait_for(timeout=12000)
        mux_trigger=page.locator('#prism-mount .prism-captions-trigger')
        await mux_trigger.evaluate('(button)=>button.click()')
        await page.wait_for_function('document.querySelector("#prism-mount .prism-captions-menu")?.hasAttribute("data-open")',timeout=10000)
        mux_radio=page.locator('#prism-mount .prism-captions-menu media-captions-radio-group media-menu-radio-item').last
        await mux_radio.wait_for(state='visible',timeout=10000)
        await mux_radio.click()
        try:
            await page.wait_for_function('''() => {
                const media=document.querySelector('#prism-mount mux-video.prism-media');
                return [...(media?.textTracks||[])].some(t=>t.kind==='captions' && t.mode==='showing' && t.cues?.length>0);
            }''',timeout=12000)
        finally:
            info=await mux.evaluate('''m=>({
                tracks:[...(m.textTracks||[])].map(t=>({kind:t.kind,mode:t.mode,cues:t.cues?.length||0,active:t.activeCues?.length||0})),
                elements:[...m.querySelectorAll('track')].map(t=>({kind:t.kind,src:t.src,readyState:t.readyState,trackMode:t.track?.mode,cues:t.track?.cues?.length||0})),
                innerTracks:m.shadowRoot?[...m.shadowRoot.querySelectorAll('video track')].map(t=>({kind:t.kind,src:t.src,readyState:t.readyState})):[],
                readyState:m.readyState,networkState:m.networkState,error:m.error?.message||null
            })''')
            outcomes['showcase_mux_caption_diagnostics']=info
            print('MUX_CAPTION_DIAGNOSTICS',json.dumps(info))
        # Cinematic's real storyboard is a deterministic fixture for the
        # identical sprite-rendering path used by the full Live Action film.
        outcomes['phase']='local cinematic reel / navigation'
        await page.goto(url+'/?source=local',wait_until='domcontentloaded',timeout=25000)
        await page.locator('#prism-mount.prism-mount.is-ready').wait_for(timeout=30000)
        await page.wait_for_function('''() => {
            const v=document.querySelector('#prism-mount video.prism-media');
            return Number.isFinite(v?.duration) && v.duration>25;
        }''',timeout=20000)
        outcomes['phase']='local cinematic reel / Optical Loupe sprite'
        canvas=page.locator('#prism-mount canvas.prism-loupe-sprite-preview')
        # The loupe canvas exists while the seek rail is idle but is
        # intentionally hidden until the viewer interacts with the rail.
        await canvas.wait_for(state='attached',timeout=10000)
        rail=page.locator('#prism-mount .prism-rail')
        async def pointer_at(frac):
            await rail.evaluate('''(el,p)=>{
                const r=el.getBoundingClientRect();
                el.dispatchEvent(new PointerEvent('pointermove',{
                    bubbles:true,pointerType:'mouse',clientX:r.left+r.width*p,
                    clientY:r.top+r.height/2
                }));
            }''',frac)
        media_before=await page.locator('#prism-mount video.prism-media').evaluate('v=>v.currentTime')
        await pointer_at(.20)
        await page.wait_for_function('document.querySelector("#prism-mount canvas.prism-loupe-sprite-preview")?.dataset.frameReady==="true"',timeout=15000)
        first=await canvas.evaluate('c=>c.toDataURL("image/png")')
        await pointer_at(.83)
        await page.wait_for_timeout(350)
        last=await canvas.evaluate('c=>c.toDataURL("image/png")')
        assert first!=last, 'The loupe image did not follow the requested film timestamp'
        media_after=await page.locator('#prism-mount video.prism-media').evaluate('v=>v.currentTime')
        assert abs(media_after-media_before)<.35, 'Preview scrub incorrectly sought main playback'
        outcomes['sprite_preview_shows_real_distinct_frames_without_seeking']=True

        # Regression: the CINEMATIC reel must show real descriptive subtitles
        # by default, including "Waves" at the second scene (not merely a
        # populated captions menu).
        outcomes['phase']='cinematic descriptive subtitles / default on'
        reel=page.locator('#prism-mount video.prism-media')
        await reel.evaluate('(v)=>{v.pause();v.currentTime=10.5}')
        await page.wait_for_function("""() => {
          const v=document.querySelector('#prism-mount video.prism-media');
          const t=[...(v?.textTracks||[])].find(t=>t.kind==='captions');
          return t?.mode==='showing' && [...(t.activeCues||[])].some(c=>/waves/i.test(c.text));
        }""",timeout=16000)
        outcomes['cinematic_waves_caption_active']=True

        # Regression: Live Action subtitles should not disappear after 39s.
        # The original 10-minute Blender MP4 is an external dependency; route
        # *only the video bytes* to a generated 62s H.264 clip. PRISM still
        # loads its actual bundled WebVTT through the real player and seeks
        # the real video media timeline. This isolates caption correctness
        # from Blender's network latency and avoids a huge external download.
        outcomes['phase']='live action captions / 39s, 42s, 47s, 51s'
        with tempfile.TemporaryDirectory(prefix='prism-caption-qa-') as tmp:
            fake=Path(tmp)/'caption-timeline.mp4'
            subprocess.run([
                'ffmpeg','-y','-hide_banner','-loglevel','error',
                '-f','lavfi','-i','color=c=black:s=320x180:r=2:d=62',
                '-c:v','libx264','-preset','ultrafast','-g','2',
                '-pix_fmt','yuv420p','-movflags','+faststart',str(fake)
            ],check=True,timeout=40)
            # Safari/WebKit requires genuine HTTP byte ranges to complete
            # seeks on a remote MP4. A generic 200 response can leave
            # video.seeking=true forever even though captions loaded.
            mp4=fake.read_bytes()
            total=len(mp4)
            async def blender_fixture(route):
                header=route.request.headers.get('range','')
                match=re.fullmatch(r'bytes=(\d+)-(\d*)',header)
                headers={'Access-Control-Allow-Origin':'*','Accept-Ranges':'bytes',
                         'Content-Type':'video/mp4'}
                if match:
                    start=int(match.group(1))
                    end=int(match.group(2)) if match.group(2) else total-1
                    end=min(end,total-1)
                    if start>=total or end<start:
                        await route.fulfill(status=416,headers={
                          **headers,'Content-Range':f'bytes */{total}'})
                        return
                    body=mp4[start:end+1]
                    headers.update({'Content-Range':f'bytes {start}-{end}/{total}',
                                    'Content-Length':str(len(body))})
                    await route.fulfill(status=206,body=body,headers=headers)
                else:
                    await route.fulfill(status=200,body=mp4,headers=headers)
            await page.route('https://video.blender.org/**',blender_fixture)
            await page.locator('[data-film="liveaction"]').click()
            await page.wait_for_function("""() => {
              const v=document.querySelector('#prism-mount video.prism-media');
              return v?.src.includes('video.blender.org/') && v.readyState>=1
                     && v.duration>=60;
            }""",timeout=22000)
            checks=[(39.5,'freaked out'),(41.5,'robotic claws'),
                    (47.0,'scene moves forward'),(51.0,'memory synced')]
            outcomes['liveaction_timestamp_checks']=[]
            for when,expected in checks:
                await page.locator('#prism-mount video.prism-media').evaluate(
                    '(v,t)=>{v.pause();v.currentTime=t}',when)
                try:
                    await page.wait_for_function("""(expected) => {
                      const v=document.querySelector('#prism-mount video.prism-media');
                      const t=[...(v?.textTracks||[])].find(t=>t.kind==='captions');
                      return t?.mode==='showing' && [...(t.activeCues||[])]
                        .some(c=>c.text.toLowerCase().includes(expected));
                    }""",arg=expected,timeout=12000)
                except Exception:
                    state=await page.locator('#prism-mount video.prism-media').evaluate("""v=>({
                      time:v.currentTime,readyState:v.readyState,seeking:v.seeking,
                      duration:v.duration,paused:v.paused,
                      tracks:[...v.textTracks].map(t=>({
                        kind:t.kind,mode:t.mode,cues:t.cues?.length||0,
                        active:[...(t.activeCues||[])].map(c=>c.text)
                      })),
                      textTrackElements:[...v.querySelectorAll('track')].map(t=>({
                        src:t.src,readyState:t.readyState,kind:t.kind
                      }))
                    })""")
                    outcomes['liveaction_timestamp_checks'].append(
                      {'time':when,'expected':expected,'passed':False,'state':state})
                    raise
                outcomes['liveaction_timestamp_checks'].append(
                  {'time':when,'expected':expected,'passed':True})
            outcomes['liveaction_captions_beyond_39_seconds']=True
        outcomes.pop('phase',None)
    except Exception as e:
        outcomes['FAILURE']=f'{type(e).__name__}: {e!r}'
        outcomes['failure_phase']=outcomes.get('phase','earlier browser checks')
        outcomes['traceback']=traceback.format_exc(limit=8)
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
