"""PRISM Cinematic Studies — original locally rendered MOVING material.
Four distinct scenes: rainy city, ocean sunrise, macro ripples, desert light.
No stock footage, external images, downloaded media or licensed music.
Requirements: Pillow, numpy, ffmpeg. Run: python assets/generate_cinematic.py
"""
from pathlib import Path
import math, subprocess, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
ROOT=Path(__file__).resolve().parent
W,H,FPS,LENGTH=960,540,24,32
X,Y=np.meshgrid(np.arange(W,dtype=np.float32),np.arange(H,dtype=np.float32))
RNG=np.random.default_rng(10103)
static_grain=RNG.normal(0,1.7,(H,W)).astype(np.float32)
VIGNETTE=1-.25*((X-W/2)/(W/2))**2-.22*((Y-H/2)/(H/2))**2
# stable particles and architecture, no frame-to-frame random position jumps
RAINDROPS=[(float(RNG.uniform(0,W)),float(RNG.uniform(0,H)),float(RNG.uniform(130,390)),float(RNG.uniform(10,34))) for _ in range(280)]
BOKEH=[(float(RNG.uniform(80,910)),float(RNG.uniform(70,435)),float(RNG.uniform(3,16)),int(RNG.integers(0,3)),float(RNG.uniform(0,6.28))) for _ in range(28)]
STARS=[(float(RNG.uniform(0,W)),float(RNG.uniform(0,245)),float(RNG.uniform(.5,1.6))) for _ in range(100)]

def base(top,bottom,extra=None):
    mix=Y/H
    rgb=np.array(top,dtype=np.float32)[None,None,:]*(1-mix[:,:,None])+np.array(bottom,dtype=np.float32)[None,None,:]*mix[:,:,None]
    if extra is not None:rgb+=extra
    rgb=rgb*VIGNETTE[:,:,None]+static_grain[:,:,None]
    return np.uint8(np.clip(rgb,0,255))

def finish(arr, t, noise=1.1):
    film=noise*(np.sin(X*.31+Y*.18+t*9.7)*.6+np.sin(X*.71-Y*.49-t*12)*.4)
    result=np.clip(arr.astype(np.float32)+film[:,:,None],0,255).astype('uint8')
    return Image.fromarray(result,'RGB')

def city(t):
    # WET CITY / tracked camera drift and many independently moving rain streaks.
    glow=np.exp(-(((X-652)/310)**2+((Y-185)/220)**2)*1.45)[:,:,None]*np.array([20,29,43])
    img=Image.fromarray(base([9,22,35],[18,31,42],glow),'RGB')
    d=ImageDraw.Draw(img,'RGBA')
    pan=24*math.sin(t*.19)
    buildings=[(-90,0,185,380),(86,0,184,295),(193,32,125,353),(315,0,92,295),(700,10,100,325),(800,0,170,435)]
    # Architecture and illuminated windows shift at different apparent depths.
    for j,(bx,by,bw,bh) in enumerate(buildings):
        p=pan*(1+.12*(j%3));x=bx+p
        d.rectangle((x,by,x+bw,by+bh), fill=(10+j%3*4,19+j%4*4,30+j%3*5,252))
        d.line((x+bw,0,x+bw,bh),fill=(89,115,114,52),width=2)
        for yy in range(24,bh-15,24):
            for wx in range(12,bw-12,19):
                if (int(wx+yy*3+j*7)%6)<4:continue
                c=(240,162,91,115) if (wx+yy+j)%3 else (105,215,226,110)
                d.rectangle((x+wx,yy,x+wx+4,yy+9),fill=c)
    # neon signage on the right, plus bright glass highlights
    neonx=773+pan*1.25
    for offset,alpha in [(9,22),(5,45),(2,95)]:
        d.rounded_rectangle((neonx+offset,148+offset,neonx+51+offset,231+offset),radius=2,outline=(255,102,68,alpha),width=3)
    d.line((neonx+22,169,neonx+22,207), fill=(255,148,105,175),width=4)
    d.line((neonx+9,192,neonx+42,192), fill=(255,148,105,145),width=3)
    d.polygon([(312,300),(730,300),(1010,540),(-80,540)], fill=(19,36,46,255))
    d.line((504,303,447,540),fill=(183,165,128,54),width=3)
    # perspective wet road / moving reflections and passing headlamps
    tx=500+230*math.sin(.43*t-.5)
    for j in range(130):
        yy=309+(j*15.5)%230; xx=(j*177+13)%W
        displacement=31*math.sin(.55*t+j*.44)
        width=3+int((yy-308)/24)
        col=(225,102,73,12+int(j%4)*10) if j%3==0 else (91,193,208,10+int(j%4)*10)
        d.line((xx+displacement,yy,xx+width+displacement,yy),fill=col,width=2)
    # Moving light sources make the city read as filmed motion rather than still architecture.
    for sign,color in [(-1,(255,195,125)),(1,(131,216,221))]:
        cx=tx+sign*42; cy=358+23*math.sin(t*.7+sign)
        for rad in [25,16,9]:
            d.ellipse((cx-rad,cy-rad,cx+rad,cy+rad), fill=(*color,8 if rad>16 else 25))
        d.ellipse((cx-5,cy-4,cx+5,cy+4),fill=(*color,250))
        d.polygon([(cx-3,cy+6),(cx+4,cy+6),(cx+19,529),(cx-19,529)],fill=(*color,20))
    # slow drifting unfocused lamps against dark facades
    for bx,by,br,k,phase in BOKEH:
        cx=bx+5*math.sin(.2*t+phase);cy=by+2*math.cos(.16*t+phase)
        tone=(240,142,99,28) if k%2 else (114,203,201,25)
        d.ellipse((cx-br,cy-br,cx+br,cy+br),fill=tone,outline=(*tone[:3],60))
    for rx,ry,v,length in RAINDROPS:
        y=(ry+v*t)%610-45; x=(rx-105*t+0.2*y)%1100-70
        d.line((x,y,x-5,y+length),fill=(186,217,216,int(50+35*math.sin(rx)*math.sin(rx))),width=1)
    # dimensional haze and crop-bar feeling
    overlay=Image.new('RGBA',(W,H),(0,0,0,0)); od=ImageDraw.Draw(overlay,'RGBA')
    od.rectangle((0,450,W,540),fill=(10,15,19,28))
    return finish(np.asarray(Image.alpha_composite(img.convert('RGBA'),overlay).convert('RGB')),t)

