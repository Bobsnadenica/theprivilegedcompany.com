"""Render an eight-second illustrated brand promo locally. No diffusion per frame."""
from pathlib import Path
import math, subprocess, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
W,H,FPS,DURATION = 1080,1920,30,8
# Work at 720 logical pixels with 1.5x output resolution.
S=1.5
INK='#181916'; IVORY='#f5f0e8'; COPPER='#dc6636'; MUTED='#b5afa6'
FONT='/System/Library/Fonts/Supplemental/'
def font(n,bold=False,serif=False):
    return ImageFont.truetype(FONT+('Georgia.ttf' if serif else 'Arial Bold.ttf' if bold else 'Arial.ttf'),round(n*S))
F={n:font(n) for n in (13,15,18,20,22,24,28)}
B={n:font(n,True) for n in (15,18,20,24,28,36,54,64,76,86)}
SER=font(106,serif=True)
char=Image.open(ROOT/'presenter.png').convert('RGBA')
def ease(x):
    x=max(0,min(1,x)); return 1-(1-x)**3
def smooth(x):
    x=max(0,min(1,x));return x*x*(3-2*x)
def rr(d,box,r,fill,outline=None,width=1):
    d.rounded_rectangle(tuple(round(v*S) for v in box),round(r*S),fill=fill,outline=outline,width=round(width*S))
def line(d,pts,fill,width=1): d.line([(round(x*S),round(y*S)) for x,y in pts],fill=fill,width=round(width*S))
def ellipse(d,box,fill=None,outline=None,width=1):d.ellipse(tuple(round(v*S) for v in box),fill=fill,outline=outline,width=round(width*S))
def txt(d,xy,text,f,fill=IVORY,anchor=None): d.text((round(xy[0]*S),round(xy[1]*S)),text,font=f,fill=fill,anchor=anchor)
def paste(im,layer,x=0,y=0,alpha=1):
    if alpha<1: layer=layer.copy();layer.putalpha(layer.getchannel('A').point(lambda a:round(a*max(0,alpha))))
    im.alpha_composite(layer,(round(x*S),round(y*S)))
def layer(): return Image.new('RGBA',(W,H),(0,0,0,0))
def brand(d,color=IVORY):
    txt(d,(48,54),'THE PRIVILEGED',B[18],color)
    txt(d,(48,78),'COMPANY',B[18],color)
    rr(d,(614,53,672,98),22,COPPER)
    line(d,[(633,82),(652,64)],IVORY,2);line(d,[(640,64),(652,64),(652,76)],IVORY,2)
def browser(t):
    l=Image.new('RGBA',(round(363*S),round(208*S)),(0,0,0,0));d=ImageDraw.Draw(l)
    rr(d,(2,2,360,205),18,IVORY)
    for i,c in enumerate((COPPER,'#d5c9b7','#b2bfa6')):ellipse(d,(18+15*i,17,25+15*i,24),c)
    line(d,[(16,37),(345,37)],'#ded7cc')
    txt(d,(23,57),'Your next big thing.',B[24],INK)
    rr(d,(23,103,195,111),4,'#c6bfb4');rr(d,(23,122,162,130),4,'#ded7cc')
    rr(d,(23,153,149,185),16,COPPER);txt(d,(42,161),'Let’s build',B[15],IVORY)
    for i in range(3):rr(d,(238+i*30,172-(35+24*i)*smooth((t-2.5)/1.2),257+i*30,174),6,['#dac1a2','#ce936e',COPPER][i])
    return l
def app_card(t):
    l=Image.new('RGBA',(round(318*S),round(116*S)),(0,0,0,0));d=ImageDraw.Draw(l)
    rr(d,(2,2,315,113),20,'#383c32',outline='#5c6352')
    rr(d,(19,18,79,96),12,'#e8e4cf');rr(d,(39,24,58,28),2,INK)
    for j in range(2):
        for i in range(2):rr(d,(29+i*22,40+j*22,44+i*22,55+j*22),4,[COPPER,'#9fa98a'][i])
    txt(d,(101,28),'Apps',B[28]);txt(d,(101,67),'Built around you.',F[18],'#c8cbbd')
    return l
