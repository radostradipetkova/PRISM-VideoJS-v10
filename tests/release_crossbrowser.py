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
        # First-visit discoverability: hover instructions without clicking.
        # No duplicate PLAYBACK text: the compact icon still opens the menu.
        speed=page.locator('#player-a .prism-settings-trigger')
        assert await speed.locator('.prism-text-caption').count()==0, 'Playback button still has a text label'
        speed_size=await speed.bounding_box()
        assert speed_size['width']<=64, f'Playback trigger still wider than adjacent icon buttons: {speed_size}'
        await speed.hover()
        hint=page.locator('#player-a .prism-control-hint')
        await hint.wait_for(state='visible',timeout=5000)
        assert 'Playback speed' in await hint.inner_text(), 'Playback control hint missing'
        box=await hint.bounding_box()
        skin_box=await page.locator('#player-a .prism-skin').bounding_box()
        assert box['x']>=skin_box['x']-1 and box['x']+box['width']<=skin_box['x']+skin_box['width']+1, 'Tooltip clipped horizontally'
        assert box['y']>=skin_box['y']-1 and box['y']+box['height']<=skin_box['y']+skin_box['height']+1, 'Tooltip clipped vertically'
        # Reusable player-a is intentionally compact, so its skip buttons
        # are hidden. Verify its markup here and hover visible buttons.
        assert await page.locator('#player-a .prism-skip.skip-back').get_attribute('data-prism-hint')=='Back 5 seconds'
        await page.locator('#player-a .prism-mute').hover()
        assert await hint.inner_text() in ('Mute audio','Unmute audio'), 'Mute control help missing'
        await page.locator('#player-a .prism-time').hover()
        assert 'elapsed / total' in await hint.inner_text(), 'Time readout not explained'
        await page.locator('#player-a .prism-loop-trigger').hover()
        assert 'Scene Loop' in await hint.inner_text(), 'Loop action not explained'
        await page.locator('#player-a .prism-play').hover()
        assert 'Play video' in await hint.inner_text(), 'Initial Play hint missing'
        outcomes['contextual_control_hints_and_icon_only_playback']=True
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
        focus_style=await prefs.evaluate("""el=>{
          const s=getComputedStyle(el);
          return {outlineWidth:s.outlineWidth,outlineStyle:s.outlineStyle,boxShadow:s.boxShadow};
        }""")
        assert focus_style['outlineStyle']!='none' and focus_style['outlineWidth']!='0px',f'Missing focus outline: {focus_style}'
        assert focus_style['boxShadow']!='none', f'Missing two-tone focus halo: {focus_style}'
        outcomes['two_tone_keyboard_focus']=focus_style
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
        # Keep showing the previously decoded image while an async seek is pending.
        # Previously mousemove set data-frame-ready=false, hiding the whole
        # loupe until the slow remote decoder finally completed its seek.
        await page.locator('#player-a .prism-rail').evaluate('''rail=>{
            const rect=rail.getBoundingClientRect();
            for(const fraction of [.15,.82,.38,.93]){
                rail.dispatchEvent(new PointerEvent('pointermove',{
                    bubbles:true,pointerType:'mouse',clientX:rect.left+rect.width*fraction,
                    clientY:rect.top+rect.height/2
                }));
                const preview=document.querySelector('#player-a video.prism-loupe-liveframe');
                if(preview?.dataset.frameReady!=='true'){
                    throw Error('Optical Loupe hid its last real frame during rapid hover');
                }
            }
        }''')
        outcomes['rapid_hover_never_blanks_a_decoded_frame']=True
        # Rapid mouse jumps must resolve to the LAST hovered timestamp rather
        # than a stale frame or the beginning of the current chapter. The
        # separate preview decoder may need time for the final seek, but mouse
        # movement itself must not cause a new 85ms debounce on every pixel.
        await page.locator('#player-a .prism-rail').evaluate('''rail=>{
            const rect=rail.getBoundingClientRect();
            for(const fraction of [.12,.86,.62]){
                rail.dispatchEvent(new PointerEvent('pointermove',{
                    bubbles:true,pointerType:'mouse',clientX:rect.left+rect.width*fraction,
                    clientY:rect.top+rect.height/2
                }));
            }
        }''')
        await page.wait_for_function('''() => {
            const v=document.querySelector('#player-a video.prism-loupe-liveframe');
            return v?.dataset.frameReady==='true' && !v.seeking &&
                Math.abs(v.currentTime-v.duration*.62)<.18;
        }''',timeout=15000)
        outcomes['rapid_hover_tracks_latest_timestamp']=True
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
        # PRISM mobile transport: never squash everything into a single row.
        # Play/Pause + readable time lead, with remaining controls following
        # in DOM/Tab order. All targets must fit inside their own dock, even
        # on 320px phones and narrow reusable embed containers.
        mobile_layouts={}
        for viewport in [320,375,440,560]:
            await page.set_viewport_size({'width':viewport,'height':812})
            layout=await page.locator('#player-b .prism-skin').evaluate("""skin=>{
              const box=e=>{const b=e.getBoundingClientRect();
                return {x:b.x,y:b.y,left:b.left,right:b.right,top:b.top,bottom:b.bottom,
                        width:b.width,height:b.height};};
              const take=s=>skin.querySelector(s);
              const left=take('.prism-group-left'), right=take('.prism-group-right');
              const play=take('.prism-play'), mute=take('.prism-mute');
              const fullscreen=take('.prism-fullscreen'), time=take('.prism-time');
              const rail=take('.prism-rail'), movie=take('.prism-media');
              const controls=[...skin.querySelectorAll('.prism-control')]
                .filter(el=>getComputedStyle(el).display!=='none' && el.getBoundingClientRect().width>0)
                .map(el=>({cls:el.className, ...box(el)}));
              return {skin:box(skin),movie:box(movie),rail:box(rail),
                left:box(left),right:box(right),play:box(play),mute:box(mute),
                fullscreen:box(fullscreen),time:box(time),controls,
                playerWidth:skin.getBoundingClientRect().width,
                scrollWidth:document.documentElement.scrollWidth,
                clientWidth:document.documentElement.clientWidth};
            }""")
            assert layout['scrollWidth']<=layout['clientWidth']+1, f'{viewport}px page overflow: {layout}'
            assert layout['left']['bottom']<=layout['right']['top']+1, f'{viewport}px: transport rows overlap'
            assert layout['play']['width']>=49 and layout['play']['height']>=49, f'{viewport}px: play priority too small'
            assert layout['time']['width']>=80, f'{viewport}px: unreadable playback time'
            assert layout['rail']['width']>=layout['skin']['width']*.85, f'{viewport}px: precision rail reduced'
            assert layout['right']['bottom']<=layout['skin']['bottom']+2, f'{viewport}px: lower controls escape player: {layout}'
            assert layout['movie']['bottom']<=layout['rail']['top']+1, f'{viewport}px: mobile deck covers movie'
            for item in layout['controls']:
                assert item['width']>=43.5 and item['height']>=43.5, f'{viewport}px: undersized control {item}'
                assert item['left']>=layout['skin']['left']-2 and item['right']<=layout['skin']['right']+2, f'{viewport}px: control clipped {item}'
            mobile_layouts[str(viewport)]={
                'playerWidth':round(layout['playerWidth']),
                'playWidth':round(layout['play']['width']),
                'timeWidth':round(layout['time']['width']),
                'controlCount':len(layout['controls']),
                'movieUncovered':layout['movie']['bottom']<=layout['rail']['top']+1}
        outcomes['mobile_transport_hierarchy_and_no_clipping']=mobile_layouts
        await page.set_viewport_size({'width':375,'height':812})
        # Functional microtype remains readable on the compact player;
        # decorative optics can stay smaller than controls, but never 6px.
        label_sizes=await page.locator('#player-b .prism-skin').evaluate("""skin=>{
          const px=(selector)=>parseFloat(getComputedStyle(skin.querySelector(selector)).fontSize);
          return {
            rail: px('.prism-rail-meta'),
            opticalScan: px('.prism-loupe-scan-label'),
            opticalIndex: px('.prism-optical-loupe .prism-preview-index'),
            opticalPosition: px('.prism-loupe-position'),
            opticalFooter: px('.prism-loupe-footer'),
            settingsOption: px('.prism-preferences-panel .prism-preferences-choices button'),
            captionOption: px('.prism-caption-appearance .prism-preferences-choices button'),
            captionSetting: px('.prism-caption-appearance .prism-caption-setting-label'),
            chapterHelp: px('.prism-chapter-dialog-help'),
            menuTitle: px('.prism-menu-title')
          };
        }""")
        assert label_sizes['rail']>=11 and label_sizes['opticalScan']>=8, f'Rail label too small: {label_sizes}'
        assert label_sizes['opticalIndex']>=9 and label_sizes['opticalPosition']>=9 and label_sizes['opticalFooter']>=8, f'Optical scan unreadable: {label_sizes}'
        assert label_sizes['settingsOption']>=12 and label_sizes['captionOption']>=11 and label_sizes['captionSetting']>=12 and label_sizes['menuTitle']>=12, f'Settings microtype unreadable: {label_sizes}'
        assert label_sizes['chapterHelp']>=12, f'Explore help too small: {label_sizes}'
        outcomes['compact_player_labels_readable']=label_sizes
        targets=await page.locator('#player-b .prism-control').evaluate_all('els=>els.filter(e=>getComputedStyle(e).display!=="none"&&e.getBoundingClientRect().width>0).map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}))')
        assert targets and all(x['w']>=43.5 and x['h']>=43.5 for x in targets),f'Touch targets too small: {targets}'
        outcomes['touch_targets_44px']=True
        # Reduced motion should cut animation durations in the dock.
        transition=await page.locator('#player-b .prism-bottom').evaluate('e=>getComputedStyle(e).transitionDuration')
        assert all(float(part.rstrip('s'))==0 for part in transition.split(', ')),f'Unexpected reduced-motion transition {transition}'
        outcomes['reduced_motion']=True
        optical_motion=await page.locator('#player-b .prism-iris-thumbnail').evaluate("""el=>{
          const s=getComputedStyle(el); return {animation:s.animationName,transition:s.transitionDuration};
        }""")
        assert optical_motion['animation']=='none' and all(float(part.rstrip('s'))==0 for part in optical_motion['transition'].split(', ')), f'Optical preview still animated under reduced motion: {optical_motion}'
        outcomes['optical_reduced_motion']=True
        assert not errors,f'Page JS errors: {errors}'
        outcomes['runtime_errors']=0
        # The default showcase uses mux-video rather than a native video tag.
        # Check its independent WebVTT path instead of assuming the reusable
        # native-video fixture proves the production captions work.
        await page.goto(url+'/',wait_until='domcontentloaded',timeout=25000)
        await page.locator('#prism-mount.prism-mount.is-ready').wait_for(timeout=30000)
        mux=page.locator('#prism-mount mux-video.prism-media')
        await mux.wait_for(timeout=12000)
        # The showcase remains at its tested mobile width for subsequent
        # native Mux menu interactions; desktop skip controls are hidden
        # responsively here, so check their accessible hint metadata.
        assert await page.locator('#prism-mount .prism-skip.skip-back').get_attribute('data-prism-hint')=='Back 5 seconds'
        assert await page.locator('#prism-mount .prism-skip.skip-forward').get_attribute('data-prism-hint')=='Forward 5 seconds'
        # Adaptive Quality is part of Playback only for streams, not MP4s.
        assert await page.locator('#player-a .prism-quality-section').count()==0, 'MP4 unexpectedly offers manual quality'
        assert await page.locator('#player-b .prism-quality-section').count()==0, 'MP4 unexpectedly offers manual quality'
        quality=page.locator('#prism-mount .prism-quality-group')
        assert await quality.count()==1, 'Mux stream missing native Video.js quality selector'
        assert await quality.evaluate('(group)=>!!customElements.get(group.localName)'), 'Native quality radio group was not registered'
        assert await page.locator('#prism-mount .prism-settings-trigger[aria-label="Playback speed and quality"]').count()==1
        await page.wait_for_timeout(750)
        quality_diagnostics=await mux.evaluate("""media=>{
          const group=document.querySelector('#prism-mount .prism-quality-group');
          const renditions=Array.from(media.videoRenditions||[]);
          const section=group.closest('.prism-quality-section');
          return {
            mediaState:media.readyState,
            renditionCount:renditions.length,
            heights:renditions.map(r=>r.height),
            manualAvailability:group.getAttribute('data-availability'),
            groupHidden:group.hidden,
            sectionVisible:getComputedStyle(section).display!=='none',
            choices:[...group.querySelectorAll('media-menu-radio-item')].map(e=>e.textContent.trim())
          };
        }""")
        outcomes['mux_native_quality_selector']=quality_diagnostics
        if quality_diagnostics['manualAvailability']=='available' and quality_diagnostics['renditionCount']>=2:
            # Select a *real* HLS rendition through Video.js, then restore
            # Auto so normal bandwidth adaptation remains the user default.
            speed_button=page.locator('#prism-mount .prism-settings-trigger[aria-label="Playback speed and quality"]')
            await speed_button.click()
            await page.wait_for_function("""() => document.querySelector(
                '#prism-mount .prism-quality-group')?.closest('media-menu')?.hasAttribute('data-open')""",timeout=8000)
            rendition480=quality.locator('media-menu-radio-item').filter(has_text='480p').first
            await rendition480.wait_for(state='visible',timeout=8000)
            # Native menu items can be visually inside a player popover
            # but outside the page viewport at phone sizes. Dispatch a real
            # DOM click after confirming the item is visible.
            await rendition480.evaluate('(item)=>item.click()')
            await page.wait_for_function("""() => {
                const media=document.querySelector('#prism-mount mux-video.prism-media');
                return Array.from(media?.videoRenditions||[]).some(r=>r.height===480 && r.selected);
            }""",timeout=9000)
            outcomes['mux_manual_480p_quality_selection']=True
            auto_choice=quality.locator('media-menu-radio-item').filter(has_text='Auto').first
            # Popover data-open and actual visibility can briefly disagree
            # after selecting a rendition. Reopen based on rendered state.
            if not await auto_choice.is_visible():
                await speed_button.evaluate('(button)=>button.click()')
            # Opening a Web Component menu is asynchronous. Clicking a
            # second time before visibility changes would CLOSE it again.
            await auto_choice.wait_for(state='visible',timeout=12000)
            await auto_choice.evaluate('(item)=>item.click()')
            await page.wait_for_function("""() => {
                const group=document.querySelector('#prism-mount .prism-quality-group');
                const first=group?.querySelector('media-menu-radio-item');
                return first?.getAttribute('aria-checked')==='true';
            }""",timeout=9000)
            outcomes['mux_auto_quality_restored']=True
            await page.keyboard.press('Escape')
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
            # The full open film now has an actual 2-second storyboard.
            # Verify *visible*, distinct real tiles on rapid pointer moves,
            # rather than a gray/off-screen decoder fallback.
            outcomes['phase']='full-film Optical Loupe storyboard / rapid hover'
            sprite=page.locator('#prism-mount canvas.prism-loupe-sprite-preview')
            await sprite.wait_for(state='attached',timeout=10000)
            async def move_loupe(fraction):
                return await page.locator('#prism-mount .prism-rail').evaluate('''(rail,fraction)=>{
                  const rect=rail.getBoundingClientRect();
                  rail.dispatchEvent(new PointerEvent('pointermove',{
                    bubbles:true,pointerType:'mouse',
                    clientX:rect.left+rect.width*fraction,
                    clientY:rect.top+rect.height/2
                  }));
                }''',fraction)
            await move_loupe(.13)
            await page.wait_for_function("""() => {
              const canvas=document.querySelector('#prism-mount canvas.prism-loupe-sprite-preview');
              return canvas?.dataset.frameReady==='true' &&
                getComputedStyle(canvas).display!=='none';
            }""",timeout=15000)
            first=await sprite.evaluate('(canvas)=>canvas.toDataURL()')
            await move_loupe(.70)
            await page.wait_for_function("""(before) => {
              const canvas=document.querySelector('#prism-mount canvas.prism-loupe-sprite-preview');
              return canvas?.dataset.frameReady==='true' &&
                getComputedStyle(canvas).display!=='none' &&
                canvas.toDataURL()!==before;
            }""",arg=first,timeout=10000)
            outcomes['liveaction_rapid_hover_uses_distinct_real_sprite_frames']=True
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
            # Real Blender offers separate MP4 files, not an adaptive stream.
            # Switch resolution on the *same* native Video.js video element
            # and verify that playhead and WebVTT survive reloading its source.
            outcomes['phase']='Live Action MP4 manual quality / 480p + 720p'
            nativeQuality=page.locator('#prism-mount .prism-quality-native')
            await nativeQuality.wait_for(state='attached',timeout=10000)
            assert await nativeQuality.locator('[data-prism-quality-index]').count()==5
            speedTrigger=page.locator('#prism-mount .prism-settings-trigger[aria-label="Playback speed and quality"]')
            await speedTrigger.click()
            await nativeQuality.locator('[data-prism-quality-index="2"]').click()
            await page.wait_for_function("""() => {
              const v=document.querySelector('#prism-mount video.prism-media');
              return v?.src.includes('-480.mp4') && v.readyState>=1 && Math.abs(v.currentTime-51)<.6;
            }""",timeout=16000)
            assert await nativeQuality.locator('[data-prism-quality-index="2"]').get_attribute('aria-pressed')=='true'
            await page.wait_for_function("""() => {
              const v=document.querySelector('#prism-mount video.prism-media');
              return [...(v?.textTracks||[])].some(t=>t.kind==='captions' && t.mode==='showing' && [...(t.activeCues||[])].some(c=>/memory synced/i.test(c.text)));
            }""",timeout=12000)
            outcomes['liveaction_480p_preserves_playhead_and_captions']=True
            if not await speedTrigger.get_attribute('aria-expanded')=='true':
                await speedTrigger.click()
            await nativeQuality.locator('[data-prism-quality-index="1"]').click()
            await page.wait_for_function("""() => {
              const v=document.querySelector('#prism-mount video.prism-media');
              return v?.src.includes('-720.mp4') && v.readyState>=1 && Math.abs(v.currentTime-51)<.6;
            }""",timeout=16000)
            outcomes['liveaction_quality_returns_to_default_720p']=True
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
