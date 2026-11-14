// One-off documentary capture of the live, unchanged PRISM Video.js v10 player.
// Editor-only framing hides the surrounding website; the media controls,
// Optical Loupe, chapter navigation and Live Action remain the genuine DOM.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://prism-videojs-v10.radostradi-pogo.workers.dev/?source=local';
const DIR = path.resolve('showcase-recordings');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const delay = (p,ms) => p.waitForTimeout(ms);

async function capture(name, seconds, page, action) {
  const outfile = path.join(DIR,name+'.mp4');
  const f = spawn('ffmpeg', [
    '-hide_banner','-nostdin','-loglevel','error','-y',
    '-f','x11grab','-draw_mouse','1','-framerate','60',
    '-video_size','1920x1080','-i',process.env.DISPLAY+'.0',
    '-t',String(seconds),'-c:v','libx264','-preset','ultrafast',
    '-crf','18','-pix_fmt','yuv420p',outfile
  ]);
  let stderr='';
  f.stderr.on('data',x=>{stderr+=String(x).slice(-1000);});
  await sleep(600);
  const started=Date.now();
  await action();
  const remaining=seconds*1000-600-(Date.now()-started);
  if(remaining>0) await sleep(remaining);
  const exit = f.exitCode===null ? await new Promise(res=>f.on('close',res)) : f.exitCode;
  if(exit!==0)throw new Error('ffmpeg '+name+' exit '+exit+' '+stderr);
  await page.screenshot({path:path.join(DIR,name+'.jpg'),type:'jpeg',quality:86});
  const s=await stat(outfile);
  console.log('CAPTURED',name,s.size, 'bytes');
}

async function main() {
  await mkdir(DIR,{recursive:true});
  const browser=await chromium.launch({
    headless:false,
    executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
    args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required',
          '--no-first-run','--disable-extensions','--kiosk','--window-position=0,0',
          '--window-size=1920,1080','--force-device-scale-factor=1']
  });
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  page.on('pageerror',err=>console.warn('PAGEERROR',err.message));
  page.setDefaultTimeout(18000);
  await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('#prism-mount .prism-skin').waitFor({state:'visible',timeout:30000});

  await page.evaluate(()=>{
    const mount=document.querySelector('#prism-mount');
    // Lift the live player out of ancestor stacking contexts so the backdrop stays behind it.
    if(mount)document.body.appendChild(mount);
    const back=document.createElement('div');
    back.id='prism-recording-matte';
    back.style.cssText='position:fixed;inset:0;background:#0b0e12;z-index:2147483000;pointer-events:none;';
    document.body.appendChild(back);
    const style=document.createElement('style');
    style.textContent='html,body{scroll-behavior:auto!important;overflow:hidden!important}'+
      '#prism-mount{position:fixed!important;left:60px!important;top:32px!important;'+
      'width:1800px!important;height:1012.5px!important;max-width:none!important;'+
      'margin:0!important;z-index:2147483001!important;transform:none!important;'+
      'border:1px solid #2c3237!important;box-shadow:0 10px 80px #0009!important}'+
      '#prism-mount .prism-vjs-player,#prism-mount .prism-skin{width:100%!important;height:100%!important;'+
      'max-width:none!important;aspect-ratio:16/9!important}';
    document.head.appendChild(style);
    scrollTo(0,0);
  });
  const video=()=>page.locator('#prism-mount mux-video, #prism-mount video').first();
  const film=async id=>{
    await page.locator('[data-film="'+id+'"]').evaluate(el=>el.click());
    await delay(page,950);
  };
  const setTime=async n=>{
    await video().evaluate((v,t)=>{v.pause();v.currentTime=t;},n);
    await delay(page,750);
  };
  const playing=()=>video().evaluate(v=>({tag:v.tagName,paused:v.paused,time:v.currentTime,readyState:v.readyState,error:v.error?.message||null}));
  const rail=()=>page.locator('.prism-rail').boundingBox();

  await film('cinematic');
  await video().waitFor({state:'attached'});
  await page.waitForFunction(()=>{let v=document.querySelector('#prism-mount mux-video,#prism-mount video');return v?.readyState>=2;},null,{timeout:30000});
  await setTime(2.4);
  await page.mouse.move(20,25);
  console.log('START',await playing());
  await capture('01_player_intro',4.1,page,async()=>{
    await page.locator('.prism-center-play').click();
    await delay(page,1900);
    await page.mouse.move(20,25,{steps:9});
  });

  await setTime(10);
  await capture('02_optical_loupe',9.3,page,async()=>{
    const r=await rail();
    await page.mouse.move(r.x+r.width*.16,r.y+r.height*.58,{steps:9});
    await delay(page,350);
    for(let i=0;i<=36;i++){
      let p=.16+.69*(i/36);
      await page.mouse.move(r.x+r.width*p,r.y+r.height*.58);
      await delay(page,160);
    }
    await page.mouse.click(r.x+r.width*.63,r.y+r.height*.58);
    await delay(page,850);
    await page.mouse.move(20,25,{steps:14});
  });

  await capture('03_optical_index',6.9,page,async()=>{
    await page.getByRole('button',{name:'Explore the video chapters'}).click();
    await delay(page,1450);
    const dialog=page.locator('dialog.prism-chapter-dialog');
    if(!await dialog.count()||!await dialog.evaluate(el=>el.open))throw new Error('Optical Index did not open');
    console.log('INDEX OPEN, chapters:',await dialog.locator('button').allTextContents());
    await delay(page,450);
    await dialog.getByRole('button',{name:/SUNRISE/i}).first().click();
    await delay(page,1200);
    await page.mouse.move(20,25,{steps:8});
    await delay(page,750);
  });

  await film('liveaction');
  await page.waitForFunction(()=>document.querySelector('#prism-mount video')?.readyState>=2,null,{timeout:30000});
  await setTime(290);
  console.log('LIVE ACTION',await playing());
  await capture('04_live_action',7.3,page,async()=>{
    await page.locator('.prism-center-play').click();
    await delay(page,1800);
    const r=await rail();
    for(let i=0;i<=20;i++){
      let p=.43+.18*(i/20);
      await page.mouse.move(r.x+r.width*p,r.y+r.height*.6);
      await delay(page,153);
    }
    await page.mouse.move(20,25,{steps:12});
    await delay(page,700);
  });

  await film('cinematic');
  await setTime(15);
  await capture('05_controls_vanish',4.8,page,async()=>{
    await page.locator('.prism-center-play').click();
    await delay(page,600);
    await page.mouse.move(20,25,{steps:15});
    await delay(page,2500);
  });
  console.log('FINAL MEDIA',await playing());
  await browser.close();
}
main().catch(err=>{console.error(err.stack||err);process.exit(1);});
