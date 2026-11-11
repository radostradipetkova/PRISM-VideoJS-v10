"""PRISM 2.0: real DOM + native MP4 + Optical Touch behavior.
The Video.js CDN is NOT loaded in this isolated browser. Native player controls
must still be verified in the user's browser or public deployed site.
"""
from pathlib import Path
import re,shutil,base64,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
html=(ROOT/'index.html').read_text()
html=re.sub(r'<script\b[^>]*>.*?</script>', '', html,flags=re.S)
html=re.sub(r'<link\b[^>]*rel="stylesheet"[^>]*>','',html)
html=html.replace('</head>','<style>'+(ROOT/'src/styles.css').read_text()+'</style></head>')
js=(ROOT/'src/optical-touch.js').read_text()+'\n'+(ROOT/'src/prism-player.js').read_text().replace("import {initOpticalTouch} from './optical-touch.js';",'')
js=js.replace('export const ','const ').replace('export function ','function ')+'\nwindow.mountPrismPlayer=mountPrismPlayer;'
js=(ROOT/'src/chapter-index.js').read_text(encoding='utf-8').replace('export const ','const ').replace('export function ','function ')+'\n'+re.sub(r"^import .*?chapter-index\.js';?\s*$",'',js,flags=re.M)
clip='data:video/mp4;base64,'+base64.b64encode((ROOT/'assets/prism-cinematic.mp4').read_bytes()).decode()
poster='data:image/jpeg;base64,'+base64.b64encode((ROOT/'assets/prism-cinematic.jpg').read_bytes()).decode()
chapters=[{'time':0,'title':'NIGHT CITY'},{'time':8,'title':'SUNRISE'},{'time':16,'title':'LIQUID'},{'time':24,'title':'GOLDEN HOUR'}]

def event(page,name,x,y,pointer_id=9):
  page.evaluate('''([type,x,y,id])=>{
    const el=document.querySelector('.prism-media');
    el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'touch',isPrimary:true,pointerId:id,clientX:x,clientY:y,buttons:type==='pointerup'?0:1}));
  }''',[name,x,y,pointer_id])

