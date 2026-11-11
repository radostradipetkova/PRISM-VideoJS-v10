"""Chromium regression for Fit/Fill on real H.264 MP4s, including portrait & square.
Uses data-URI modules/media so browser does not require network or Video.js CDN.
Confirms frame pixels, 2 player builds, compact menus, keyboard, playback, sizing.
"""
from pathlib import Path
from urllib.parse import quote
import base64,re,io,json
from PIL import Image
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
ASPECTS={'16x9':(320,180),'4x3':(320,240),'3x4':(240,320),'9x16':(180,320),'1x1':(240,240)}
cache={}
def encoded_module(path):
 path=path.resolve()
 if path in cache: return cache[path]
 source=path.read_text()
 def convert(match):
  imported=(path.parent/match.group(2)).resolve()
  return match.group(1)+encoded_module(imported)+match.group(3)
 source=re.sub(r"(from\s*['\"])(\./[^'\"]+\.js)(['\"])",convert,source)
 url='data:text/javascript;charset=utf-8,'+quote(source,safe='')
 cache[path]=url
 return url
urls={name:'data:video/mp4;base64,'+base64.b64encode((ROOT/'fixtures'/f'video-fit-{name}.mp4').read_bytes()).decode() for name in ASPECTS}
results=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
 for package in ['src','skin']:
  css=(ROOT/package/('styles.css' if package=='src' else 'prism-skin.css')).read_text()
  mod=encoded_module(ROOT/package/'prism-player.js')
  for width in [1080,390,320]:
   pg=browser.new_page(viewport={'width':width,'height':840})
   page_errors=[];pg.on('pageerror',lambda e:page_errors.append(str(e)))
   pg.set_content(f'''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>{css}</style><style>html,body{{margin:0;background:#17191b}}#mount{{width:min(100%,720px);margin:10px auto}}.prism-topline,.prism-side-ruler,.prism-edge-mark,.prism-optical-frame,.prism-center-play,.prism-center-aperture,.prism-dim-layer{{visibility:hidden!important}}.prism-preferences-panel{{visibility:visible!important}}</style></head><body><div id="mount"></div></body></html>''')
   pg.evaluate('async source=>{window.mountPrism=(await import(source)).mountPrismPlayer;}',mod)
   for aspect,(w,h) in ASPECTS.items():
    pg.evaluate('''({src,name})=>{window.instance?.destroy();window.instance=window.mountPrism(document.getElementById('mount'),{src,poster:'',captions:null,chapters:[],title:name})}''',{'src':urls[aspect],'name':aspect})
    pg.wait_for_function('window.instance?.media?.readyState>=2',timeout=12000)
    video=pg.locator('video.prism-media')
    def result():
     return pg.evaluate('''()=>{let m=window.instance.media,skin=document.querySelector('.prism-skin'),s=skin.getBoundingClientRect();return {fit:getComputedStyle(m).objectFit,width:m.videoWidth,height:m.videoHeight,frameWidth:s.width,frameHeight:s.height,ready:m.readyState,scrollX:document.documentElement.scrollWidth-document.documentElement.clientWidth,playerHeight:s.height}}''')
    before=result()
    assert (before['width'],before['height'])==(w,h),(package,width,aspect,before)
    assert before['fit']=='contain',(package,width,aspect,before)
    assert before['scrollX']<=1,(package,width,aspect,'overflow Fit',before)
    trigger=pg.locator('.prism-preferences-trigger');trigger.click(force=True)
    fill=pg.locator('[data-pref-video-fit="fill"]');fill.focus();pg.keyboard.press('Enter')
    print('DEBUG',package,width,aspect,pg.evaluate('''()=>({pressed:document.querySelector('[data-pref-video-fit=fill]').getAttribute('aria-pressed'),panel:document.querySelector('.prism-preferences-panel').hidden,focus:document.activeElement?.outerHTML?.slice(0,200),state:window.instance.getPreferences(),style:getComputedStyle(document.querySelector('.prism-preferences-panel')).visibility})'''));assert fill.get_attribute('aria-pressed')=='true',(package,width,aspect,'Enter failed')
    assert pg.locator('[data-pref-video-fit="fit"]').get_attribute('aria-pressed')=='false'
    after=result()
    assert after['fit']=='cover',(package,width,aspect,after)
    assert after['playerHeight']==before['playerHeight'],(package,width,aspect,'resize',before,after)
    assert after['scrollX']<=1,(package,width,aspect,'overflow Fill',after)
    assert pg.locator('.prism-loupe-image').count()==1
    if aspect=='3x4' and width in [1080,390]:
     pg.evaluate('window.instance.media.play()')
     pg.wait_for_timeout(180)
     pg.evaluate('window.instance.media.pause()')
     def pixel():
      pg.evaluate("document.querySelector('.prism-preferences-panel').style.setProperty('visibility','hidden','important')")
      try:shot=video.screenshot()
      finally:pg.evaluate("document.querySelector('.prism-preferences-panel').style.removeProperty('visibility')")
      image=Image.open(io.BytesIO(shot)).convert('RGB')
      return image.getpixel((5,image.height//2))
     filled_pixel=pixel()
    fit=pg.locator('[data-pref-video-fit="fit"]');fit.focus();pg.keyboard.press('Space')
    assert fit.get_attribute('aria-pressed')=='true',(package,width,aspect,'Space failed')
    assert result()['fit']=='contain',(package,width,aspect,'Fit not restored')
    if aspect=='3x4' and width in [1080,390]:
     matte_pixel=pixel()
     assert sum(filled_pixel)>sum(matte_pixel)+30,(package,width,aspect,'paint test',filled_pixel,matte_pixel)
    pg.locator('.prism-preferences-close').click(force=True)
    if aspect in ['16x9','3x4'] and width==1080:
     pg.evaluate('window.instance.media.play()')
     pg.wait_for_timeout(250)
     assert pg.evaluate('window.instance.media.currentTime')>0.08,(package,aspect,'playback failed')
     pg.evaluate('window.instance.media.pause()')
    results.append((package,width,aspect,'PASS'))
   assert not page_errors,(package,width,page_errors)
   pg.close()
 browser.close()
print(json.dumps({'combinations':len(results),'passed':len(results),'ratios':list(ASPECTS),'widths':[1080,390,320],'implementations':['src','skin'],'modes':['fit','fill'],'keys':['Enter','Space'],'paint_checks':'portrait fit vs fill','playback_tests':'16:9 and 3:4'},indent=2))
