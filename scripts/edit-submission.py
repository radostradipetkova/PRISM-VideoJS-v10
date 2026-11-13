#!/usr/bin/env python3
"""Render an original, competition-focused film from *actual* PRISM browser captures."""
import os,sys,json,subprocess,math,wave,re
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

BASE=Path('submission-film')
BASE.mkdir(parents=True,exist_ok=True)
SCENES=BASE/'scenes'
SCENES.mkdir(exist_ok=True)
W,H,FPS=1920,1080,30
BG=(9,10,13)
GOLD=(218,148,91)
WHITE=(238,237,231)
MUTED=(164,167,174)
fontfile='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
fontbold='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

def run(args):
 print('+',' '.join(map(str,args))[:350],flush=True)
 subprocess.run(list(map(str,args)),check=True)

def dur(path):
 p=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nokey=1:noprint_wrappers=1',str(path)],capture_output=True,text=True)
 try:return float(p.stdout.strip())
 except:return 0

def font(size,bold=False):
 return ImageFont.truetype(fontbold if bold else fontfile,size)

def drawtracking(d,xy,s,fill,spacing=6,size=23):
 f=font(size,True);x,y=xy
 for c in s:
  d.text((x,y),c,font=f,fill=fill,stroke_width=0)
  x+=d.textlength(c,font=f)+spacing

def title_overlay(i,label,mobile):
 im=Image.new('RGBA',(W,H),(0,0,0,0));d=ImageDraw.Draw(im)
 d.rectangle((0,0,W,78),fill=(8,9,12,255))
 d.rectangle((0,992,W,H),fill=(8,9,12,255))
 d.line((150,77,1770,77),fill=GOLD+(95,),width=2)
 d.line((150,992,1770,992),fill=GOLD+(95,),width=2)
 drawtracking(d,(154,20),'PRISM.',WHITE,spacing=1,size=25)
 d.text((1745,28),f'{i+1:02d} / 15',font=font(18),fill=MUTED,anchor='ra')
 d.text((156,1019),label,font=font(29,True),fill=WHITE)
 d.text((1763,1025),'VIDEO.JS V10',font=font(17,True),fill=GOLD,anchor='ra')
 if mobile:
  d.rounded_rectangle((150,130,1040,850),radius=18,fill=(8,9,12,232))
  drawtracking(d,(211,206),'PRISM / MOBILE',GOLD,size=20,spacing=2)
  d.text((203,305),'BUILT FOR',font=font(77,True),fill=WHITE)
  d.text((203,405),'EVERY SCREEN.',font=font(77,True),fill=WHITE)
  d.text((207,538),'The same optical language.',font=font(31),fill=MUTED)
  d.text((207,592),'A touch-first experience.',font=font(31),fill=MUTED)
 return im

def still(title,sub,small,duration,target,logo=True):
 im=Image.new('RGB',(W,H),BG);d=ImageDraw.Draw(im)
 d.line((285,282,485,282),fill=GOLD,width=5)
 d.text((285,340),title,font=font(130 if len(title)<12 else 84,True),fill=WHITE)
 d.text((290,545),sub,font=font(39),fill=GOLD)
 d.text((290,647),small,font=font(24),fill=MUTED)
 d.rectangle((285,850,1630,853),fill=GOLD)
 img=BASE/(target+'.png');im.save(img)
 out=BASE/(target+'.mp4')
 run(['ffmpeg','-y','-loglevel','error','-loop','1','-framerate',FPS,'-i',img,'-t',duration,
 '-c:v','libx264','-preset','veryfast','-crf','20','-r',FPS,'-pix_fmt','yuv420p',out])
 return out

