from PIL import Image, ImageDraw, ImageFilter, ImageFont
import numpy as np, math
from pathlib import Path
BASE=Path(__file__).parent
W,H=1280,720
try:
    sans='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    mono='/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
except: sans=mono=''

def poster(name, bright=False):
    yy,xx=np.mgrid[:H,:W].astype(np.float32)
    if bright:
        base=np.array([207,189,162]); edge=np.array([114,87,68]); glow=np.array([251,230,182]); px,py=840,340
    else:
        base=np.array([26,27,31]); edge=np.array([9,12,17]); glow=np.array([241,100,59]); px,py=835,338
    vign=np.clip(((xx-W*.54)**2/(W*1.06)**2 + (yy-H*.50)**2/(H*.92)**2),0,1)
    a=base[None,None,:]*(1-vign[:,:,None]) + edge[None,None,:]*vign[:,:,None]
    dist=np.sqrt(((xx-px)/350)**2+((yy-py)/290)**2)
    intensity=np.exp(-dist**2*1.9)[:,:,None]
    a=np.clip(a*(1-0.27*intensity)+glow*0.27*intensity,0,255)
    grain=np.random.default_rng(19).normal(0,1.9,(H,W,1))
    a=np.uint8(np.clip(a+grain,0,255))
    im=Image.fromarray(a,'RGB').convert('RGBA')
    layer=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(layer)
    if bright:
        # A folded ivory column with a soft umbra and cut-out circle
        d.ellipse((492,25,1114,650),fill=(68,45,42,110))
        layer=layer.filter(ImageFilter.GaussianBlur(51)); im=Image.alpha_composite(im,layer)
        layer=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(layer)
        d.polygon([(684,-110),(1028,-110),(937,796),(565,796)], fill=(240,218,176,255))
        d.polygon([(813,-110),(1017,-110),(913,796),(768,796)], fill=(203,160,123,255))
        d.polygon([(680,-110),(813,-110),(767,796),(560,796)], fill=(255,236,192,255))
        for i in range(1,13):
            x=650+i*21
            d.line([(x,34),(x-70,705)],fill=(255,250,224,15),width=2)
        # Singular dark aperture
        d.ellipse((684,208,960,484),fill=(59,44,39,255))
        d.arc((697,220,947,470),18,344,fill=(247,224,187,160),width=2)
    else:
        # A theatrical, floating mineral 'lens' rendered in concentric asymmetrical layers
        d.ellipse((525,92,1065,632),fill=(52,39,39,145))
        layer=layer.filter(ImageFilter.GaussianBlur(37)); im=Image.alpha_composite(im,layer)
        layer=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(layer)
        for i in range(24):
            t=i/23; ox=(1-t)*100; oy=(1-t)*72
            rect=(int(586+ox),int(145+oy),int(1050-ox),int(610-oy))
            c=(int(88+135*t),int(48+58*t),int(49+27*t),255)
            d.ellipse(rect,fill=c)
        d.ellipse((665,221,973,533),fill=(18,21,27,255))
        for i in range(10):
            off=i*11; d.arc((630+off,182+off,1009-off,570-off),212,345,fill=(252,168,108,max(30,145-i*10)),width=2)
        d.polygon([(770,180),(963,242),(1010,485),(826,546)],fill=(255,225,160,16))
    im=Image.alpha_composite(im,layer)
    d=ImageDraw.Draw(im)
    light=(255,241,217,210) if not bright else (45,44,41,210)
    faint=(255,241,217,90) if not bright else (45,44,41,90)
    d.line((75,68,140,68),fill=light,width=2)
    d.line((75,68,75,122),fill=light,width=2)
    d.text((80,142), 'STUDY  /  0'+('2' if bright else '1'),font=ImageFont.truetype(mono,16),fill=light)
    d.text((80,600), 'THE ARCHIVE OF LIGHT',font=ImageFont.truetype(mono,14),fill=light)
    d.text((80,630), 'PRISM   •   ORIGINAL MOTION STUDIES',font=ImageFont.truetype(mono,11),fill=faint)
    d.line((79,587,220,587),fill=faint,width=1)
    d.text((1117,75),'0'+('2' if bright else '1')+'  /  02',font=ImageFont.truetype(mono,15),fill=light)
    if bright:
        d.text((80,250),'DAY',font=ImageFont.truetype(sans,62),fill=(49,39,35,242))
        d.text((80,318),'BREAK',font=ImageFont.truetype(sans,62),fill=(49,39,35,242))
    else:
        d.text((80,250),'AFTER',font=ImageFont.truetype(sans,62),fill=(240,226,208,230))
        d.text((80,318),'DARK',font=ImageFont.truetype(sans,62),fill=(240,226,208,230))
    im.convert('RGB').save(BASE/(name+'.jpg'),quality=90,optimize=True)

poster('after-dark'); poster('daybreak',True)
