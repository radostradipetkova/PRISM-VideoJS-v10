from pathlib import Path
from playwright.sync_api import sync_playwright
import re

R=Path(__file__).resolve().parents[1]

def markup(tree):
    raw=(R/tree/'prism-player.js').read_text()
    start=raw.index('      <section id="${prefMenu}" class="prism-preferences-panel"')
    finish=raw.index('      </section>',start)+len('      </section>')
    raw=raw[start:finish]
    raw=raw.replace('${prefMenu}','guide-preferences').replace('${uid}', 'guide-demo').replace('${icon.loop}', '↻')
    raw=re.sub(r'\$\{hasCaptions\s*\?\s*.*?\}', 'Changes affect real subtitles when captions are enabled using CC.',raw)
    assert '${' not in raw,raw[-300:]
    return raw

def module(tree):
    src=(R/tree/'player-preferences.js').read_text()
    return src.replace('export function ', 'function ')

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    total=0
    for tree in ['src','skin']:
      css=(R/tree/('styles.css' if tree=='src' else 'prism-skin.css')).read_text()
      for width in [1080,390,320]:
        page=browser.new_page(viewport={'width':width+30,'height':720},reduced_motion='reduce' if width==320 else 'no-preference')
        errors=[]
        page.on('pageerror',lambda err:errors.append(str(err)))
        page.set_content(f'''<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{{margin:0;background:#eee}}.test-player{{width:{width}px;max-width:100%;margin:0 auto}}.prism-skin{{box-sizing:border-box;display:block;width:100%;height:{max(340,round(width*.56))}px;position:relative;container-type:inline-size;}}</style><style>{css}</style></head><body><div class="test-player"><media-container class="prism-skin" tabindex="0" aria-label="Demo player"><button class="prism-preferences-trigger" aria-expanded="false" aria-controls="guide-preferences">Preferences</button><media-time-slider class="prism-rail" tabindex="0" style="display:block;width:90%;height:20px;position:absolute;top:60px"></media-time-slider>{markup(tree)}</media-container></div></body></html>''')
        page.add_script_tag(content=module(tree)+'''\nwindow.__prismPrefs=initPlayerPreferences({target:document.querySelector('.test-player'),skin:document.querySelector('.prism-skin'),trigger:document.querySelector('.prism-preferences-trigger'),panel:document.querySelector('.prism-preferences-panel'),win:window});''')
        trigger=page.locator('.prism-preferences-trigger')
        trigger.click(force=True)
        panel=page.locator('.prism-preferences-panel')
        assert panel.is_visible(),(tree,width,'panel not visible')
        summary=page.locator('.prism-keyboard-guide summary')
        assert not page.locator('.prism-keyboard-guide').get_attribute('open'),(tree,width,'unexpected expanded by default')
        summary.focus()
        page.keyboard.press('Enter')
        assert page.locator('.prism-keyboard-guide').get_attribute('open') is not None,(tree,width,'Enter not opening')
        assert page.get_by_text('Play / pause').is_visible()
        assert page.get_by_text('Previous / next chapter**').is_visible()
        # Keep shortcuts inside the preferences panel, not video hotkeys.
        page.evaluate('''() => {window.__hotkeyCount=0;document.querySelector('.prism-skin').addEventListener('keydown',()=>window.__hotkeyCount++);}''')
        summary.focus()
        page.keyboard.press('Space')
        assert page.locator('.prism-keyboard-guide').get_attribute('open') is None,(tree,width,'Space not closing')
        assert page.evaluate('window.__hotkeyCount')==0,(tree,width,'guide leaked hotkey')
        page.keyboard.press('Enter')
        assert page.locator('.prism-keyboard-guide').get_attribute('open') is not None
        guide_btn=page.locator('[data-guide-focus-player]')
        guide_btn.focus()
        page.evaluate("() => {window.__btnClicks=0;document.querySelector('[data-guide-focus-player]').addEventListener('click',()=>window.__btnClicks++)}")
        page.keyboard.press('Enter')
        assert panel.is_hidden(),(tree,width,'focus player did not close menu')
        assert page.evaluate("document.activeElement.classList.contains('prism-skin')"),(tree,width,'player focus failed')
        assert trigger.get_attribute('aria-expanded')=='false'
        trigger.click(force=True)
        focus_timeline=page.locator('[data-guide-focus-timeline]')
        focus_timeline.focus()
        page.keyboard.press('Space')
        assert panel.is_hidden(),(tree,width,'focus timeline did not close menu')
        assert page.evaluate("document.activeElement.classList.contains('prism-rail')"),(tree,width,'timeline focus failed')
        trigger.click(force=True)
        page.keyboard.press('Escape')
        assert panel.is_hidden(),(tree,width,'Escape did not close')
        assert page.evaluate("document.activeElement.classList.contains('prism-preferences-trigger')"),(tree,width,'Escape focus return')
        trigger.click(force=True)
        summary.focus()
        if page.locator('.prism-keyboard-guide').get_attribute('open') is None:page.keyboard.press('Enter')
        assert page.locator('.prism-keyboard-guide').get_attribute('open') is not None
        # both panel and the guide content must fit within mobile player width.
        dims=page.evaluate('''() => {
          const panel=document.querySelector('.prism-preferences-panel');const content=document.querySelector('.prism-keyboard-guide');const list=document.querySelector('.prism-shortcut-list');return {
           panelClient:panel.clientWidth,panelScroll:panel.scrollWidth,
           contentClient:content.clientWidth,contentScroll:content.scrollWidth,
           listClient:list.clientWidth,listScroll:list.scrollWidth,
           player:document.querySelector('.prism-skin').getBoundingClientRect().width,
           panelWidth:panel.getBoundingClientRect().width
          };
        }''')
        assert dims['panelScroll']<=dims['panelClient']+2,(tree,width,'panel overflow',dims)
        assert dims['contentScroll']<=dims['contentClient']+2,(tree,width,'guide overflow',dims)
        assert dims['panelWidth']<=dims['player']+1,(tree,width,'panel exceeds player',dims)
        assert not errors,(tree,width,errors)
        if tree=='src' and width==390:
           summary.scroll_into_view_if_needed();panel.screenshot(path=str(R/'tests'/'keyboard-guide-mobile-preview.png'))
        print(f'PASS / {tree} {width}px — disclosure Enter/Space, keys listed, focus player/timeline, Escape, responsive fit')
        total+=1
        page.close()
    browser.close()
    print(f'PASS / {total} desktop and mobile browser runs')