intro=still('PRISM.','THE ART OF WATCHING.','A REAL PLAYER. A DIFFERENT PERSPECTIVE.',5,'intro')
entries=[('file',intro)]
manifest=json.loads((BASE/'manifest.json').read_text())
report=[]
for i,m in enumerate(manifest):
 src=Path(m['path'])
 if not src.exists() or dur(src)<2:
  report.append({'scene':m['name'],'status':'missing'});continue
 total=dur(src)
 lead=max(0,total-float(m['duration'])+0.15)
 take=min(total-lead,12.8)
 if take<2:
  lead=0;take=total
 overlay=SCENES/f'title_{i:02d}.png'
 title_overlay(i,m['label'],m['mobile']).save(overlay)
 dst=SCENES/f'scene_{i:02d}.mp4'
 if m['mobile']:
  filt=('[0:v]fps=30,scale=390:844:flags=lanczos,'
        'pad=1920:1080:1160:117:color=0x090a0d,setsar=1[content];'
        '[content][1:v]overlay=0:0:format=auto,format=yuv420p[v]')
 else:
  filt=('[0:v]fps=30,scale=1600:900:flags=lanczos,'
        'pad=1920:1080:160:90:color=0x090a0d,setsar=1[content];'
        '[content][1:v]overlay=0:0:format=auto,format=yuv420p[v]')
 try:
  run(['ffmpeg','-y','-loglevel','error','-ss',f'{lead:.3f}','-t',f'{take:.3f}', '-i',src,
   '-loop','1','-i',overlay,'-filter_complex',filt,'-map','[v]',
   '-t',f'{take:.3f}','-an','-r',FPS,'-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p',dst])
  entries.append(('file',dst))
  report.append({'scene':m['name'],'seconds':round(dur(dst),2),'status':'captured'})
 except Exception as e:
  report.append({'scene':m['name'],'error':str(e),'status':'encoding failed'})
outro=still('PRISM.','EVERY FRAME DESERVES A BETTER INTERFACE.','Video.js v10 Skin Design Challenge  |  prism-videojs-v10.radostradi-pogo.workers.dev',7,'outro')
entries.append(('file',outro))
playlist=BASE/'segments.txt'
playlist.write_text(''.join(f"file '{p.resolve()}'\n" for _,p in entries))
silent=BASE/'joined.mp4'
run(['ffmpeg','-y','-loglevel','error','-f','concat','-safe','0','-i',playlist,'-c','copy',silent])

# Original synthesized low-volume score. No copyrighted audio or purchased music.
seconds=dur(silent)
rate=32000
n=int(seconds*rate)
t=np.arange(n,dtype=np.float32)/rate
# Deeper than conventional corporate promo: warm sub drone, restrained optical shimmer, soft rhythmic pulse.
waveform=(0.11*np.sin(2*np.pi*55*t)+0.046*np.sin(2*np.pi*82.41*t+0.18*np.sin(2*np.pi*.08*t))+
          0.035*np.sin(2*np.pi*164.81*t+0.1*np.sin(2*np.pi*.12*t)))
pulse=(0.5+0.5*np.cos(2*np.pi*0.54*t))**8
waveform+=0.022*pulse*np.sin(2*np.pi*220*t)
waveform+=0.018*np.sin(2*np.pi*330*t)*np.maximum(0,np.sin(2*np.pi*.13*t))
fade=np.minimum(1,t/2)*np.minimum(1,(seconds-t)/3)
audio=(np.clip(waveform*fade,-.5,.5)*32767).astype(np.int16)
wav=BASE/'original_score.wav'
with wave.open(str(wav),'wb') as f:
 f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate);f.writeframes(audio.tobytes())
final=BASE/'PRISM_Official_Submission_1080p30.mp4'
run(['ffmpeg','-y','-loglevel','error','-i',silent,'-i',wav,
 '-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','160k','-shortest','-movflags','+faststart',final])
reportpath=BASE/'coverage.json'
reportpath.write_text(json.dumps({'duration_seconds':dur(final),'format':'1920x1080 30 FPS','scenes':report},indent=2))
print('FINISHED',final,'DURATION',dur(final),'BYTES',final.stat().st_size)
