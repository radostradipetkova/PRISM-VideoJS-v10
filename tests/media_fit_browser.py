"""Browser test of PRISM's real media markup + CSS using locally encoded MP4s.
Official Video.js CDN isn't loaded in this isolated test; this verifies native
video decoding, object-fit, loading, seeking, sizing and existing transport layout.
"""
from pathlib import Path
from urllib.parse import quote
import base64, json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
css=(ROOT/'src/styles.css').read_text()
chapter=(ROOT/'src/chapter-index.js').read_text()
optical=(ROOT/'src/optical-touch.js').read_text()
player=(ROOT/'src/prism-player.js').read_text()
module=lambda s: 'data:text/javascript;charset=utf-8,'+quote(s,safe='')
optical=optical.replace("from './chapter-index.js'",'from '+json.dumps(module(chapter)))
player=player.replace("from './optical-touch.js'",'from '+json.dumps(module(optical)))
urls={name:'data:video/mp4;base64,'+base64.b64encode((ROOT/'fixtures'/f'{name}.mp4').read_bytes()).decode() for name in ['wide','square','portrait']}
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
 pg=b.new_page(viewport={'width':1280,'height':900})
 errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
 pg.set_content('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body style="margin:0;padding:24px"><div class="prism-mount" id="m" style="max-width:1080px;margin:auto"></div></body></html>')
 pg.evaluate('async url=>{window.prismModule=await import(url)}',module(player))
 count=0
 for viewport in [320,375,390,640,768,1280]:
  pg.set_viewport_size({'width':viewport,'height':900})
  for name,src in urls.items():
   pg.evaluate('''o=>{window.inst?.destroy();window.inst=window.prismModule.mountPrismPlayer(document.querySelector('#m'),o)}''',dict(src=src,poster='',captions=None,chapters=[]))
   pg.wait_for_function('window.inst?.media?.readyState>=2',timeout=10000)
   x=pg.evaluate('''()=>{const m=window.inst.media,skin=window.inst.player.querySelector('.prism-skin'),box=skin.getBoundingClientRect(),vb=m.getBoundingClientRect();return {ratio:m.videoWidth/m.videoHeight,actualWidth:m.videoWidth,actualHeight:m.videoHeight,fit:getComputedStyle(m).objectFit,matte:getComputedStyle(skin).backgroundImage,videoError:m.error?.message||null,readyState:m.readyState,hasOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,width:box.width,height:box.height,videoStageHeight:vb.height,chapterButtonHidden:skin.querySelector('.prism-explore-launch').hidden}}''')
   assert x['fit']=='contain', (viewport,name,x)
   assert x['readyState']>=2 and x['videoError'] is None,(viewport,name,x)
   assert x['actualWidth']>0 and x['actualHeight']>0,(viewport,name,x)
   assert not x['hasOverflow'],(viewport,name,x)
   assert x['matte'].startswith('radial-gradient('),(viewport,name,x)
   assert x['chapterButtonHidden'],(viewport,name,x)
   if viewport==1280:
    pg.evaluate('''async()=>{const m=window.inst.media;await m.play();}''')
    pg.wait_for_timeout(240)
    assert pg.evaluate('window.inst.media.currentTime')>0.05, f'playback did not advance for {name}'
    pg.evaluate('window.inst.media.currentTime=0.95')
    pg.wait_for_timeout(80)
    assert 0.82<=pg.evaluate('window.inst.media.currentTime')<=1.35, f'seek failed for {name}'
    pg.evaluate('window.inst.media.pause()')
   count+=1
   print(f'PASS {viewport}px {name}: {x["actualWidth"]}x{x["actualHeight"]} full image; no media error or overflow',flush=True)
 assert not errors,errors
 b.close()
 print(f'{count} real-media/viewport combinations passed + desktop play/seek for all 3 video ratios. No uncaught browser exceptions.')
