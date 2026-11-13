// PRISM submission film: capture actual browser interactions; never composite simulated controls.
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT='https://prism-videojs-v10.radostradi-pogo.workers.dev/';
const OUT=path.resolve('submission-film/raw');
await fs.mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required','--disable-dev-shm-usage']});
const manifest=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function safe(tag,fn){
 try { await fn(); console.log('OK',tag); return true; }
 catch(e) { console.log('SKIP',tag,String(e.message).slice(0,200)); return false; }
}
async function snap(name, label, act, {mobile=false, source='CINEMATIC REEL', wait=1200}={}) {
 const viewport=mobile?{width:390,height:844}:{width:1440,height:810};
 const context=await browser.newContext({
  viewport,deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile,
  recordVideo:{dir:OUT,size:viewport},reducedMotion:'no-preference',
 });
 const page=await context.newPage();
 page.setDefaultTimeout(3500);
 await page.goto(ROOT,{waitUntil:'domcontentloaded',timeout:35000});
 await safe('player ready',()=>page.getByRole('group',{name:/PRISM video player/i}).waitFor({timeout:18000}));
 await safe('source '+source,async()=>{if(source!=='CINEMATIC REEL') await page.getByRole('button',{name:source,exact:true}).click();});
 const player=page.getByRole('group',{name:/PRISM video player/i});
 await safe('scroll player',async()=>{await player.scrollIntoViewIfNeeded();});
 await sleep(wait);
 await safe('hover controls',async()=>{
  const b=await player.boundingBox();
  if(b&&!mobile)await page.mouse.move(b.x+b.width*.46,b.y+b.height*.79,{steps:10});
 });
 await sleep(550);
 const started=Date.now();
 await safe(name,()=>act(page,player));
 await sleep(950);
 const duration=(Date.now()-started)/1000+wait/1000+0.55;
 const video=page.video();
 await page.close();
 await context.close();
 const target=path.join(OUT,String(manifest.length).padStart(2,'0')+'_'+name.replace(/\W+/g,'_')+'.webm');
 await video.saveAs(target);
 manifest.push({name,label,source,mobile,path:target,duration});
 console.log('CAPTURED',name,duration.toFixed(1),target);
}
async function openMenu(page,name){await page.getByRole('button',{name,exact:true}).click();await sleep(700)}
async function playerControls(page){const p=page.getByRole('group',{name:/PRISM video player/i});await p.hover({force:true});return p;}

await snap('01_THE_REVEAL','FOUR FILMS. ONE OPTICAL LANGUAGE.',async(page,p)=>{
 await page.getByRole('button',{name:'Play',exact:true}).last().click();
 await sleep(3200);
 await p.hover();
 await sleep(1000);
 await page.getByRole('button',{name:'Pause',exact:true}).last().click();
 await sleep(900);
 await page.getByRole('button',{name:'Play',exact:true}).last().click();
 await sleep(1800);
});

await snap('02_OPTICAL_LOUPE','PRECISION, IN MOTION.',async(page,p)=>{
 const rail=page.getByRole('slider',{name:'Seek',exact:true});
 await rail.scrollIntoViewIfNeeded();
 const b=await rail.boundingBox();
 if(!b)throw Error('Seek rail unavailable');
 await page.mouse.move(b.x+b.width*.2,b.y+b.height*.5,{steps:10});await sleep(800);
 await page.mouse.down();
 await page.mouse.move(b.x+b.width*.49,b.y+b.height*.5,{steps:50});await sleep(550);
 await page.mouse.move(b.x+b.width*.81,b.y+b.height*.5,{steps:50});await sleep(900);
 await page.mouse.up();
 await sleep(1100);
});

await snap('03_OPTICAL_INDEX','EXPLORE THE FILM.',async(page,p)=>{
 await openMenu(page,'Explore the video chapters');
 await sleep(1300);
 await safe('chapter SUNRISE',()=>page.getByRole('button',{name:/Seek to chapter SUNRISE/}).click());
 await sleep(1100);
 await openMenu(page,'Explore the video chapters');
 await safe('chapter GOLDEN HOUR',()=>page.getByRole('button',{name:/Seek to chapter GOLDEN HOUR/}).click());
 await sleep(1100);
 await openMenu(page,'Explore the video chapters');
 await sleep(1100);
});

await snap('04_SCENE_LOOP','MAKE A MOMENT YOUR OWN.',async(page,p)=>{
 await openMenu(page,'Scene loop controls');
 await sleep(1000);
 await safe('loop chapter',()=>page.getByRole('menuitem',{name:/Loop This Chapter/}).click());
 await sleep(1000);
 await openMenu(page,'Scene loop controls');
 await safe('mark in',()=>page.getByRole('menuitem',{name:/Mark In/}).click());
 await sleep(900);
 await openMenu(page,'Scene loop controls');
 await safe('mark out',()=>page.getByRole('menuitem',{name:/Mark Out/}).click());
 await sleep(900);
 await openMenu(page,'Scene loop controls');
 await sleep(1300);
});

await snap('05_SPEED_QUALITY','CONTROL EVERY FRAME.',async(page,p)=>{
 await openMenu(page,'Playback speed and quality');
 await sleep(900);
 await safe('speed 1.5',()=>page.getByRole('menuitemradio',{name:'1.5×'}).click());
 await sleep(800);
 await openMenu(page,'Playback speed and quality');
 await sleep(850);
 await safe('quality 480p',()=>page.getByRole('menuitemradio',{name:'480p'}).click());
 await sleep(900);
 await openMenu(page,'Playback speed and quality');
 await sleep(950);
});

