/* Mobile time tracker
   - Starts/stops DB-backed timers
   - Keeps a minimal local running state for UX
   - Shows billed hours today (billable time only)
   - Error feedback via toast
*/

const STORAGE = {
  running: 'tt_running',
  consultant: 'tt_consultantName',
  customerId: 'tt_customerId'
};

const CAP_HOURS = 8;

const els = {
  cancelBtn:  document.getElementById('cancelBtn'),
  pauseBtn:   document.getElementById('pauseBtn'),
  tasks:      document.getElementById('grid'),
  activity:   document.getElementById('activity'),
  timer:      document.getElementById('timer'),
  dailyHours: document.getElementById('dailyHours'),
  toast:      document.getElementById('toast')
};

let state = {
  running: null,
  tasks: [],
  taskMap: new Map(),
  customers: [],
  customerId: null,
  consultantName: null,
  todayBilledSecondsFromDb: 0,
  lastDayTotalFetchMs: 0,
  busy: false
};

// ---- Toast / error feedback ----

let toastTimer = null;
function showToast(msg, durationMs = 3500){
  if(!els.toast) return;
  els.toast.textContent = msg;
  els.toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> els.toast.classList.remove('visible'), durationMs);
}

// ---- Persistence ----

function readRunning(){
  try{ return JSON.parse(localStorage.getItem(STORAGE.running)); }
  catch{ return null; }
}

function writeRunning(obj){
  if(!obj){ localStorage.removeItem(STORAGE.running); return; }
  localStorage.setItem(STORAGE.running, JSON.stringify(obj));
}

function ensureConsultantName(){
  const existing = localStorage.getItem(STORAGE.consultant);
  if(existing && existing.trim()) return existing.trim();
  const name = (prompt('Your name (used for customer overview):', '') || '').trim();
  const safe = name || 'Consultant';
  localStorage.setItem(STORAGE.consultant, safe);
  return safe;
}

async function ensureCustomerId(){
  const existing = localStorage.getItem(STORAGE.customerId);
  if(existing) return Number(existing);

  const customers = await API.get('/api/customers');
  state.customers = customers;
  const first = customers[0]?.customerId;
  if(!first) throw new Error('No customers in DB. Add one in Admin first.');
  localStorage.setItem(STORAGE.customerId, String(first));
  return Number(first);
}

// ---- Task rendering ----

async function loadTasks(){
  const tasks = await API.get('/api/tasks');
  state.tasks = tasks;
  state.taskMap = new Map(tasks.map(t=>[t.taskId, t]));
}

function renderTasks(){
  if(!els.tasks) return;
  els.tasks.innerHTML='';
  state.tasks.forEach(t=>{
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.type = 'button';
    btn.textContent = t.taskName;
    btn.dataset.taskId = String(t.taskId);
    btn.addEventListener('click', () => onTaskTap(t.taskId));
    els.tasks.appendChild(btn);
  });
  syncActiveTaskStyles();
}

function syncActiveTaskStyles(){
  if(els.tasks){
    const activeTaskId = state.running?.mode === 'task' ? state.running.taskId : null;
    [...els.tasks.children].forEach(btn=>{
      const tid = Number(btn.dataset.taskId);
      btn.classList.toggle('active', activeTaskId === tid);
    });
  }
  if(els.pauseBtn) els.pauseBtn.classList.toggle('active', state.running?.mode === 'break');
  if(els.cancelBtn) els.cancelBtn.classList.toggle('visible', !!state.running);
}

function setStatus(taskName, seconds){
  if(els.activity) els.activity.textContent = taskName || '—';
  if(els.timer) els.timer.textContent = formatHMS(seconds || 0);
}

function nowMs(){ return Date.now(); }

function runningSeconds(){
  if(!state.running?.startMs) return 0;
  return Math.floor((nowMs() - state.running.startMs) / 1000);
}

// ---- Busy guard (prevent double-taps during API calls) ----

async function guarded(fn){
  if(state.busy) return;
  state.busy = true;
  try{ await fn(); }
  catch(err){
    console.error(err);
    showToast('Network error — please try again');
  }
  finally{ state.busy = false; }
}

// ---- Core actions ----

async function onTaskTap(taskId){
  if(state.running?.mode === 'task' && state.running.taskId === taskId) return;
  await guarded(async ()=>{
    await stopCurrentIfNeeded({ goToBreak: false });
    await startDbTask(taskId);
  });
}

async function startDbTask(taskId){
  const t = state.taskMap.get(taskId);
  if(!t) throw new Error('Unknown task');

  const payload = {
    customerId: state.customerId,
    taskId,
    consultantName: state.consultantName
  };

  const res = await API.post('/api/timeentries/start', payload);
  const startMs = res.startTimeUtc ? new Date(res.startTimeUtc).getTime() : nowMs();

  state.running = {
    mode:'task',
    taskId,
    taskName: t.taskName,
    timeEntryId: res.timeEntryId,
    startMs,
    customerId: state.customerId,
    consultantName: state.consultantName
  };

  writeRunning(state.running);
  syncActiveTaskStyles();
  setStatus(t.taskName, 0);
  refreshTodayBilledFromDb(true).catch(()=>{});
}

function startBreak(){
  state.running = {
    mode:'break',
    taskId: 'break',
    taskName:'Pause',
    startMs: nowMs(),
    customerId: state.customerId,
    consultantName: state.consultantName
  };
  writeRunning(state.running);
  syncActiveTaskStyles();
}

