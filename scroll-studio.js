import {createField} from './studio-field.js?v=mesh2';
const clamp = (x,min,max) => Math.max(min,Math.min(max,x));
const sheetFrames=12, lastFrame=143;

// The final chapter gets its own stopping point before the pinned stage releases.
export function exitBlend(distance, height) {
    const fraction = clamp(distance / Math.max(1, height * .72), 0, 1);
    return fraction * fraction * (3 - 2 * fraction);
}

// Pairs straddling a sheet boundary use the same interpolation as adjacent frames on one sheet.
export function sampledFrames(progress) {
    const position=clamp(progress/3,0,1)*lastFrame;
    const left=Math.floor(position);
    return {left,right:Math.min(lastFrame,left+1),blend:position-left};
}
function framePlayer(canvas,refresh) {
    const ctx=canvas.getContext('2d');
    if(!ctx) return null;
    const cache=new Map();
    function sheet(format,index) {
        const url='/assets/field/'+format+'-'+index+'.webp';
        if(!cache.has(url)) {
            const image=new Image();
            image.onload=refresh;image.src=url;cache.set(url,image);
            if(cache.size>4)cache.delete(cache.keys().next().value);
        }
        return cache.get(url);
    }
    return progress=>{
        const format=canvas.width<canvas.height?'tall':'wide';
        const {left,right,blend}=sampledFrames(progress);
        function draw(frame,alpha){
            const img=sheet(format,Math.floor(frame/sheetFrames));
            if(!img.complete || !img.naturalWidth)return false;
            const w=img.naturalWidth/4,h=img.naturalHeight/3,slot=frame%sheetFrames;
            const scale=Math.max(canvas.width/w,canvas.height/h);
            ctx.globalAlpha=alpha;
            ctx.drawImage(img,slot%4*w,Math.floor(slot/4)*h,w,h,(canvas.width-w*scale)/2,(canvas.height-h*scale)/2,w*scale,h*scale);
            return true;
        }
        const ready=draw(left,1);
        if(blend)draw(right,ready?blend:1);
        if(left%12>=8 && left<132)sheet(format,Math.floor(left/12)+1);
        ctx.globalAlpha=1;
    };
}

