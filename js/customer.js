const els = {
  customer:      document.getElementById('customer'),
  period:        document.getElementById('period'),
  month:         document.getElementById('month'),
  year:          document.getElementById('year'),
  monthField:    document.getElementById('monthField'),
  yearField:     document.getElementById('yearField'),
  totalHours:    document.getElementById('totalHours'),
  totalCost:     document.getElementById('totalCost'),
  currencyLabel: document.getElementById('currencyLabel'),
  costHead:      document.getElementById('costHead'),
  logCostHead:   document.getElementById('logCostHead'),
  bars:          document.getElementById('bars'),
  donut:         document.getElementById('donut'),
  legend:        document.getElementById('legend'),
  logs:          document.getElementById('logs'),
  runningList:   document.getElementById('runningList'),
  consultants:   document.getElementById('consultants'),
  forecastHead:  document.getElementById('forecastHead'),
  approve:       document.getElementById('approve'),
  revokeApproval:document.getElementById('revokeApproval'),
  approverName:  document.getElementById('approverName'),
  approvalState: document.getElementById('approvalState'),
  apiError:      document.getElementById('apiError')
};

let state = {
  customers: [],
  entries: [],
  running: [],
  approvalInfo: null,
  currency: 'SEK'
};

function monthKey(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  return `${y}-${m}`;
}

function monthStartLocal(key){
  const [y,m] = key.split('-').map(Number);
  return new Date(y, m-1, 1, 0,0,0,0);
}

function monthEndLocal(key){
  const d = monthStartLocal(key);
  return new Date(d.getFullYear(), d.getMonth()+1, 1, 0,0,0,0);
}

function isCurrentMonthSelected(){
  if(els.period.value !== 'month') return false;
  return els.month.value === monthKey(new Date());
}

function clearBanner(){
  if(!els.apiError) return;
  els.apiError.style.display = 'none';
  els.apiError.textContent = '';
}

function showBanner(text){
  if(!els.apiError) return;
  els.apiError.style.display = '';
  els.apiError.textContent = text;
}

function updateCurrencyDisplay(code){
  state.currency = code || 'SEK';
  if(els.currencyLabel) els.currencyLabel.textContent = state.currency;
  if(els.costHead) els.costHead.textContent = `Cost (${state.currency})`;
  if(els.logCostHead) els.logCostHead.textContent = `Cost (${state.currency})`;
}

/**
 * Compute duration hours from entry data.
 * Prefers DurationSeconds, falls back to timestamp math.
 */
function getDurationHours(e){
  const secs = Number(e.durationSeconds);
  if(Number.isFinite(secs) && secs > 0) return secs / 3600;

  if(e.startTimeUtc && e.endTimeUtc){
    const s = new Date(e.startTimeUtc).getTime();
    const en = new Date(e.endTimeUtc).getTime();
    if(Number.isFinite(s) && Number.isFinite(en) && en >= s){
      return (en - s) / 3600000;
    }
  }

  const secsSoFar = Number(e.durationSecondsSoFar);
  if(Number.isFinite(secsSoFar) && secsSoFar > 0) return secsSoFar / 3600;

  return 0;
}

function calcTotals(entries){
  let hours = 0;
  let cost = 0;
  entries.forEach(e=>{
    hours += getDurationHours(e);
    const c = Number(e.costAmount||0);
    if(Number.isFinite(c)) cost += c;
  });
  return { hours, cost };
}

function groupSum(entries, keyFn, valFn){
  const map = new Map();
  entries.forEach(e=>{
    const k = keyFn(e);
    const v = valFn(e);
    map.set(k, (map.get(k)||0) + v);
  });
  return map;
}

// ---- Approval (server-side) ----

function getApprovalPeriodKey(){
  if(els.period.value !== 'month') return null;
  return els.month.value || null;
}

async function loadApprovalState(){
  const cid = Number(els.customer.value);
  const pk = getApprovalPeriodKey();
  if(!cid || !pk){
    state.approvalInfo = null;
    return;
  }

  try{
    const info = await API.get(`/api/approval?customerId=${cid}&periodKey=${pk}`);
    state.approvalInfo = info;
  }catch{
    state.approvalInfo = null;
  }
}

