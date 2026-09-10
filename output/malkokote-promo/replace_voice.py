"""Replace Daria with Kalina speech and hold the end card for two more seconds."""
from pathlib import Path
import subprocess,json
R=Path(__file__).resolve().parent
FF='/opt/homebrew/bin/ffmpeg'
args=[]
for i in range(3):args+=['-i',str(R/f'kalina-{i}.mp3')]
filters=[]
for i,delay in enumerate((300,5200,11200)):
    filters.append(f'[{i}:a]aresample=48000,asetpts=N/SR/TB,highpass=f=65,adelay={delay}|{delay}[v{i}]')
filters.append('[v0][v1][v2]amix=inputs=3:normalize=0:duration=longest,loudnorm=I=-18:TP=-2.5:LRA=9,aresample=48000,asetpts=N/SR/TB,apad=whole_len=864000,atrim=end_sample=864000[v]')
subprocess.run([FF,'-y','-loglevel','error',*args,'-filter_complex',';'.join(filters),'-map','[v]','-ar','48000','-t','18',str(R/'narration-kalina.wav')],check=True,timeout=40)
subprocess.run([FF,'-y','-loglevel','error','-i',str(R/'malkokote-animated-bg-16s.mp4'),'-i',str(R/'narration-kalina.wav'),'-i',str(R/'music.wav'),'-filter_complex','[0:v]tpad=stop_mode=clone:stop_duration=2[vid];[1:a][2:a]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.75:level=false[a]','-map','[vid]','-map','[a]','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-t','18','-metadata:s:a:0','language=bul','-metadata','title=Малко коте — Kalina neural voice','-movflags','+faststart',str(R/'malkokote-neural-voice-bg-18s.mp4')],check=True)
(R/'neural-voice-settings.json').write_text(json.dumps({'service':'Microsoft Edge online text-to-speech','voice':'bg-BG-KalinaNeural','client':'edge-tts 7.2.8','rate':'-8%','pitch':'-2Hz','speech_target_lufs':-18,'phrase_starts_seconds':[.3,5.2,11.2],'script':'narration.json','original_video_preserved':True,'duration_seconds':18},ensure_ascii=False,indent=2))
print('Created neural voice version.',flush=True)