await snap('06_CAPTION_STUDIO','CAPTIONS, RECONSIDERED.',async(page,p)=>{
 await openMenu(page,'Caption tracks and settings');
 await sleep(900);
 await safe('caption appearance',()=>page.getByRole('button',{name:'Caption appearance settings'}).click());
 await sleep(850);
 await safe('size Large',()=>page.getByRole('menuitemradio',{name:/Large|LARGE|^L$/}).first().click());
 await sleep(800);
 await safe('caption menu again',()=>openMenu(page,'Caption tracks and settings'));
 await sleep(850);
 await safe('caption appearance again',()=>page.getByRole('button',{name:'Caption appearance settings'}).click());
 await sleep(1150);
});

await snap('07_LIQUID_AND_SOLID','AN INTERFACE THAT ADAPTS.',async(page,p)=>{
 await openMenu(page,'Player preferences');
 await sleep(900);
 await safe('Solid',()=>page.getByRole('menuitemradio',{name:/Solid/}).click());
 await sleep(1150);
 await openMenu(page,'Player preferences');
 await sleep(800);
 await safe('Liquid Glass',()=>page.getByRole('menuitemradio',{name:/Liquid Glass/}).click());
 await sleep(1000);
 await openMenu(page,'Player preferences');
 await sleep(800);
});

await snap('08_FIT_AND_FILL','YOUR FRAME. YOUR VIEW.',async(page,p)=>{
 await openMenu(page,'Player preferences');
 await sleep(700);
 await safe('Fill crop',()=>page.getByRole('menuitemradio',{name:/Fill.*Crop/}).click());
 await sleep(1200);
 await openMenu(page,'Player preferences');
 await safe('Fit full frame',()=>page.getByRole('menuitemradio',{name:/Fit.*Full Frame/}).click());
 await sleep(1100);
});

await snap('09_REDUCED_MOTION','DESIGNED FOR EVERYONE.',async(page,p)=>{
 await openMenu(page,'Player preferences');
 await sleep(1000);
 await safe('minimal motion',()=>page.getByRole('checkbox',{name:/Minimal motion/}).click());
 await sleep(1000);
 await safe('remember settings',()=>page.getByRole('checkbox',{name:/Remember my settings/}).click());
 await sleep(1200);
});

await snap('10_KEYBOARD','EVERY INTERACTION MATTERS.',async(page,p)=>{
 await p.focus();await sleep(650);
 await page.keyboard.press('Tab');await sleep(750);
 await page.keyboard.press('ArrowRight');await sleep(900);
 await page.keyboard.press('ArrowLeft');await sleep(900);
 await page.keyboard.press('m');await sleep(900);
 await page.keyboard.press('k');await sleep(900);
 await page.keyboard.press('Escape');await sleep(750);
});

await snap('11_SEEK_VOLUME','ESSENTIALS. BEAUTIFULLY DONE.',async(page,p)=>{
 await page.getByRole('button',{name:'Seek forward 5 seconds'}).click();await sleep(700);
 await page.getByRole('button',{name:'Seek backward 5 seconds'}).click();await sleep(700);
 await page.getByRole('button',{name:'Mute',exact:true}).click();await sleep(750);
 await safe('unmute',()=>page.getByRole('button',{name:'Unmute',exact:true}).click());await sleep(700);
 const v=page.getByRole('slider',{name:'Volume',exact:true});
 await safe('set volume',()=>v.fill('45'));await sleep(1100);
});

await snap('12_FOUR_WORLDS','ONE SKIN. FOUR WORLDS.',async(page,p)=>{
 await page.getByRole('button',{name:'NIGHT',exact:true}).click();await sleep(2300);
 await page.getByRole('button',{name:'DAYLIGHT',exact:true}).click();await sleep(2300);
 await page.getByRole('button',{name:'CINEMATIC REEL',exact:true}).click();await sleep(2400);
});

await snap('13_LIVE_ACTION','REAL FOOTAGE. REAL CONTROLS.',async(page,p)=>{
 await openMenu(page,'Playback speed and quality');await sleep(1000);
 await page.keyboard.press('Escape');await sleep(750);
 await safe('explore live',()=>page.getByRole('button',{name:/Explore video time markers|Explore the video chapters/}).click());
 await sleep(1300);
 await page.keyboard.press('Escape');await sleep(900);
},{source:'LIVE ACTION',wait:2800});

await snap('14_MOBILE','ENGINEERED FOR EVERY SCREEN.',async(page,p)=>{
 await safe('mobile play',()=>page.getByRole('button',{name:'Play',exact:true}).last().click());
 await sleep(1800);
 await safe('mobile tap to seek',async()=>{
  const b=await page.getByRole('slider',{name:'Seek',exact:true}).boundingBox();
  if(b)await page.touchscreen.tap(b.x+b.width*.55,b.y+b.height/2);
 });
 await sleep(1500);
 await safe('mobile preferences',()=>page.getByRole('button',{name:'Player preferences'}).click());
 await sleep(1450);
},{mobile:true});

await snap('15_ANATOMY','MORE THAN ANOTHER BAR.',async(page,p)=>{
 await page.getByRole('heading',{name:/NOT JUST/}).scrollIntoViewIfNeeded();
 await sleep(850);
 const rail=page.getByRole('slider',{name:'Seek in the actual PRISM video'});
 const b=await rail.boundingBox();
 if(b){
  await page.mouse.move(b.x+b.width*.2,b.y+b.height*.5);await page.mouse.down();
  await page.mouse.move(b.x+b.width*.73,b.y+b.height*.5,{steps:30});await page.mouse.up();
 }
 await sleep(1600);
 await safe('anatomy play',()=>page.getByRole('button',{name:/Play video|Pause video/}).click());
 await sleep(1300);
});

await browser.close();
await fs.writeFile('submission-film/manifest.json',JSON.stringify(manifest,null,2));
console.log('DONE:',manifest.length,'actual website recordings');