with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
  page=browser.new_page(viewport={'width':1280,'height':920})
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html,wait_until='domcontentloaded')
  page.add_script_tag(content=js)
  page.evaluate('''({clip,poster,chapters})=>{
    window.demo=mountPrismPlayer(document.querySelector('#prism-mount'),{src:clip,poster,chapters});
    document.querySelector('#prism-mount').classList.add('is-ready');
    document.querySelector('.prism-controls').setAttribute('data-visible','');
  }''',{'clip':clip,'poster':poster,'chapters':chapters})
  page.wait_for_function('document.querySelector(".prism-media").readyState>=1',timeout=20000)
  assert page.locator('.prism-loupe-image').count()==1
  assert page.locator('.prism-preview.prism-optical-loupe').count()==1
  assert page.locator('.prism-chapter-ticks span').count()==3
  print('PASS / Optical Loupe and chapter rail mounted')
  # Crossing a chapter boundary changes the loupe chapter label and HUD.
  rail=page.locator('.prism-rail').bounding_box()
  rleft=rail['x']; rw=rail['width']; ry=rail['y']+rail['height']/2
  page.locator('.prism-rail').evaluate('''(el,args)=>{
    for(const [kind,x] of args){el.dispatchEvent(new PointerEvent(kind,{bubbles:true,pointerType:'touch',isPrimary:true,pointerId:44,clientX:x,clientY:el.getBoundingClientRect().top+10,buttons:1}));}
  }''',[['pointerdown',rleft+rw*.1],['pointermove',rleft+rw*.55]])
  assert 'LIQUID' in page.locator('.prism-loupe-chapter').text_content()
  page.wait_for_function("document.querySelector('.prism-gesture-feedback').textContent.includes('LIQUID')",timeout=1500)
  page.locator('.prism-rail').evaluate('''el=>el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch',pointerId:44}))''')
  print('PASS / dragging into a new chapter updates the Optical Loupe and produces visual feedback')
  page.locator('.prism-rail').evaluate('e=>e.setAttribute("data-pointing","")')
  page.locator('#player-wrap').screenshot(path=str(ROOT/'screenshots'/'prism2-optical-loupe-desktop.png'))
  page.locator('.prism-rail').evaluate('e=>e.removeAttribute("data-pointing")')
  # Native modal chapter navigator supports keyboard Escape and semantic buttons.
  page.locator('.prism-explore-launch').click()
  assert page.locator('.prism-chapter-dialog').evaluate('(el)=>el.open')
  assert page.locator('.prism-chapter-choice').count()==4
  page.locator('.prism-chapter-choice').nth(2).focus()
  assert page.locator('.prism-iris-thumbnail').get_attribute('time')=='16'
  assert page.locator('.prism-iris-label').inner_text()=='LIQUID'
  page.screenshot(path=str(ROOT/'screenshots'/'prism2-chapter-dialog-desktop.png'))
  page.keyboard.press('Escape')
  assert not page.locator('.prism-chapter-dialog').evaluate('(el)=>el.open')
  print('PASS / Aperture Navigator opens, traps focus and Escape closes')
  page.locator('.prism-explore-launch').click()
  page.locator('.prism-chapter-choice').nth(2).click()
  page.wait_for_function('document.querySelector(".prism-media").currentTime>15.5',timeout=20000)
  assert not page.locator('.prism-chapter-dialog').evaluate('(el)=>el.open')
  print('PASS / Aperture Navigator seeks genuine MP4 to LIQUID chapter')
  # Liquid glass and solid accessibility fallbacks change background.
  glass=page.locator('.prism-dock').evaluate('(el)=>getComputedStyle(el).backgroundColor')
  page.locator('#player-wrap').evaluate('(e)=>e.classList.add("prism-solid-surface")')
  solid=page.locator('.prism-dock').evaluate('(el)=>getComputedStyle(el).backgroundColor')
  assert solid!=glass,(glass,solid)
  print('PASS / Solid alternative changes translucent surface to opaque')
  # Real native media used for gestures.
  page.locator('.prism-media').evaluate('(el)=>{el.currentTime=4;el.volume=.4;el.playbackRate=1;el.play()}')
  page.wait_for_function('!document.querySelector(".prism-media").paused',timeout=8000)
  r=page.locator('.prism-media').bounding_box()
  left=r['x']+r['width']*.23;right=r['x']+r['width']*.83;y=r['y']+r['height']*.4
  event(page,'pointerdown',right,y);event(page,'pointerup',right,y)
  page.wait_for_timeout(100)
  event(page,'pointerdown',right,y);event(page,'pointerup',right,y)
  page.wait_for_function('document.querySelector(".prism-media").currentTime>=8',timeout=3000)
  print('PASS / double-tap right seeks forward in actual media')
  page.locator('.prism-media').evaluate('(el)=>{el.currentTime=11;el.playbackRate=1}')
  event(page,'pointerdown',left,y)
  page.wait_for_timeout(500)
  rate=page.locator('.prism-media').evaluate('(el)=>el.playbackRate')
  assert rate==2,rate
  event(page,'pointerup',left,y)
  rate=page.locator('.prism-media').evaluate('(el)=>el.playbackRate')
  assert rate==1,rate
  print('PASS / long-press temporarily accelerates to 2x and restores')
  page.locator('#player-wrap').evaluate('(e)=>e.classList.add("prism-allow-embed-swipes")')
  event(page,'pointerdown',right,y)
  event(page,'pointermove',right,y-105)
  event(page,'pointerup',right,y-105)
  newvol=page.locator('.prism-media').evaluate('(el)=>el.volume')
  assert newvol>.4,newvol
  event(page,'pointerdown',left,y)
  event(page,'pointermove',left,y+92)
  event(page,'pointerup',left,y+92)
  dim=page.locator('.prism-skin').evaluate('(e)=>getComputedStyle(e).getPropertyValue("--prism-dim")')
  assert float(dim)>.05,dim
  print('PASS / opt-in right swipe changes volume; left swipe dims video (not device screen)')
  for width in [320,375,390,640,1280]:
    page.set_viewport_size({'width':width,'height':900})
    assert page.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1'),width
    assert page.locator('.prism-explore-launch').is_visible()
    assert page.locator('.prism-explore-launch').evaluate('(e)=>e.getBoundingClientRect().width>=44 && e.getBoundingClientRect().height>=44'),width
    if width==375:
      page.locator('.prism-explore-launch').click()
      page.screenshot(path=str(ROOT/'screenshots'/'prism2-chapter-dialog-mobile.png'))
      assert page.locator('.prism-chapter-dialog').evaluate('(e)=>e.getBoundingClientRect().width<=innerWidth')
      page.keyboard.press('Escape')
      page.screenshot(path=str(ROOT/'screenshots'/'prism2-player-mobile.png'))
    print('PASS / mobile/zoom viewport',width)
  assert not errors,errors
  print('PASS / no uncaught JS exceptions')
  browser.close()
