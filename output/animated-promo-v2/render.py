"""Two 16-second localized revisions using the approved illustrated artwork."""
from pathlib import Path
import importlib.util, json, subprocess, sys, wave
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parent
SPEC=importlib.util.spec_from_file_location('original',ROOT.parent/'animated-promo'/'render.py')
art=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(art)
DURATION=16;FPS=30
FF='/opt/homebrew/bin/ffmpeg'
LANG=sys.argv[1] if len(sys.argv)>1 else 'en'
assert LANG in ('en','bg')
OUT=ROOT/LANG;OUT.mkdir(exist_ok=True)
BG={
 'BIG IDEAS':('ГОЛЕМИ ИДЕИ',624),
 'start here.':('започват тук.',624),
 'You imagine it. We build it.':('Твоите идеи оживяват.',324),
 'MAKE IT':('ПРЕВЪРНИ ИДЕЯТА',624),
 'happen.':('в реалност.',624),
 'WEB  /  APPS  /  AUTOMATION':('САЙТОВЕ  /  ПРИЛОЖЕНИЯ  /  АВТОМАТИЗАЦИИ',624),
 'Your next big thing.':('Твоята следваща идея.',316),
 'Let’s build':('Да започнем',106),
 'Apps':('Приложения',197),
 'Built around you.':('Създадени за теб.',197),
 'LESS BUSYWORK.':('ПО-МАЛКО РУТИНА.',300),
 'Automation':('Автоматизация',211),
 '01 / IDEAS TO REALITY':('01 / ОТ ИДЕЯ ДО РЕАЛНОСТ',230),
 'FROM YOUR FIRST IDEA.':('ОТ ПЪРВАТА ТИ ИДЕЯ.',624),
 'Build':('Създай',624),
 'Anything.':('Всичко.',624),
 'Websites. Apps. Automation.':('Сайтове. Приложения. Автоматизации.',624),
 'IDEA':('ИДЕЯ',140), 'BUILD':('РАЗРАБОТКА',180), 'LAUNCH':('СТАРТ',140),
 'LET’S BUILD YOURS':('ДА СЪЗДАДЕМ ТВОЯТА ИДЕЯ',508),
}
original_txt=art.txt
def localized(d,xy,text,f,fill=art.IVORY,anchor=None):
    if LANG=='bg' and text in BG:
        text,width=BG[text]
        while d.textlength(text,font=f)>width*art.S:
            f=f.font_variant(size=f.size-1)
    original_txt(d,xy,text,f,fill,anchor)
art.txt=localized

def scene(t):
    # Re-render all movement at 30fps over a longer timeline, without repeating frames.
    return art.scene(t/2)

def music():
    sr=48000;a=np.zeros(sr*DURATION,dtype=np.float32)
    notes=(220,329.628,440,554.365,659.255,554.365,440,329.628)
    for i in range(22):
        start=int((.2+i*.68)*sr);n=min(int(1.7*sr),len(a)-start)
        t=np.arange(n)/sr;env=(1-np.exp(-t*35))*np.exp(-t*3.5)
        a[start:start+n]+=.018*env*(np.sin(2*np.pi*notes[i%8]*t)+.12*np.sin(4*np.pi*notes[i%8]*t))
    a*=np.minimum(1,np.arange(len(a))/sr/.2)*np.minimum(1,(len(a)-np.arange(len(a)))/sr/.9)
    with wave.open(str(ROOT/'music.wav'),'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(sr);w.writeframes((a*32767).astype('<i2').tobytes())

def mix():
    delays=(650,4450,12000)
    args=[]
    for i in range(3):args+=['-i',str(OUT/f'voice-{i+1}.aiff')]
    filters=[]
    for i,delay in enumerate(delays):
        filters.append(f'[{i}:a]highpass=f=75,equalizer=f=3200:t=q:w=0.8:g=-3.5,lowpass=f=8500,afade=t=in:d=0.035,adelay={delay}|{delay}[v{i}]')
    filters.append('[v0][v1][v2]amix=inputs=3:normalize=0:duration=longest,loudnorm=I=-18:TP=-2:LRA=9,apad,atrim=duration=16[voice]')
    subprocess.run([FF,'-y','-loglevel','error',*args,'-filter_complex',';'.join(filters),'-map','[voice]','-ar','48000','-c:a','pcm_s16le',str(OUT/'narration-soft.wav')],check=True)
    subprocess.run([FF,'-y','-loglevel','error','-i',str(OUT/'animation-silent.mp4'),'-i',str(OUT/'narration-soft.wav'),'-i',str(ROOT/'music.wav'),'-filter_complex','[2:a]volume=0.65[m];[1:a][m]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.89[a]','-map','0:v:0','-map','[a]','-metadata:s:a:0','language='+('eng' if LANG=='en' else 'bul'),'-metadata','title=The Privileged Company — '+('English' if LANG=='en' else 'Български'),'-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-t','16','-movflags','+faststart',str(OUT/f'the-privileged-company-{LANG}-16s.mp4')],check=True)

if __name__=='__main__':
    if '--preview' in sys.argv:
        sheet=Image.new('RGB',(1080,480))
        for i,t in enumerate((1.8,5.6,9.,14.4)):
            f=scene(t);f.save(OUT/f'frame-{t}.jpg');sheet.paste(f.resize((270,480)),(i*270,0))
        sheet.save(OUT/'storyboard.jpg');sys.exit()
    music()
    p=subprocess.Popen([FF,'-y','-loglevel','error','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s',f'{art.W}x{art.H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p',str(OUT/'animation-silent.mp4')],stdin=subprocess.PIPE)
    for i in range(FPS*DURATION):
        p.stdin.write(scene(i/FPS).tobytes())
        if i%120==0:print(f'{LANG}: {i}/{FPS*DURATION} frames',flush=True)
    p.stdin.close();assert p.wait()==0
    mix();print(f'{LANG}: finished',flush=True)