def auto_card(t):
    l=Image.new('RGBA',(round(357*S),round(119*S)),(0,0,0,0));d=ImageDraw.Draw(l)
    rr(d,(2,2,354,116),20,'#b6522f')
    for x in (28,58,88):ellipse(d,(x,38,x+13,51),IVORY)
    line(d,[(36,44),(94,44)],IVORY,2)
    px=34+58*((t-3.2)*.7%1);ellipse(d,(px-4,40,px+4,48),'#ffcd88')
    txt(d,(26,73),'LESS BUSYWORK.',B[15]);txt(d,(124,34),'Automation',B[24]);
    return l
def scene(t):
    im=Image.new('RGBA',(W,H),INK);d=ImageDraw.Draw(im)
    # Animated orbital rings and subtle editorial grid.
    for x in range(48,721,78):line(d,[(x,140),(x,1150)],'#22241f')
    for y in range(156,1151,78):line(d,[(32,y),(688,y)],'#22241f')
    for r in (235,300,370):
        cx=520+18*math.sin(t*.45);cy=743+12*math.cos(t*.55)
        ellipse(d,(cx-r,cy-r,cx+r,cy+r),outline='#494338')
    a=t*.7;cx=520+300*math.cos(a);cy=743+300*math.sin(a)
    ellipse(d,(cx-7,cy-7,cx+7,cy+7),COPPER)
    brand(d)
    txt(d,(48,1206),'theprivilegedcompany.com',F[20],MUTED)
    txt(d,(672,1206),'01 / IDEAS TO REALITY',F[13],MUTED,anchor='ra')
    # Presenter entrance and subtle floating movement: artwork stays sharp.
    enter=ease(t/.8);shift=smooth((t-1.9)/.55)
    height=880-100*shift
    chw=round(height*char.width/char.height*S);chh=round(height*S)
    c=char.resize((chw,chh),Image.Resampling.LANCZOS)
    paste(im,c,184+35*shift+(1-enter)*150,326+56*shift+8*math.sin(t*1.7),enter)
    d=ImageDraw.Draw(im)
    intro=1-smooth((t-1.85)/.4)
    if intro>0:
        l=layer();q=ImageDraw.Draw(l);dy=(1-ease(t/.7))*32
        txt(q,(48,185+dy),'BIG IDEAS',B[76]);txt(q,(48,268+dy),'start here.',font(70,serif=True),COPPER)
        txt(q,(51,374+dy),'You imagine it. We build it.',F[22],MUTED)
        paste(im,l,alpha=intro*ease(t/.25))
    reveal=ease((t-2.05)/.5)
    if reveal:
        l=layer();q=ImageDraw.Draw(l)
        txt(q,(48,185),'MAKE IT',B[64]);txt(q,(48,255),'happen.',font(80,serif=True),COPPER)
        txt(q,(48,381),'WEB  /  APPS  /  AUTOMATION',B[15],MUTED)
        paste(im,l,0,(1-reveal)*24,reveal)
        for asset,start,x,y in ((browser(t),2.25,44,465),(app_card(t),2.72,66,706),(auto_card(t),3.13,44,854)):
            e=ease((t-start)/.55);paste(im,asset,x-420*(1-e),y+5*math.sin(t*1.6+start),e)
        # Tiny animated sparkle beside the presenter.
        if t>3.3:
            d=ImageDraw.Draw(im);sz=10+3*math.sin(t*4)
            line(d,[(648-sz,440),(648+sz,440)],COPPER,2);line(d,[(648,440-sz),(648,440+sz)],COPPER,2)
    # A full-frame copper/ivory wipe creates a proper third scene.
    if t>=5.4:
        e=ease((t-5.4)/.5);w=layer();q=ImageDraw.Draw(w)
        rr(q,(-20,1280*(1-e),740,1300),0,COPPER);paste(im,w)
    if t>=5.62:
        e=ease((t-5.62)/.55);w=layer();q=ImageDraw.Draw(w)
        rr(q,(-20,1280*(1-e),740,1300),0,IVORY);paste(im,w)
    if t>5.82:
        e=ease((t-5.82)/.48);l=layer();q=ImageDraw.Draw(l);brand(q,INK)
        txt(q,(48,278),'FROM YOUR FIRST IDEA.',B[18],'#76695d')
        txt(q,(42,357),'Build',SER,INK);txt(q,(42,481),'Anything.',SER,COPPER)
        line(q,[(48,648),(672,648)],'#c6b7a4')
        txt(q,(48,689),'Websites. Apps. Automation.',F[28],INK)
        # Flow diagram keeps motion in the ending, without distracting from CTA.
        for i,(x,label) in enumerate(((93,'IDEA'),(315,'BUILD'),(559,'LAUNCH'))):
            ellipse(q,(x-22,824,x+22,868),COPPER if i<=int((t-6)*2.2) else '#dccdbb')
            txt(q,(x,891),label,B[15],INK,anchor='ma')
        line(q,[(122,846),(285,846)],'#c6b7a4',2);line(q,[(345,846),(528,846)],'#c6b7a4',2)
        rr(q,(48,1027,672,1111),42,INK)
        txt(q,(78,1056),'LET’S BUILD YOURS',B[24],IVORY)
        line(q,[(603,1080),(624,1059)],COPPER,3);line(q,[(604,1059),(624,1059),(624,1079)],COPPER,3)
        txt(q,(48,1196),'theprivilegedcompany.com',F[24],INK)
        paste(im,l,0,(1-e)*22,e)
    return im.convert('RGB')

