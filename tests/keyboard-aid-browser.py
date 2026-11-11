"""Chromium DOM-only focus/layout verification; NOT an integrated Video.js playback test."""
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
html=(ROOT/'index.html').read_text()
css=(ROOT/'src/styles.css').read_text()
js=(ROOT/'src/keyboard-aid.js').read_text().replace('export function initKeyboardAid','window.initKeyboardAid=function initKeyboardAid')
# Remove CDN scripts and app bootstrap: the fixture tests only visible page layout and focus transfer.
import re
html=re.sub(r'<script[^>]*>.*?</script>','',html,flags=re.S)
html=re.sub(r'<script[^>]*src="[^"]+"[^>]*></script>','',html,flags=re.S)
html=re.sub(r'<link[^>]*rel="stylesheet"[^>]*>','',html)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-web-security'])
    for width in [320,375,640,1024,1440]:
        page=browser.new_page(viewport={'width':width,'height':900},reduced_motion='reduce')
        page.set_content(html,wait_until='domcontentloaded')
        page.add_style_tag(content=css)
        page.evaluate('''() => {
            const mount=document.querySelector('#prism-mount');
            mount.innerHTML='<video-player><media-container tabindex="0" aria-label="PRISM test focus target"></media-container></video-player>';
            mount.classList.add('is-ready');
        }''')
        page.add_script_tag(content=js)
        page.evaluate("window.initKeyboardAid({mount:document.querySelector('#prism-mount'),getPlayer:()=>document.querySelector('#prism-mount video-player')})")
        page.locator('#focus-prism-player').click()
        assert page.evaluate("document.activeElement.tagName.toLowerCase()") == 'media-container',f'focus at {width}'
        assert 'ACTIVE' in page.locator('#prism-keyboard-state').inner_text(),f'status at {width}'
        assert page.locator('media-container').evaluate("e=>e.classList.contains('prism-keyboard-engaged')"),f'focus visual cue at {width}'
        page.locator('#focus-prism-player').focus()
        assert 'SPACE: PLAY / PAUSE ANYWHERE' in page.locator('#prism-keyboard-state').inner_text(),f'focus leaves at {width}'
        assert not page.locator('media-container').evaluate("e=>e.classList.contains('prism-keyboard-engaged')"),f'focus reset at {width}'
        page.locator('#skip-to-prism').focus()
        page.keyboard.press('Enter')
        assert page.evaluate("document.activeElement.tagName.toLowerCase()") == 'media-container',f'skip link at {width}'
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),f'horizontal overflow at {width}'
        print(f'PASS: {width}px focus button, skip link, status and width')
        page.close()
    # Verify showcase-wide Space against a controllable DOM media fixture.
    # This deliberately does not depend on CDN availability or real decoding.
    page=browser.new_page(viewport={'width':1280,'height':900},reduced_motion='reduce')
    page.set_content(html,wait_until='domcontentloaded')
    page.add_style_tag(content=css)
    page.add_script_tag(content=js)
    page.evaluate("""() => {
      const mount=document.querySelector('#prism-mount');
      mount.innerHTML='<video-player><media-container tabindex="0"><video class="prism-media"></video></media-container></video-player>';
      mount.classList.add('is-ready');
      const video=mount.querySelector('.prism-media');
      window.toggleCount=0;
      window.attachFakeMedia=(media)=>{
        let paused=true;
        Object.defineProperty(media,'paused',{get:()=>paused,configurable:true});
        media.play=()=>{paused=false;window.toggleCount++;return Promise.resolve()};
        media.pause=()=>{paused=true;window.toggleCount++};
      };
      window.attachFakeMedia(video);
      window.keyboardAid=window.initKeyboardAid({mount,
        getPlayer:()=>mount.querySelector('video-player'),
        getMedia:()=>mount.querySelector('.prism-media')});
      // Mimic the focused Video.js hotkey to detect accidental double toggles.
      mount.querySelector('media-container').addEventListener('keydown',event=>{
        if(event.code==='Space' && !event.repeat){
          event.preventDefault();
          const media=mount.querySelector('.prism-media');
          if(media.paused)media.play();else media.pause();
        }
      });
    }""")
    page.locator('.hero-subline p').click()  # ordinary surrounding page text
    scroll_before=page.evaluate('window.scrollY')
    page.keyboard.press('Space')
    assert page.evaluate('window.toggleCount')==1,'Space should toggle after clicking blank page'
    assert page.evaluate('document.querySelector(".prism-media").paused')==False
    assert page.evaluate('window.scrollY')==scroll_before,'Space must not scroll'
    page.keyboard.press('Space')
    assert page.evaluate('window.toggleCount')==2,'Second Space should pause'
    assert page.evaluate('document.querySelector(".prism-media").paused')==True
    page.locator('.feature-title h2').click()  # different page section
    page.keyboard.press('Space')
    assert page.evaluate('window.toggleCount')==3,'Space should work further down the page'
    page.locator('[data-film="night"]').focus()
    page.keyboard.press('Space')
    assert page.evaluate('window.toggleCount')==3,'Focused button must keep native Space'
    page.evaluate("""() => {const input=document.createElement('input');input.id='prism-test-input';document.body.append(input)}""")
    page.locator('#prism-test-input').focus()
    page.keyboard.press('Space')
    assert page.locator('#prism-test-input').input_value()==' ','Space must type in focused text fields'
    assert page.evaluate('window.toggleCount')==3,'Focused input must not toggle video'
    page.locator('.hero-subline p').click()
    page.keyboard.down('Shift')
    page.keyboard.press('Space')
    page.keyboard.up('Shift')
    assert page.evaluate('window.toggleCount')==3,'Shift+Space must not toggle PRISM'
    page.locator('media-container').focus()
    page.keyboard.press('Space')
    assert page.evaluate('window.toggleCount')==4,'Native player Space must toggle once, not twice'
    page.evaluate("""() => {
      const modal=document.createElement('dialog');modal.setAttribute('open','');modal.id='keyboard-test-modal';document.body.append(modal);
    }""")
    page.locator('.hero-subline p').click()
    page.keyboard.press('Space')
    assert page.evaluate('window.toggleCount')==4,'Open modal must block page shortcut'
    page.evaluate("document.querySelector('#keyboard-test-modal').remove()")
    page.evaluate("""() => {
      const current=document.querySelector('.prism-media');
      const replacement=document.createElement('video');
      replacement.className='prism-media';
      current.replaceWith(replacement);
      window.attachFakeMedia(replacement);
    }""")
    page.keyboard.press('Space')
    assert page.evaluate('window.toggleCount')==5,'Newly switched video should receive Space'
    page.evaluate('window.keyboardAid.destroy()')
    page.keyboard.press('Space')
    assert page.evaluate('window.toggleCount')==5,'Destroy removes the global shortcut'
    print('PASS: page Space play/pause, no scrolling, focused controls, one native toggle, modal, remount and cleanup')
    page.close()
    browser.close()
