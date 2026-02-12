/* Customer view
   - Visualises logs + cost breakdown
   - Adds "Currently working on" + per-consultant overview

   This is still intentionally "simple static web + API".
   No frameworks. No build step. No surprises.
*/

const els = {
  customer: document.getElementById('customer'),
  period: document.getElementById('period'),
  month: document.getElementById('month'),
  year: document.getElementById('year'),
  monthField: document.getElementById('monthField'),
  yearField: document.getElementById('yearField'),
  totalHours: document.getElementById('totalHours'),
  totalSek: document.getElementById('totalSek'),
  bars: document.getElementById('bars'),
  donut: document.getElementById('donut'),
  legend: document.getElementById('legend'),
  logs: document.getElementById('logs'),
  runningList: document.getElementById('runningList'),
  consultants: document.getElementById('consultants'),
  forecastHead: document.getElementById('forecastHead'),
  approve: document.getElementById('approve'),
  approvalState: document.getElementById('approvalState')
};

let state = {
  customers: [],
  entries: [],
  running: []
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

function calcTotals(entries){
  let hours = 0;
  let sek = 0;
  entries.forEach(e=>{
    const h = (Number(e.durationMinutes||0) / 60);
    const s = Number(e.costAmount||0);
    if(Number.isFinite(h)) hours += h;
    if(Number.isFinite(s)) sek += s;
  });
  return { hours, sek };
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

function setApprovalState(isApproved){
  els.approvalState.textContent = isApproved ? 'Approved' : 'Not approved';
}

function approvalStorageKey(){
  const cid = els.customer.value || '0';
  const p = els.period.value;
  const mk = (p==='month') ? els.month.value : (p==='ytd' ? els.year.value : 'all');
  return `tt_approved_${cid}_${p}_${mk}`;
}

function isCurrentMonthSelected(){
  if(els.period.value !== 'month') return false;
  return els.month.value === monthKey(new Date());
}

function render(){
  const ended = state.entries.filter(e=>!!e.endTimeUtc);

  // Totals
  const totals = calcTotals(ended);
  els.totalHours.textContent = totals.hours.toFixed(2);
  els.totalSek.textContent = Math.round(totals.sek).toString();

  // Period UI
  els.monthField.style.display = els.period.value === 'month' ? '' : 'none';
  els.yearField.style.display = els.period.value === 'ytd' ? '' : 'none';

  // Forecast column only makes sense for "current month"
  els.forecastHead.style.display = isCurrentMonthSelected() ? '' : 'none';

  renderBars(ended);
  renderDonut(ended);
  renderLogs(ended);
  renderRunning(state.running);
  renderConsultants(ended, state.running);

  // Approval state (local only for now)
  const approved = localStorage.getItem(approvalStorageKey()) === '1';
  setApprovalState(approved);
}

function renderBars(entries){
  els.bars.innerHTML='';
  const map = groupSum(entries, e=>e.taskName || '—', e=>Number(e.costAmount||0));
  const rows = [...map.entries()].map(([task, sek])=>({task, sek})).sort((a,b)=>b.sek-a.sek);
  const max = Math.max(1, ...rows.map(r=>r.sek));

  rows.forEach(r=>{
    const row = document.createElement('div');
    row.className='barRow';
    row.innerHTML = `
      <div>${r.task}</div>
      <div class="bar"><i style="width:${(r.sek/max*100).toFixed(1)}%"></i></div>
      <div style="text-align:right">${Math.round(r.sek)}</div>
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

      tr.innerHTML = `
        <td>${formatYYYYMMDD(d)}</td>
        <td>${formatHHMM(e.startTimeUtc)}</td>
        <td>${e.endTimeUtc ? formatHHMM(e.endTimeUtc) : ''}</td>
        <td>${e.taskName || ''}</td>
        <td>${e.responsibleName || ''}</td>
        <td style="text-align:right">${(Number(e.durationMinutes||0)/60).toFixed(2)}</td>
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

  const byConsultant = groupSum(entries, e=>e.consultantName || 'Consultant', e=>Number(e.costAmount||0));
  const hoursByConsultant = groupSum(entries, e=>e.consultantName || 'Consultant', e=>Number(e.durationMinutes||0)/60);

  const runningByConsultant = new Map();
  running.forEach(r=>runningByConsultant.set(r.consultantName || 'Consultant', r));

  const rows = [...byConsultant.keys()].map(name=>{
    const hours = hoursByConsultant.get(name) || 0;
    const sek = byConsultant.get(name) || 0;
    const run = runningByConsultant.get(name);
    return {
      name,
      hours,
      sek,
      runningTask: run ? (run.taskName || '') : '',
      runningSince: run ? run.startTimeUtc : null
    };
  }).sort((a,b)=>b.sek-a.sek);

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
    const forecast = r.sek * forecastMultiplier;

    const runningText = r.runningTask
      ? `${r.runningTask} (${formatHHMM(r.runningSince)})`
      : '';

    tr.innerHTML = `
      <td>${r.name}</td>
      <td style="text-align:right">${r.hours.toFixed(2)}</td>
      <td style="text-align:right">${Math.round(r.sek)}</td>
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

async function refresh(){
  const cid = Number(els.customer.value);
  if(!cid) return;

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

    // YTD means "up to end of today" for current year, full year otherwise.
    const now = new Date();
    const toLocal = (y === now.getFullYear()) ? addDays(startOfLocalDay(now), 1) : new Date(y+1,0,1,0,0,0,0);

    fromIso = fromLocal.toISOString();
    toIso = toLocal.toISOString();
  }

  const q = new URLSearchParams({ customerId: String(cid) });
  if(fromIso) q.set('from', fromIso);
  if(toIso) q.set('to', toIso);

  // Fetch completed+running in range (we'll split client-side)
  state.entries = await API.get(`/api/timeentries?${q.toString()}`);

  // Fetch running right now (ignores date range)
  state.running = await API.get(`/api/timeentries?customerId=${encodeURIComponent(cid)}&running=1`);

  render();
}

async function boot(){
  state.customers = await API.get('/api/customers');

  // Populate customer selector
  els.customer.innerHTML='';
  state.customers.forEach(c=>{
    els.customer.append(new Option(c.customerName, c.customerId));
  });

  // Populate month/year
  els.month.innerHTML='';
  els.year.innerHTML='';

  const now = new Date();
  for(let i=0;i<12;i++){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const mk = monthKey(d);
    els.month.append(new Option(mk, mk));
  }

  for(let y=now.getFullYear(); y>=now.getFullYear()-4; y--){
    els.year.append(new Option(String(y), String(y)));
  }

  // Defaults
  els.customer.value = String(state.customers[0]?.customerId || '');
  els.period.value = 'month';
  els.month.value = monthKey(now);
  els.year.value = String(now.getFullYear());

  // Wire events
  ['customer','period','month','year'].forEach(id=>{
    els[id].addEventListener('change', refresh);
  });

  els.period.addEventListener('change', ()=>{
    // Force re-render for fields + forecast column visibility
    render();
  });

  els.approve.addEventListener('click', ()=>{
    const k = approvalStorageKey();
    localStorage.setItem(k, '1');
    setApprovalState(true);
  });

  await refresh();

  // Live-ish updates for running timers
  setInterval(()=>{
    refresh().catch(()=>{});
  }, 30_000);
}

boot().catch(err=>{
  console.error(err);
  els.totalHours.textContent = '—';
  els.totalSek.textContent = '—';
});
