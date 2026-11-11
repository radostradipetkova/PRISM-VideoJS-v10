from playwright.sync_api import sync_playwright
from time import sleep
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
 for w in (1080,390,320):
  page=browser.new_page(viewport={'width':w,'height':820})
  page.goto('http://127.0.0.1:4173/?source=local',wait_until='domcontentloaded',timeout=20000)
  page.wait_for_selector('[data-film="liveaction"]',timeout=8000)
  page.wait_for_timeout(700)
  page.locator('[data-film="liveaction"]').click()
  page.wait_for_timeout(1300)
  base=page.evaluate('''() => {
   const m=document.querySelector('.prism-media'),t=m?.querySelector('track'), menu=document.querySelector('.prism-captions-menu');
   return {src:m?.currentSrc,hasCaption:!!t,ready:t?.readyState,mode:m?.textTracks?.[0]?.mode,mediaReady:m?.readyState,cues:m?.textTracks?.[0]?.cues?.length,hasGear:!!menu?.querySelector('.prism-caption-gear'),captionInPreferences:!!document.querySelector('.prism-preferences-panel [data-pref-caption-size]')};
  }''')
  print(w,'BASE',base)
  # VTT captions real-media loaded; force video to 2.8s (first cue in test excerpt)
  page.evaluate('''() => {const video=document.querySelector('video.prism-media');if(video){video.currentTime=3;video.play().catch(()=>{});}}''')
  page.wait_for_timeout(700)
  cue=page.evaluate('''() => {
   const v=document.querySelector('video.prism-media'),t=v?.textTracks?.[0];return {mode:t?.mode,active:[...(t?.activeCues||[])].map(c=>c.text),ready:v?.querySelector('track')?.readyState,time:v?.currentTime,paused:v?.paused};
  }''')
  print(w,'CUES',cue)
  assert cue['mode']=='showing',cue
  assert any('action' in s.lower() for s in cue['active']),cue
  # Open menu manually in an offline harness: VideoJS menu custom element unavailable without CDN.
  page.evaluate('''() => { const m=document.querySelector('.prism-captions-menu');m.setAttribute('data-open','');m.style.position='absolute';m.style.right='0';m.style.bottom='95px';m.style.display='block'; }''')
  gear=page.locator('.prism-caption-gear')
  gear.click(force=True)
  assert page.locator('[data-caption-appearance]').is_visible()
  assert page.locator('[data-caption-track-list]').is_hidden()
  page.locator('[data-pref-caption-size="large"]').click(force=True)
  assert page.locator('[data-pref-caption-size="large"]').get_attribute('aria-pressed')=='true'
  page.locator('.prism-caption-back').click(force=True)
  assert page.locator('[data-caption-track-list]').is_visible()
  dims=page.evaluate('''() => {const sk=document.querySelector('.prism-skin'),m=document.querySelector('.prism-captions-menu');return {skin:sk.getBoundingClientRect().width,menu:m.getBoundingClientRect().width,style:sk.style.getPropertyValue('--prism-caption-font-size')}}''')
  print(w,'MENU',dims)
  assert dims['menu'] <= dims['skin']+1,dims
  assert dims['style']=='22px',dims
  page.close()
 browser.close()