def ocean(t):
    # SUNDOWN / layered volumetric clouds, lively water with moving highlights.
    grad=base([35,51,80],[237,156,108])
    sky=np.clip((Y/298)**1.2,0,1)
    skyRGB=np.zeros_like(grad,dtype=np.float32)
    for i,(a,b) in enumerate(zip([42,61,92],[246,161,108])):
        skyRGB[:,:,i]=a*(1-sky)+b*sky
    sunx=660+16*math.sin(t*.16);suny=175+5*math.sin(t*.18)
    haze=np.exp(-((X-sunx)**2/(290*290)+(Y-suny)**2/(140*140))*1.5)
    skyRGB+=haze[:,:,None]*np.array([24,27,14],dtype=np.float32)
    img=Image.fromarray(np.uint8(np.clip(skyRGB,0,255)),'RGB');d=ImageDraw.Draw(img,'RGBA')
    # real-moving layered cloudy sky
    for layer in range(3):
        p=(layer+1)*.6
        for j in range(18):
            x=(j*173+layer*59+14*t*p)%1330-180
            y=50+layer*40+(j%5)*22+3*math.sin(j+t*.1)
            w=105+25*(j%3);h=5+(j%4)*2
            d.ellipse((x-w,y-h,x+w,y+h),fill=(255,217,173,8+layer*4))
    for r,a in [(80,8),(60,12),(45,18),(36,25)]:
        d.ellipse((sunx-r,suny-r,sunx+r,suny+r),fill=(255,230,165,a))
    d.ellipse((sunx-29,suny-29,sunx+29,suny+29),fill=(255,224,159,248))
    # turquoise water with perspective wave optics
    horizon=277
    yclip=np.maximum(Y-horizon,0)
    distortion=(np.sin(X*.029+Y*.093+t*2.4)+.54*np.sin(X*.072-Y*.047-t*3.5))
    shimmer=np.clip(np.cos((X-sunx + 44*np.sin(Y*.1+t*2.7)) / (13+1.2*yclip)*1.3),0,1)**12
    sea=np.zeros((H,W,3),dtype=np.float32)
    depth=np.minimum(1,yclip/(H-horizon))
    sea[:,:,0]=27+38*depth+13*distortion+100*haze*shimmer
    sea[:,:,1]=94+16*depth+8*distortion+75*haze*shimmer
    sea[:,:,2]=116-22*depth+8*distortion+55*haze*shimmer
    skyPixels=np.array(img)
    mask=Y>=horizon
    skyPixels[mask]=np.uint8(np.clip(sea,0,255))[mask]
    img=Image.fromarray(skyPixels,'RGB');d=ImageDraw.Draw(img,'RGBA')
    d.line((0,horizon,W,horizon),fill=(255,201,154,110),width=2)
    for j in range(120):
        yy=horizon+3+j*2.42
        z=(yy-horizon)/(H-horizon)
        xx=(j*197+74+30*math.sin(t*.8+j*.41))%1100-70
        lng=(12+z*100)*(0.5+0.5*math.sin(j*1.4+t*2.1))
        col=(255,208,153,20+int(85*z)) if abs(xx-sunx)<260 else (165,221,220,10+int(45*z))
        d.line((xx,yy,xx+lng,yy),fill=col,width=1 if z<.35 else 2)
    for k in range(4):
        x0=100+k*290+10*math.sin(.1*t+k); y0=250+k%2*4
        d.polygon([(x0,y0),(x0+46,y0-12),(x0+131,y0+2),(x0+89,y0+5)],fill=(41,61,72,75))
    return finish(np.array(img),t)

