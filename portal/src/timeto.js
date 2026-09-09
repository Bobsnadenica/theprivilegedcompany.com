import { createBudgetRepository } from './budget-repository.js';
import { validateTimer, validateTimers, nextDue, daysLeft } from './timeto-model.js';
import { localDate, money, parseAmount } from './budget-model.js';
const node=(tag, cls, text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n};
export function createTimeToUI(makeStorage) {
  const $=id=>document.getElementById(id), form=$('timer-form');
  let repo, entries=[], epoch=0, busy=false, dirty=false, editing=null, pending=null;
  function status(text,error=false){$('timer-status').textContent=text;$('timer-status').classList.toggle('error',error)}
  function lock(value){busy=value;$('timer-fields').disabled=value;$('timer-refresh').disabled=value;document.querySelectorAll('.timer-action').forEach(b=>b.disabled=value)}
  function reset(){dirty=false;editing=null;pending=null;form.reset();$('timer-date').value=localDate();$('timer-title-heading').textContent='Add a countdown';$('timer-cancel').hidden=true;dateState()}
  function dateState(){$('timer-date').disabled=$('timer-repeat').value==='never';$('timer-date').required=!$('timer-date').disabled}
  function render(){
    const root=$('timer-list');root.replaceChildren();
    const query=$('timer-search').value.toLowerCase();
    const visible=entries.filter(e=>`${e.title} ${e.group} ${e.note}`.toLowerCase().includes(query)).sort((a,b)=>(nextDue(a)||'9999').localeCompare(nextDue(b)||'9999')||a.title.localeCompare(b.title));
    $('timer-count').textContent=`${entries.length} saved countdown${entries.length===1?'':'s'}`;
    $('timer-empty').hidden=visible.length>0;$('timer-empty').textContent=entries.length?'No countdowns match your search.':'Add your first countdown. It will be saved privately to your account.';
    for(const e of visible){
      const days=daysLeft(e), due=nextDue(e), card=node('article','card timer-card');
      const head=node('div','timer-card-head'), text=node('div','');text.append(node('span','eyebrow',e.group),node('h3','',e.title));
      const badge=node('strong',`timer-days ${days!==null&&days<0?'negative':days!==null&&days<=30?'expense':''}`,days===null?'∞':days<0?`${Math.abs(days)}d overdue`:days===0?'Today':`${days}d left`);head.append(text,badge);
      card.append(head,node('p','muted',due?`${due} · ${e.recurrence==='once'?'One-time':e.recurrence==='monthly'?'Monthly':'Yearly'}`:'Never expires'));
      if(e.amount!==null)card.append(node('p','timer-amount',money(e.amount,e.currency)));
      if(e.note)card.append(node('p','timer-note',e.note));
      const actions=node('div','transaction-actions');
      const edit=node('button','btn-ghost timer-action','Edit');edit.type='button';edit.setAttribute('aria-label',`Edit ${e.title}`);edit.onclick=()=>{
        if(busy || (dirty&&!confirm('Discard the unsaved countdown and edit this one?')))return;
        editing=e;pending=null;dirty=false;
        for(const [id,value] of Object.entries({'timer-title':e.title,'timer-group':e.group,'timer-date':e.date,'timer-repeat':e.recurrence,'timer-note':e.note,'timer-amount':e.amount===null?'':(e.amount/100).toFixed(2),'timer-currency':e.currency}))$(id).value=value;
        dateState();$('timer-title-heading').textContent='Edit countdown';$('timer-cancel').hidden=false;$('timer-title').focus();
      };
      const del=node('button','btn-ghost danger delete-entry timer-action','Delete');del.type='button';del.setAttribute('aria-label',`Delete ${e.title}`);del.onclick=()=>{if(!busy&&confirm(`Delete “${e.title}”?`))save({id:e.id,expectedRevision:e.revision,entry:null})};
      actions.append(edit,del);card.append(actions);root.append(card);
    }
    lock(busy);
  }
  async function refresh(){if(!repo||busy)return;const generation=epoch, active=repo;lock(true);status('Loading countdowns…');try{const data=await active.load();if(generation!==epoch)return;entries=data.entries;render();status('Up to date. Countdowns are saved in your account.')}catch(e){if(generation===epoch)status(`Could not refresh: ${e.message}`,true)}finally{if(generation===epoch)lock(false)}}
  async function save(change){const generation=epoch,active=repo;lock(true);status('Saving…');try{const data=await active.commit(change);if(generation!==epoch)return;entries=data.entries;if(change.entry||editing?.id===change.id)reset();render();status('Saved to your account.')}catch(e){if(generation===epoch)status(`Not saved. ${e.message} Keep this page open and retry.`,true)}finally{if(generation===epoch)lock(false)}}
  form.addEventListener('input',()=>dirty=true);form.addEventListener('change',()=>dirty=true);
  $('timer-repeat').onchange=dateState;$('timer-search').oninput=render;$('timer-refresh').onclick=refresh;
  $('timer-cancel').onclick=()=>{if(!dirty||confirm('Discard unsaved changes?'))reset()};
  form.onsubmit=async event=>{event.preventDefault();if(busy||!repo||!form.reportValidity())return;try{
    const values={title:$('timer-title').value.trim(),group:$('timer-group').value.trim(),date:$('timer-repeat').value==='never'?'':$('timer-date').value,recurrence:$('timer-repeat').value,note:$('timer-note').value.trim(),amount:$('timer-amount').value.trim()?parseAmount($('timer-amount').value):null,currency:$('timer-currency').value};
    const fingerprint=JSON.stringify(values);if(!pending||pending.fingerprint!==fingerprint){const id=editing?.id||crypto.randomUUID();pending={fingerprint,change:{id,expectedRevision:editing?.revision??null,entry:validateTimer({id,revision:crypto.randomUUID(),...values})}}}await save(pending.change);
  }catch(e){status(e.message,true)}};
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&repo&&!$('timeto-panel').hidden)refresh()});
  setInterval(()=>{if(repo&&!document.hidden&&!$('timeto-panel').hidden)render()},60000);
  function stop(){epoch++;repo=null;entries=[];reset();$('timer-search').value='';lock(false);render();status('')}
  stop();return{stop,refresh,hasUnsaved:()=>dirty,start(){stop();repo=createBudgetRepository(makeStorage(),{entry:validateTimer,ledger:validateTimers});return refresh()}};
}
