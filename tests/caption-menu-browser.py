"""Offline Chromium regression for compact CC appearance menu & real text track.
The Video.js CDN does not load in this environment, so Video.js radio rendering
is tested structurally, while native HTMLMediaElement cues are verified in browser.
"""
import base64,re,json
from pathlib import Path
from urllib.parse import quote
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
cache={}
def module(path):
 path=path.resolve()
 if path in cache:return cache[path]
 s=path.read_text()
 s=re.sub(r"(from\s*['\"])(\./[^'\"]+\.js)(['\"])",lambda m:m.group(1)+module((path.parent/m.group(2)).resolve())+m.group(3),s)
 url='data:text/javascript;charset=utf-8,'+quote(s,safe='')
 cache[path]=url
 return url
video='data:video/mp4;base64,'+base64.b64encode((ROOT/'fixtures'/'caption-menu-test.mp4').read_bytes()).decode()
vtt='data:text/vtt;charset=utf-8,'+quote((ROOT/'assets'/'tears-of-steel-excerpt.vtt').read_text())
results=[]
with sync_playwright() as pw:
 b=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
 for kind in ('src','skin'):
  css=(ROOT/kind/('styles.css' if kind=='src' else 'prism-skin.css')).read_text()
  js=module(ROOT/kind/'prism-player.js')
  for width in (1080,390,320):
   page=b.new_page(viewport={'width':width,'height':850})
   errors=[];page.on('pageerror',lambda x:errors.append(str(x)))
   page.set_content(f'''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>{css}</style><style>html,body{{margin:0;background:#16191d}}#mount{{width:min(100%,750px);margin:10px auto}}.prism-topline,.prism-side-ruler,.prism-edge-mark,.prism-optical-frame,.prism-center-play,.prism-center-aperture,.prism-dim-layer{{visibility:hidden!important}}.prism-controls,.prism-bottom{{opacity:1!important;visibility:visible!important;transform:none!important}}.prism-captions-menu{{visibility:visible!important;position:absolute;right:3px;bottom:96px;display:block!important}}.prism-captions-menu:not([data-open]){{display:none!important}}</style></head><body><div id="mount"></div></body></html>''')
   page.evaluate('async js => {window.mountPrism=(await import(js)).mountPrismPlayer}',js)
   page.evaluate('''({video,vtt}) => {window.prism=window.mountPrism(document.getElementById('mount'),{src:video,captions:vtt,captionsDefault:true,captionLabel:'English / excerpt',poster:''})}''',{'video':video,'vtt':vtt})
   page.wait_for_function('window.prism?.media?.readyState>=1',timeout=20000)
   page.wait_for_function('window.prism.media.querySelector(\'track\')?.readyState===2',timeout=15000)
   page.evaluate('''() => {window.prism.media.currentTime=3;window.prism.media.play().catch(()=>{})}''')
   page.wait_for_timeout(250)
   cue=page.evaluate('''() => {const m=window.prism.media,track=m.textTracks[0];return {mode:track.mode,count:track.cues?.length,active:[...(track.activeCues||[])].map(c=>c.text),ready:m.querySelector('track').readyState}}''')
   assert cue['mode']=='showing' and cue['count']>1 and 'action' in str(cue['active']).lower(),(kind,width,cue)
   assert page.locator('.prism-preferences-panel [data-pref-caption-size]').count()==0
   assert page.locator('.prism-captions-menu [data-pref-caption-size]').count()==3
   # Simulate the native Video.js radio items: Off first, then English.
   page.evaluate('''() => {
     const group=document.querySelector('.prism-captions-menu media-captions-radio-group');
     for(const label of ['Off','English / excerpt']){
       const item=document.createElement('media-menu-radio-item');
       item.className='prism-menu-item';
       const span=document.createElement('span');span.setAttribute('data-part','label');span.textContent=label;
       item.appendChild(span);group.appendChild(item);
     }
     document.querySelector('.prism-captions-menu').setAttribute('data-open','');
   }''')
   page.locator('media-menu-radio-item.prism-menu-item').first.click(force=True)
   page.wait_for_timeout(40)
   assert page.evaluate('window.prism.media.textTracks[0].mode')=='disabled',(kind,width,'Off selection')
   page.locator('media-menu-radio-item.prism-menu-item').nth(1).click(force=True)
   page.wait_for_timeout(40)
   assert page.evaluate('window.prism.media.textTracks[0].mode')=='showing',(kind,width,'English selection')
   page.locator('.prism-caption-gear').focus()
   page.keyboard.press('Enter')
   assert page.locator('[data-caption-appearance]').is_visible(),(kind,width,'open via Enter')
   assert page.locator('[data-caption-track-list]').is_hidden(),(kind,width,'track rows hidden')
   page.locator('[data-pref-caption-size="large"]').focus();page.keyboard.press('Space')
   assert page.locator('[data-pref-caption-size="large"]').get_attribute('aria-pressed')=='true'
   page.locator('[data-pref-caption-background="transparent"]').focus();page.keyboard.press('Enter')
   assert page.locator('[data-pref-caption-background="transparent"]').get_attribute('aria-pressed')=='true'
   # Back to language selection: Escape should only close subview first.
   page.locator('.prism-caption-back').focus();page.keyboard.press('Enter')
   assert page.locator('[data-caption-track-list]').get_attribute('hidden') is None,(kind,width,'back')
   page.locator('.prism-caption-gear').focus();page.keyboard.press('Space')
   page.locator('.prism-caption-back').focus();page.keyboard.press('Escape')
   assert page.locator('[data-caption-track-list]').get_attribute('hidden') is None,(kind,width,'Escape')
   props=page.evaluate('''() => {const m=document.querySelector('.prism-captions-menu'),s=document.querySelector('.prism-skin');return {menu:m.getBoundingClientRect().width,skin:s.getBoundingClientRect().width,font:s.style.getPropertyValue('--prism-caption-font-size'),background:s.dataset.captionBackground,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}}''')
   assert props['font']=='22px' and props['background']=='transparent',(kind,width,props)
   assert props['menu']<=props['skin']+1,(kind,width,props)
   assert props['overflow']<=1,(kind,width,props)
   assert not errors,(kind,width,errors)
   results.append({'implementation':kind,'width':width,'nativeCue':cue,'menu':props})
   page.close()
 b.close()
print(json.dumps(results,indent=2))
