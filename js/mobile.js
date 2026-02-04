let running = null;

async function loadTasks() {
  const tasks = await API.get('/api/tasks/active');
  const root = document.getElementById('tasks');
  root.innerHTML = '';
  tasks.forEach(t => {
    const b = document.createElement('button');
    b.textContent = t.TaskName;
    b.onclick = () => startTask(t.TaskId);
    root.appendChild(b);
  });
}

async function startTask(taskId) {
  if (running) await stopTask();
  const res = await API.post('/api/timeentries/start', { taskId });
  running = res;
}

async function stopTask() {
  await API.post('/api/timeentries/stop', { timeEntryId: running.timeEntryId });
  running = null;
}

document.getElementById('pause').onclick = stopTask;
document.addEventListener('DOMContentLoaded', loadTasks);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./pwa/sw.js');
}
