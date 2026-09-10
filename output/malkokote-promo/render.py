"""Sixteen-second Bulgarian fashion-modeling brand animation."""
from pathlib import Path
import math, subprocess, sys, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parent
W,H,S,FPS,DUR=1080,1920,1.5,30,16
FF='/opt/homebrew/bin/ffmpeg'
INK='#211d22';PINK='#ecd5d4';ROSE='#ad7279';CREAM='#fcf4e9';GOLD='#bda07b'
FONT='/System/Library/Fonts/Supplemental/'
def font(size,bold=False,serif=False):return ImageFont.truetype(FONT+('Georgia.ttf' if serif else 'Arial Bold.ttf' if bold else 'Arial.ttf'),round(size*S))
def text(d,x,y,s,size=24,fill=INK,bold=False,serif=False,anchor=None,width=None):
    f=font(size,bold,serif)
    while width and d.textlength(s,font=f)>width*S:f=f.font_variant(size=f.size-1)
    d.text((round(x*S),round(y*S)),s,font=f,fill=fill,anchor=anchor)
def line(d,points,fill=GOLD,w=1):d.line([(round(x*S),round(y*S)) for x,y in points],fill=fill,width=round(w*S))
def ell(d,b,fill=None,outline=None,w=1):d.ellipse(tuple(round(v*S) for v in b),fill=fill,outline=outline,width=round(w*S))
def rect(d,b,fill,r=0,outline=None,w=1):d.rounded_rectangle(tuple(round(v*S) for v in b),round(r*S),fill=fill,outline=outline,width=round(w*S))
def ease(x):x=max(0,min(x,1));return 1-(1-x)**3
def smooth(x):x=max(0,min(x,1));return x*x*(3-2*x)
def layer():return Image.new('RGBA',(W,H),(0,0,0,0))
def put(im,l,x=0,y=0,a=1):
    if a<1:l=l.copy();l.putalpha(l.getchannel('A').point(lambda v:round(v*max(a,0))))
    im.alpha_composite(l,(round(x*S),round(y*S)))
model=Image.open(ROOT/'model.png').convert('RGBA')
# Subtle stationary paper color variation avoids a sterile flat backdrop.
yy,xx=np.mgrid[0:H,0:W]
g=np.exp(-(((xx-W*.56)/(W*.9))**2+((yy-H*.5)/(H*.7))**2))
bg=np.empty((H,W,3),dtype=np.uint8)
for i,(a,b) in enumerate(zip((228,199,203),(252,242,231))):bg[:,:,i]=a+(b-a)*g
paper=Image.fromarray(bg).convert('RGBA')
def cat(d,x,y,size=1,color=INK):
    # A simple new decorative mark, not a reproduction of an existing logo.
    pts=[(-28,8),(-27,-31),(-9,-16),(9,-16),(27,-31),(28,8)]
    line(d,[(x+px*size,y+py*size) for px,py in pts],color,2)
    line(d,[(x-27*size,y+8*size),(x-15*size,y+23*size),(x,y+28*size),(x+15*size,y+23*size),(x+27*size,y+8*size)],color,2)
    for sign in (-1,1):line(d,[(x+sign*7*size,y+4*size),(x+sign*17*size,y+1*size)],color,2)
def brand(d,color=INK):
    cat(d,68,75,.55,color)
    text(d,101,58,'malkokote',29,color,serif=True)
    rect(d,(593,52,671,87),None,17,color)
    text(d,632,61,'18+',16,color,True,anchor='ma')
def spark(d,x,y,r,color=GOLD):
    line(d,[(x-r,y),(x+r,y)],color,1.5);line(d,[(x,y-r),(x,y+r)],color,1.5)
