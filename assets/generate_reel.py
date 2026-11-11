"""Offline original three-scene PRISM reel: moving optics, architecture, refraction.
The imagery and sound are generated locally, with no stock footage or external assets.
Dependencies: Pillow, numpy, ffmpeg.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import math, subprocess, wave

ROOT=Path(__file__).resolve().parent
W,H,FPS,SECONDS=960,540,24,27
N=FPS*SECONDS
rng=np.random.default_rng(7301)
YY,XX=np.mgrid[0:H,0:W].astype(np.float32)
grain=rng.standard_normal((H,W),dtype=np.float32)*1.2
vignette=(1-0.15*((XX-W/2)/(W/2))**2-0.12*((YY-H/2)/(H/2))**2).astype(np.float32)
def gradient(a,b):
  w=(0.28*(XX/W)+0.72*(YY/H))
  return np.array(a,dtype=np.float32)[None,None,:]*(1-w[:,:,None])+np.array(b,dtype=np.float32)[None,None,:]*w[:,:,None]
BACK=[gradient([13,17,23],[37,25,27]),gradient([238,221,189],[190,155,130]),gradient([12,34,40],[26,24,47])]
def ellipse(draw,x,y,r,fill,outline=None,width=1):
  draw.ellipse((int(x-r),int(y-r),int(x+r),int(y+r)),fill=fill,outline=outline,width=width)
def geom(x,y,r,angle):return(x+r*math.cos(angle), y+r*math.sin(angle))
def bg(scene,t):
  base=BACK[scene].copy()
  if scene==0:
    glow=np.exp(-(((XX-(590+85*math.sin(t*.2)))/440)**2+((YY-255)/400)**2)*2.8)
    base+=glow[:,:,None]*np.array([55,25,13],dtype=np.float32)
  elif scene==1:
    glow=np.exp(-(((XX-(650+32*math.sin(t*.35)))/460)**2+((YY-225)/370)**2)*2)
    base+=glow[:,:,None]*np.array([12,19,17],dtype=np.float32)
  else:
    band=np.sin((XX/W)*12-(YY/H)*4+t*.7)*.5+.5
    base+=band[:,:,None]*np.array([9,21,19],dtype=np.float32)
  base=base*vignette[:,:,None]+grain[:,:,None]
  return Image.fromarray(np.uint8(np.clip(base,0,255)),'RGB').convert('RGBA')

def aperture(t):
  img=bg(0,t)
  cx=548+32*math.sin(.27*t); cy=260+19*math.sin(.37*t+.2)
  shadow=Image.new('RGBA',(W,H));sd=ImageDraw.Draw(shadow)
  ellipse(sd,cx+5,cy+15,235,(0,0,0,145))
  img=Image.alpha_composite(img,shadow.filter(ImageFilter.GaussianBlur(42)))
  l=Image.new('RGBA',(W,H));d=ImageDraw.Draw(l)
  # Transient optical light: thin shafts sweep through the lens, not a static still.
  shift=130*math.sin(t*.24)
  d.polygon([(340+shift,-45),(408+shift,-45),(238+shift,585),(140+shift,585)],fill=(243,151,88,16))
  for k in range(13,0,-1):
    r=170+k*2.5
    ellipse(d,cx,cy,r,None,outline=(190+min(60,k*3),76+k*4,56+k*4,170),width=2)
  ellipse(d,cx,cy,176,(179,84,62,255))
  ellipse(d,cx,cy,162,(93,53,55,255))
  ellipse(d,cx,cy,149,(25,29,37,255))
  opening=49+19*math.sin(.42*t)
  for i in range(8):
    a=i*2*math.pi/8+t*.25
    points=[geom(cx,cy,149,a),geom(cx,cy,149,a+math.pi/4+.035),geom(cx,cy,opening,a+.38),geom(cx,cy,opening,a-.05)]
    d.polygon(points,fill=(80+i*3,52+i*2,57+i,255))
    d.line([points[0],points[3]],fill=(252,161,105,125),width=2)
  ellipse(d,cx,cy,opening,(8,13,21,255))
  for i in range(5):
    r=169+i*5
    a=math.degrees(t*.34+i*.61)
    d.arc((cx-r,cy-r,cx+r,cy+r),int(a),int(a+22+i*9),fill=(255,205,144,140),width=2)
  x,y=geom(cx,cy,192,t*.69)
  ellipse(d,x,y,5,(255,230,169,250))
  # Fine metrology lines expand the frame without putting text inside the footage.
  for i in range(18):
    x=25+i*52
    y=510+6*math.sin(t*.2+i*.2)
    d.line((x,y,x,y-(15 if i%3==0 else 5)),fill=(234,186,147,50),width=1)
  return Image.alpha_composite(img,l).convert('RGB')

def architecture(t):
  img=bg(1,t)
  sunx=650+70*math.sin(.24*t);suny=240+20*math.sin(.4*t)
  glow=Image.new('RGBA',(W,H));g=ImageDraw.Draw(glow)
  ellipse(g,sunx,suny,160,(251,232,179,105))
  img=Image.alpha_composite(img,glow.filter(ImageFilter.GaussianBlur(55)))
  l=Image.new('RGBA',(W,H));d=ImageDraw.Draw(l)
  # Monolithic moving folds with precise architectural shadows.
  dx=70*math.sin(t*.25)
  d.polygon([(20+dx,-30),(355+dx,-30),(210+dx,570),(-140+dx,570)], fill=(240,224,191,255))
  d.polygon([(315+dx,-30),(460+dx,-30),(322+dx,570),(170+dx,570)],fill=(171,122,111,245))
  d.polygon([(440+dx,-30),(488+dx,-30),(328+dx,570),(270+dx,570)],fill=(252,234,204,255))
  ellipse(d,sunx,suny,120,(247,213,157,250))
  d.arc((sunx-145,suny-145,sunx+145,suny+145),int(t*25),int(t*25)+86,fill=(120,86,74,180),width=3)
  dx2=35*math.sin(.36*t+1.6)
  d.polygon([(795+dx2,-30),(1120+dx2,-30),(970+dx2,570),(675+dx2,570)],fill=(230,198,165,250))
  d.polygon([(790+dx2,-30),(843+dx2,-30),(684+dx2,570),(624+dx2,570)],fill=(118,91,87,165))
  for i in range(9):
    y=70+i*55
    d.line((370,y,490,y+12),fill=(255,245,222,58),width=1)
  return Image.alpha_composite(img,l).convert('RGB')

def refraction(t):
  img=bg(2,t)
  l=Image.new('RGBA',(W,H));d=ImageDraw.Draw(l)
  # Moving monoliths and prism planes in a restrained teal / amber palette.
  phi=t*.16
  for j in range(5):
    x=175+j*147+55*math.sin(phi+j*.43)
    y0=74+(j%2)*25
    offs=50*math.sin(phi*1.3+j*.74)
    d.polygon([(x,y0),(x+58,y0-24),(x+30+offs,503),(x-65+offs,485)],fill=(54+j*7,91+j*9,98+j*6,118))
    d.line([(x,y0),(x-65+offs,485)],fill=(187,224,202,138),width=2)
    d.line([(x+58,y0-24),(x+30+offs,503)],fill=(108,199,178,140),width=1)
  # Iridescent light caustics that really translate through the frame.
  for j in range(4):
    path=[]
    for x in range(30,960,12):
      yy=275+j*37+48*math.sin(x/95 + t*.38+j*.65)+20*math.sin(x/37-t*.26)
      path.append((x,yy))
    color=[(255,178,125,110),(235,213,178,125),(146,212,201,160),(196,169,205,100)][j]
    d.line(path,fill=color,width=3 if j==2 else 2,joint='curve')
  cx=530+120*math.sin(t*.22);cy=220+45*math.cos(t*.3)
  ellipse(d,cx,cy,107,(34,54,64,50),outline=(205,227,199,100),width=3)
  d.arc((cx-124,cy-124,cx+124,cy+124),int(t*33),int(t*33)+98,fill=(255,206,158,180),width=3)
  return Image.alpha_composite(img,l).convert('RGB')

def frame(t):
  periods=[0,9,18,27]
  idx=min(2,int(t/9))
  local=t-idx*9
  method=[aperture,architecture,refraction]
  if idx<2 and local>8.2:
    mix=(local-8.2)/.8
    a=method[idx](t);b=method[idx+1](t+1.1)
    return Image.blend(a,b,max(0,min(1,mix)))
  return method[idx](t)

def make_audio(path):
  sr=44100; tt=np.arange(sr*SECONDS,dtype=np.float64)/sr
  chord=[110,146.83,185]
  notes=np.zeros_like(tt)
  for i,f in enumerate(chord):
    env=np.clip((tt-i*9)/1.5,0,1)*np.clip(((i+1)*9-tt)/1.8,0,1)
    notes+=env*(.52*np.sin(2*np.pi*f*tt)+.22*np.sin(2*np.pi*f*1.5*tt)+.09*np.sin(2*np.pi*f*2*tt))
  motion=.82+.18*np.sin(2*np.pi*.19*tt)
  notes=notes*motion*.05
  notes*=np.clip(tt/1,0,1)*np.clip((SECONDS-tt)/1.3,0,1)
  # subtle stereo offset for spatial sound, no stock or copyrighted music
  left=(np.clip(notes,-.9,.9)*32767).astype('<i2')
  right=(np.clip(np.roll(notes,110),-.9,.9)*32767).astype('<i2')
  interleave=np.column_stack([left,right]).ravel()
  with wave.open(str(path),'wb') as wav:
    wav.setnchannels(2);wav.setsampwidth(2);wav.setframerate(sr);wav.writeframes(interleave.tobytes())

def main():
  audio=ROOT/'.reel-audio.wav';temp=ROOT/'prism-reel-working.mp4';target=ROOT/'prism-reel.mp4'
  make_audio(audio)
  cmd=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{W}x{H}','-framerate',str(FPS),'-i','pipe:0','-i',str(audio),'-c:v','libx264','-threads','4','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','112k','-ar','44100','-movflags','+faststart','-t',str(SECONDS),str(temp)]
  proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
  print('Encoding original 27-second PRISM reel…',flush=True)
  try:
    for n in range(N):
      img=frame(n/FPS)
      if n==46:img.save(ROOT/'prism-reel.jpg',quality=94)
      proc.stdin.write(img.tobytes())
      if n and n%144==0:print(f'  {n}/{N} frames',flush=True)
  finally:
    proc.stdin.close()
  code=proc.wait();audio.unlink(missing_ok=True)
  if code:raise RuntimeError(f'ffmpeg failed ({code})')
  temp.replace(target)
  print('Saved',target,target.stat().st_size,'bytes',flush=True)
if __name__=='__main__':main()
