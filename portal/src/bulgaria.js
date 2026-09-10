import {createBudgetRepository} from './budget-repository.js';
import {PLACES,validateVisit,validateVisits,validateCatalogue,filterPlaces} from './bulgaria-model.js';
import {localDate} from './budget-model.js';
import {friendlyDate} from './calendar.js';
import {loadPublicJson} from './public-data.js';
import catalogueUrl from './data/bulgaria-catalogue.json?url';
import geographyUrl from './data/bulgaria-geography.json?url';
import detailsUrl from './data/bulgaria-place-details.json?url';
import {distanceKm,formatDistance,sortPlaces,googlePlaceUrl,googleSatelliteUrl,locationError,validLocation} from './explorer-location.js';
const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n};
const legacy=new Map(PLACES.map(p=>[p.id,p]));

export function createBulgariaUI(makeStorage){
 const $=id=>document.getElementById(id);
 let repo,entries=[],places=[],epoch=0,busy=false,loaded=false,dirty=false,selected=null,pending=null,map=null,assetsPromise=null,details={},location=null,locationRequest=0,photoId=null,detailOpen=false;
 const status=(text,error=false)=>{for(const id of ['bg-status','bg-detail-status']){$(id).textContent=text;$(id).classList.toggle('error',error)}};
 function lock(value){busy=value;$('bg-refresh').disabled=value;$('bg-checkin').disabled=value||!loaded;$('bg-undo').disabled=value||!loaded;$('bg-visit-date').disabled=value||!loaded;document.querySelectorAll('.legacy-undo').forEach(button=>button.disabled=value)}
 function assets(){
  if(!assetsPromise)assetsPromise=Promise.allSettled([
   loadPublicJson(catalogueUrl,'tpc-public-bulgaria-catalogue',validateCatalogue),
   loadPublicJson(geographyUrl,'tpc-public-bulgaria-geography',data=>{if(!['regions','countries','rivers','cities'].every(key=>Array.isArray(data?.[key]?.features)))throw new Error('Map data is incomplete.');return data}),
   import('./explorer-map.js'),
   loadPublicJson(detailsUrl,'tpc-public-bulgaria-details',data=>{if(data?.version!==1||!data.places||typeof data.places!=='object')throw Error('Place details are unavailable.');return data}),
  ]).then(results=>{
   if(results[0].status!=='fulfilled')throw results[0].reason;
   if(results.slice(1).some(result=>result.status==='rejected'))assetsPromise=null;
   return {catalogue:results[0].value,geography:results[1].value,module:results[2].value,details:results[3].value};
  }).catch(error=>{assetsPromise=null;throw error});
  return assetsPromise;
 }
 const phone=matchMedia('(max-width:680px)');
 function closeDetail(){
  const returnId=selected;$('bg-place-dialog').close();$('bg-detail-home').append($('bg-detail'));$('bg-detail').hidden=true;selected=null;detailOpen=false;render();
  const returnButton=[...$('bg-results').querySelectorAll('button')].find(button=>button.dataset.place===returnId);(returnButton||$('bg-map')).focus({preventScroll:true});
 }
 function presentDetail(){
  if(!selected||!detailOpen)return;
  if(phone.matches){$('bg-place-dialog').append($('bg-detail'));if(!$('bg-place-dialog').open)$('bg-place-dialog').showModal()}
  else {if($('bg-place-dialog').open)$('bg-place-dialog').close();$('bg-detail-home').append($('bg-detail'))}
 }
 phone.addEventListener('change',presentDetail);
 function choose(id,fromList=false){
  if(busy)return;
  if((dirty||pending)&&selected!==id&&!confirm('Discard the unsaved visit date?'))return;
  selected=id;detailOpen=true;pending=null;dirty=false;$('bg-detail-status').textContent='';
  const visit=entries.find(e=>e.id===id);$('bg-visit-date').value=visit?.date||localDate();
  render();if(fromList)map?.focusPlace(id);presentDetail();$('bg-place-name').focus({preventScroll:true});
 }
 function showPhoto(place){
  if(photoId===place.id)return;photoId=place.id;
  const photo=details[place.id]?.photo,img=$('bg-photo-image');img.removeAttribute('src');$('bg-photo').hidden=true;
  if(!photo)return;
  const validUrl=(url,host)=>{try{return new URL(url).protocol==='https:'&&new URL(url).hostname===host}catch{return false}};
  if(!(validUrl(photo.url,'upload.wikimedia.org')||validUrl(photo.url,'thumb.wikimedia.org'))||!validUrl(photo.page,'commons.wikimedia.org')||!validUrl(photo.licenseUrl,'creativecommons.org'))return;
  $('bg-photo').hidden=false;img.alt=photo.alt||place.name;img.src=photo.url;$('bg-photo-link').href=photo.page;
  img.onerror=()=>{if(photoId===place.id)$('bg-photo').hidden=true};
  const author=el('a','',photo.author),license=el('a','',photo.license);author.href=photo.page;license.href=photo.licenseUrl;
  for(const link of [author,license]){link.target='_blank';link.rel='noopener'}
  $('bg-photo-credit').replaceChildren(author,document.createTextNode(' · '),license);
 }
 function mapState(state){
  document.querySelectorAll('[data-map-style]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mapStyle===state.style)));
  $('bg-map-hint').textContent=state.satellite?'Satellite landscape':state.style==='overview'?'Regional map':'Zoom in for satellite imagery';
  $('bg-imagery-status').hidden=!state.message;$('bg-imagery-status').textContent=state.message;
 }
 async function locate(){
  if(!navigator.geolocation){$('bg-location-status').textContent='This browser cannot provide your location.';return}
  const request=++locationRequest,gen=epoch;$('bg-locate').disabled=true;$('bg-location-status').textContent='Finding your location…';
  navigator.geolocation.getCurrentPosition(position=>{
   if(request!==locationRequest||gen!==epoch)return;
   const next={lat:position.coords.latitude,lon:position.coords.longitude,accuracy:position.coords.accuracy};
   if(!validLocation(next)){locationFailure({code:2});return}
   location=next;map?.setLocation(location);$('bg-sort').querySelector('[value="nearest"]').disabled=false;$('bg-sort').value='nearest';
   $('bg-locate').disabled=false;$('bg-locate').textContent='Update location';$('bg-clear-location').hidden=false;
   $('bg-location-status').textContent=`Nearest first · straight-line distances. Location accuracy: about ${formatDistance(Math.max(10,location.accuracy||10)/1000)}. Not stored in your account.`;render();
   $('bg-browser').open=true;
  },locationFailure,{enableHighAccuracy:false,timeout:15000,maximumAge:60000});
  function locationFailure(error){if(request!==locationRequest||gen!==epoch)return;$('bg-locate').disabled=false;$('bg-location-status').textContent=locationError(error)}
 }
 function clearLocation(){
  locationRequest++;location=null;map?.setLocation(null);$('bg-locate').disabled=false;$('bg-locate').textContent='◎ Near me';$('bg-clear-location').hidden=true;
  $('bg-sort').value='catalogue';$('bg-sort').querySelector('[value="nearest"]').disabled=true;$('bg-location-status').textContent='See how far away places are. Location is used only when you ask.';
 }
 function render(){
  const visits=new Set(entries.map(e=>e.id)),count=places.filter(p=>visits.has(p.id)).length;
  $('bg-progress').textContent=places.length?`${count} of ${places.length} places visited`:'Your discoveries start here';$('bg-progress-bar').max=places.length||1;$('bg-progress-bar').value=count;
  const visible=sortPlaces(filterPlaces(places,{query:$('bg-search').value,region:$('bg-region').value,category:$('bg-category').value,state:$('bg-filter').value,visits}),$('bg-sort').value,location);
  $('bg-result-count').textContent=`${visible.length} places`;$('bg-no-results').hidden=visible.length>0||places.length===0;
  $('bg-results').replaceChildren(...visible.map(p=>{
   const row=el('li',''),button=el('button','');button.type='button';button.setAttribute('aria-pressed',String(p.id===selected));button.dataset.place=p.id;
   const title=el('span','place-title',p.name),subtitle=el('span','place-subtitle',p.bg);subtitle.lang='bg';title.append(subtitle);
   const meta=el('span','place-row-meta',`${p.category} · ${p.region}`);if(location)meta.append(el('strong','place-row-distance',`${formatDistance(distanceKm(location,p))} away`));title.append(meta);button.append(el('span','place-number',p.number),title,el('span','place-check',visits.has(p.id)?'✓':'›'));button.setAttribute('aria-label',`${p.name}, ${visits.has(p.id)?'visited':'not visited'}`);button.onclick=()=>choose(p.id,true);row.append(button);return row;
  }));
  map?.setPlaces(visible,visits,selected);
  const place=places.find(p=>p.id===selected);$('bg-place-actions').hidden=!place;$('bg-detail').hidden=!place||!detailOpen;
  if(place){
   const visit=entries.find(e=>e.id===place.id);
   $('bg-place-number').textContent=`No. ${place.number} · ${place.category}`;$('bg-place-name').textContent=place.name;$('bg-place-bg').textContent=place.bg;$('bg-description').textContent=place.description;
   showPhoto(place);$('bg-place-region').textContent=`${place.location||place.region} · ${place.region}`;
   $('bg-distance').hidden=!location;$('bg-distance').textContent=location?`${formatDistance(distanceKm(location,place))} away · straight line`:'';
   const summary=details[place.id]?.summary;$('bg-place-summary').hidden=!summary;$('bg-place-summary').replaceChildren();if(summary){const source=el('a','',summary.charAt(0).toUpperCase()+summary.slice(1)+' ↗');source.href=/^https:\/\/www\.wikidata\.org\/wiki\/Q\d+$/.test(details[place.id].source)?details[place.id].source:place.source;source.target='_blank';source.rel='noopener';$('bg-place-summary').append(source)}
   $('bg-visit-tip').textContent=place.category==='Nature'?'Check weather, trail access, and daylight before setting out. The map pin marks the site area; use the official guide to plan your route.':place.category==='Faith'?'Check visiting hours and local visitor guidance before travelling. Some spaces may be in active religious use.':'Check the official guide for current opening hours, tickets, and access before travelling.';
   $('bg-place-state').textContent=visit?`Visited on ${friendlyDate(visit.date)}`:'Still to explore. Already been? Save your visit.';
   $('bg-checkin').hidden=!!visit;$('bg-undo').hidden=!visit;$('bg-visit-date').readOnly=!!visit;
   $('bg-directions').href=googlePlaceUrl(place,true);$('bg-google').href=googlePlaceUrl(place);$('bg-google-satellite').href=googleSatelliteUrl(place);
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
    const data=publicData.value;details=data.details?.places||{};
    if(!places.length){
     places=data.catalogue.places;
     for(const [id,key,label] of [['bg-region','region','All regions'],['bg-category','category','All types']])$(id).replaceChildren(new Option(label,''),...[...new Set(places.map(p=>p[key]))].sort().map(value=>new Option(value,value)));
    }
    if(!map&&data.geography&&data.module){$('bg-map').replaceChildren();map=data.module.createExplorerMap($('bg-map'),data.geography,id=>choose(id),mapState);map.setLocation(location)}
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
 $('bg-search').oninput=render;for(const id of ['bg-region','bg-category','bg-filter','bg-sort'])$(id).onchange=render;
 $('bg-locate').onclick=locate;$('bg-clear-location').onclick=()=>{clearLocation();render()};
 $('bg-close-detail').onclick=()=>{if(busy)return;if((dirty||pending)&&!confirm('Discard the unsaved visit date?'))return;dirty=false;pending=null;closeDetail()};
 $('bg-place-dialog').addEventListener('cancel',event=>{event.preventDefault();$('bg-close-detail').click()});
 $('bg-zoom-place').onclick=()=>{const id=selected;if(phone.matches){detailOpen=false;$('bg-place-dialog').close();$('bg-detail-home').append($('bg-detail'));$('bg-detail').hidden=true;$('bg-map').scrollIntoView({block:'center'})}map?.focusPlace(id,true)};
 document.querySelectorAll('[data-map-style]').forEach(button=>button.onclick=()=>map?.setStyle(button.dataset.mapStyle));
 $('bg-browse').onclick=()=>{$('bg-browser').open=true;$('bg-search').focus();$('bg-browser').scrollIntoView({block:'nearest'})};
 $('bg-clear-filters').onclick=()=>{$('bg-search').value='';$('bg-region').value='';$('bg-category').value='';$('bg-filter').value='all';render()};
 $('bg-refresh').onclick=()=>refresh({force:true});$('bg-reset').onclick=()=>map?.reset();$('bg-checkin').onclick=()=>save(false);$('bg-undo').onclick=()=>save(true);$('bg-visit-date').oninput=()=>dirty=true;
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&repo&&!$('bulgaria-panel').hidden)refresh()});
 window.addEventListener('beforeunload',event=>{if(dirty||pending){event.preventDefault();event.returnValue=''}});
 function stop(){
  epoch++;$('bg-place-dialog').close();$('bg-detail-home').append($('bg-detail'));clearLocation();photoId=null;detailOpen=false;$('bg-photo-image').removeAttribute('src');$('bg-photo').hidden=true;repo?.clear();repo=null;entries=[];places=[];selected=null;pending=null;loaded=false;dirty=false;map?.destroy();map=null;
  mapState({style:'auto',satellite:false,message:''});$('bg-map').replaceChildren();$('bg-map').classList.remove('map-unavailable');$('bg-search').value='';$('bg-filter').value='all';$('bg-region').value='';$('bg-category').value='';$('bg-visit-date').value=localDate();$('bg-legacy').open=false;$('bg-browser').open=!matchMedia('(max-width:680px)').matches;
  lock(false);render();status('');
 }
 stop();return{stop,refresh,hasUnsaved:()=>dirty||pending!==null,start(){stop();repo=createBudgetRepository(makeStorage(),{entry:validateVisit,ledger:validateVisits});return refresh()}};
}
