import { createBudgetRepository } from './budget-repository.js';
import { validateTimer, validateTimers, nextDue, daysLeft, paymentProgress, domainProgress, isDomain } from './timeto-model.js';
import { localDate, money, parseAmount } from './budget-model.js';
const friendlyDate = date => new Intl.DateTimeFormat(undefined, {day:'numeric',month:'long',year:'numeric'}).format(new Date(`${date}T12:00:00`));
const relative = days => days === null ? 'No expiry' : days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? 'Due today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
const node=(tag, cls, text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n};
export function createTimeToUI(makeStorage) {
  const $=id=>document.getElementById(id), form=$('timer-form');
  let repo, entries=[], epoch=0, busy=false, dirty=false, editing=null, pending=null;
  function status(text,error=false){$('timer-status').textContent=text;$('timer-status').classList.toggle('error',error)}
  function lock(value){busy=value;$('timer-fields').disabled=value;$('timer-refresh').disabled=value;document.querySelectorAll('.timer-action').forEach(b=>b.disabled=value)}
  function reset(){dirty=false;editing=null;pending=null;form.reset();$('timer-date').value=localDate();$('timer-title-heading').textContent='Add a countdown';$('timer-cancel').hidden=false;dateState()}
  function dateState(){
    const domain=$('timer-kind').value==='domain';
    if(domain)$('timer-repeat').value='once';
    $('timer-repeat').disabled=domain;$('timer-term-wrap').hidden=!domain;$('timer-term').required=domain;
    $('timer-date-label').textContent=domain?'Expiry date':'First due date';
    $('timer-schedule-help').textContent=domain?'The start is calculated from the expiry date and registration term. Expired domains stay overdue until you update them.':'Recurring dates repeat automatically. Shorter months use their last day.';
    $('timer-date').disabled=$('timer-repeat').value==='never';$('timer-date').required=!$('timer-date').disabled;
  }
  function render(){
    const root=$('timer-list');root.replaceChildren();
    const query=$('timer-search').value.toLowerCase(), filter=$('timer-filter').value;
    const ordered=entries.map(e=>({entry:e,days:daysLeft(e),due:nextDue(e)})).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')||a.entry.title.localeCompare(b.entry.title));
    const next=ordered.find(e=>e.days!==null&&e.days>=0), overdue=ordered.filter(e=>e.days!==null&&e.days<0).length, soon=ordered.filter(e=>e.days!==null&&e.days>=0&&e.days<=30).length;
    const overview=$('timer-overview');overview.replaceChildren();
    const upcoming=node('article','timer-next');upcoming.append(node('span','eyebrow','Next on your calendar'),node('h3','',next?next.entry.title:entries.length?'No upcoming dates':'A clear view of what’s ahead'),node('strong','timer-next-time',next?relative(next.days):'Start with one important date'),node('p','muted',next?`${friendlyDate(next.due)} · ${next.entry.group}`:'Add a renewal, a payment or something you’re looking forward to.'));
    overview.append(upcoming);
    for(const [count,label,value,cls] of [[soon,'Due in the next 30 days','soon',''],[overdue,'Past their due date','overdue','timer-overdue']]){const button=node('button',`timer-stat ${cls}`);button.type='button';button.append(node('strong','',String(count)),node('span','',label),node('small','','View dates →'));button.onclick=()=>{$('timer-filter').value=value;$('timer-search').value='';render();$('timer-filter').focus()};overview.append(button)}
    const visible=ordered.filter(({entry:e,days})=>`${e.title} ${e.group} ${e.note}`.toLowerCase().includes(query)&&(filter==='all'||filter==='soon'&&days!==null&&days>=0&&days<=30||filter==='overdue'&&days!==null&&days<0||filter==='recurring'&&['monthly','yearly'].includes(e.recurrence))).map(item=>item.entry);
    $('timer-count').textContent=`${visible.length} of ${entries.length} countdown${entries.length===1?'':'s'} · grouped, nearest dates first`;
    $('timer-empty').hidden=visible.length>0;$('timer-empty').textContent=entries.length?'No dates in this view. Try All countdowns or clear your search.':'Your calendar starts here. Choose “Add a countdown” above.';
    const groupOrder=new Map();for(const e of visible)if(!groupOrder.has(e.group))groupOrder.set(e.group,groupOrder.size);
    visible.sort((a,b)=>groupOrder.get(a.group)-groupOrder.get(b.group));
    let lastSection='';
    for(const e of visible){
      const days=daysLeft(e), due=nextDue(e), card=node('article',`card timer-card ${days!==null&&days<0?'is-overdue':days!==null&&days<=7?'is-soon':''}`);
      const section=e.group;
      if(section!==lastSection){root.append(node('h3','timer-section-title',section));lastSection=section;}
      const head=node('div','timer-card-head'), text=node('div','');text.append(node('span','eyebrow',e.group),node('h3','',e.title));
      const badge=node('strong',`timer-days ${days!==null&&days<0?'negative':days!==null&&days<=30?'expense':''}`,relative(days));head.append(text,badge);
      card.append(head,node('p','muted',due?`${friendlyDate(due)} · ${isDomain(e)?`Domain · ${e.termYears??1}-year term`:e.recurrence==='once'?'One-time':e.recurrence==='monthly'?'Repeats monthly':'Repeats yearly'}`:'Never expires'));
      if(e.amount!==null)card.append(node('p','timer-amount',money(e.amount,e.currency)));
      const domain=domainProgress(e),cycle=domain||paymentProgress(e);
      if(cycle){
        const wrap=node('div','payment-progress'),label=node('p','',domain?(days<0?`Expired ${Math.abs(days)} days ago`:days===0?'Expires today':`${cycle.remaining} days until expiry`):`${cycle.remaining} days until ${e.amount!==null?'payment':'next occurrence'} · ${cycle.remaining>cycle.cycleDays?'cycle not started':`${cycle.cycleDays}-day cycle`}`),bar=node('progress','');
        bar.max=100;bar.value=cycle.percent;bar.setAttribute('aria-label',`${e.title}: ${cycle.remaining} days remaining`);wrap.append(label,bar);
        if(domain){const dates=node('div','progress-dates');dates.append(node('span','',`Start · ${friendlyDate(domain.start)}`),node('span','',`Expiry · ${friendlyDate(domain.end)}`));wrap.append(dates);if(domain.start>localDate())wrap.append(node('p','field-hint','Registration period has not started. Check the term if this domain is already active.'));}
        card.append(wrap);
      }
      if(e.note)card.append(node('p','timer-note',e.note));
      const actions=node('div','transaction-actions');
      const edit=node('button','btn-ghost timer-action','Edit');edit.type='button';edit.setAttribute('aria-label',`Edit ${e.title}`);edit.onclick=()=>{
        if(busy || (dirty&&!confirm('Discard the unsaved countdown and edit this one?')))return;
        editing=e;pending=null;dirty=false;
        for(const [id,value] of Object.entries({'timer-title':e.title,'timer-group':e.group,'timer-date':e.date,'timer-repeat':e.recurrence,'timer-note':e.note,'timer-amount':e.amount===null?'':(e.amount/100).toFixed(2),'timer-currency':e.currency,'timer-kind':isDomain(e)?'domain':'countdown','timer-term':e.termYears??1}))$(id).value=value;
        dateState();$('timer-editor').open=true;$('timer-title-heading').textContent='Edit countdown';$('timer-cancel').hidden=false;$('timer-title').focus();
      };
      const del=node('button','btn-ghost danger delete-entry timer-action','Delete');del.type='button';del.setAttribute('aria-label',`Delete ${e.title}`);del.onclick=()=>{if(!busy&&confirm(`Delete “${e.title}”?`))save({id:e.id,expectedRevision:e.revision,entry:null})};
      actions.append(edit,del);card.append(actions);root.append(card);
    }
    lock(busy);
  }
  async function refresh({force=false}={}){if(!repo||busy)return;const generation=epoch, active=repo;lock(true);status('Loading countdowns…');try{const data=await active.load({force});if(generation!==epoch)return;entries=data.entries;render();status('Up to date. Countdowns are saved in your account.')}catch(e){if(generation===epoch)status(`Could not refresh: ${e.message}`,true)}finally{if(generation===epoch)lock(false)}}
  async function save(change){const generation=epoch,active=repo;lock(true);status('Saving…');try{const data=await active.commit(change);if(generation!==epoch)return;entries=data.entries;if(change.entry||editing?.id===change.id){reset();$('timer-editor').open=false;}render();status('Saved to your account.')}catch(e){if(generation===epoch)status(`Not saved. ${e.message} Keep this page open and retry.`,true)}finally{if(generation===epoch)lock(false)}}
  form.addEventListener('input',()=>dirty=true);form.addEventListener('change',()=>dirty=true);
  $('timer-kind').onchange=dateState;$('timer-repeat').onchange=dateState;$('timer-search').oninput=render;$('timer-filter').onchange=render;$('timer-refresh').onclick=()=>refresh({force:true});
  $('timer-cancel').onclick=()=>{if(!dirty||confirm('Discard unsaved changes?')){reset();$('timer-editor').open=false;$('timer-editor').querySelector('summary').focus()}};
  form.onsubmit=async event=>{event.preventDefault();if(busy||!repo||!form.reportValidity())return;try{
    const values={title:$('timer-title').value.trim(),group:$('timer-group').value.trim(),date:$('timer-repeat').value==='never'?'':$('timer-date').value,recurrence:$('timer-repeat').value,note:$('timer-note').value.trim(),amount:$('timer-amount').value.trim()?parseAmount($('timer-amount').value):null,currency:$('timer-currency').value};
    values.kind=$('timer-kind').value;if(values.kind==='domain')values.termYears=Number($('timer-term').value);
    const fingerprint=JSON.stringify(values);if(!pending||pending.fingerprint!==fingerprint){const id=editing?.id||crypto.randomUUID();const entry={...editing,id,revision:crypto.randomUUID(),...values};if(values.kind!=='domain')delete entry.termYears;pending={fingerprint,change:{id,expectedRevision:editing?.revision??null,entry:validateTimer(entry)}}}await save(pending.change);
  }catch(e){status(e.message,true)}};
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&repo&&!$('timeto-panel').hidden)refresh()});
  setInterval(()=>{if(repo&&!document.hidden&&!$('timeto-panel').hidden)render()},60000);
  function stop(){epoch++;repo?.clear();repo=null;entries=[];reset();$('timer-editor').open=false;$('timer-filter').value='all';$('timer-search').value='';lock(false);render();status('')}
  stop();return{stop,refresh,hasUnsaved:()=>dirty,start(){stop();repo=createBudgetRepository(makeStorage(),{entry:validateTimer,ledger:validateTimers});return refresh()}};
}
