let running = JSON.parse(localStorage.getItem('tt_running'));
let tasks = [];
let arc = document.getElementById('arc');
let startMs = running?.startMs || null;

async function loadTasks(){
  tasks = await API.get('/api/tasks/active');
  renderTasks();
  if(running) setActive(running.taskId);
}

function renderTasks(){
  const root = document.getElementById('tasks');
  root.innerHTML='';
  tasks.forEach(t=>{
    const d=document.createElement('div');
    d.className='task';
    d.textContent=t.TaskName;
    d.onclick=()=>startTask(t.TaskId,d);
    root.appendChild(d);
  });
}

async function startTask(taskId,el){
  if(running) await stopRunning();
  const res = await API.post('/api/timeentries/start',{taskId});
  running={
    taskId,
    timeEntryId:res.timeEntryId,
    startMs:Date.now()
  };
  localStorage.setItem('tt_running',JSON.stringify(running));
  startMs=running.startMs;
  setActive(taskId);
}

async function stopRunning(){
  if(!running) return;
  await API.post('/api/timeentries/stop',{timeEntryId:running.timeEntryId});
  running=null;
  startMs=null;
  localStorage.removeItem('tt_running');
  clearActive();
}

function setActive(taskId){
  document.querySelectorAll('.task').forEach((el,i)=>{
    if(tasks[i].TaskId===taskId) el.classList.add('active');
  });
}

function clearActive(){
  document.querySelectorAll('.task').forEach(el=>el.classList.remove('active'));
  arc.setAttribute('d','');
}

function tick(){
  if(startMs){
    const mins=(Date.now()-startMs)/60000;
    const deg=Math.min(mins/480*120,120);
    arc.setAttribute('d',polarArc(100,100,80,0,deg));
  }
  requestAnimationFrame(tick);
}

document.getElementById('pause').onclick=stopRunning;
document.getElementById('cancel').onclick=()=>{
  running=null;
  startMs=null;
  localStorage.removeItem('tt_running');
  clearActive();
};

if('serviceWorker'in navigator){
  navigator.serviceWorker.register('/pwa/sw.js');
}

loadTasks();
tick();
