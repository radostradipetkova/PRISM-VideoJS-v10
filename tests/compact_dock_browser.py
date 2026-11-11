"""Visual geometry regression for the transport dock. Uses the real CSS and
markup-shaped Video.js elements; doesn't claim streamed video decoding."""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
BASE=Path('/mnt/data/PRISM-RELEASE-QUALITY-CANDIDATE')

def fixture(css,width):
    return f'''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{{box-sizing:border-box}} body{{margin:0;background:#eae7df}} .testbed{{width:{width}px;margin:12px auto}}
{css}</style></head><body><div class="testbed"><div class="prism-mount is-ready"><video-player class="prism-vjs-player"><media-container class="prism-skin" data-view-state="paused" tabindex="0" aria-label="PRISM video player: Test">
<div class="prism-media" style="background:linear-gradient(135deg,#ddb399,#1e5e73)"></div>
<media-controls><media-controls-content class="prism-controls" data-visible>
<div class="prism-bottom"><div class="prism-dock"><div class="prism-dock-header" aria-hidden="true"><span class="prism-dock-index">01 / TIMELINE</span><span class="prism-dock-rule"></span><span class="prism-dock-state"><i></i>TRANSPORT / PAUSED</span></div>
<div class="prism-rail-meta" aria-hidden="true"><span>00</span><span class="prism-rail-code">PRISM PRECISION RAIL ↔ DRAG TO SEEK</span><span>END</span></div>
<media-time-slider class="prism-rail" aria-label="Seek in video" tabindex="0" style="--media-slider-fill:45%"><media-slider-track class="prism-rail-track"><media-slider-fill class="prism-fill"></media-slider-fill></media-slider-track><media-slider-thumb class="prism-thumb"><span></span></media-slider-thumb></media-time-slider>
<media-controls-group class="prism-control-row" aria-label="Playback controls"><div class="prism-group-left"><media-play-button tabindex="0" class="prism-control prism-play" aria-label="Play">▶</media-play-button><media-seek-button class="prism-control prism-skip" tabindex="0" aria-label="Back 5">←</media-seek-button><media-seek-button class="prism-control prism-skip" tabindex="0" aria-label="Forward 5">→</media-seek-button><div class="prism-time"><media-time>0:03</media-time><span class="prism-time-divider">/</span><media-time>0:07</media-time></div></div><div class="prism-group-right"><media-mute-button class="prism-control prism-mute" tabindex="0" aria-label="Mute">♫</media-mute-button><media-volume-slider class="prism-volume" tabindex="0" aria-label="Volume"><media-slider-track></media-slider-track></media-volume-slider><div class="prism-separator"></div><button class="prism-control prism-settings-trigger" aria-label="Speed">◷<span class="prism-text-caption"> SPEED</span></button><button class="prism-control prism-settings-trigger" aria-label="Captions">▤</button><media-pip-button class="prism-control prism-pip" tabindex="0" aria-label="Picture in picture">▣</media-pip-button><media-fullscreen-button class="prism-control prism-fullscreen" tabindex="0" aria-label="Fullscreen">⛶</media-fullscreen-button></div></media-controls-group>
<div class="prism-dock-foot" aria-hidden="true"><span>PRISM / TRANSPORT</span><span>◆ IMAGE FIRST / CONTROL ALWAYS</span><span>00:03</span></div>
</div></div></media-controls-content></media-controls></media-container></video-player></div></div></body></html>'''

async def main():
    b=(BASE/'src/styles.css').read_text();n=(ROOT/'src/styles.css').read_text()
    metrics=[]
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        for w in (320,390,660,720,1080,1500):
            for variant,css in [('before',b),('after',n)]:
                page=await browser.new_page(viewport={'width':max(w+30,360),'height':1000})
                await page.set_content(fixture(css,w))
                data=await page.evaluate('''() => {
                  const q=s=>document.querySelector(s),box=s=>{const r=q(s).getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}};
                  const controls=[...document.querySelectorAll('.prism-control')].filter(el=>getComputedStyle(el).display!=='none');
                  const controlWidths=controls.map(el=>Math.round(el.getBoundingClientRect().width));
                  const controlHeights=controls.map(el=>Math.round(el.getBoundingClientRect().height));
                  return {dock:box('.prism-dock'),bottom:box('.prism-bottom'),rail:box('.prism-rail'),row:box('.prism-control-row'),footDisplay:getComputedStyle(q('.prism-dock-foot')).display,
                    visibleControls:controls.length,smallestTargetWidth:Math.min(...controlWidths),smallestTargetHeight:Math.min(...controlHeights),horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,
                    railFocusable:q('.prism-rail').getAttribute('tabindex')==='0', volume:getComputedStyle(q('.prism-volume')).display};
                }''')
                data.update(width=w,variant=variant)
                metrics.append(data)
                if w==1080:
                    await page.screenshot(path=str(ROOT/f'COMPACT-DOCK-{variant}.png'))
                await page.close()
        await browser.close()
    a={(d['width'],d['variant']):d for d in metrics}
    for w in (320,390,660,720,1080,1500):
        before,after=a[(w,'before')],a[(w,'after')]
        delta=round(before['dock']['h']-after['dock']['h'])
        print(f'{w}px: dock {before["dock"]["h"]} => {after["dock"]["h"]} (-{delta}px); min control {after["smallestTargetWidth"]}x{after["smallestTargetHeight"]}; seek {after["rail"]["h"]}px; foot={after["footDisplay"]}')
        assert not after['horizontalOverflow'],(w,after)
        assert after['rail']['h']>=44,(w,after)
        assert after['smallestTargetWidth']>=44 and after['smallestTargetHeight']>=44,(w,after)
        assert after['visibleControls']>=4,(w,after)
        if w<=660:
            assert abs(before['dock']['h']-after['dock']['h'])<=1,(w,before,after)
        else:
            assert delta>=15,(w,delta)
            assert after['footDisplay']=='none'
    (ROOT/'COMPACT-DOCK-QA.json').write_text(json.dumps(metrics,indent=2)+'\n')
    print('PASS: geometry, touch targets, seek rail, mobile preservation, horizontal overflow')

if __name__=='__main__':asyncio.run(main())