function renderApprovalState(){
  const pk = getApprovalPeriodKey();
  const showApproval = !!pk; // Only show for month view

  els.approve.style.display = showApproval ? '' : 'none';
  els.approverName.parentElement.style.display = showApproval ? '' : 'none';

  if(!showApproval){
    els.approvalState.textContent = '';
    els.revokeApproval.style.display = 'none';
    return;
  }

  const info = state.approvalInfo;
  const isApproved = info && info.isApproved;

  if(isApproved){
    els.approvalState.textContent = `Approved by ${info.approvedBy} on ${new Date(info.approvedAtUtc).toLocaleDateString()}`;
    els.approve.style.display = 'none';
    els.revokeApproval.style.display = '';
  } else {
    els.approvalState.textContent = 'Not approved';
    els.approve.style.display = '';
    els.revokeApproval.style.display = 'none';
  }
}

// ---- Rendering ----

function render(){
  const ended = state.entries.filter(e=>!!e.endTimeUtc);

  const totals = calcTotals(ended);
  els.totalHours.textContent = totals.hours.toFixed(2);
  els.totalCost.textContent = Math.round(totals.cost).toString();

  els.monthField.style.display = els.period.value === 'month' ? '' : 'none';
  els.yearField.style.display = els.period.value === 'ytd' ? '' : 'none';

  els.forecastHead.style.display = isCurrentMonthSelected() ? '' : 'none';

  renderBars(ended);
  renderDonut(ended);
  renderLogs(ended);
  renderRunning(state.running);
  renderConsultants(ended, state.running);
  renderApprovalState();
}

function renderBars(entries){
  els.bars.innerHTML='';
  const map = groupSum(entries, e=>e.taskName || '—', e=>Number(e.costAmount||0));
  const rows = [...map.entries()].map(([task, cost])=>({task, cost})).sort((a,b)=>b.cost-a.cost);
  const max = Math.max(1, ...rows.map(r=>r.cost));

  rows.forEach(r=>{
    const row = document.createElement('div');
    row.className='barRow';
    row.innerHTML = `
      <div>${r.task}</div>
      <div class="bar"><i style="width:${(r.cost/max*100).toFixed(1)}%"></i></div>
      <div style="text-align:right">${Math.round(r.cost)}</div>
    `;
    els.bars.appendChild(row);
  });

  if(!rows.length){
    const empty = document.createElement('div');
    empty.style.color = 'var(--muted)';
    empty.style.fontWeight = '900';
    empty.style.fontSize = '12px';
    empty.textContent = 'No data in selected period.';
    els.bars.appendChild(empty);
  }
}

function renderDonut(entries){
  const map = groupSum(entries, e=>e.taskName || '—', e=>Number(e.costAmount||0));
  const items = [...map.entries()].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);

  drawDonut(els.donut, items);

  els.legend.innerHTML='';
  items.slice(0,6).forEach((it, idx)=>{
    const li = document.createElement('div');
    li.className = 'legendItem';
    const alpha = 0.18 + (idx % 6) * 0.08;
    li.innerHTML = `
      <span class="swatch" style="background: rgba(255,255,255,${alpha.toFixed(2)})"></span>
      <span>${it.label}</span>
      <span style="margin-left:auto; font-variant-numeric: tabular-nums">${Math.round(it.value)}</span>
    `;
    els.legend.appendChild(li);
  });
}

function renderLogs(entries){
  els.logs.innerHTML='';

  entries
    .slice()
    .sort((a,b)=>new Date(a.startTimeUtc) - new Date(b.startTimeUtc))
    .forEach(e=>{
      const tr = document.createElement('tr');
      const d = new Date(e.startTimeUtc);
      const h = getDurationHours(e);

      tr.innerHTML = `
        <td>${formatYYYYMMDD(d)}</td>
        <td>${formatHHMM(e.startTimeUtc)}</td>
        <td>${e.endTimeUtc ? formatHHMM(e.endTimeUtc) : ''}</td>
        <td>${e.taskName || ''}</td>
        <td>${e.responsibleName || ''}</td>
        <td style="text-align:right">${h.toFixed(2)}</td>
        <td style="text-align:right">${Math.round(Number(e.costAmount||0))}</td>
      `;
      els.logs.appendChild(tr);
    });
}

