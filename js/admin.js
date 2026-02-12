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
  rTable: document.getElementById('rTable')
};

let state = {
  tasks: [],
  customers: [],
  responsibilities: []
};

function clearTables(){
  els.actTable.innerHTML='';
  els.custTable.innerHTML='';
  els.rTable.innerHTML='';
  els.rCustomer.innerHTML='';
  els.rTask.innerHTML='';
}

function render(){
  clearTables();

  state.tasks.forEach(t=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${t.taskName}</td><td style="text-align:right">${Number(t.defaultRatePerHour||0)}</td>`;
    els.actTable.appendChild(tr);
  });

  state.customers.forEach(c=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${c.customerName}</td>`;
    els.custTable.appendChild(tr);
    els.rCustomer.append(new Option(c.customerName, c.customerId));
  });

  state.tasks.forEach(t=>{
    els.rTask.append(new Option(t.taskName, t.taskId));
  });

  state.responsibilities.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.customerName}</td><td>${r.taskName}</td><td>${r.responsibleName || ''}</td>`;
    els.rTable.appendChild(tr);
  });
}

async function load(){
  const [tasks, customers, responsibilities] = await Promise.all([
    API.get('/api/tasks'),
    API.get('/api/customers'),
    API.get('/api/admin/responsibilities')
  ]);

  state.tasks = tasks;
  state.customers = customers;
  state.responsibilities = responsibilities;

  render();
}

els.saveAct.addEventListener('click', async ()=>{
  const name = (els.actName.value || '').trim();
  const rate = Number(els.actRate.value);
  if(!name) return;

  await API.post('/api/admin/task', { name, rate });
  els.actName.value='';
  els.actRate.value='';
  await load();
});

els.saveCust.addEventListener('click', async ()=>{
  const name = (els.custName.value || '').trim();
  if(!name) return;

  await API.post('/api/admin/customer', { name });
  els.custName.value='';
  await load();
});

els.rSave.addEventListener('click', async ()=>{
  const customerId = Number(els.rCustomer.value);
  const taskId = Number(els.rTask.value);
  const responsible = (els.rName.value || '').trim();
  if(!customerId || !taskId || !responsible) return;

  await API.post('/api/admin/responsibility', { customerId, taskId, responsible });
  els.rName.value='';
  await load();
});

load().catch(err=>{
  console.error(err);
});
