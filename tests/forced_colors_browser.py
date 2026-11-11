"""Check PRISM Optical Index focus visibility and geometry in Chromium forced colours."""
from pathlib import Path
import re,shutil,subprocess,tempfile,base64
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parent.parent
html=(R/'index.html').read_text();html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S|re.I);html=re.sub(r'<link\b[^>]*rel="stylesheet"[^>]*>','',html);html=html.replace('</head>','<style>'+(R/'src/styles.css').read_text()+'</style></head>')
js=''
for f in ['chapter-index.js','optical-touch.js','prism-player.js']:
 s=(R/'src'/f).read_text();s=re.sub(r'^import .*?;\s*$','',s,flags=re.M);s=re.sub(r'^export\s+(?=(?:const|function)\b)','',s,flags=re.M);js+=s+'\n'
js+='\nwindow.mountPrismPlayer=mountPrismPlayer;'
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 for width in [375,640,1280]:
  ctx=b.new_context(viewport={'width':width,'height':780},forced_colors='active',reduced_motion='reduce')
  page=ctx.new_page();page.set_content(html);page.add_script_tag(content=js)
  page.evaluate('''()=>{window.demo=mountPrismPlayer(document.querySelector('#prism-mount'),{src:'',poster:'',captions:null,chapters:[{time:0,title:'INTRO'},{time:5,title:'EXPERIMENT'},{time:10,title:'RESULTS'}]});document.querySelector('#prism-mount').classList.add('is-ready')}''')
  launch=page.locator('.prism-explore-launch');launch.focus();page.keyboard.press('Enter')
  button=page.locator('.prism-chapter-choice').first;button.focus()
  style=button.evaluate('''el=>{const s=getComputedStyle(el);return {outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth,color:s.color,bg:s.backgroundColor}}''')
  assert style['outlineStyle']!='none' and float(style['outlineWidth'].replace('px',''))>=2,('missing outline',style)
  assert page.locator('.prism-chapter-dialog').evaluate('e=>e.getBoundingClientRect().right<=innerWidth+2')
  assert page.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+2')
  print('PASS forced colors focus and layout',width,style)
  ctx.close()
 b.close()
