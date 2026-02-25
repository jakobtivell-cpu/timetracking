/* Admin view
   - Manage tasks, customers, and customer+task responsibility mapping.
   - This is the "source of truth" for dropdowns on Mobile + Customer.
*/

const els = {
  actName: document.getElementById('actName'),
  actRate: document.getElementById('actRate'),
  saveAct: document.getElementById('saveAct'),
  actTable: document.getElementById('actTable'),

  custName: document.getElementById('custName'),
  saveCust: document.getElementById('saveCust'),
  custTable: document.getElementById('custTable'),

  rCustomer: document.getElementById('rCustomer'),
  rTask: document.getElementById('rTask'),
  rName: document.getElementById('rName'),
  rSave: document.getElementById('rSave'),
  rTable: document.getElementById('rTable'),

  apiError: document.getElementById('apiError')
};

let state = {
  tasks: [],
  customers: [],
  responsibilities: []
};

function clearBanner(){
  if(!els.apiError) return;
  els.apiError.style.display = 'none';
  els.apiError.textContent = '';
}

function showBanner(text){
  if(!els.apiError) return;
  els.apiError.style.display = 'block';
  els.apiError.textContent = text;
}

function normalizeTask(t){
  if(!t || typeof t !== 'object') return null;
  const taskId = Number(t.taskId ?? t.TaskId ?? t.id ?? t.Id);
  const taskName = (t.taskName ?? t.TaskName ?? t.name ?? t.Name ?? '').toString();
  const defaultRatePerHour = Number(t.defaultRatePerHour ?? t.DefaultRatePerHour ?? t.rate ?? t.Rate ?? 0);
  if(!taskName) return null;
  return { taskId: Number.isFinite(taskId) ? taskId : undefined, taskName, defaultRatePerHour };
}

function normalizeCustomer(c){
  if(!c || typeof c !== 'object') return null;
  const customerId = Number(c.customerId ?? c.CustomerId ?? c.id ?? c.Id);
  const customerName = (c.customerName ?? c.CustomerName ?? c.name ?? c.Name ?? '').toString();
  if(!customerName) return null;
  return { customerId: Number.isFinite(customerId) ? customerId : undefined, customerName };
}

function normalizeResponsibility(r){
  if(!r || typeof r !== 'object') return null;
  const customerName = (r.customerName ?? r.CustomerName ?? '').toString();
  const taskName = (r.taskName ?? r.TaskName ?? '').toString();
  const responsibleName = (r.responsibleName ?? r.ResponsibleName ?? r.responsible ?? r.Responsible ?? '').toString();
  if(!customerName || !taskName) return null;
  return { customerName, taskName, responsibleName };
}

function clearTables(){
  els.actTable.innerHTML = '';
  els.custTable.innerHTML = '';
  els.rTable.innerHTML = '';

  els.rCustomer.innerHTML = '';
  els.rTask.innerHTML = '';

  els.rCustomer.append(new Option('Select customer…', ''));
  els.rTask.append(new Option('Select task…', ''));
}

function render(){
  clearTables();

  state.tasks.forEach(t=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(t.taskName)}</td>
      <td style="text-align:right">${Number.isFinite(Number(t.defaultRatePerHour)) ? Number(t.defaultRatePerHour) : 0}</td>
    `;
    els.actTable.appendChild(tr);
  });

  state.customers.forEach(c=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(c.customerName)}</td>`;
    els.custTable.appendChild(tr);

    if(c.customerId){
      els.rCustomer.append(new Option(c.customerName, String(c.customerId)));
    }
  });

  state.tasks.forEach(t=>{
    if(t.taskId){
      els.rTask.append(new Option(t.taskName, String(t.taskId)));
    }
  });

  state.responsibilities.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(r.customerName)}</td>
      <td>${escapeHtml(r.taskName)}</td>
      <td>${escapeHtml(r.responsibleName || '')}</td>
    `;
    els.rTable.appendChild(tr);
  });
}

function escapeHtml(s){
  return String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#39;");
}

async function tryGetAny(urls){
  let lastErr;
  for(const u of urls){
    try{
      return await API.get(u);
    }catch(err){
      lastErr = err;
      console.error(err);
    }
  }
  throw lastErr;
}

async function load(){
  clearBanner();

  let tasks = [];
  let customers = [];
  let responsibilities = [];

  const errors = [];

  try{
    const raw = await API.get('/api/tasks');
    tasks = (Array.isArray(raw) ? raw : raw?.tasks || raw?.Tasks || []).map(normalizeTask).filter(Boolean);
  }catch(err){
    errors.push(`Tasks: ${err?.message || err}`);
  }

  try{
    const raw = await API.get('/api/customers');
    customers = (Array.isArray(raw) ? raw : raw?.customers || raw?.Customers || []).map(normalizeCustomer).filter(Boolean);
  }catch(err){
    errors.push(`Customers: ${err?.message || err}`);
  }

  try{
    // Try plural first; fallback to singular GET (added server-side).
    const raw = await tryGetAny([
      '/api/admin/responsibilities',
      '/api/admin/responsibility'
    ]);
    responsibilities = (Array.isArray(raw) ? raw : raw?.responsibilities || raw?.Responsibilities || [])
      .map(normalizeResponsibility)
      .filter(Boolean);
  }catch(err){
    errors.push(`Responsibilities: ${err?.message || err}`);
  }

  state.tasks = tasks;
  state.customers = customers;
  state.responsibilities = responsibilities;

  render();

  if(errors.length){
    showBanner(
      'Some data could not be loaded from the API. Open DevTools → Console/Network for details. ' +
      errors.join(' | ')
    );
  }
}

els.saveAct.addEventListener('click', async ()=>{
  clearBanner();

  const name = (els.actName.value || '').trim();
  const rate = Number(els.actRate.value);

  if(!name){
    return showBanner('Activity name is required.');
  }
  if(!Number.isFinite(rate) || rate < 0){
    return showBanner('SEK/h must be a non-negative number.');
  }

  try{
    await API.post('/api/admin/task', { name, rate });
    els.actName.value = '';
    els.actRate.value = '';
    await load();
  }catch(err){
    console.error(err);
    showBanner(`Failed to save activity. ${err?.message || err}`);
  }
});

els.saveCust.addEventListener('click', async ()=>{
  clearBanner();

  const name = (els.custName.value || '').trim();
  if(!name){
    return showBanner('Customer name is required.');
  }

  try{
    await API.post('/api/admin/customer', { name });
    els.custName.value = '';
    await load();
  }catch(err){
    console.error(err);
    showBanner(`Failed to save customer. ${err?.message || err}`);
  }
});

els.rSave.addEventListener('click', async ()=>{
  clearBanner();

  const customerId = Number(els.rCustomer.value);
  const taskId = Number(els.rTask.value);
  const responsible = (els.rName.value || '').trim();

  if(!customerId || !taskId || !responsible){
    return showBanner('Select customer + task, and enter a responsible name.');
  }

  try{
    await API.post('/api/admin/responsibility', { customerId, taskId, responsible });
    els.rName.value = '';
    await load();
  }catch(err){
    console.error(err);
    showBanner(`Failed to save responsibility. ${err?.message || err}`);
  }
});

load().catch(err=>{
  console.error(err);
  showBanner(`Failed to initialize admin page. ${err?.message || err}`);
});
