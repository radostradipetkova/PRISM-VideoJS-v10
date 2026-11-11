"""In-browser PRISM regression for SecurityError/quota-blocked localStorage.

Mounts the actual player/preference markup and logic with offline Video.js
registrations, then tests keyboard controls and the in-memory fallback.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import re

ROOT=Path(__file__).resolve().parents[1]

def script_for(tree):
    blocks=[]
    for name in ['player-preferences.js','remember-settings.js','prism-player.js']:
        source=(ROOT/tree/name).read_text()
        source=re.sub(r'^import .*?;\n','',source,flags=re.M)
        source=re.sub(r'\bexport (?=(?:function|const)\b)','',source)
        blocks.append(source)
    return '\n'.join(blocks)+'''
const createTransportTracker=()=>()=> 'PAUSED';
const formatMediaTime=()=> '00:00';
const initOpticalTouch=()=>({getIndex:()=>({type:'chapters',entries:[]}),destroy(){}});
const initSceneLoop=()=>({getState:()=>({active:false}),hasChapter:()=>false,destroy(){}});
const initFullscreenOrientation=()=>({setEnabled(){},destroy(){}});
const initWebKitFullscreenKeyboard=()=>({destroy(){}});
const normalizeChapters=()=>[];
for(const tag of ['video-player','media-container','media-controls','media-controls-content','media-play-button','media-time-slider','media-slider-thumb','media-seek-button','media-mute-button','media-volume-slider','media-fullscreen-button','media-menu','media-playback-rate-radio-group','media-pip-button','media-hotkey','media-gesture','media-status-announcer','media-slider-thumbnail','media-thumbnail','media-captions-radio-group']){
  if(!customElements.get(tag)) customElements.define(tag,class extends HTMLElement{});
}
window.__mount=()=>{
  window.__prism?.destroy();
  window.__prism=mountPrismPlayer(document.getElementById('root'),{src:'unrelated.mp4',captions:null,chapters:[]});
  const media=window.__prism.media;
  Object.defineProperty(media,'readyState',{configurable:true,get:()=>1});
  media.dispatchEvent(new Event('loadedmetadata'));
  return media.playbackRate;
};
window.__mount();
'''

BLOCKED_GETTER="""
Object.defineProperty(window,'localStorage',{
  configurable:true,
  get(){throw new DOMException('Local storage blocked', 'SecurityError')}
});
"""

QUOTA_EXCEEDED="""
window.__originalStore=new Map();
Object.defineProperty(window,'localStorage',{
  configurable:true,
  get(){return {
    getItem(key){return window.__originalStore.get(key)??null},
    setItem(){throw new DOMException('Quota exceeded','QuotaExceededError')},
    removeItem(key){window.__originalStore.delete(key)}
  }}
});
"""

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    count=0
    for tree in ['src','skin']:
        css=(ROOT/tree/('styles.css' if tree=='src' else 'prism-skin.css')).read_text()
        for width in [1080,390]:
            for scenario,js in [('getter-throws',BLOCKED_GETTER),('set-throws',QUOTA_EXCEEDED)]:
                page=browser.new_page(viewport={'width':width+30,'height':720})
                errors=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.set_content(f'''<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
                    html,body{{margin:0;background:#edebe5}}*,*::before,*::after{{box-sizing:border-box}}
                    #root{{width:{width}px;max-width:100%;margin:10px auto}}
                    .prism-skin{{display:block;width:100%;height:{max(360,round(width*.56))}px;position:relative;container-type:inline-size}}
                    </style><style>{css}</style></head><body><div id="root"></div></body></html>''')
                page.add_script_tag(content=js+script_for(tree))
                page.locator('.prism-preferences-trigger').click(force=True)
                assert not page.locator('[data-pref-remember]').is_checked(),(tree,width,scenario,'opt-in default')
                page.locator('[data-pref-surface="solid"]').click(force=True)
                page.locator('[data-pref-caption-size="large"]').click(force=True)
                page.locator('[data-pref-caption-background="transparent"]').click(force=True)
                checkbox=page.locator('[data-pref-remember]')
                checkbox.focus()
                page.keyboard.press('Enter')
                assert checkbox.is_checked(),(tree,width,scenario,'toggle blocked by browser')
                assert 'open page' in page.locator('[data-pref-remember-status]').inner_text(),(tree,width,scenario,'status lies')
                page.evaluate('''() => {window.__prism.media.playbackRate=1.5;window.__prism.media.dispatchEvent(new Event('ratechange'))}''')
                # A new embedded player in the *same JS page* uses fallback memory.
                assert page.evaluate('window.__mount()')==1.5,(tree,width,scenario,'speed lost')
                assert page.locator('[data-pref-remember]').is_checked(),(tree,width,scenario,'memory not read')
                assert page.locator('.prism-skin').get_attribute('data-caption-size')=='large',(tree,width,scenario,'caption not restored')
                assert page.locator('.prism-skin').evaluate('(el)=>el.classList.contains("prism-solid-surface")'),(tree,width,scenario,'surface not restored')
                assert 'open page' in page.locator('[data-pref-remember-status]').inner_text(),(tree,width,scenario,'reload status lies')
                page.locator('.prism-preferences-trigger').click(force=True)
                remember=page.locator('[data-pref-remember]')
                remember.focus()
                page.keyboard.press('Space')
                assert not remember.is_checked(),(tree,width,scenario,'opt out not working')
                assert page.evaluate('window.__mount()')==1,(tree,width,scenario,'fallback removal failed')
                assert page.locator('.prism-skin').get_attribute('data-caption-size')=='medium',(tree,width,scenario,'caption did not reset')
                assert not errors,(tree,width,scenario,errors)
                print(f'PASS {tree} {width}px / {scenario}: memory fallback, Enter, speed, remount, opt out, no JS errors')
                page.close()
                count+=1
    browser.close()
    print(f'PASS {count} PRISM blocked-storage browser tests')
