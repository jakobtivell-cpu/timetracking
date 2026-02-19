/* Mobile time tracker
   - Starts/stops DB-backed timers
   - Keeps a minimal local running state for UX
   - Stealth clock shows billed hours today (billable time only)
*/

const STORAGE = {
  running: 'tt_running',
  consultant: 'tt_consultantName',
  customerId: 'tt_customerId'
};

const CAP_HOURS = 8; // gauge caps at 8h (adjust if you work 12h days like a maniac)

const els = {
  // UI elements are intentionally optional; the mobile layout is a pure HTML/CSS shell.
  // If an element is missing, we simply skip that feature (prevents runtime errors).
  cancelBtn: document.getElementById('cancelBtn'),
  pauseBtn: document.getElementById('pauseBtn') || document.getElementById('pause'),
  tasks: document.getElementById('grid') || document.getElementById('tasks'),
  activity: document.getElementById('activity'),
  timer: document.getElementById('timer'),
  clockProg: document.getElementById('clockProg'),
  hourHand: document.getElementById('hourHand'),
  minHand: document.getElementById('minHand'),
};

let state = {
  running: null,          // { mode:'task'|'break', taskId, taskName, startMs, timeEntryId?, customerId, consultantName }
  tasks: [],              // [{taskId, taskName, defaultRatePerHour, isBillable}]
  taskMap: new Map(),     // taskId -> task object
  customers: [],
  customerId: null,
  consultantName: null,
  todayBilledSecondsFromDb: 0,
  clockLen: null,
  lastDayTotalFetchMs: 0
};

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

async function onTaskTap(taskId){
  // Switching tasks: stop whatever is running, then start new.
  if(state.running?.mode === 'task' && state.running.taskId === taskId){
    // Tapping same task = do nothing (prevents accidental restart)
    return;
  }

  await stopCurrentIfNeeded({ goToBreak: false });
  await startDbTask(taskId);
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

  // Update the billed-hours gauge soon.
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

  // DB-backed running task
  const timeEntryId = state.running.timeEntryId;
  try{
    await API.post('/api/timeentries/stop', { timeEntryId });
  } finally {
    state.running = null;
    writeRunning(null);
    syncActiveTaskStyles();
    if(goToBreak) startBreak();
    // Refresh day totals after stop (so gauge includes finished segment)
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

  // Cancel = delete running DB entry (don’t bill it)
  const timeEntryId = state.running.timeEntryId;
  try{
    await API.post('/api/timeentries/cancel', { timeEntryId });
  } catch {
    // Worst case: if cancel endpoint isn't available, stop it instead.
    await API.post('/api/timeentries/stop', { timeEntryId });
  }

  state.running = null;
  writeRunning(null);
  syncActiveTaskStyles();
  setStatus('—', 0);
  refreshTodayBilledFromDb(true).catch(()=>{});
}

async function onPause(){
  // Pause toggles break mode.
  if(!state.running){
    startBreak();
    return;
  }
  if(state.running.mode === 'break'){
    // pause again = exit break
    state.running = null;
    writeRunning(null);
    syncActiveTaskStyles();
    return;
  }

  await stopCurrentIfNeeded({ goToBreak: true });
}

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

  // Pull today's entries for THIS consultant (so the clock is personal)
  const url = `/api/timeentries?customerId=${encodeURIComponent(state.customerId)}&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}&consultant=${encodeURIComponent(state.consultantName)}`;
  const entries = await API.get(url);

  // Sum billable seconds from completed entries
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
}

function updateClock(){
  // Clock/gauge is optional (not present in the re-instated minimal UI).
  if(!els.clockProg || !els.hourHand || !els.minHand) return;

  // Initialise length once
  if(state.clockLen === null){
    try{ state.clockLen = els.clockProg.getTotalLength(); }
    catch{ state.clockLen = 1; }
    els.clockProg.style.strokeDasharray = `${state.clockLen} ${state.clockLen}`;
  }

  // Billed seconds today = DB total + running (if billable)
  let billedSeconds = state.todayBilledSecondsFromDb;
  if(state.running?.mode === 'task'){
    const task = state.taskMap.get(state.running.taskId);
    const isBillable = (task?.isBillable !== false);
    if(isBillable){
      billedSeconds += runningSeconds();
    }
  }

  const billedHours = billedSeconds / 3600;
  const pct = Math.max(0, Math.min(1, billedHours / CAP_HOURS));

  // Progress arc
  const dash = state.clockLen * pct;
  els.clockProg.style.strokeDasharray = `${dash} ${state.clockLen}`;

  // Hands (subtle motion, not a literal clock)
  const sweep = 120; // degrees
  const hourDeg = -90 + (pct * sweep); // from 12 o'clock down

  const mins = new Date().getMinutes();
  const minDeg = -90 + (mins/60) * sweep;

  els.hourHand.setAttribute('transform', `rotate(${hourDeg})`);
  els.minHand.setAttribute('transform', `rotate(${minDeg})`);
}

function renderLoop(){
  if(state.running){
    setStatus(state.running.taskName, runningSeconds());
  } else {
    setStatus('—', 0);
  }

  updateClock();
  requestAnimationFrame(renderLoop);
}

async function boot(){
  // Init persisted state
  state.consultantName = ensureConsultantName();
  state.customerId = await ensureCustomerId();

  await loadTasks();
  renderTasks();

  // Restore running state if present
  const persisted = readRunning();
  if(persisted && persisted.consultantName === state.consultantName){
    state.running = persisted;
  }
  syncActiveTaskStyles();

  // Wire UI
  if(els.cancelBtn){
    els.cancelBtn.addEventListener('click', () => cancelCurrent().catch(err=>console.error(err)));
  }
  if(els.pauseBtn){
    els.pauseBtn.addEventListener('click', () => onPause().catch(err=>console.error(err)));
  }

  // PWA worker (best-effort)
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/pwa/sw.js').catch(()=>{});
  }

  // Initial clock totals
  refreshTodayBilledFromDb(true).catch(()=>{});
  setInterval(()=>refreshTodayBilledFromDb(false).catch(()=>{}), 60_000);

  renderLoop();
}

boot().catch(err=>{
  console.error(err);
  if(els.activity) els.activity.textContent = 'Setup needed';
  if(els.timer) els.timer.textContent = '—';
});
