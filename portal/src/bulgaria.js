import {createBudgetRepository} from './budget-repository.js';
import {PLACES,validateVisit,photoVisit,validateVisits,validateCatalogue,filterPlaces} from './bulgaria-model.js';
import {localDate} from './budget-model.js';
import {friendlyDate} from './calendar.js';
import {loadPublicJson} from './public-data.js';
import catalogueUrl from './data/bulgaria-catalogue.json?url';
import geographyUrl from './data/bulgaria-geography.json?url';
import detailsUrl from './data/bulgaria-place-details.json?url';
import {distanceKm,formatDistance,sortPlaces,googlePlaceUrl,googleSatelliteUrl,recommendPlaces,locationError,validLocation} from './explorer-location.js';
import {prepareVisitPhoto} from './visit-photo.js';
import {commitPhotoVisit} from './visit-save.js';
const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n};
const legacy=new Map(PLACES.map(p=>[p.id,p]));

export function createBulgariaUI(makeStorage,makePhotos){
 const $=id=>document.getElementById(id);
 let repo,entries=[],places=[],epoch=0,busy=false,loaded=false,dirty=false,selected=null,pending=null,map=null,assetsPromise=null,details={},location=null,locationRequest=0,photoId=null,detailOpen=false,photos=null,storage=null,draftPhoto=null,draftUrl=null,photoProcessing=false,photoRequest=0,privatePhotoId=null,privatePhotoUrl=null,privateRequest=0,explorerView='map',resultPage=0;
 const status=(text,error=false)=>{for(const id of ['bg-status','bg-detail-status']){$(id).textContent=text;$(id).classList.toggle('error',error)}};
 function lock(value){
  busy=value;const disabled=busy||photoProcessing;
  for(const id of ['bg-refresh','bg-checkin','bg-undo','bg-visit-date','bg-take-photo','bg-choose-photo','bg-remove-draft-photo','bg-close-detail','bg-focus-checkin'])$(id).disabled=disabled||!loaded;
  document.querySelectorAll('.legacy-undo').forEach(button=>button.disabled=disabled);
 }
 function setView(view){
  explorerView=view;resultPage=0;$('bulgaria-panel').dataset.explorerView=view;
  document.querySelectorAll('button[data-explorer-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.explorerView===view)));
  $('bg-browser').open=view!=='map'||!phone.matches;
  $('bg-list-title').textContent=view==='visited'?'Your travel journal':'Explore places';
  render();
 }
 function clearDraft(){
  photoRequest++;draftPhoto=null;photoProcessing=false;
  if(draftUrl)URL.revokeObjectURL(draftUrl);draftUrl=null;
  $('bg-photo-preview-image').removeAttribute('src');$('bg-photo-preview').hidden=true;$('bg-photo-input').value='';$('bg-camera-input').value='';
  $('bg-photo-input-status').textContent='A smaller copy is saved privately. Your original stays on your phone.';
 }
 function clearPrivatePhoto(){
  privateRequest++;privatePhotoId=null;if(privatePhotoUrl)URL.revokeObjectURL(privatePhotoUrl);privatePhotoUrl=null;
  $('bg-saved-photo-image').removeAttribute('src');$('bg-saved-photo-image').hidden=true;$('bg-saved-photo').hidden=true;$('bg-retry-photo').hidden=true;
 }
 async function selectPhoto(file){
  if(!file||busy||!loaded)return;
  const gen=epoch,request=++photoRequest;photoProcessing=true;lock(busy);$('bg-photo-input-status').textContent='Preparing your photo…';
  try {
   const prepared=await prepareVisitPhoto(file);if(gen!==epoch||request!==photoRequest)return;
   if(draftUrl)URL.revokeObjectURL(draftUrl);draftPhoto=prepared;draftUrl=URL.createObjectURL(prepared.blob);
   $('bg-photo-preview-image').src=draftUrl;$('bg-photo-preview').hidden=false;dirty=true;pending=null;
   $('bg-photo-input-status').textContent=`Photo ready · ${Math.round(prepared.blob.size/1024)} KB. Save your check-in below.`;
   $('bg-checkin').scrollIntoView({block:'nearest'});
  }catch(error){if(gen===epoch&&request===photoRequest)$('bg-photo-input-status').textContent=error.message+(draftPhoto?' Your previous photo is still selected.':'')}
  finally{if(gen===epoch&&request===photoRequest){photoProcessing=false;lock(busy)}}
 }
 async function showPrivatePhoto(visit){
  if(!visit?.photo){clearPrivatePhoto();return}
  if(privatePhotoId===visit.photo.id)return;
  clearPrivatePhoto();privatePhotoId=visit.photo.id;$('bg-saved-photo').hidden=false;$('bg-saved-photo-status').textContent='Loading your private photo…';
  const gen=epoch,request=privateRequest,active=photos;
  try {
   const blob=await active.read(visit.photo);if(gen!==epoch||request!==privateRequest)return;
   privatePhotoUrl=URL.createObjectURL(blob);$('bg-saved-photo-image').src=privatePhotoUrl;$('bg-saved-photo-image').hidden=false;$('bg-saved-photo-status').textContent='Your photo · saved privately';
  }catch(error){if(gen===epoch&&request===privateRequest){$('bg-saved-photo-status').textContent='Your check-in is saved, but the photo could not load. Try again.';$('bg-retry-photo').hidden=false}}
 }
 function recommendations(visits){
  const show=explorerView==='nearby'&&!$('bg-search').value.trim();$('bg-recommendations').hidden=!show;
  if(!show)return;
  const picks=recommendPlaces(places,visits,location);
  $('bg-recommend-title').textContent=!location?'Where could you go next?':picks.length?'Your next three discoveries':'Every place has a memory';
  $('bg-recommend-note').textContent=!location?'Tap Find places near me for personal suggestions.':picks.length?'Closest places you haven’t visited. Distances are straight-line estimates.':'You’ve visited every place in the catalogue.';
  $('bg-recommend-list').replaceChildren(...picks.map((p,index)=>{
   const button=el('button','recommend-place');button.type='button';button.dataset.recommend=p.id;button.onclick=()=>choose(p.id,true);
   const top=el('span','recommend-kicker',index===0?'Closest new discovery':`Another idea · ${p.category}`),name=el('strong','',p.name),bottom=el('span','recommend-distance',`${formatDistance(distanceKm(location,p))} away · ${p.region}`);
   button.append(top,name,bottom,el('span','recommend-action','See place →'));return button;
  }));
 }
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
  const returnButton=[...$('bg-results').querySelectorAll('button')].find(button=>button.dataset.place===returnId);(returnButton||[...$('bg-recommend-list').querySelectorAll('button')].find(button=>button.dataset.recommend===returnId)||document.querySelector('button[data-explorer-view][aria-pressed="true"]')).focus({preventScroll:true});
 }
 function presentDetail(){
  if(!selected||!detailOpen)return;
  if(phone.matches){$('bg-place-dialog').append($('bg-detail'));if(!$('bg-place-dialog').open)$('bg-place-dialog').showModal()}
  else {if($('bg-place-dialog').open)$('bg-place-dialog').close();$('bg-detail-home').append($('bg-detail'))}
 }
 phone.addEventListener('change',presentDetail);
 function choose(id,fromList=false){
  if(busy||photoProcessing)return;
  if((dirty||pending)&&selected!==id&&!confirm('Discard the unsaved visit date?'))return;
  if(selected===id&&(dirty||pending)){detailOpen=true;render();presentDetail();return}
  clearDraft();clearPrivatePhoto();selected=id;detailOpen=true;pending=null;dirty=false;$('bg-detail-status').textContent='';
  const visit=entries.find(e=>e.id===id);$('bg-visit-date').value=visit?.date||localDate();
  render();if(fromList)map?.focusPlace(id);presentDetail();$('bg-place-name').focus({preventScroll:true});
 }
 function showPhoto(place){
  if(photoId===place.id)return;photoId=place.id;
  $('bg-google-photos').href=googlePlaceUrl(place);
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
   $('bg-location-status').textContent=`Location ready · accurate to about ${formatDistance(Math.max(10,location.accuracy||10)/1000)}. Distances are straight line.`;setView('nearby');
  },locationFailure,{enableHighAccuracy:false,timeout:15000,maximumAge:60000});
  function locationFailure(error){if(request!==locationRequest||gen!==epoch)return;$('bg-locate').disabled=false;$('bg-location-status').textContent=locationError(error)}
 }
 function clearLocation(){
  locationRequest++;location=null;map?.setLocation(null);$('bg-locate').disabled=false;$('bg-locate').textContent='◎ Find places near me';$('bg-clear-location').hidden=true;
  $('bg-sort').value='catalogue';$('bg-sort').querySelector('[value="nearest"]').disabled=true;$('bg-location-status').textContent='Use your location for nearby suggestions.';
 }
 function render(){
  const visits=new Set(entries.map(e=>e.id)),count=places.filter(p=>visits.has(p.id)).length;
  $('bg-visited-count').textContent=String(count);recommendations(visits);
  $('bg-progress').textContent=places.length?`${count} of ${places.length} places visited`:'Your discoveries start here';$('bg-progress-bar').max=places.length||1;$('bg-progress-bar').value=count;
  const visible=sortPlaces(filterPlaces(places,{query:$('bg-search').value,region:$('bg-region').value,category:$('bg-category').value,state:explorerView==='visited'?'visited':$('bg-filter').value,visits}),$('bg-sort').value,location);
  $('bg-result-count').textContent=`${visible.length} places`;$('bg-no-results').hidden=visible.length>0||places.length===0;
  resultPage=Math.min(resultPage,Math.max(0,Math.ceil(visible.length/12)-1));
  const start=resultPage*12,page=visible.slice(start,start+12);$('bg-page-label').textContent=visible.length?`${start+1}–${start+page.length} of ${visible.length}`:'No places';$('bg-page-prev').disabled=resultPage===0;$('bg-page-next').disabled=start+12>=visible.length;
  $('bg-results').replaceChildren(...page.map(p=>{
   const row=el('li',''),button=el('button','');button.type='button';button.setAttribute('aria-pressed',String(p.id===selected));button.dataset.place=p.id;
   const title=el('span','place-title',p.name),subtitle=el('span','place-subtitle',p.bg);subtitle.lang='bg';title.append(subtitle);
   const meta=el('span','place-row-meta',`${p.category} · ${p.region}`);if(entries.find(e=>e.id===p.id)?.photo)meta.append(el('span','place-row-proof','✓ Photo check-in'));if(location)meta.append(el('strong','place-row-distance',`${formatDistance(distanceKm(location,p))} away`));title.append(meta);button.append(el('span','place-number',p.number),title,el('span','place-check',visits.has(p.id)?'✓':'›'));button.setAttribute('aria-label',`${p.name}, ${visits.has(p.id)?'visited':'not visited'}`);button.onclick=()=>choose(p.id,true);row.append(button);return row;
  }));
  const mapPlaces=selected&&!visible.some(p=>p.id===selected)?[...visible,...places.filter(p=>p.id===selected)]:visible;map?.setPlaces(mapPlaces,visits,selected);
  const place=places.find(p=>p.id===selected);$('bg-place-actions').hidden=!place;$('bg-detail').hidden=!place||!detailOpen;
  if(place){
   const visit=entries.find(e=>e.id===place.id);
   $('bg-place-number').textContent=`No. ${place.number} · ${place.category}`;$('bg-place-name').textContent=place.name;$('bg-place-bg').textContent=place.bg;$('bg-description').textContent=place.description;
   showPhoto(place);$('bg-place-region').textContent=`${place.location||place.region} · ${place.region}`;
   $('bg-distance').hidden=!location;$('bg-distance').textContent=location?`${formatDistance(distanceKm(location,place))} away · straight line`:'';
   const summary=details[place.id]?.summary;$('bg-place-summary').hidden=!summary;$('bg-place-summary').replaceChildren();if(summary){const source=el('a','',summary.charAt(0).toUpperCase()+summary.slice(1)+' ↗');source.href=/^https:\/\/www\.wikidata\.org\/wiki\/Q\d+$/.test(details[place.id].source)?details[place.id].source:place.source;source.target='_blank';source.rel='noopener';$('bg-place-summary').append(source)}
   $('bg-visit-tip').textContent=place.category==='Nature'?'Check weather, trail access, and daylight before setting out. The map pin marks the site area; use the official guide to plan your route.':place.category==='Faith'?'Check visiting hours and local visitor guidance before travelling. Some spaces may be in active religious use.':'Check the official guide for current opening hours, tickets, and access before travelling.';
   showPrivatePhoto(visit);
   $('bg-place-state').textContent=visit?.photo?`✓ Photo check-in · ${friendlyDate(visit.date)}`:visit?`Earlier visit · ${friendlyDate(visit.date)}. Add a photo to complete the memory.`:'Been here? Add your photo and visit date.';
   $('bg-checkin').hidden=!!visit?.photo;$('bg-checkin').textContent=visit?'Save visit photo':'Save photo check-in';$('bg-undo').hidden=!visit;$('bg-visit-date').readOnly=!!visit;
   $('bg-photo-editor').hidden=!!visit?.photo;$('bg-focus-checkin').textContent=visit?.photo?'View my photo':visit?'＋ Add my photo':'＋ Add my visit';
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
  if(!repo||busy||photoProcessing)return;const gen=epoch,active=repo;lock(true);status('Loading your explorer…');
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
  if(!repo||busy||photoProcessing||!loaded||!id)return;
  const existing=entries.find(e=>e.id===id),date=$('bg-visit-date').value;
  if(!remove&&!$('bg-visit-date').reportValidity())return;
  if(!remove&&!draftPhoto&&!existing?.photo){$('bg-photo-input-status').textContent='Add a photo before saving your check-in.';$('bg-choose-photo').focus();$('bg-photo-editor').scrollIntoView({block:'nearest'});return}
  if(remove&&!legacy.has(id)&&!confirm('Remove this check-in and its visit photo?'))return;
  const fingerprint=JSON.stringify({id,remove,date:remove?null:date,photo:remove?null:draftPhoto?.photo.id||existing?.photo?.id});
  if(!pending||pending.fingerprint!==fingerprint)pending={fingerprint,change:{id,expectedRevision:existing?.revision??null,entry:remove?null:photoVisit({...existing,id,revision:crypto.randomUUID(),date,photo:draftPhoto?.photo||existing?.photo})},upload:remove?null:draftPhoto,uploaded:false};
  const gen=epoch,active=repo,activePhotos=photos,activeStorage=storage,change=pending;lock(true);status(remove?'Removing your check-in…':'Saving your photo and check-in…');
  try{
   const data=remove?await active.commit(change.change):await commitPhotoVisit(active,activePhotos,change);
   if(gen!==epoch)return;entries=data.entries;pending=null;dirty=false;clearDraft();clearPrivatePhoto();render();
   status(remove?'Check-in removed. Saved to your account.':'Photo check-in saved to your account.');
   // Cleanup follows a confirmed ledger change. Never delete on an uncertain save.
   if(remove&&existing?.photo){
    try{const latest=await activeStorage.read();if(latest&&!validateVisits(latest.ledger).entries.some(e=>e.photo?.id===existing.photo.id))await activePhotos.remove(existing.photo)}
    catch{if(gen===epoch)status('Check-in removed. Its old photo could not be cleaned up; it remains private.')}
   }
   if(gen===epoch)$('bg-place-name').focus({preventScroll:true});
  }catch(e){if(gen===epoch)status(`Not saved. ${e.message} Your photo and date are still here; please retry.`,true)}finally{if(gen===epoch)lock(false)}
 }
 $('bg-search').oninput=()=>{resultPage=0;if(phone.matches&&explorerView==='map'&&$('bg-search').value.trim())setView('nearby');else render()};
 document.querySelectorAll('button[data-explorer-view]').forEach(button=>button.onclick=()=>setView(button.dataset.explorerView));
 $('bg-take-photo').onclick=()=>{$('bg-camera-input').value='';$('bg-camera-input').click()};$('bg-choose-photo').onclick=()=>{$('bg-photo-input').value='';$('bg-photo-input').click()};
 for(const id of ['bg-photo-input','bg-camera-input'])$(id).onchange=event=>selectPhoto(event.target.files[0]);
 $('bg-remove-draft-photo').onclick=()=>$('bg-choose-photo').click();
 $('bg-retry-photo').onclick=()=>{privatePhotoId=null;showPrivatePhoto(entries.find(e=>e.id===selected))};
 $('bg-focus-checkin').onclick=()=>{$('bg-place-actions').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});if(!entries.find(e=>e.id===selected)?.photo)$('bg-choose-photo').focus({preventScroll:true})};for(const id of ['bg-region','bg-category','bg-filter','bg-sort'])$(id).onchange=()=>{resultPage=0;render()};
 for(const [id,step] of [['bg-page-prev',-1],['bg-page-next',1]])$(id).onclick=()=>{resultPage+=step;render();$('bg-browser').scrollIntoView({block:'start'});$('bg-results').querySelector('button')?.focus({preventScroll:true})};
 $('bg-locate').onclick=locate;$('bg-clear-location').onclick=()=>{clearLocation();render()};
 $('bg-close-detail').onclick=()=>{if(busy||photoProcessing)return;if((dirty||pending)&&!confirm('Discard the unsaved visit date?'))return;dirty=false;pending=null;clearDraft();clearPrivatePhoto();closeDetail()};
 $('bg-place-dialog').addEventListener('cancel',event=>{event.preventDefault();$('bg-close-detail').click()});
 $('bg-zoom-place').onclick=()=>{const id=selected;if(phone.matches){detailOpen=false;$('bg-place-dialog').close();$('bg-detail-home').append($('bg-detail'));$('bg-detail').hidden=true;setView('map');$('bg-map').scrollIntoView({block:'center'})}map?.focusPlace(id,true)};
 document.querySelectorAll('[data-map-style]').forEach(button=>button.onclick=()=>map?.setStyle(button.dataset.mapStyle));
 $('bg-browse').onclick=()=>{setView('nearby');$('bg-search').focus()};
 $('bg-clear-filters').onclick=()=>{resultPage=0;$('bg-search').value='';$('bg-region').value='';$('bg-category').value='';$('bg-filter').value='all';render()};
 $('bg-refresh').onclick=()=>refresh({force:true});$('bg-reset').onclick=()=>map?.reset();$('bg-checkin').onclick=()=>save(false);$('bg-undo').onclick=()=>save(true);$('bg-visit-date').oninput=()=>dirty=true;
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&repo&&!$('bulgaria-panel').hidden)refresh()});
 window.addEventListener('beforeunload',event=>{if(dirty||pending||photoProcessing){event.preventDefault();event.returnValue=''}});
 function stop(){
  epoch++;clearDraft();clearPrivatePhoto();photos=null;storage=null;$('bg-place-dialog').close();$('bg-detail-home').append($('bg-detail'));clearLocation();photoId=null;detailOpen=false;$('bg-photo-image').removeAttribute('src');$('bg-photo').hidden=true;repo?.clear();repo=null;entries=[];places=[];selected=null;pending=null;loaded=false;dirty=false;map?.destroy();map=null;
  mapState({style:'auto',satellite:false,message:''});$('bg-map').replaceChildren();$('bg-map').classList.remove('map-unavailable');$('bg-search').value='';$('bg-filter').value='all';$('bg-region').value='';$('bg-category').value='';$('bg-visit-date').value=localDate();$('bg-legacy').open=false;$('bg-browser').open=!matchMedia('(max-width:680px)').matches;
  lock(false);setView('map');status('');
 }
 stop();return{stop,refresh,hasUnsaved:()=>dirty||pending!==null||photoProcessing,start(){stop();storage=makeStorage();photos=makePhotos();repo=createBudgetRepository(storage,{entry:validateVisit,ledger:validateVisits});return refresh()}};
}
