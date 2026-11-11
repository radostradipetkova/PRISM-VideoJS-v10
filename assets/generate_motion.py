"""Create the TWO actual animated demo movies for PRISM (not static poster loops).

Offline build-time tool. Requirements: Python, Pillow, numpy, ffmpeg (libx264/aac).
All artwork, animation, music are locally synthesized from original shapes.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np
import math, wave, subprocess, sys

ROOT=Path(__file__).resolve().parent
W,H=960,540
FPS=24
SECONDS=18
N=FPS*SECONDS
XX, YY=np.meshgrid(np.arange(W,dtype=np.float32),np.arange(H,dtype=np.float32))
Y=YY/H
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
MONO='/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
def font(path,size):
 try:return ImageFont.truetype(path,size)
 except:return ImageFont.load_default()
F_TITLE=font(FONT,64)
F_MONO=font(MONO,13)
F_SM=font(MONO,10)
NOISE=np.random.default_rng(404).normal(0,1.4,(H,W)).astype(np.float32)


def background(t,bright):
 if bright:
  base=np.array([181.,156.,132.],np.float32)
  sunx=715+55*math.sin(.19*t)
  suny=245+25*math.cos(.22*t)
  r2=((XX-sunx)/480)**2+((YY-suny)/420)**2
  illum=np.exp(-r2*1.7)
  arr=base[None,None,:]+illum[:,:,None]*np.array([44.,46.,46.],np.float32)
  arr+=((XX/W)*(-13))[:,:,None]
 else:
  base=np.array([13.,16.,24.],np.float32)
  px=641+60*math.sin(.21*t)
  py=270+42*math.sin(.33*t)
  r2=((XX-px)/350)**2+((YY-py)/330)**2
  illum=np.exp(-r2*1.9)
  arr=base[None,None,:]+illum[:,:,None]*np.array([67.,28.,15.],np.float32)
  arr+=Y[:,:,None]*np.array([3.,-2.,-2.],np.float32)
 shade=.11*((XX-W*.50)/(W*.5))**2+.06*((YY-H*.50)/(H*.5))**2
 arr*=1-shade[:,:,None]
 arr+=NOISE[:,:,None]
 return Image.fromarray(np.uint8(np.clip(arr,0,255)),'RGB').convert('RGBA')

def ellipse(draw,cx,cy,r,fill,width=0,outline=None):
 bb=(round(cx-r),round(cy-r),round(cx+r),round(cy+r))
 if fill is not None:draw.ellipse(bb,fill=fill)
 if outline:draw.ellipse(bb,outline=outline,width=width)

def pt(cx,cy,r,ang):return(cx+r*math.cos(ang),cy+r*math.sin(ang))

def draw_dark(im,t):
 cx=625+26*math.sin(t*.34);cy=262+14*math.cos(t*.53)
 # The moving volume casts a soft travelling shadow
 shade=Image.new('RGBA',(W,H),(0,0,0,0));ds=ImageDraw.Draw(shade)
 ellipse(ds,cx+8,cy+21,195,(3,5,12,190))
 shade=shade.filter(ImageFilter.GaussianBlur(38))
 im=Image.alpha_composite(im,shade)
 layer=Image.new('RGBA',(W,H),(0,0,0,0));d=ImageDraw.Draw(layer)
 # Moving translucent slashes: the lens illuminates its environment
 sweep=(t*.11)%1
 bandx=720+230*math.sin(t*.37)
 d.polygon([(bandx-65,-40),(bandx+42,-40),(bandx-132,580),(bandx-248,580)],fill=(255,125,75,15))
 # Thick bronze bezel with true moving inner geometry
 r=176+5*math.sin(t*.47)
 ellipse(d,cx,cy,r,(211,90,63,255))
 ellipse(d,cx,cy,r-12,(156,64,52,255))
 ellipse(d,cx,cy,r-28,(56,36,39,255))
 # seven physical aperture blades shift visibly and continuously
 phase=t*.33
 for i in range(7):
  a=phase+2*math.pi*i/7
  a2=a+2*math.pi/7
  p1=pt(cx,cy,r-26,a)
  p2=pt(cx,cy,r-26,a2+.04)
  p3=pt(cx,cy,45+22*math.sin(.39*t+.5),a2-.47)
  p4=pt(cx,cy,45+22*math.sin(.39*t+.5),a-.12)
  light=(i*9)%35
  d.polygon([p1,p2,p3,p4],fill=(81+light,46+light//2,49+light//2,255))
  d.line([p1,p4],fill=(229,138,94,100),width=2)
 # Aperture travels from near closed to open through the film
 aperture=50+38*(.5+.5*math.sin(.59*t-1))
 ellipse(d,cx,cy,aperture,(12,17,24,255))
 for j in range(5):
  rr=r-4-j*5
  start=int((t*23+j*29)%360)
  d.arc((cx-rr,cy-rr,cx+rr,cy+rr),start,start+35,fill=(255,212-j*15,167-j*8,210-j*28),width=2)
 # Orbiting highlight: unmistakable time-varying motion
 oa=t*.77-1.4
 ox,oy=pt(cx,cy,r+12,oa)
 ellipse(d,ox,oy,5,(251,202,154,255))
 d.line([(cx-260,cy+185),(cx-235,cy+185)],fill=(236,138,96,160),width=2)
 return Image.alpha_composite(im,layer)

def draw_bright(im,t):
 cx=625+45*math.sin(.25*t)
 cy=263+18*math.sin(.45*t+.2)
 layer=Image.new('RGBA',(W,H),(0,0,0,0));d=ImageDraw.Draw(layer)
 # Graphic sun translates through the folds as light changes
 glow=Image.new('RGBA',(W,H),(0,0,0,0));gd=ImageDraw.Draw(glow)
 ellipse(gd,cx,cy,155,(255,236,197,110))
 im=Image.alpha_composite(im,glow.filter(ImageFilter.GaussianBlur(52)))
 for k in range(13,0,-1):
  rad=117+16*math.sin(t*.35)-k*2.8
  mix=k/13
  d.ellipse((cx-rad,cy-rad,cx+rad,cy+rad), fill=(247-int(25*mix),214-int(42*mix),162-int(53*mix),255))
 # Orbit and shadow ellipses give visible parallax
 d.arc((cx-139,cy-139,cx+139,cy+139), int(t*17)%360,int(t*17)%360+135,fill=(107,66,49,220),width=2)
 d.arc((cx-150,cy-150,cx+150,cy+150), int(180-t*24)%360,int(180-t*24)%360+81,fill=(252,240,214,180),width=3)
 # Massive moving folded-paper panels, with slit that crosses the sun
 dx=78*math.sin(t*.32)
 x1=434+dx;x2=660+dx
 d.polygon([(x1-125,-35),(x1+42,-35),(x1-110,575),(x1-265,575)],fill=(239,214,179,255))
 d.polygon([(x1+35,-35),(x1+108,-35),(x1-40,575),(x1-110,575)],fill=(198,153,124,255))
 d.polygon([(x2+190,-35),(x2+315,-35),(x2+140,575),(x2+20,575)],fill=(239,210,171,245))
 d.line([(x1+40,-35),(x1-110,575)],fill=(252,244,222,195),width=2)
 # Thin optical measurement trails visibly drift
 for j in range(6):
  lx=780+j*32+16*math.sin(t*.65+j*.28)
  d.line([(lx,55),(lx-37,456)],fill=(255,247,227,45),width=1)
 return Image.alpha_composite(im,layer)

def dress(im,t,bright):
 d=ImageDraw.Draw(im)
 ink=(43,35,33,245) if bright else (246,227,202,235)
 subdued=(80,65,52,180) if bright else (232,182,147,190)
 d.line([(54,48),(106,48)],fill=ink,width=2)
 d.line([(54,48),(54,94)],fill=ink,width=2)
 d.text((56,111),'STUDY   /   02' if bright else 'STUDY   /   01',fill=ink,font=F_MONO)
 d.text((56,208),'DAY' if bright else 'AFTER',fill=ink,font=F_TITLE)
 d.text((56,276),'BREAK' if bright else 'DARK',fill=ink,font=F_TITLE)
 d.line([(57,439),(173,439)],fill=subdued,width=2)
 d.text((57,452),'THE ARCHIVE OF LIGHT',fill=ink,font=F_SM)
 d.text((57,475),'PRISM   /   MOTION IN COLOUR',fill=subdued,font=F_SM)
 d.text((833,54),'02 / 02' if bright else '01 / 02',font=F_MONO,fill=ink)
 d.text((818,475),f'{t:04.1f} SEC',fill=ink,font=F_MONO)
 # Active measurement marks on the right margin progress with time.
 d.line([(862,492),(862+68*t/SECONDS,492)],fill=ink,width=3)
 d.line([(862,492),(930,492)],fill=subdued,width=1)
 return im.convert('RGB')

def audio(path, bright):
 sr=22050
 n=SECONDS*sr
 t=np.arange(n,dtype=np.float64)/sr
 # deliberately soft, self-made droning score: a harmonic chord under a slow pulse
 f=174.61 if bright else 130.81
 chirp=0.7*np.sin(2*np.pi*f*t)+0.32*np.sin(2*np.pi*f*1.5*t)+0.22*np.sin(2*np.pi*f*2*t)
 wobble=0.6+0.4*np.sin(2*np.pi*(0.17 if bright else 0.23)*t)
 env=np.minimum(1,t/1.5)*np.minimum(1,(SECONDS-t)/1.7)
 sample=(chirp*wobble*env*.035*32767).astype(np.int16)
 with wave.open(str(path),'wb') as wav:
  wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(sr);wav.writeframes(sample.tobytes())

def encode(name,bright):
 out=ROOT/f'{name}.mp4'; wav=ROOT/f'.{name}-temp.wav'; temp=ROOT/f'.{name}-new.mp4'
 audio(wav,bright)
 cmd=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{W}x{H}','-framerate',str(FPS),'-i','pipe:0','-i',str(wav),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','80k','-ar','22050','-movflags','+faststart','-t',str(SECONDS),str(temp)]
 proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
 print(f'Encoding {name} ({SECONDS}s, {FPS}fps, {W}x{H})...',flush=True)
 try:
  for index in range(N):
   t=index/FPS
   img=background(t,bright)
   img=draw_bright(img,t) if bright else draw_dark(img,t)
   img=dress(img,t,bright)
   if index==0:img.save(ROOT/f'{name}.jpg',quality=92)
   proc.stdin.write(img.tobytes())
   if index and index%120==0:print(f'  {index}/{N} frames',flush=True)
 finally:
  proc.stdin.close()
 code=proc.wait();wav.unlink(missing_ok=True)
 if code:raise RuntimeError(f'ffmpeg failed with exit {code}')
 temp.replace(out)
 print(f'Created {out.name}: {out.stat().st_size/1024/1024:.1f} MiB',flush=True)

if __name__=='__main__':
 selected=sys.argv[1:] or ['after-dark','daybreak']
 for name,b in [('after-dark',False),('daybreak',True)]:
  if name in selected: encode(name,b)
