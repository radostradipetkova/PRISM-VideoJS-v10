"""Independent browser check: chapter seeks real MP4 without loading CDN Video.js.
It uses the exact chapter script from src/app.js and the real on-disk H264 file.
NOT a complete Video.js integration test.
"""
from pathlib import Path
import re, shutil
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parent.parent
html=(R/'index.html').read_text()
css=(R/'src/styles.css').read_text()
js=(R/'src/app.js').read_text()
chapter_markup=re.search(r'<div class="chapter-bar"[\s\S]*?</div>\s*<div class="player-footer">',html).group(0).rsplit('<div class="player-footer">',1)[0]
script=js[js.index('// These are real chapter seeks'):]
bootstrap="""
let currentFilm='cinematic';
let current={media:document.querySelector('video')};
function load(film){currentFilm=film;window.lastLoaded=film;current.media.src='https://prism.test/prism-cinematic.mp4';}
"""
video=(R/'assets/prism-cinematic.mp4').read_bytes()
with sync_playwright() as p:
  exe=shutil.which('chromium') or shutil.which('google-chrome')
  b=p.chromium.launch(headless=True,executable_path=exe if exe else None,args=['--no-sandbox'])
  page=b.new_page(viewport={'width':1440,'height':850})
  errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  def fulfill(route):
    h=route.request.headers.get('range','')
    match=re.fullmatch(r'bytes=(\d+)-(\d*)',h)
    if match:
      start=int(match.group(1));end=int(match.group(2)) if match.group(2) else len(video)-1
      end=min(end,len(video)-1)
      route.fulfill(status=206,body=video[start:end+1],headers={'Content-Type':'video/mp4','Content-Length':str(end-start+1),'Content-Range':f'bytes {start}-{end}/{len(video)}','Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*'})
    else:
      route.fulfill(status=200,body=video,headers={'Content-Type':'video/mp4','Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*'})
  page.route('https://prism.test/prism-cinematic.mp4',fulfill)
  page.set_content(f'''<html><head><style>{css}</style></head><body><div class="site-shell"><div class="player-region"><video preload="metadata" controls playsinline src="https://prism.test/prism-cinematic.mp4" width="800" style="display:block;width:100%;max-width:800px;aspect-ratio:16/9"></video>{chapter_markup}</div></div></body></html>''')
  page.add_script_tag(content=bootstrap+script)
  page.wait_for_function('document.querySelector("video").readyState>=1',timeout=15000)
  for index,seconds in enumerate([.3,8.3,16.3,24.3]):
    page.locator(f'[data-chapter="{index}"]').click()
    page.wait_for_function('(x)=>Math.abs(document.querySelector("video").currentTime-x)<.5',arg=seconds,timeout=10000)
    assert page.locator(f'[data-chapter="{index}"]').get_attribute('aria-current')=='true'
    print(f'PASS / chapter {index+1} seeks actual MP4 to {seconds:.1f}s')
  page.evaluate("currentFilm='coast'")
  page.locator('[data-chapter="2"]').click()
  page.wait_for_function('Math.abs(document.querySelector("video").currentTime-16.3)<.5',timeout=10000)
  assert page.evaluate('window.lastLoaded')=='cinematic'
  print('PASS / clicking chapter after focused film returns to 32s reel')
  (R/'screenshots').mkdir(exist_ok=True)
  for w in [320,375,480,640,768,1080,1440]:
    page.set_viewport_size({'width':w,'height':900})
    assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth'),f'Overflow at {w}'
    assert page.locator('[data-chapter]').count()==4
    if w in [375,1440]:
      page.locator('.chapter-bar').screenshot(path=str(R/'screenshots'/f'cinematic-chapters-{w}.png'))
    print(f'PASS / chapter strip {w}px fits viewport')
  assert not errors,errors
  print('PASS / no JavaScript page errors')
  b.close()
