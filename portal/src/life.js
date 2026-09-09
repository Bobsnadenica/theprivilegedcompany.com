import {createBudgetRepository} from './budget-repository.js';
import {validatePerson,validatePeople,lifeSummary,isPeriod,periodSummary,periodGrid} from './life-model.js';
import {localDate} from './budget-model.js';
import {friendlyDate} from './calendar.js';
const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n};
const units={days:'Days',months:'Months',years:'Years'};

export function createLifeUI(makeStorage){
 const $=id=>document.getElementById(id),form=$('life-form');
 let repo,entries=[],epoch=0,busy=false,dirty=false,editing=null,pending=null,pendingView=null;
 const pages=new Map();
 function status(text,error=false){$('life-status').textContent=text;$('life-status').classList.toggle('error',error)}
 function lock(value){busy=value;$('life-fields').disabled=value;$('life-refresh').disabled=value;document.querySelectorAll('.life-action').forEach(b=>b.disabled=value)}
 function reset(){dirty=false;editing=null;pending=null;form.reset();$('life-start').value=localDate();$('life-form-title').textContent='What time would you like to see?';$('life-form-help').textContent='Both dates are included. Choose a useful time horizon; the end date is yours to set.';$('life-cancel').hidden=true;}
 function edit(person){
  if(busy||(dirty&&!confirm('Discard unsaved changes?')))return;
  reset();editing=person;$('life-name').value=person.name;
  $('life-start').value=isPeriod(person)?person.startDate:'';$('life-end').value=isPeriod(person)?person.endDate:'';$('life-unit').value=isPeriod(person)?person.unit:'years';
  $('life-form-title').textContent=isPeriod(person)?'Edit time period':'Set exact dates';
  if(!isPeriod(person))$('life-form-help').textContent=`Your saved age (${person.age}) and planning age (${person.horizon}) stay as a snapshot. Enter the actual dates for your new grid.`;
  $('life-cancel').hidden=false;$('life-editor').open=true;$('life-name').focus();
 }
 function renderPeriod(person,card){
  const summary=periodSummary(person),gridData=periodGrid(person,localDate(),pages.get(person.id));
  const caption=summary.state==='future'?`Starts in ${summary.untilStart.toLocaleString()} days`:summary.state==='completed'?'Period complete':`${summary.remaining.toLocaleString()} days remaining, including today`;
  const head=el('div','life-person-head');head.append(el('h3','',person.name),el('span',`period-state ${summary.state}`,summary.state==='active'?'In progress':summary.state==='future'?'Still ahead':'Complete'));card.append(head);
  card.append(el('p','muted period-dates',`${friendlyDate(person.startDate)} — ${friendlyDate(person.endDate)}`));
  const overview=el('div','period-overview');overview.append(el('strong','',`${Number(summary.percent.toFixed(1))}%`),el('div','',caption));card.append(overview);
  const line=el('progress','period-progress');line.max=summary.total;line.value=summary.elapsed;line.setAttribute('aria-label',`${person.name}: ${summary.elapsed} of ${summary.total} days elapsed`);card.append(line);
  card.append(el('p','period-count',`${summary.elapsed.toLocaleString()} days elapsed · ${summary.total.toLocaleString()} days in this period`));
  const toolbar=el('div','period-toolbar'),switcher=el('div','unit-switch');switcher.setAttribute('role','group');switcher.setAttribute('aria-label',`Box size for ${person.name}`);
  for(const [unit,label] of Object.entries(units)){
   const button=el('button','life-action',label);button.type='button';button.setAttribute('aria-pressed',String(person.unit===unit));
   button.onclick=()=>{if(!busy&&person.unit!==unit){if(pendingView?.id!==person.id||pendingView?.entry.unit!==unit)pendingView={id:person.id,expectedRevision:person.revision,entry:{...person,unit,revision:crypto.randomUUID()}};save(pendingView,false)}};switcher.append(button);
  }
  toolbar.append(switcher);card.append(toolbar);
  const pager=el('div','period-pager');pager.append(el('span','',gridData.year===gridData.endYear?String(gridData.year):`${gridData.year} – ${gridData.endYear}`));
  for(const [target,label,symbol] of [[gridData.previous,'Previous period','←'],[gridData.next,'Next period','→']]){
   const button=el('button','btn-ghost',symbol);button.type='button';button.disabled=target===null;button.setAttribute('aria-label',`${label} for ${person.name}`);
   button.onclick=()=>{pages.set(person.id,target);render();document.querySelector(`[data-person="${person.id}"] .period-pager`).focus()};pager.append(button);
  }
  pager.tabIndex=-1;card.append(pager);
  const grid=el('div',`period-grid unit-${person.unit}`);grid.setAttribute('role','img');grid.setAttribute('aria-label',`${person.name}. Each box is one ${person.unit.slice(0,-1)}. Showing ${gridData.year} to ${gridData.endYear}. ${summary.elapsed} of ${summary.total} days elapsed; ${summary.remaining} remain.`);
  for(const group of gridData.groups){
   const section=el('div','period-group');section.append(el('span','period-group-label',group.label));const cells=el('div','period-cells');
   for(const cell of group.cells){const square=el('span',`life-square ${cell.state} ${cell.partial?'partial':''}`);square.setAttribute('aria-hidden','true');square.title=`${friendlyDate(cell.start)}${cell.end!==cell.start?` – ${friendlyDate(cell.end)}`:''}: ${cell.state}${cell.partial?' (partial calendar period)':''}`;cells.append(square)}
   section.append(cells);grid.append(section);
  }
  card.append(grid);
  if(person.legacyAge)card.append(el('p','field-hint',`Original snapshot preserved: age ${person.legacyAge.age}, planning age ${person.legacyAge.horizon}, entered ${person.legacyAge.asOf}.`));
 }
 function renderLegacy(person,card){
  const s=lifeSummary(person);card.append(el('span','eyebrow','Saved age snapshot'),el('h3','',person.name),el('p','muted',`Age ${person.age} · planning age ${person.horizon} · entered ${person.asOf}`));
  const grid=el('div','life-grid');grid.setAttribute('role','img');grid.setAttribute('aria-label',`${s.elapsed} years elapsed; ${s.remaining} years to the chosen planning age.`);
  for(let i=0;i<s.boxes;i++){const square=el('span',`life-square ${i<s.elapsed?'elapsed':''}`);square.setAttribute('aria-hidden','true');grid.append(square)}
  card.append(grid,el('p','field-hint','Your original snapshot is intact. Set exact dates to switch between days, months, and years. The planning age is not a lifespan prediction.'));
 }
 function render(){
  const root=$('life-people');root.replaceChildren();$('life-empty').hidden=entries.length>0;
  for(const person of entries){
   const card=el('article','card life-person');card.dataset.person=person.id;
   if(isPeriod(person))renderPeriod(person,card);else renderLegacy(person,card);
   const actions=el('div','transaction-actions'),editButton=el('button','btn-ghost life-action',isPeriod(person)?'Edit':'Set exact dates'),del=el('button','btn-ghost danger delete-entry life-action','Delete');
   editButton.type=del.type='button';editButton.setAttribute('aria-label',`${isPeriod(person)?'Edit':'Set exact dates for'} ${person.name}`);del.setAttribute('aria-label',`Delete ${person.name}`);
   editButton.onclick=()=>edit(person);del.onclick=()=>{if(!busy&&confirm(`Delete “${person.name}”?`))save({id:person.id,entry:null,expectedRevision:person.revision})};actions.append(editButton,del);card.append(actions);root.append(card);
  }lock(busy);
 }
 async function refresh({force=false}={}){
  if(!repo||busy)return;const gen=epoch,active=repo;lock(true);status('Loading your time periods…');
  try{const data=await active.load({force});if(gen!==epoch)return;entries=data.entries;render();status('Account records loaded. Your time periods are private.')}
  catch(e){if(gen===epoch)status(`Could not refresh. ${e.message}`,true)}finally{if(gen===epoch)lock(false)}
 }
 async function save(change,finishEdit=true){
  const gen=epoch,active=repo;let focusAfterSave=null;lock(true);status('Saving…');
  try{
   const data=await active.commit(change);if(gen!==epoch)return;entries=data.entries;
   if(finishEdit&&(change.entry||editing?.id===change.id)){reset();$('life-editor').open=false}
   else if(editing?.id===change.id){editing=entries.find(e=>e.id===change.id);pending=null;}
   if(pendingView?.id===change.id)pendingView=null;
   render();status(dirty?'View saved. Your form still has unsaved changes.':'Saved to your account.');
   focusAfterSave=!finishEdit?document.querySelector(`[data-person="${change.id}"] .unit-switch [aria-pressed="true"]`):$('life-editor').querySelector('summary');
  }catch(e){if(gen===epoch)status(`Not saved. ${e.message} Your input is still here.`,true)}finally{if(gen===epoch){lock(false);focusAfterSave?.focus({preventScroll:true})}}
 }
 form.addEventListener('input',()=>dirty=true);form.addEventListener('change',()=>dirty=true);
 form.onsubmit=async event=>{
  event.preventDefault();if(!repo||busy||!form.reportValidity())return;
  try{
   const values={name:$('life-name').value.trim(),startDate:$('life-start').value,endDate:$('life-end').value,unit:$('life-unit').value};
   const fingerprint=JSON.stringify(values);
   if(!pending||pending.fingerprint!==fingerprint){
    const id=editing?.id||crypto.randomUUID(),next={...editing,id,revision:crypto.randomUUID(),...values};
    if(editing&&!isPeriod(editing)){next.legacyAge={age:editing.age,horizon:editing.horizon,asOf:editing.asOf};delete next.age;delete next.horizon;delete next.asOf;}
    pending={fingerprint,change:{id,expectedRevision:editing?.revision??null,entry:validatePerson(next)}};
   }await save(pending.change);
  }catch(e){status(e.message,true)}
 };
 $('life-cancel').onclick=()=>{if(!dirty||confirm('Discard unsaved changes?')){reset();$('life-editor').open=false;$('life-editor').querySelector('summary').focus()}};
 $('life-refresh').onclick=()=>refresh({force:true});
 window.addEventListener('beforeunload',e=>{if(dirty||pendingView){e.preventDefault();e.returnValue=''}});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&repo&&!$('life-panel').hidden)refresh()});
 function stop(){epoch++;repo?.clear();repo=null;entries=[];pendingView=null;pages.clear();reset();$('life-editor').open=false;lock(false);render();status('')}
 stop();return{stop,refresh,hasUnsaved:()=>dirty||pendingView!==null,start(){stop();repo=createBudgetRepository(makeStorage(),{entry:validatePerson,ledger:validatePeople});return refresh()}};
}
