import {createBudgetRepository} from './budget-repository.js';
import {validatePerson,validatePeople,lifeSummary} from './life-model.js';
import {localDate} from './budget-model.js';
const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n};
export function createLifeUI(makeStorage){
 const $=id=>document.getElementById(id),form=$('life-form');let repo,entries=[],epoch=0,busy=false,dirty=false,editing=null,pending=null;
 function status(text,error=false){$('life-status').textContent=text;$('life-status').classList.toggle('error',error)}
 function lock(value){busy=value;$('life-fields').disabled=value;$('life-refresh').disabled=value;document.querySelectorAll('.life-action').forEach(b=>b.disabled=value)}
 function reset(){dirty=false;editing=null;pending=null;form.reset();$('life-form-title').textContent='Add yourself or someone you love';$('life-cancel').hidden=true}
 function render(){
  const root=$('life-people');root.replaceChildren();$('life-empty').hidden=entries.length>0;
  for(const person of entries){const s=lifeSummary(person),card=el('article','card life-person'),head=el('div','life-person-head');head.append(el('h3','',person.name),el('span','life-age',`${s.elapsed} years`));card.append(head);
   card.append(el('p','muted',`Age entered on ${person.asOf} · planning age ${person.horizon}`));
   const grid=el('div','life-grid');grid.setAttribute('role','img');grid.setAttribute('aria-label',`${s.elapsed} years elapsed; ${s.remaining} years to the chosen planning age of ${person.horizon}. Each square is one year.`);
   for(let i=0;i<s.boxes;i++){const square=el('span',`life-square ${i<s.elapsed?'elapsed':''}`);square.setAttribute('aria-hidden','true');square.title=`Year ${i+1}`;grid.append(square)}card.append(grid);
   const summary=el('div','life-summary');summary.append(el('span','',`${s.elapsed} years elapsed`),el('strong','',s.remaining?`${s.remaining} years to your planning age`:'Planning age reached — life continues'));card.append(summary);
   const actions=el('div','transaction-actions'),edit=el('button','btn-ghost life-action','Edit'),del=el('button','btn-ghost danger delete-entry life-action','Delete');edit.type=del.type='button';edit.setAttribute('aria-label',`Edit ${person.name}`);del.setAttribute('aria-label',`Delete ${person.name}`);
   edit.onclick=()=>{if(busy||(dirty&&!confirm('Discard unsaved changes?')))return;editing=person;pending=null;dirty=false;$('life-name').value=person.name;$('life-age').value=person.age;$('life-horizon').value=person.horizon;$('life-form-title').textContent='Edit person';$('life-cancel').hidden=false;$('life-editor').open=true;$('life-name').focus()};
   del.onclick=()=>{if(!busy&&confirm(`Remove ${person.name} from your life view?`))save({id:person.id,entry:null,expectedRevision:person.revision})};actions.append(edit,del);card.append(actions);root.append(card);
  }lock(busy);
 }
 async function refresh(){if(!repo||busy)return;const gen=epoch,active=repo;lock(true);status('Loading your life view…');try{const data=await active.load();if(gen!==epoch)return;entries=data.entries;render();status('Up to date. Saved privately to your account.')}catch(e){if(gen===epoch)status(`Could not refresh. ${e.message}`,true)}finally{if(gen===epoch)lock(false)}}
 async function save(change){const gen=epoch,active=repo;lock(true);status('Saving…');try{const data=await active.commit(change);if(gen!==epoch)return;entries=data.entries;if(change.entry||editing?.id===change.id){reset();$('life-editor').open=false}render();status('Saved to your account.')}catch(e){if(gen===epoch)status(`Not saved. ${e.message} Your input is still here.`,true)}finally{if(gen===epoch)lock(false)}}
 form.addEventListener('input',()=>dirty=true);form.addEventListener('change',()=>dirty=true);
 form.onsubmit=async event=>{event.preventDefault();if(!repo||busy||!form.reportValidity())return;try{const values={name:$('life-name').value.trim(),age:Number($('life-age').value),horizon:Number($('life-horizon').value),asOf:localDate()},fingerprint=JSON.stringify(values);if(!pending||pending.fingerprint!==fingerprint){const id=editing?.id||crypto.randomUUID();pending={fingerprint,change:{id,expectedRevision:editing?.revision??null,entry:validatePerson({id,revision:crypto.randomUUID(),...values})}}}await save(pending.change)}catch(e){status(e.message,true)}};
 $('life-cancel').onclick=()=>{if(!dirty||confirm('Discard unsaved changes?')){reset();$('life-editor').open=false}};$('life-refresh').onclick=refresh;
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&repo&&!$('life-panel').hidden)refresh()});
 function stop(){epoch++;repo=null;entries=[];reset();$('life-editor').open=false;lock(false);render();status('')}
 stop();return{stop,refresh,hasUnsaved:()=>dirty,start(){stop();repo=createBudgetRepository(makeStorage(),{entry:validatePerson,ledger:validatePeople});return refresh()}};
}