function renderRunning(running){
  els.runningList.innerHTML='';

  if(!running.length){
    const empty = document.createElement('div');
    empty.style.color = 'var(--muted)';
    empty.style.fontWeight = '900';
    empty.style.fontSize = '12px';
    empty.textContent = 'No active timers.';
    els.runningList.appendChild(empty);
    return;
  }

  running
    .slice()
    .sort((a,b)=>new Date(b.startTimeUtc) - new Date(a.startTimeUtc))
    .forEach(e=>{
      const start = new Date(e.startTimeUtc);
      const secs = Math.max(0, Math.floor((Date.now() - start.getTime())/1000));

      const row = document.createElement('div');
      row.className = 'runningItem';
      row.innerHTML = `
        <div>
          <b>${e.consultantName || 'Consultant'}</b>
          <small>${e.taskName || ''}</small>
        </div>
        <div class="runningRight">
          ${formatHMS(secs)}
          <div style="margin-top:2px; color: var(--muted); font-size:12px; font-weight:900">since ${formatHHMM(start)}</div>
        </div>
      `;
      els.runningList.appendChild(row);
    });
}

function renderConsultants(entries, running){
  els.consultants.innerHTML='';

  const costByConsultant = groupSum(entries, e=>e.consultantName || 'Consultant', e=>Number(e.costAmount||0));
  const hoursByConsultant = groupSum(entries, e=>e.consultantName || 'Consultant', e=>getDurationHours(e));

  const runningByConsultant = new Map();
  running.forEach(r=>runningByConsultant.set(r.consultantName || 'Consultant', r));

  const rows = [...costByConsultant.keys()].map(name=>{
    const hours = hoursByConsultant.get(name) || 0;
    const cost = costByConsultant.get(name) || 0;
    const run = runningByConsultant.get(name);
    return {
      name,
      hours,
      cost,
      runningTask: run ? (run.taskName || '') : '',
      runningSince: run ? run.startTimeUtc : null
    };
  }).sort((a,b)=>b.cost-a.cost);

  const showForecast = isCurrentMonthSelected();
  const forecastMultiplier = (()=>{
    if(!showForecast) return 1;
    const now = new Date();
    const elapsedDays = Math.max(1, now.getDate());
    const totalDays = daysInMonth(now.getFullYear(), now.getMonth());
    return totalDays / elapsedDays;
  })();

  rows.forEach(r=>{
    const tr = document.createElement('tr');
    const forecast = r.cost * forecastMultiplier;

    const runningText = r.runningTask
      ? `${r.runningTask} (${formatHHMM(r.runningSince)})`
      : '';

    tr.innerHTML = `
      <td>${r.name}</td>
      <td style="text-align:right">${r.hours.toFixed(2)}</td>
      <td style="text-align:right">${Math.round(r.cost)}</td>
      <td>${runningText}</td>
      <td style="text-align:right; display:${showForecast ? '' : 'none'}">${Math.round(forecast)}</td>
    `;
    els.consultants.appendChild(tr);
  });

  if(!rows.length){
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="5" style="color:var(--muted); font-weight:900; font-size:12px">No consultant data.</td>`;
    els.consultants.appendChild(tr);
  }
}

// ---- Data loading ----

async function refresh(){
  clearBanner();

  const cid = Number(els.customer.value);
  if(!cid) return;

  // Update currency from selected customer
  const selectedCustomer = state.customers.find(c => c.customerId === cid);
  if(selectedCustomer) updateCurrencyDisplay(selectedCustomer.currencyCode);

  let fromIso = '';
  let toIso = '';
  const p = els.period.value;

  if(p === 'month'){
    const fromLocal = monthStartLocal(els.month.value);
    const toLocal = monthEndLocal(els.month.value);
    fromIso = fromLocal.toISOString();
    toIso = toLocal.toISOString();
  }

  if(p === 'ytd'){
    const y = Number(els.year.value);
    const fromLocal = new Date(y,0,1,0,0,0,0);
    const now = new Date();
    const toLocal = (y === now.getFullYear()) ? addDays(startOfLocalDay(now), 1) : new Date(y+1,0,1,0,0,0,0);
    fromIso = fromLocal.toISOString();
    toIso = toLocal.toISOString();
  }

  const q = new URLSearchParams({ customerId: String(cid) });
  if(fromIso) q.set('from', fromIso);
  if(toIso) q.set('to', toIso);

  state.entries = await API.get(`/api/timeentries?${q.toString()}`);
  state.running = await API.get(`/api/timeentries?customerId=${encodeURIComponent(cid)}&running=1`);
  await loadApprovalState();

  render();
}

function pickLatestMonthWithData(allEntries){
  const ended = (allEntries || []).filter(e => e && e.startTimeUtc && e.endTimeUtc);
  if(!ended.length) return null;

  let max = null;
  for(const e of ended){
    const d = new Date(e.startTimeUtc);
    if(isNaN(d)) continue;
    if(!max || d > max) max = d;
  }
  return max ? monthKey(max) : null;
}

async function boot(){
  clearBanner();

  state.customers = await API.get('/api/customers');
  if(!Array.isArray(state.customers) || !state.customers.length){
    throw new Error('No customers returned from API (/api/customers).');
  }

  els.customer.innerHTML='';
  state.customers.forEach(c=>{
    els.customer.append(new Option(c.customerName, c.customerId));
  });

  // Update currency for first customer
  if(state.customers[0]) updateCurrencyDisplay(state.customers[0].currencyCode);

  // months/years
  els.month.innerHTML='';
  els.year.innerHTML='';

  const now = new Date();
  for(let i=0;i<24;i++){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const mk = monthKey(d);
    els.month.append(new Option(mk, mk));
  }

  for(let y=now.getFullYear(); y>=now.getFullYear()-6; y--){
    els.year.append(new Option(String(y), String(y)));
  }

  // Defaults
  els.customer.value = String(state.customers[0]?.customerId || '');
  els.period.value = 'month';
  els.month.value = monthKey(now);
  els.year.value = String(now.getFullYear());

  // Auto-pick month with data
  try{
    const cid = Number(els.customer.value);
    const all = await API.get(`/api/timeentries?customerId=${encodeURIComponent(cid)}`);
    const mk = pickLatestMonthWithData(all);
    if(mk){
      const hasOpt = Array.from(els.month.options).some(o => o.value === mk);
      if(hasOpt) els.month.value = mk;
    }
  }catch{ /* ignore */ }

  // Restore approver name
  const savedName = localStorage.getItem('tt_approverName');
  if(savedName) els.approverName.value = savedName;

  // Wire events
  ['customer','period','month','year'].forEach(id=>{
    els[id].addEventListener('change', ()=> refresh().catch(err=>{
      console.error(err);
      showBanner(`Refresh failed: ${err?.message || err}`);
    }));
  });

  els.customer.addEventListener('change', ()=>{
    const c = state.customers.find(c => c.customerId === Number(els.customer.value));
    if(c) updateCurrencyDisplay(c.currencyCode);
  });

  els.approve.addEventListener('click', async ()=>{
    const name = (els.approverName.value || '').trim();
    if(!name){ showBanner('Please enter your name to approve.'); return; }

    const cid = Number(els.customer.value);
    const pk = getApprovalPeriodKey();
    if(!cid || !pk){ showBanner('Select a month to approve.'); return; }

    localStorage.setItem('tt_approverName', name);

    try{
      await API.post('/api/approval', { customerId: cid, periodKey: pk, approvedBy: name });
      await loadApprovalState();
      renderApprovalState();
    }catch(err){
      showBanner(`Approval failed: ${err?.message || err}`);
    }
  });

  els.revokeApproval.addEventListener('click', async ()=>{
    const name = (els.approverName.value || '').trim() || 'Unknown';
    const cid = Number(els.customer.value);
    const pk = getApprovalPeriodKey();
    if(!cid || !pk) return;

    try{
      await API.post('/api/approval', { customerId: cid, periodKey: pk, approvedBy: name, revoke: true });
      await loadApprovalState();
      renderApprovalState();
    }catch(err){
      showBanner(`Revoke failed: ${err?.message || err}`);
    }
  });

  await refresh();
  setInterval(()=>{ refresh().catch(()=>{}); }, 30_000);
}

boot().catch(err=>{
  console.error(err);

  if(err && err.name === 'ApiHttpError'){
    const body = (err.bodyText || '').trim();
    const extra = body ? ` Response: ${body}` : '';
    showBanner(`Failed to load data. ${err.url} → HTTP ${err.status}.${extra}`);
  } else {
    showBanner(`Failed to load data. ${err?.message || String(err)}`);
  }

  els.totalHours.textContent = '—';
  els.totalCost.textContent = '—';
});
