from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
out=Path(__file__).parent
W,H=720,1280
im=Image.new('RGBA',(W,H),(0,0,0,0));d=ImageDraw.Draw(im)
for y in range(H):
 a=0
 if y<280:a=int(140*(1-y/280))
 if y>930:a=max(a,int(210*((y-930)/350)))
 if a:d.line((0,y,W,y),fill=(8,8,9,a))
def font(n,bold=False):return ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial'+(' Bold' if bold else '')+'.ttf',n)
def text(y,s,size,color=(245,238,224,255),bold=False):
 f=font(size,bold);bb=d.textbbox((0,0),s,font=f);d.text(((W-(bb[2]-bb[0]))/2,y),s,font=f,fill=color,stroke_width=0)
copper=(222,167,100,255)
text(72,'THE PRIVILEGED',36,bold=True)
text(115,'COMPANY',52,bold=True)
d.line((302,193,418,193),fill=copper,width=3)
text(995,'YOUR NEXT IDEA. BUILT.',34,bold=True)
text(1049,'Websites  /  Apps  /  Automation',23)
text(1140,'theprivilegedcompany.com',29,copper,bold=True)
im.save(out/'titles.png')