def liquid(t):
    # MACRO / light refracts through moving, interfering water ripples and particles.
    centers=[(250,210,.61),(675,330,.47),(445,120,.73),(790,140,.58)]
    phase=np.zeros((H,W),dtype=np.float32)
    for cx,cy,s in centers:
        rr=np.sqrt((X-cx)**2+(Y-cy)**2)
        phase+=np.exp(-rr/530)*np.sin(rr*.065-t*5.3*s)
    # directional caustics moving independently; sharp macro focus at center
    wave=1.2*np.sin(X*.009+Y*.012+t*1.2)+.6*np.sin(X*.021-Y*.032-t*1.0)
    speck=np.clip((np.sin(X*.064+phase*2.1+Y*.023+t*2)*np.sin(Y*.071-phase*2.8-t*1.7))**6,0,1)
    light=np.clip(.5+phase*.18+wave*.15,0,1)
    rgb=np.empty((H,W,3),dtype=np.float32)
    rgb[:,:,0]=17+31*light+105*speck
    rgb[:,:,1]=46+109*light+106*speck
    rgb[:,:,2]=65+121*light+89*speck
    beam=np.exp(-((X-680)**2/(430**2)+(Y-215)**2/(250**2)))
    rgb+=beam[:,:,None]*np.array([15,28,23],dtype=np.float32)
    img=Image.fromarray(np.uint8(np.clip(rgb*VIGNETTE[:,:,None],0,255)),'RGB')
    layer=Image.new('RGBA',(W,H),(0,0,0,0));d=ImageDraw.Draw(layer,'RGBA')
    # bright passing suspended droplets; droplet movement visibly changes frame
    for j in range(24):
        x=(j*111+33+17*math.sin(t*.32+j))%W
        y=(j*61+100-t*(9+(j%4)*7))%(H+90)-50
        r=1+(j%5)
        d.ellipse((x-r,y-r,x+r,y+r),fill=(225,250,230,30),outline=(234,255,244,60))
    for k in range(3):
        rr=40+((t*60+k*130)%420)
        cx,cy=centers[k][:2]
        if rr>10:
            d.ellipse((cx-rr,cy-rr,cx+rr,cy+rr),outline=(154,235,223,max(5,80-int(rr/7))),width=2)
    return finish(np.array(Image.alpha_composite(img.convert('RGBA'),layer).convert('RGB')),t)

def dunes(t):
    # GOLDEN HOUR / landscape with parallax ridge motion, wind-carried sand.
    rgb=base([63,51,83],[240,169,105])
    horizon=295
    yellow=np.exp(-((X-675)**2/(300**2)+(Y-220)**2/(220**2)))
    rgb=np.clip(rgb.astype(np.float32)+yellow[:,:,None]*np.array([22,21,7]),0,255).astype('uint8')
    img=Image.fromarray(rgb,'RGB');d=ImageDraw.Draw(img,'RGBA')
    sunx=685+10*math.sin(t*.12); suny=195
    for r in [90,75,60,48]:d.ellipse((sunx-r,suny-r,sunx+r,suny+r),fill=(255,199,117,6))
    d.ellipse((sunx-37,suny-37,sunx+37,suny+37),fill=(255,217,151,245))
    for j in range(13):
        x=(j*191+t*(9+j%3*3))%1200-160;y=63+(j%7)*24
        d.ellipse((x-80,y-4,x+80,y+4),fill=(255,223,194,12))
    # three parallax ridges undulate as camera tracks sideways
    def ridge(level,amp,phase,colour,drift):
        pts=[]
        for x in range(-10,W+20,8):
            p=x/W
            y=level+amp*math.sin(p*5+phase+t*drift)+.37*amp*math.sin(p*13+phase*.6+t*drift*.65)
            pts.append((x,y))
        d.polygon(pts+[(W,H+10),(-10,H+10)], fill=colour)
        d.line(pts, fill=(255,222,155,50),width=2)
    ridge(329,58,.8,(123,94,93,255),.10)
    ridge(390,70,2.8,(183,119,91,255),.16)
    ridge(473,89,1.3,(217,150,95,255),.27)
    # drifting sand flecks and grazing wind striations
    for j in range(140):
        yy=300+(j*37)%245
        xx=(j*307 + t*(20+3*(j%7)))%1100-70
        length=6+(j%4)*4
        d.line((xx,yy,xx+length,yy-1),fill=(252,213,160,24+(j%5)*6),width=1)
    return finish(np.array(img),t)