export function initScrollStudio() {
    const tour=document.getElementById('mesh-tour');
    if(!tour)return;
    const stage=tour.querySelector('.mesh-stage'), surface=tour.querySelector('.mesh-surface');
    const scenes=[...tour.querySelectorAll('.mesh-scene')],controls=tour.querySelector('.mesh-controls');
    const buttons=[...controls.querySelectorAll('.mesh-index button')];
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    let canvas,draw,live=false,visible=false,pending=0,previous=0,elapsed=0,progress=0,target=0,dirty=true,hasDrawn=false;
    let x=0,y=0,px=0,py=0,webgl=false,top=0,travel=1,active=-1;
    let height=1, blend=0, appliedBlend=-1, starfieldPaused;
    function syncStarfield() {
        const pause = live && visible && blend === 0;
        if (pause === starfieldPaused) return;
        starfieldPaused = pause;
        document.dispatchEvent(new CustomEvent('tourvisibility', {detail:pause}));
    }
    const audioButton=controls.querySelector('.mesh-audio');
    let audio;
    function silence(){if(audio){audio.close().catch(()=>{});audio=null;}audioButton.setAttribute('aria-pressed','false');}
    audioButton.onclick=async()=>{
        if(audio)return silence();
        const Audio=window.AudioContext || window.webkitAudioContext;
        if(!Audio)return;
        const context=new Audio();audio=context;
        try {
            const volume=context.createGain();volume.gain.value=.024;volume.connect(context.destination);
            for(const hz of [98,146.83,196.3]){const osc=context.createOscillator();osc.frequency.value=hz;osc.connect(volume);osc.start();}
            await context.resume(); if(audio===context)audioButton.setAttribute('aria-pressed','true');
        } catch {silence();}
    };
    function schedule(){if(live && visible && !document.hidden && !pending)pending=requestAnimationFrame(tick);}
    function refresh(){dirty=true;schedule();}
    function makeRenderer(useGL) {
        canvas=document.createElement('canvas');
        surface.replaceChildren(canvas);draw=null;
        if(useGL){try{draw=createField(canvas,innerWidth<760);}catch{/* Use the prerendered scene. */}}
        webgl=Boolean(draw);
        if(!draw){canvas=document.createElement('canvas');surface.replaceChildren(canvas);draw=framePlayer(canvas,refresh);}
        else canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();makeRenderer(false);resize();},{once:true});
        tour.dataset.renderer=webgl?'live':'sequence';
    }
    function scroll(){
        const distance=scrollY-top;
        target=clamp(distance/travel,0,1)*3;
        blend=exitBlend(distance-travel,height);
        syncStarfield();
        schedule();
    }
    function resize(){
        if(!live)return;
        const width=stage.clientWidth;
        height=stage.clientHeight;
        if(!width || !height)return;
        const ratio=Math.min(devicePixelRatio||1,webgl?1.5:1);
        canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
        top=tour.getBoundingClientRect().top+scrollY;
        travel=Math.max(1,tour.offsetHeight-height*1.72);scroll();refresh();
    }
    function tick(now){
        pending=0;if(!live || !visible || document.hidden)return;
        const dt=previous?clamp((now-previous)/1000,0,.08):1/60;
        previous=now;elapsed+=dt;
        const before=progress;
        progress+= (target-progress)*(1-Math.exp(-dt*15));
        if(Math.abs(target-progress)<.0005)progress=target;
        px+=(x-px)*(1-Math.exp(-dt*7));py+=(y-py)*(1-Math.exp(-dt*7));
        const blendChanged=blend!==appliedBlend;
        if(blendChanged){
            stage.style.setProperty('--field-opacity', String(1-blend));
            stage.classList.toggle('field-cleared', blend>.57);
            appliedBlend=blend;
        }
        if(blend<1 && (webgl || dirty || blendChanged || before!==progress))draw?.(progress,elapsed,px,py,canvas.width/stage.clientWidth,blend);
        dirty=false;
        if(before!==progress || !hasDrawn) {
            const chapter=Math.round(progress);
            scenes.forEach((scene,i)=>{
                const distance=i-progress;
                const fade=clamp((.63-Math.abs(distance))/.4,0,1);
                scene.style.opacity=fade*fade*(3-2*fade);
                scene.style.transform='translate3d(0,'+(distance*8)+'vh,0) scale('+(1-distance*.13)+')';
                if(chapter!==active || !hasDrawn){scene.inert=i!==chapter;buttons[i].setAttribute('aria-current',String(i===chapter));}
            });
            active=chapter;hasDrawn=true;
        }
        if((webgl && blend<1) || progress!==target)schedule();
    }
    function configure(){
        live=!motion.matches && innerHeight>=440;
        tour.classList.toggle('is-live',live);controls.hidden=!live;
        if(live){
            if(!canvas)makeRenderer(true);
            hasDrawn=false;resize();progress=target;schedule();
        }else{
            silence();cancelAnimationFrame(pending);pending=0;previous=0;
            scenes.forEach(s=>{s.inert=false;s.style.removeProperty('opacity');s.style.removeProperty('transform');});
        }
        syncStarfield();
    }
    buttons.forEach((button,i)=>button.addEventListener('click',()=>window.scrollTo({top:top+travel*i/3,behavior:'smooth'})));
    controls.querySelector('.mesh-skip').onclick=()=>{silence();const planner=document.getElementById('session-planner');planner.focus({preventScroll:true});planner.scrollIntoView({behavior:motion.matches?'instant':'smooth'});};
    stage.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'){x=e.clientX/innerWidth-.5;y=e.clientY/innerHeight-.5;}},{passive:true});
    stage.addEventListener('pointerleave',()=>{x=y=0;});
    new IntersectionObserver(([entry])=>{
        visible=entry.isIntersecting;previous=0;
        if(visible){resize();progress=target;hasDrawn=false;schedule();}
        else{silence();cancelAnimationFrame(pending);pending=0;}
        syncStarfield();
    }).observe(stage);
    new ResizeObserver(resize).observe(stage);
    window.addEventListener('scroll',scroll,{passive:true});
    matchMedia('(min-height:440px)').addEventListener('change',configure);
    document.addEventListener('visibilitychange',()=>{previous=0;if(document.hidden)silence();else refresh();});
    motion.addEventListener('change',configure);configure();
}