async function stopCurrentIfNeeded({ goToBreak }){
  if(!state.running) return;

  if(state.running.mode === 'break'){
    state.running = null;
    writeRunning(null);
    syncActiveTaskStyles();
    if(goToBreak) startBreak();
    return;
  }

  const timeEntryId = state.running.timeEntryId;
  try{
    await API.post('/api/timeentries/stop', { timeEntryId });
  } finally {
    state.running = null;
    writeRunning(null);
    syncActiveTaskStyles();
    if(goToBreak) startBreak();
    refreshTodayBilledFromDb(true).catch(()=>{});
  }
}

async function cancelCurrent(){
  if(!state.running) return;

  if(state.running.mode === 'break'){
    state.running = null;
    writeRunning(null);
    syncActiveTaskStyles();
    setStatus('—', 0);
    return;
  }

  const timeEntryId = state.running.timeEntryId;
  try{
    await API.post('/api/timeentries/cancel', { timeEntryId });
    showToast('Entry cancelled');
  } catch {
    // Fallback: stop it instead if cancel fails
    try{ await API.post('/api/timeentries/stop', { timeEntryId }); }
    catch{ /* give up */ }
    showToast('Could not cancel — entry was stopped instead');
  }

  state.running = null;
  writeRunning(null);
  syncActiveTaskStyles();
  setStatus('—', 0);
  refreshTodayBilledFromDb(true).catch(()=>{});
}

async function onPause(){
  await guarded(async ()=>{
    if(!state.running){
      startBreak();
      return;
    }
    if(state.running.mode === 'break'){
      state.running = null;
      writeRunning(null);
      syncActiveTaskStyles();
      return;
    }
    await stopCurrentIfNeeded({ goToBreak: true });
  });
}

// ---- Daily billed hours ----

function localDayRangeUtcIso(date=new Date()){
  const startLocal = startOfLocalDay(date);
  const endLocal = addDays(startLocal, 1);
  return { fromIso: startLocal.toISOString(), toIso: endLocal.toISOString() };
}

async function refreshTodayBilledFromDb(force=false){
  const now = nowMs();
  if(!force && now - state.lastDayTotalFetchMs < 60_000) return;
  state.lastDayTotalFetchMs = now;

  const { fromIso, toIso } = localDayRangeUtcIso(new Date());
  const url = `/api/timeentries?customerId=${encodeURIComponent(state.customerId)}&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}&consultant=${encodeURIComponent(state.consultantName)}`;

  try {
    const entries = await API.get(url);
    let seconds = 0;
    entries.forEach(e=>{
      if(!e.endTimeUtc) return;
      const task = state.taskMap.get(e.taskId);
      if(task && task.isBillable === false) return;
      const s = new Date(e.startTimeUtc).getTime();
      const en = new Date(e.endTimeUtc).getTime();
      if(!Number.isFinite(s) || !Number.isFinite(en)) return;
      seconds += Math.max(0, Math.floor((en - s) / 1000));
    });
    state.todayBilledSecondsFromDb = seconds;
  } catch {
    // Silently fail — will retry next interval
  }
}

function updateDailyHours(){
  if(!els.dailyHours) return;

  let billedSeconds = state.todayBilledSecondsFromDb;
  if(state.running?.mode === 'task'){
    const task = state.taskMap.get(state.running.taskId);
    if(task?.isBillable !== false){
      billedSeconds += runningSeconds();
    }
  }

  const hours = billedSeconds / 3600;
  const pct = Math.min(100, (hours / CAP_HOURS) * 100);
  els.dailyHours.textContent = `${hours.toFixed(1)}h`;
  els.dailyHours.style.setProperty('--pct', `${pct.toFixed(0)}%`);
}

// ---- Render loop ----

function renderLoop(){
  if(state.running){
    setStatus(state.running.taskName, runningSeconds());
  } else {
    setStatus('—', 0);
  }
  updateDailyHours();
  requestAnimationFrame(renderLoop);
}

// ---- Boot ----

async function boot(){
  state.consultantName = ensureConsultantName();
  state.customerId = await ensureCustomerId();

  await loadTasks();
  renderTasks();

  // Restore running state
  const persisted = readRunning();
  if(persisted && persisted.consultantName === state.consultantName){
    state.running = persisted;
  }
  syncActiveTaskStyles();

  // Wire UI
  if(els.cancelBtn){
    els.cancelBtn.addEventListener('click', () => guarded(()=> cancelCurrent()));
  }
  if(els.pauseBtn){
    els.pauseBtn.addEventListener('click', () => onPause());
  }

  // PWA worker
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/pwa/sw.js').catch(()=>{});
  }

  // Visibility change — refresh when coming back to the app
  document.addEventListener('visibilitychange', ()=>{
    if(!document.hidden){
      refreshTodayBilledFromDb(true).catch(()=>{});
    }
  });

  // Initial data
  refreshTodayBilledFromDb(true).catch(()=>{});
  setInterval(()=>refreshTodayBilledFromDb(false).catch(()=>{}), 60_000);

  renderLoop();
}

boot().catch(err=>{
  console.error(err);
  if(els.activity) els.activity.textContent = 'Setup needed';
  if(els.timer) els.timer.textContent = '—';
  showToast(err?.message || 'Failed to initialize');
});
