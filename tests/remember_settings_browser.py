"""Offline browser integration: mount real PRISM markup and preferences logic with
no-op Video.js registrations, so playback UI/storage behavior can be exercised
without depending on external CDN connectivity in CI.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import re

ROOT=Path(__file__).resolve().parents[1]

def logic(tree):
    blocks=[]
    for name in ['player-preferences.js','remember-settings.js','prism-player.js']:
        text=(ROOT/tree/name).read_text()
        text=re.sub(r'^import .*?;\n','',text,flags=re.M)
        text=re.sub(r'\bexport (?=(?:function|const)\b)','',text)
        blocks.append(text)
    return '\n'.join(blocks)+'''
window.mountPrismPlayer=mountPrismPlayer;
window.__stub=()=>{
  for(const tag of ['video-player','media-container','media-controls','media-controls-content','media-play-button','media-time-slider','media-slider-thumb','media-seek-button','media-mute-button','media-volume-slider','media-fullscreen-button','media-menu','media-playback-rate-radio-group','media-pip-button','media-hotkey','media-gesture','media-status-announcer','media-slider-thumbnail','media-thumbnail','media-captions-radio-group']){
    if(!customElements.get(tag))customElements.define(tag,class extends HTMLElement{});
  }
};
'''

stubs='''
const createTransportTracker=()=>()=> 'PAUSED';
const formatMediaTime=()=> '00:00';
const initOpticalTouch=()=>({getIndex:()=>({type:'chapters',entries:[]}),destroy(){}});
const initSceneLoop=()=>({getState:()=>({active:false}),hasChapter:()=>false,destroy(){}});
const initFullscreenOrientation=()=>({setEnabled(){},destroy(){}});
const initWebKitFullscreenKeyboard=()=>({destroy(){}});
const normalizeChapters=()=>[];
'''

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    total=0
    for tree in ['src','skin']:
      css=(ROOT/tree/('styles.css' if tree=='src' else 'prism-skin.css')).read_text()
      for width in [1080,390,320]:
        page=browser.new_page(viewport={'width':width+30,'height':720})
        errors=[]
        page.on('pageerror',lambda err:errors.append(str(err)))
        page.set_content(f'''<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
          html,body{{margin:0;background:#edebe5}} *,*::before,*::after{{box-sizing:border-box}}
          #root{{width:{width}px;max-width:100%;margin:10px auto}} .prism-skin{{display:block;width:100%;height:{max(360,round(width*.56))}px;position:relative;container-type:inline-size}}
          </style><style>{css}</style></head><body><div id="root"></div></body></html>''')
        page.add_script_tag(content='''
          window.__mem=new Map();
          Object.defineProperty(window,'localStorage',{configurable:true,value:{
            getItem(k){return window.__mem.has(k)?window.__mem.get(k):null;},
            setItem(k,v){window.__mem.set(k,v);},
            removeItem(k){window.__mem.delete(k);}
          }});
        '''+stubs+logic(tree)+'''
          window.__stub();
          window.__mount=()=>{
            window.__prism?.destroy();
            window.__prism=mountPrismPlayer(document.querySelector('#root'),{src:'not-network-video.mp4',captions:null,chapters:[]});
            const v=window.__prism.media;
            // Mimic metadata readiness for the direct playbackRate setter.
            Object.defineProperty(v,'readyState',{configurable:true,get:()=>1});
            v.dispatchEvent(new Event('loadedmetadata'));
            return v.playbackRate;
          };
          window.__mount();
        ''')
        assert page.locator('[data-pref-remember]').count()==1,(tree,width,'toggle missing')
        assert page.evaluate('window.__mem.size')==0,(tree,width,'opt in not respected')
        page.locator('.prism-preferences-trigger').click(force=True)
        remember=page.locator('[data-pref-remember]')
        assert not remember.is_checked()
        page.locator('[data-pref-surface="solid"]').click(force=True)
        page.locator('[data-pref-caption-size="large"]').click(force=True)
        page.locator('[data-pref-caption-background="transparent"]').click(force=True)
        motion=page.locator('[data-pref-motion]')
        motion.focus()
        page.keyboard.press('Enter')
        assert motion.is_checked(),(tree,width,'Enter motion')
        assert page.evaluate('window.__mem.size')==0,(tree,width,'wrote before consent')
        # Activate remember using Enter and preserve the actual speed set by the media.
        page.evaluate('''() => {window.__prism.media.playbackRate=1.5;window.__prism.media.dispatchEvent(new Event('ratechange'))}''')
        remember.focus()
        page.keyboard.press('Enter')
        assert remember.is_checked(),(tree,width,'Enter remember')
        saved=page.evaluate('JSON.parse(window.__mem.get(DEFAULT_REMEMBER_KEY))')
        assert saved['preferences']=={'surface':'solid','motion':True,'captionSize':'large','captionBackground':'transparent'},(tree,width,saved)
        assert saved['playbackRate']==1.5,(tree,width,saved)
        page.evaluate('''() => {window.__prism.media.playbackRate=1.75;window.__prism.media.dispatchEvent(new Event('ratechange'))}''')
        assert page.evaluate('JSON.parse(window.__mem.get(DEFAULT_REMEMBER_KEY)).playbackRate')==1.75
        # Simulated reload: a brand-new player reads persistent state from storage.
        speed=page.evaluate('window.__mount()')
        assert speed==1.75,(tree,width,'speed not restored',speed)
        assert page.locator('.prism-skin').get_attribute('data-caption-size')=='large'
        assert 'prism-solid-surface' in (page.locator('.prism-skin').get_attribute('class') or '')
        page.locator('.prism-preferences-trigger').click(force=True)
        assert page.locator('[data-pref-remember]').is_checked()
        assert page.locator('[data-pref-motion]').is_checked()
        assert page.locator('[data-pref-caption-background="transparent"]').get_attribute('aria-pressed')=='true'
        remember=page.locator('[data-pref-remember]')
        remember.focus()
        page.keyboard.press('Space')
        assert not remember.is_checked(),(tree,width,'Space toggle off')
        assert page.evaluate('window.__mem.size')==0,(tree,width,'did not clear storage')
        speed=page.evaluate('window.__mount()')
        assert speed==1,(tree,width,'speed should reset after opt-out')
        assert page.locator('.prism-skin').get_attribute('data-caption-size')=='medium'
        assert not page.locator('.prism-skin').evaluate('(el)=>el.classList.contains("prism-solid-surface")'),(tree,width,'surface did not reset')
        # OS accessibility always wins over saved viewer overrides.
        page.evaluate('''() => window.__mem.set(DEFAULT_REMEMBER_KEY,JSON.stringify({version:1,enabled:true,preferences:{surface:'glass',motion:false,captionSize:'large',captionBackground:'transparent'},playbackRate:1.25}))''')
        page.emulate_media(reduced_motion='reduce',forced_colors='active')
        page.evaluate('window.__mount()')
        assert page.locator('.prism-skin').evaluate('(el)=>el.classList.contains("prism-solid-surface")'),(tree,width,'forced-colors override')
        assert page.locator('[data-pref-motion]').is_checked(),(tree,width,'OS motion override')
        assert page.locator('[data-pref-motion]').is_disabled(),(tree,width,'OS checkbox lock')
        assert page.locator('[data-pref-caption-background="solid"]').get_attribute('aria-pressed')=='true',(tree,width,'OS caption contrast')
        page.locator('.prism-preferences-trigger').click(force=True)
        panel=page.locator('.prism-preferences-panel')
        # The final setting remains accessible in the small scrolling overlay.
        remember=page.locator('[data-pref-remember]')
        remember.scroll_into_view_if_needed()
        assert remember.is_visible(),(tree,width,'toggle hidden behind scroll')
        dims=page.evaluate('''() => {const a=document.querySelector('.prism-preferences-panel');const b=document.querySelector('.prism-skin');return {scroll:a.scrollWidth,client:a.clientWidth,panel:a.getBoundingClientRect().width,player:b.getBoundingClientRect().width}}''')
        assert dims['scroll']<=dims['client']+2 and dims['panel']<=dims['player']+2,(tree,width,dims)
        page.keyboard.press('Escape')
        assert panel.is_hidden(),(tree,width,'Escape')
        assert not errors,(tree,width,errors)
        print(f'PASS {tree} {width}px: opt-in, Enter/Space, native speed, simulated reload, opt-out, OS priority, mobile fit')
        total+=1
        page.close()
    browser.close()
    print(f'PASS {total} PRISM preference browser integrations')
