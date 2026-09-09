import {createBudgetRepository} from './budget-repository.js';
import {PLACES,validateVisit,validateVisits} from './bulgaria-model.js';
import {OUTLINE,project} from './bulgaria-map.js';
import {localDate} from './budget-model.js';
const svg=(tag,attrs={})=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n};
export function createBulgariaUI(makeStorage){
 const $=id=>document.getElementById(id);let repo,entries=[],epoch=0,busy=false,selected=PLACES[0].id,pending=null;
 const status=(text,error=false)=>{$('bg-status').textContent=text;$('bg-status').classList.toggle('error',error)};
 function lock(value){busy=value;$('bg-refresh').disabled=value;$('bg-checkin').disabled=value;$('bg-undo').disabled=value}
 function render(){
  const visited=new Map(entries.map(e=>[e.id,e]));$('bg-progress').textContent=`${entries.length} / ${PLACES.length} places revealed`;$('bg-progress-bar').value=entries.length;
  const root=$('bg-map');root.replaceChildren();
  const defs=svg('defs'),pattern=svg('pattern',{id:'bg-foil',width:8,height:8,patternUnits:'userSpaceOnUse'});pattern.append(svg('rect',{width:8,height:8,fill:'#35383b'}),svg('path',{d:'M0 8L8 0',stroke:'#44484b','stroke-width':1}));
  const clip=svg('clipPath',{id:'bg-country'});clip.append(svg('path',{d:OUTLINE}));defs.append(pattern,clip);root.append(defs);
  root.append(svg('path',{d:OUTLINE,fill:'url(#bg-foil)',stroke:'#8a8d85','stroke-width':2}));
  const reveal=svg('g',{'clip-path':'url(#bg-country)'});
  for(const p of PLACES){if(visited.has(p.id)){const[x,y]=project(p.lon,p.lat);reveal.append(svg('circle',{cx:x,cy:y,r:62,fill:'#cfb575',class:'scratch-reveal'}))}}
  if(entries.length===PLACES.length)reveal.append(svg('path',{d:OUTLINE,fill:'#cfb575'}));root.append(reveal);
  for(const p of PLACES){const[x,y]=project(p.lon,p.lat),button=svg('g',{role:'button',tabindex:0,'aria-label':`${p.name}, ${visited.has(p.id)?'visited':'not visited'}`,'aria-pressed':selected===p.id,class:'map-place'});
   button.append(svg('circle',{cx:x,cy:y,r:22,fill:'transparent'}),svg('circle',{cx:x,cy:y,r:selected===p.id?13:8,fill:visited.has(p.id)?'#153f32':'#111214',stroke:selected===p.id?'#ffffff':'#f3e6be','stroke-width':3}));
   const label=svg('text',{x,y:y-21,'text-anchor':'middle',fill:'#fff',class:'map-label'});label.textContent=p.name;button.append(label);
   const choose=()=>{selected=p.id;render();$('bg-place').focus()};button.addEventListener('click',choose);button.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose()}});root.append(button);
  }
  const p=PLACES.find(p=>p.id===selected),visit=visited.get(selected);$('bg-place').value=selected;$('bg-place-name').textContent=p.name;$('bg-place-bg').textContent=p.bg;$('bg-place-state').textContent=visit?`Checked in on ${visit.date}`:'Still under the silver. Been here? Make it part of your map.';$('bg-checkin').hidden=!!visit;$('bg-undo').hidden=!visit;
  $('bg-visited').replaceChildren(...entries.map(e=>{const n=document.createElement('button');n.type='button';n.className='btn-ghost';n.textContent=`✓ ${PLACES.find(p=>p.id===e.id).name}`;n.onclick=()=>{selected=e.id;render();$('bg-place').focus()};return n}));lock(busy);
 }
 async function refresh(){if(!repo||busy)return;const generation=epoch,active=repo;lock(true);status('Loading your map…');try{const data=await active.load();if(generation!==epoch)return;entries=data.entries;render();status('Up to date. Your map is saved to your account.')}catch(e){if(generation===epoch)status(`Could not load your map. ${e.message}`,true)}finally{if(generation===epoch)lock(false)}}
 async function save(remove){if(!repo||busy)return;const existing=entries.find(e=>e.id===selected);if(remove&&!confirm('Undo this check-in and cover the place again?'))return;
  if(!pending||pending.id!==selected||pending.remove!==remove)pending={id:selected,remove,change:{id:selected,expectedRevision:existing?.revision??null,entry:remove?null:{id:selected,revision:crypto.randomUUID(),date:localDate()}}};
  const generation=epoch,active=repo;lock(true);status('Saving your check-in…');try{const data=await active.commit(pending.change);if(generation!==epoch)return;entries=data.entries;pending=null;render();status(remove?'Check-in removed. Map saved.':'Place revealed! Saved to your account.');$('bg-place').focus()}catch(e){if(generation===epoch)status(`Not saved. ${e.message} Please retry.`,true)}finally{if(generation===epoch)lock(false)}
 }
 $('bg-place').replaceChildren(...PLACES.map(p=>new Option(`${p.name} · ${p.bg}`,p.id)));$('bg-place').onchange=()=>{selected=$('bg-place').value;render()};$('bg-refresh').onclick=refresh;$('bg-checkin').onclick=()=>save(false);$('bg-undo').onclick=()=>save(true);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&repo&&!$('bulgaria-panel').hidden)refresh()});
 function stop(){epoch++;repo=null;entries=[];selected=PLACES[0].id;pending=null;lock(false);render();status('')}
 stop();return{stop,refresh,start(){stop();repo=createBudgetRepository(makeStorage(),{entry:validateVisit,ledger:validateVisits});return refresh()}};
}