SCENES=[city,ocean,liquid,dunes]

def frame(t):
    n=min(3,int(t//8));local=t-n*8
    a=SCENES[n](t)
    if n<3 and local>=7.5:
        b=SCENES[n+1](t)
        f=(local-7.5)/.5
        return Image.blend(a,b,max(0,min(1,f)))
    return a

def audio():
    # Original quiet cinematic soundscape: synthesized drone and tonal swells; no borrowed music.
    sr=32000; n=sr*LENGTH; times=np.arange(n,dtype=np.float64)/sr
    out=np.zeros(n,dtype=np.float64)
    freqs=[82.41,110,130.81,98]
    for i,f in enumerate(freqs):
        center=i*8+4
        env=np.maximum(0,1-np.abs(times-center)/5)
        env*=env
        phase=2*np.pi*f*times
        out+=env*(.54*np.sin(phase)+.21*np.sin(phase*1.5)+.08*np.sin(phase*2.01))
    # soft, original rhythmic pulse on transitions
    for at in [0,8,16,24]:
        u=np.maximum(times-at,0)
        out+=.12*np.exp(-u*3)*np.sin(2*np.pi*59*u)*(times>=at)
    # Four differentiated but deliberately quiet location sound textures.
    noise=np.random.default_rng(1402).standard_normal(n)
    smooth=np.convolve(noise,np.ones(14)/14,mode='same')
    verysmooth=np.convolve(noise,np.ones(80)/80,mode='same')
    city_gate=np.clip((8-times)/.7,0,1)
    ocean_gate=np.clip((times-8)/.7,0,1)*np.clip((16-times)/.7,0,1)
    liquid_gate=np.clip((times-16)/.7,0,1)*np.clip((24-times)/.7,0,1)
    desert_gate=np.clip((times-24)/.7,0,1)
    # Rainfall hiss, breaking surf, tiny glassy tones and a desert breeze.
    texture=city_gate*(noise*.010+smooth*.018)
    texture+=ocean_gate*(smooth*.07+verysmooth*.12)*(.65+.35*np.sin(times*2.7))
    texture+=liquid_gate*(smooth*.04+noise*.003)
    texture+=desert_gate*(smooth*.045+verysmooth*.18)*(.75+.25*np.sin(times*1.1))
    for at in np.arange(16.4,24,1.65):
        delta=times-at
        pulse=np.where(delta>=0,np.exp(-np.maximum(delta,0)*11)*np.sin(2*np.pi*680*np.maximum(delta,0)),0)
        texture+=.022*pulse*liquid_gate
    env=np.minimum(1,np.maximum(0,times/1.4))*np.minimum(1,np.maximum(0,(LENGTH-times)/1.6))
    out=np.clip((out*.14+texture)*env,-.9,.9)
    stereo=np.column_stack((out,np.roll(out,180)*.9)).ravel()
    tmp=ROOT/'.cinematic-audio.wav'
    with wave.open(str(tmp),'wb') as f:
        f.setnchannels(2);f.setsampwidth(2);f.setframerate(sr);f.writeframes((stereo*32767).astype('<i2').tobytes())
    return tmp

def render():
    wav=audio()
    path=ROOT/'prism-cinematic.mp4';tmp=ROOT/'.cinematic-encoding.mp4'
    cmd=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24', '-s',f'{W}x{H}', '-r',str(FPS), '-i','pipe:0', '-i',str(wav), '-c:v','libx264','-threads','4','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','112k','-ar','32000','-movflags','+faststart','-t',str(LENGTH),str(tmp)]
    p=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    try:
        for i in range(FPS*LENGTH):
            still=frame(i/FPS)
            if i==12:still.save(ROOT/'prism-cinematic.jpg',quality=91)
            p.stdin.write(still.tobytes())
            if i%192==0:print(f'{i}/{FPS*LENGTH} frames',flush=True)
    finally:p.stdin.close()
    ret=p.wait();wav.unlink(missing_ok=True)
    if ret:raise RuntimeError(f'Encoder exited {ret}')
    tmp.replace(path)
    print('Rendered',path,path.stat().st_size,flush=True)

if __name__=='__main__':render()
