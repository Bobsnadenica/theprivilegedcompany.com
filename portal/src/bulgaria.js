import {createBudgetRepository} from './budget-repository.js';
import {PLACES,validateVisit,validateVisits,validateCatalogue,filterPlaces} from './bulgaria-model.js';
import {localDate} from './budget-model.js';
import {friendlyDate} from './calendar.js';
import {loadPublicJson} from './public-data.js';
import catalogueUrl from './data/bulgaria-catalogue.json?url';
import geographyUrl from './data/bulgaria-geography.json?url';
const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n};
const legacy=new Map(PLACES.map(p=>[p.id,p]));

export function createBulgariaUI(makeStorage){
 const $=id=>document.getElementById(id);
 let repo,entries=[],places=[],epoch=0,busy=false,loaded=false,dirty=false,selected=null,pending=null,map=null,assetsPromise=null;
 const status=(text,error=false)=>{$('bg-status').textContent=text;$('bg-status').classList.toggle('error',error)};
 function lock(value){busy=value;$('bg-refresh').disabled=value;$('bg-checkin').disabled=value||!loaded;$('bg-undo').disabled=value||!loaded;$('bg-visit-date').disabled=value||!loaded;document.querySelectorAll('.legacy-undo').forEach(button=>button.disabled=value)}
 function assets(){
  if(!assetsPromise)assetsPromise=Promise.allSettled([
   loadPublicJson(catalogueUrl,'tpc-public-bulgaria-catalogue',validateCatalogue),
   loadPublicJson(geographyUrl,'tpc-public-bulgaria-geography',data=>{if(!['regions','countries','rivers','cities'].every(key=>Array.isArray(data?.[key]?.features)))throw new Error('Map data is incomplete.');return data}),
   import('./explorer-map.js'),
  ]).then(results=>{
   if(results[0].status!=='fulfilled')throw results[0].reason;
   return {catalogue:results[0].value,geography:results[1].value,module:results[2].value};
  }).catch(error=>{assetsPromise=null;throw error});
  return assetsPromise;
 }
 function choose(id,fromList=false){
  selected=id;pending=null;
  const visit=entries.find(e=>e.id===id);if(visit)$('bg-visit-date').value=visit.date;
  render();if(fromList)map?.focusPlace(id);$('bg-place-name').focus({preventScroll:true});
  if(matchMedia('(max-width:680px)').matches)$('bg-detail').scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
 }
 function render(){
  const visits=new Set(entries.map(e=>e.id)),count=places.filter(p=>visits.has(p.id)).length;
  $('bg-progress').textContent=places.length?`${count} of ${places.length} places visited`:'Your discoveries start here';$('bg-progress-bar').max=places.length||1;$('bg-progress-bar').value=count;
  const visible=filterPlaces(places,{query:$('bg-search').value,region:$('bg-region').value,category:$('bg-category').value,state:$('bg-filter').value,visits});
  $('bg-result-count').textContent=`${visible.length} places`;$('bg-no-results').hidden=visible.length>0||places.length===0;
  $('bg-results').replaceChildren(...visible.map(p=>{
   const row=el('li',''),button=el('button','');button.type='button';button.setAttribute('aria-pressed',String(p.id===selected));button.dataset.place=p.id;
   const title=el('span','place-title',p.name),subtitle=el('span','place-subtitle',p.bg);subtitle.lang='bg';title.append(subtitle);
   button.append(el('span','place-number',p.number),title,el('span','place-check',visits.has(p.id)?'✓':''));button.setAttribute('aria-label',`${p.name}, ${visits.has(p.id)?'visited':'not visited'}`);button.onclick=()=>choose(p.id,true);row.append(button);return row;
  }));
  map?.setPlaces(visible,visits,selected);
  const place=places.find(p=>p.id===selected);$('bg-place-actions').hidden=!place;
  if(place){
   const visit=entries.find(e=>e.id===place.id);
   $('bg-place-number').textContent=`No. ${place.number} · ${place.category} · ${place.region}`;$('bg-place-name').textContent=place.name;$('bg-place-bg').textContent=place.bg;$('bg-description').textContent=place.description;
   $('bg-place-state').textContent=visit?`Visited on ${friendlyDate(visit.date)}`:'Still to explore. Already been? Save your visit.';
   $('bg-checkin').hidden=!!visit;$('bg-undo').hidden=!visit;$('bg-visit-date').readOnly=!!visit;
   $('bg-directions').href=`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${place.name}, ${place.location||place.region}, Bulgaria`)}&travelmode=driving`;
   $('bg-source').href=place.source;
  }else{
   $('bg-place-number').textContent='Your next discovery';$('bg-place-name').textContent='Where will you go next?';$('bg-place-bg').textContent='Избери следващото си откритие.';$('bg-description').textContent='Choose a pin or search the official catalogue below. Your discoveries stay in your account.';
  }
  const earlier=entries.filter(e=>legacy.has(e.id));$('bg-legacy').hidden=!earlier.length;
  $('bg-legacy-list').replaceChildren(...earlier.map(e=>{
   const row=el('li',''),undo=el('button','btn-ghost danger legacy-undo','Remove');undo.type='button';undo.setAttribute('aria-label',`Remove earlier visit to ${legacy.get(e.id).name}`);
   undo.onclick=()=>{if(!busy&&confirm(`Remove the earlier city check-in for ${legacy.get(e.id).name}?`))save(true,e.id)};
   row.append(el('span','',`${legacy.get(e.id).name} · ${friendlyDate(e.date)}`),undo);return row;
  }));lock(busy);
 }
 async function refresh({force=false}={}){
  if(!repo||busy)return;const gen=epoch,active=repo;lock(true);status('Loading your explorer…');
  try{
   const [stored,publicData]=await Promise.allSettled([active.load({force}),assets()]);if(gen!==epoch)return;
   if(publicData.status==='fulfilled'){
    const data=publicData.value;
    if(!places.length){
     places=data.catalogue.places;
     for(const [id,key,label] of [['bg-region','region','All regions'],['bg-category','category','All types']])$(id).replaceChildren(new Option(label,''),...[...new Set(places.map(p=>p[key]))].sort().map(value=>new Option(value,value)));
    }
    if(!map&&data.geography&&data.module){$('bg-map').replaceChildren();map=data.module.createExplorerMap($('bg-map'),data.geography,id=>choose(id))}
    else if(!map){$('bg-map').textContent='The map is unavailable. You can still explore and check in using the place list. Press Refresh to retry.';$('bg-map').classList.add('map-unavailable');assetsPromise=null;}
   }
   if(stored.status==='fulfilled'){entries=stored.value.entries;loaded=true;}
   $('bg-visit-date').max=localDate();render();
   if(publicData.status==='rejected')throw publicData.reason;
   if(stored.status==='rejected')throw stored.reason;
   status('Your visits are saved privately in your account.');
  }catch(e){if(gen===epoch)status(`Could not refresh. ${e.message}`,true)}finally{if(gen===epoch)lock(false)}
 }
 async function save(remove,id=selected){
  if(!repo||busy||!loaded||!id)return;
  const existing=entries.find(e=>e.id===id),date=$('bg-visit-date').value;
  if(!remove&&!$('bg-visit-date').reportValidity())return;
  if(remove&&!legacy.has(id)&&!confirm('Undo this check-in?'))return;
  const fingerprint=JSON.stringify({id,remove,date:remove?null:date});
  if(!pending||pending.fingerprint!==fingerprint)pending={fingerprint,change:{id,expectedRevision:existing?.revision??null,entry:remove?null:validateVisit({id,revision:crypto.randomUUID(),date})}};
  const gen=epoch,active=repo;lock(true);status('Saving your visit…');
  try{const data=await active.commit(pending.change);if(gen!==epoch)return;entries=data.entries;pending=null;dirty=false;render();status(remove?'Check-in removed. Saved to your account.':'Visit saved to your account.');$('bg-place-name').focus({preventScroll:true})}
  catch(e){if(gen===epoch)status(`Not saved. ${e.message} Your visit date is still here; please retry.`,true)}finally{if(gen===epoch)lock(false)}
 }
 $('bg-search').oninput=render;for(const id of ['bg-region','bg-category','bg-filter'])$(id).onchange=render;
 $('bg-refresh').onclick=()=>refresh({force:true});$('bg-reset').onclick=()=>map?.reset();$('bg-checkin').onclick=()=>save(false);$('bg-undo').onclick=()=>save(true);$('bg-visit-date').oninput=()=>dirty=true;
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&repo&&!$('bulgaria-panel').hidden)refresh()});
 window.addEventListener('beforeunload',event=>{if(dirty||pending){event.preventDefault();event.returnValue=''}});
 function stop(){
  epoch++;repo?.clear();repo=null;entries=[];places=[];selected=null;pending=null;loaded=false;dirty=false;map?.destroy();map=null;
  $('bg-map').replaceChildren();$('bg-map').classList.remove('map-unavailable');$('bg-search').value='';$('bg-filter').value='all';$('bg-region').value='';$('bg-category').value='';$('bg-visit-date').value=localDate();$('bg-legacy').open=false;$('bg-browser').open=!matchMedia('(max-width:680px)').matches;
  lock(false);render();status('');
 }
 stop();return{stop,refresh,hasUnsaved:()=>dirty||pending!==null,start(){stop();repo=createBudgetRepository(makeStorage(),{entry:validateVisit,ledger:validateVisits});return refresh()}};
}