def music():
    sr=48000;a=np.zeros(sr*DURATION,dtype=np.float32)
    # Original restrained plucked major-ninth sound bed.
    for i,freq in enumerate((220,329.628,440,554.365,659.255,554.365,440,329.628,220,329.628,440,659.255,554.365)):
        start=int((.12+i*.54)*sr);n=min(int(1.5*sr),len(a)-start)
        t=np.arange(n)/sr
        env=(1-np.exp(-t*50))*np.exp(-t*4)
        a[start:start+n]+=.025*env*(np.sin(2*np.pi*freq*t)+.2*np.sin(4*np.pi*freq*t))
    a*=np.minimum(1,np.arange(len(a))/sr/.1)*np.minimum(1,(len(a)-np.arange(len(a)))/sr/.6)
    with wave.open(str(ROOT/'music.wav'),'wb') as out:
        out.setnchannels(1);out.setsampwidth(2);out.setframerate(sr);out.writeframes((a*32767).astype('<i2').tobytes())

if __name__=='__main__':
    import sys
    if '--preview' in sys.argv:
        thumbs=[]
        for t in (.9,2.8,4.5,7.2):
            frame=scene(t);frame.save(ROOT/f'frame-{t}.jpg');thumbs.append(frame.resize((270,480)))
        sheet=Image.new('RGB',(1080,480));
        for i,f in enumerate(thumbs):sheet.paste(f,(i*270,0))
        sheet.save(ROOT/'storyboard.jpg');sys.exit()
    music()
    cmd=['/opt/homebrew/bin/ffmpeg','-y','-loglevel','error','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p',str(ROOT/'animation-silent.mp4')]
    p=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    for i in range(FPS*DURATION):
        p.stdin.write(scene(i/FPS).tobytes())
        if i%60==0:print(f'Rendered {i}/{FPS*DURATION} frames',flush=True)
    p.stdin.close();assert p.wait()==0
    subprocess.run(['/opt/homebrew/bin/ffmpeg','-y','-loglevel','error','-i',str(ROOT/'animation-silent.mp4'),'-i',str(ROOT/'narration.aiff'),'-i',str(ROOT/'music.wav'),'-filter_complex','[1:a]adelay=240|240,apad,volume=1.3[v];[2:a]volume=0.6[m];[v][m]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.95[a]','-map','0:v:0','-map','[a]','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-t','8','-movflags','+faststart',str(ROOT/'the-privileged-company-animated-8s.mp4')],check=True)
    print('Finished animated promo.',flush=True)