def scene(t):
    im=paper.copy();d=ImageDraw.Draw(im)
    for i in range(3):
        r=255+55*i;x=380+13*math.sin(t*.3+i);y=730
        ell(d,(x-r,y-r,x+r,y+r),outline='#d4b9b9')
    for i,(x,y) in enumerate(((94,403),(616,341),(104,1038),(638,950))):spark(d,x,y,7+2*math.sin(t*2+i),ROSE)
    brand(d)
    text(d,48,1215,'МОДЕЛИ 18+',16,ROSE,True)
    text(d,672,1215,'СТИЛ С ХАРАКТЕР',16,ROSE,anchor='ra')
    shift=smooth((t-4)/1.1);entry=ease(t/1.1)
    height=815+105*shift
    scaled=model.resize((round(height*model.width/model.height*S),round(height*S)),Image.Resampling.LANCZOS)
    put(im,scaled,88+153*shift+80*(1-entry),345-130*shift+5*math.sin(t*1.3),entry)
    intro=1-smooth((t-3.65)/.65)
    if intro>0:
        l=layer();q=ImageDraw.Draw(l)
        text(q,48,159,'Малко коте.',67,INK,serif=True,width=624)
        text(q,48,247,'Голямо присъствие.',41,ROSE,serif=True,width=624)
        put(im,l,0,24*(1-entry),intro*entry)
    feature=ease((t-4.25)/.6)
    if feature:
        l=layer();q=ImageDraw.Draw(l)
        text(q,48,168,'БЪДИ',46,INK,True)
        text(q,48,220,'незабравима.',54,ROSE,serif=True,width=624)
        for j,(label,sub) in enumerate((('Стил.','Твоят почерк.'),('Увереност.','Твоето присъствие.'),('Характер.','Твоята индивидуалност.'))):
            e=ease((t-4.75-j*1.15)/.6)
            if e:
                card=layer();c=ImageDraw.Draw(card);y=464+j*173
                text(c,48,y,f'0{j+1}',13,ROSE,True)
                text(c,48,y+27,label,38,INK,serif=True,width=291)
                text(c,49,y+82,sub,17,ROSE,width=286)
                line(c,[(48,y+117),(314,y+117)],'#c8a3a7')
                put(l,card,-70*(1-e),0,e)
        put(im,l,0,0,feature)
    # Sweeping dark end card, held long enough for the spoken call to action.
    if t>=10.5:
        e=ease((t-10.5)/.85);l=layer();q=ImageDraw.Draw(l)
        rect(q,(-10,1280*(1-e),730,1290),INK)
        put(im,l)
    if t>=11:
        e=ease((t-11)/.8);l=layer();q=ImageDraw.Draw(l);brand(q,PINK)
        cat(q,360,328,1.65,GOLD)
        text(q,360,464,'малко',91,PINK,serif=True,anchor='ma')
        text(q,360,572,'коте',111,PINK,serif=True,anchor='ma')
        text(q,360,746,'ГОЛЯМО ПРИСЪСТВИЕ.',20,GOLD,True,anchor='ma')
        line(q,[(108,832),(612,832)],'#51424a')
        text(q,360,877,'Модели 18+ • Стил с характер',24,PINK,anchor='ma',width=624)
        rect(q,(78,1011,642,1097),PINK,43)
        text(q,360,1040,'ОТКРИЙ МАЛКО КОТЕ',23,INK,True,anchor='ma')
        address=(ROOT/'website.txt').read_text().strip() if (ROOT/'website.txt').exists() else 'malkokote'
        text(q,360,1184,address,25,GOLD,serif=address=='malkokote',anchor='ma',width=624)
        for i in range(5):
            angle=t*.22+i*math.tau/5;spark(q,360+240*math.cos(angle),332+122*math.sin(angle),4,GOLD)
        put(im,l,0,18*(1-e),e)
    return im.convert('RGB')
def music():
    sr=48000;a=np.zeros(sr*DUR,dtype=np.float32)
    notes=(220,261.626,329.628,493.883,440,329.628,261.626,329.628)
    for i in range(20):
        start=int((.3+i*.75)*sr);n=min(int(2*sr),len(a)-start);t=np.arange(n)/sr
        env=(1-np.exp(-t*20))*np.exp(-t*2.8)
        a[start:start+n]+=.012*env*(np.sin(2*np.pi*notes[i%8]*t)+.15*np.sin(4*np.pi*notes[i%8]*t))
    a*=np.minimum(1,(len(a)-np.arange(len(a)))/sr/.8)
    with wave.open(str(ROOT/'music.wav'),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(sr);w.writeframes((a*32767).astype('<i2').tobytes())
def mix():
    args=[]
    for i in range(3):args+=['-i',str(ROOT/f'voice-{i}.aiff')]
    filters=[]
    for i,delay in enumerate((700,4600,10900)):
        filters.append(f'[{i}:a]highpass=f=75,equalizer=f=3200:t=q:w=0.8:g=-3.5,lowpass=f=8500,afade=t=in:d=0.03,adelay={delay}|{delay}[v{i}]')
    filters.append('[v0][v1][v2]amix=inputs=3:normalize=0,loudnorm=I=-18:TP=-2:LRA=9,apad,atrim=duration=16[v]')
    subprocess.run([FF,'-y','-loglevel','error',*args,'-filter_complex',';'.join(filters),'-map','[v]','-ar','48000',str(ROOT/'narration-soft.wav')],check=True)
    subprocess.run([FF,'-y','-loglevel','error','-i',str(ROOT/'silent.mp4'),'-i',str(ROOT/'narration-soft.wav'),'-i',str(ROOT/'music.wav'),'-filter_complex','[1:a][2:a]amix=inputs=2:normalize=0,alimiter=limit=0.89[a]','-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-b:a','192k','-t','16','-metadata:s:a:0','language=bul','-metadata','title=Малко коте — Голямо присъствие','-movflags','+faststart',str(ROOT/'malkokote-animated-bg-16s.mp4')],check=True)
if __name__=='__main__':
    if '--preview' in sys.argv:
        sheet=Image.new('RGB',(1080,480))
        for i,t in enumerate((2,6,9,14)):
            f=scene(t);f.save(ROOT/f'frame-{t}.jpg');sheet.paste(f.resize((270,480)),(i*270,0))
        sheet.save(ROOT/'storyboard.jpg');sys.exit()
    music()
    p=subprocess.Popen([FF,'-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p',str(ROOT/'silent.mp4')],stdin=subprocess.PIPE)
    for i in range(FPS*DUR):
        p.stdin.write(scene(i/FPS).tobytes())
        if i%120==0:print(f'{i}/{FPS*DUR} frames',flush=True)
    p.stdin.close();assert p.wait()==0;mix();print('Finished.',flush=True)
