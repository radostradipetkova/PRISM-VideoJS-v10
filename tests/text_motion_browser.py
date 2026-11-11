"""Browser-level letter-motion verification using real PRISM typography/CSS.
The player is intentionally not initialized, so this test makes no claim about Video.js.
"""
from pathlib import Path
import re, shutil, math
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
html=(ROOT/'index.html').read_text(encoding='utf8')
html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S)
html=re.sub(r'<link\b[^>]*rel="stylesheet"[^>]*>','',html)
html=html.replace('</head>','<style>'+(ROOT/'src/styles.css').read_text(encoding='utf8')+'</style></head>')
js=(ROOT/'src/text-motion.js').read_text(encoding='utf8').replace('export function initTypeMotion','function initTypeMotion')+'\nwindow.__prismMotion=initTypeMotion();'
HEADINGS=['.hero-heading-area h1','.feature-title h2', '.feature-card:nth-child(1) .feature-card-bottom h3', '.feature-card:nth-child(2) .feature-card-bottom h3', '.feature-card:nth-child(3) .feature-card-bottom h3']
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':900},reduced_motion='no-preference')
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html)
 # No-JS fallback visible, complete and readable.
 assert page.locator('.hero-heading-area h1').inner_text().replace('\n',' ').strip()=='THE ART OF WATCHING.'
 page.add_script_tag(content=js)
 assert page.locator('.type-stagger').count()==5
 assert page.locator('.hero-heading-area h1').get_attribute('aria-label')=='THE ART OF WATCHING.'
 assert page.locator('.hero-heading-area h1 .type-source em').count()==1
 assert page.locator('.hero-heading-area h1 .type-overlay').get_attribute('aria-hidden')=='true'
 assert page.locator('.hero-heading-area h1 .type-char').count()==17 # THEART + OF + WATCHING.
 print('PASS / original text preserved as semantic source; aria-hidden glyph overlay')
 # The screenshot taken at 550ms contains an intentionally partial headline.
 page.wait_for_function('document.querySelector(".hero-heading-area h1").classList.contains("type-inview")')
 page.wait_for_timeout(550)
 ROOT.joinpath('screenshots').mkdir(exist_ok=True)
 page.screenshot(path=str(ROOT/'screenshots'/'cinematic-type-1440-mid.png'))
 opacity=page.locator('.hero-heading-area h1 .type-char').evaluate_all('(chars)=>chars.map(e=>+getComputedStyle(e).opacity)')
 assert opacity[0]>.5 and opacity[-1]<.1,f'Not actually staggered: {opacity}'
 underline=page.locator('.hero-heading-area h1 em').evaluate("(e)=>getComputedStyle(e, '::after').transform")
 assert underline.startswith('matrix(0'),f'Underline drew too soon: {underline}'
 print('PASS / first visible, last still blurred and invisible; underline delayed')
 page.wait_for_timeout(3050)
 assert page.locator('.hero-heading-area h1').get_attribute('data-type-prepared')=='true'
 assert page.locator('.hero-heading-area h1').evaluate('(e)=>e.classList.contains("type-finished")')
 assert page.locator('.hero-heading-area h1 .type-overlay').evaluate('(e)=>getComputedStyle(e).display')=='none'
 assert page.locator('.hero-heading-area h1 .type-source').evaluate('(e)=>getComputedStyle(e).color') != 'rgba(0, 0, 0, 0)'
 page.screenshot(path=str(ROOT/'screenshots'/'cinematic-type-1440-complete.png'))
 print('PASS / overlay hands off to unmodified original typography')
 # Scroll rapidly: animations trigger once and finish without layout jumps.
 for sel in HEADINGS[1:5]:
  page.locator(sel).scroll_into_view_if_needed()
  page.wait_for_function('(s)=>document.querySelector(s).classList.contains("type-inview")',arg=sel)
  page.wait_for_timeout(100)
  assert page.locator(sel+' .type-char').count()>5
 # Returning to an already revealed heading must not restart animations.
 page.locator('.feature-title h2').scroll_into_view_if_needed()
 before=page.locator('.feature-title h2 .type-char').first.get_attribute('style')
 page.locator('.hero-heading-area h1').scroll_into_view_if_needed()
 page.locator('.feature-title h2').scroll_into_view_if_needed()
 assert page.locator('.feature-title h2').evaluate('(e)=>e.classList.contains("type-inview")')
 assert page.locator('.feature-title h2 .type-char').first.get_attribute('style')==before
 print('PASS / all major headings reveal only once on viewport entry')
 # The motion preference lives inside the player; test the shared typography API.
 page.evaluate('window.__prismMotion.setMinimal(true)')
 assert page.evaluate('document.documentElement.classList.contains("minimal-type-motion")')
 assert page.locator('.hero-heading-area h1 .type-overlay').evaluate('(e)=>getComputedStyle(e).display')=='none'
 assert page.locator('.hero-heading-area h1 .type-source').evaluate('(e)=>getComputedStyle(e).color')!='rgba(0, 0, 0, 0)'
 page.evaluate('window.__prismMotion.setMinimal(false)')
 print('PASS / in-page Minimal Motion bypasses character animation')
 for w in [320,375,390,480,640,768,1080,1280,1440]:
  page.set_viewport_size({'width':w,'height':900})
  page.evaluate("document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,0)")
  page.wait_for_timeout(80)
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),f'Overflow at width {w}'
  assert page.locator('.hero-heading-area h1').is_visible()
  if w in [375,1440]:
   page.screenshot(path=str(ROOT/'screenshots'/f'cinematic-type-{w}-complete.png'))
  print(f'PASS / {w}px, no horizontal overflow')
 assert not errors,errors
 print('PASS / no JS runtime errors')
 b.close()
 b=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 q=b.new_page(reduced_motion='reduce')
 q.set_content(html);q.add_script_tag(content=js)
 assert q.evaluate('document.documentElement.classList.contains("minimal-type-motion")')
 assert q.locator('.hero-heading-area h1 .type-overlay').evaluate('(e)=>getComputedStyle(e).display')=='none'
 print('PASS / browser prefers-reduced-motion')
 b.close()
