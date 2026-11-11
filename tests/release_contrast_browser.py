"""Actual Chromium CSS compositing audit, offline via page.set_content.
No live Video.js network or decoder claims. Works in restricted CI/container environments.
"""
from pathlib import Path
from PIL import Image
import asyncio, json
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
CSS=(ROOT/'skin/prism-skin.css').read_text()

def luminance(rgb):
    def channel(x):
        x=x/255
        return x/12.92 if x <= .04045 else ((x+.055)/1.055)**2.4
    return sum(w*channel(x) for w,x in zip((.2126,.7152,.0722),rgb))
def contrast(a,b):
    hi,lo=sorted((luminance(a),luminance(b)),reverse=True)
    return round((hi+.05)/(lo+.05),2)

async def main():
    outcomes=[]
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        for w in (320,390,768,1280):
            for bright in (False,True):
                page=await browser.new_page(viewport={'width':w,'height':800},device_scale_factor=1)
                backdrop='#ffffff' if bright else '#090a0b'
                html='''<!doctype html><html><head><style>html,body{margin:0;padding:0;background:#ddd}
                .qa{width:min(96vw,1080px);margin:35px auto}'''+CSS+'''</style></head><body>
                <div class="qa prism-mount"><video-player class="prism-vjs-player"><media-container class="prism-skin" data-view-state="paused">
                <div class="prism-media" style="background:'''+backdrop+'''" aria-hidden="true"></div>
                <div class="prism-bottom"><div class="prism-dock">
                <div class="prism-dock-header">01 / TIMELINE <span class="prism-dock-rule"></span><span class="prism-dock-state">TRANSPORT / PAUSED</span></div>
                <div class="prism-rail-meta">PRECISION RAIL</div>
                <div class="prism-control-row"><span class="prism-time">00:09 / 00:32</span></div>
                <div class="prism-dock-foot">PRISM / TRANSPORT</div></div></div>
                <media-buffering-indicator class="prism-buffering" aria-label="Buffering"><span></span><span></span><span></span></media-buffering-indicator>
                <media-error-dialog><media-dialog-popup class="prism-error"><media-dialog-title>Could not load video</media-dialog-title></media-dialog-popup></media-error-dialog>
                </media-container></video-player></div></body></html>'''
                await page.set_content(html)
                dock=page.locator('.prism-dock')
                r=await dock.bounding_box()
                png=ROOT/f'release-contrast-{w}-{"bright" if bright else "dark"}.png'
                await page.screenshot(path=str(png),full_page=False)
                with Image.open(png) as im:
                    im=im.convert('RGB')
                    px=im.getpixel((int(r['x']+r['width']*.45),int(r['y']+r['height']*.72)))
                mute=(200,185,168)
                ratio=contrast(px,mute)
                ratio_white=contrast(px,(247,238,225))
                css_data=await page.evaluate('''() => ({overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth+1,
                  bufferHidden: getComputedStyle(document.querySelector('.prism-buffering')).display==='none',
                  errorHidden: getComputedStyle(document.querySelector('.prism-error')).display==='none',
                  backdropFilter: getComputedStyle(document.querySelector('.prism-dock')).backdropFilter})''')
                await page.locator('.prism-buffering').evaluate("el => el.setAttribute('data-visible','')")
                await page.locator('.prism-error').evaluate("el => el.setAttribute('data-open','')")
                indicators=await page.evaluate('''() => ({bufferShown:getComputedStyle(document.querySelector('.prism-buffering')).display !== 'none',
                    errorShown:getComputedStyle(document.querySelector('.prism-error')).display!=='none'})''')
                ok=ratio>=4.5 and ratio_white>=4.5 and not css_data['overflow'] and css_data['bufferHidden'] and css_data['errorHidden'] and indicators['bufferShown'] and indicators['errorShown']
                result=dict(width=w,footage='bright' if bright else 'dark',rgb=px,mutedTextContrast=ratio,lightTextContrast=ratio_white,passCheck=ok,**css_data,**indicators)
                outcomes.append(result)
                await page.close()
        # Separate check: browser honors reduced motion and default cue styles.
        page=await browser.new_page(viewport={'width':900,'height':600},reduced_motion='reduce')
        await page.set_content('<style>'+CSS+'</style><div class="prism-mount"><div class="prism-skin"><div class="prism-bottom"></div></div></div>')
        duration=await page.locator('.prism-bottom').evaluate('el=>getComputedStyle(el).transitionDuration')
        await browser.close()
    passed=all(x['passCheck'] for x in outcomes) and duration in ('0s','0s, 0s','0s, 0s, 0s')
    report=dict(passed=passed,contrastScreens=len(outcomes),reducedMotionTransition=duration,results=outcomes)
    (ROOT/'RELEASE-CONTRAST-RESULTS.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='results'},indent=2))
    for x in outcomes:
        print(x['width'],x['footage'],x['mutedTextContrast'],x['lightTextContrast'],'PASS' if x['passCheck'] else 'FAIL')
    if not passed: raise SystemExit(1)

if __name__=='__main__':asyncio.run(main())
