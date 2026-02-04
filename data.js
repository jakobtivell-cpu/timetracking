// data.js
// Front-end only. For Static Web Apps, this becomes your "mock backend" until you add an API.
// Persists admin edits in localStorage.

(function () {
  const STORAGE_KEY = "tr_mock_v1";

  const RAW_ROWS = [
    ["2026-01-05","9:00","14:00", 750,"Admin","RN Nordic","Martin Fossum"],
    ["2026-01-07","9:00","10:00",1000,"Forecastapp","RN Nordic","Martin Fossum"],
    ["2026-01-07","10:00","11:30",750,"Admin","RN Nordic","Martin Fossum"],
    ["2026-01-07","12:00","13:30",750,"Admin","RN Nordic","Martin Fossum"],
    ["2026-01-07","14:00","16:30",1000,"Forecastapp","RN Nordic","Martin Fossum"],
    ["2026-01-08","9:05","11:30",750,"Admin","RN Nordic","Martin Fossum"],
    ["2026-01-08","12:00","18:29",1000,"Forecastapp","RN Nordic","Martin Fossum"],
    ["2026-01-09","8:00","11:15",750,"Admin","RN Nordic","Martin Fossum"],
    ["2026-01-09","12:00","15:00",1000,"Forecastapp","RN Nordic","Martin Fossum"],
    ["2026-01-10","9:00","13:00",1000,"Forecastapp","RN Nordic","Martin Fossum"],
    ["2026-01-12","9:00","10:00",750,"Admin","RN Nordic","Martin Fossum"],
    ["2026-01-12","10:00","13:30",1000,"Forecastapp","RN Nordic","Martin Fossum"],
    ["2026-01-12","13:30","15:30",1000,"Remarketing platform","RN Nordic","Martin Fossum"],
    ["2026-01-13","8:25","11:30",750,"Admin","RN Nordic","Martin Fossum"],
    ["2026-01-13","11:50","13:50",750,"Admin","RN Nordic","Martin Fossum"],
    ["2026-01-14","9:00","10:00",750,"Admin","RN Nordic","Martin Fossum"],
    ["2026-01-14","10:00","11:44",1000,"Forecastapp","RN Nordic","Martin Fossum"],
    ["2026-01-19","9:00","12:40",750,"Admin","RN Nordic","Martin Fossum"],
    ["2026-01-19","14:54","16:00",1000,"Forecastapp","RN Nordic","Martin Fossum"],
    ["2026-01-20","8:00","11:50",1000,"Forecastapp","RN Nordic","Martin Fossum"],
    ["2026-01-20","12:57","14:00",1000,"Forecastapp","RN Nordic","Martin Fossum"],
    ["2026-01-21","9:10","10:30",750,"Admin","RN Nordic","Martin Fossum"],
    ["2026-01-21","10:30","12:40",1000,"Remarketing platform","RN Nordic","Martin Fossum"],
    ["2026-01-21","13:00","14:00",750,"Admin","RN Nordic","Martin Fossum"],
    ["2026-01-22","8:35","9:10",750,"Admin","RN Nordic","Martin Fossum"],
    ["2026-01-22","9:20","11:40",1000,"Forecastapp","RN Nordic","Martin Fossum"],
    ["2026-01-22","13:46","16:20",1000,"Forecastapp","RN Nordic","Martin Fossum"],
    ["2026-01-22","18:40","19:40",1000,"Forecastapp","RN Nordic","Martin Fossum"],
    ["2026-01-22","20:20","21:32",1000,"Forecastapp","RN Nordic","Martin Fossum"],
    ["2026-01-23","8:25","9:26",1000,"Forecastapp","RN Nordic","Martin Fossum"],
    ["2026-01-23","10:00","12:10",1000,"Remarketing platform","RN Nordic","Martin Fossum"],
    ["2026-01-23","12:10","12:30",1000,"Forecastapp","RN Nordic","Martin Fossum"],
    ["2026-01-23","12:30","13:15",1000,"Remarketing platform","RN Nordic","Martin Fossum"],
    ["2026-01-23","14:00","14:20",1000,"Remarketing platform","RN Nordic","Martin Fossum"],
    ["2026-01-23","15:20","16:25",750,"Admin","RN Nordic","Martin Fossum"],
    ["2026-01-25","5:25","5:55",1000,"Forecastapp","RN Nordic","Martin Fossum"],
    ["2026-01-27","8:25","12:05",1000,"TCO PC","RN Nordic","Martin Fossum"],
    ["2026-01-27","12:05","14:29",1000,"Remarketing platform","RN Nordic","Martin Fossum"],
    ["2026-01-27","16:00","19:26",1000,"Remarketing platform","RN Nordic","Martin Fossum"],
    ["2026-01-28","8:00","11:30",1000,"Remarketing platform","RN Nordic","Martin Fossum"],
    ["2026-01-28","11:30","12:35",750,"Admin","RN Nordic","Martin Fossum"],
    ["2026-01-28","14:35","15:58",1000,"Remarketing platform","RN Nordic","Martin Fossum"],
    ["2026-01-29","7:00","8:00",1000,"Remarketing platform","RN Nordic","Martin Fossum"],
    ["2026-01-29","8:00","8:30",750,"Admin","RN Nordic","Martin Fossum"],
    ["2026-01-29","9:00","14:00",750,"Admin","RN Nordic","Martin Fossum"],
    ["2026-01-29","14:00","18:44",1000,"Remarketing platform","RN Nordic","Martin Fossum"],
    ["2026-01-29","12:20","15:53",1000,"TCO PC","RN Nordic","Martin Fossum"],
    ["2026-01-31","15:01","16:45",1000,"Remarketing platform","RN Nordic","Martin Fossum"],
  ];

  function slugify(s){
    return (s || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g,"-")
      .replace(/^-+|-+$/g,"");
  }
  function pad(n){ return String(n).padStart(2,"0"); }
  function fmtDate(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
  function fmtTime(d){ return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function monthKey(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; }
  function msToHours(ms){ return ms / 3600000; }
  function round2(n){ return Math.round(n * 100) / 100; }

  function parseDateTime(dateStr, timeStr){
    const [hh, mm] = timeStr.split(":").map(Number);
    const d = new Date(`${dateStr}T00:00:00`);
    d.setHours(hh, mm, 0, 0);
    return d;
  }

  function calcEntry(entry, rateLookup){
    const durMs = entry.end - entry.start;
    const hrs = msToHours(durMs);
    const rate = rateLookup(entry.taskId);
    const sek = hrs * rate;
    return { hrs, sek, rate };
  }

  function sumEntries(entries, rateLookup){
    return entries.reduce((acc,e) => {
      const { hrs, sek } = calcEntry(e, rateLookup);
      acc.hrs += hrs;
      acc.sek += sek;
      return acc;
    }, { hrs:0, sek:0 });
  }

  function taskBreakdown(entries, rateLookup){
    const map = new Map();
    for(const e of entries){
      const { hrs, sek } = calcEntry(e, rateLookup);
      const key = e.taskId;
      const cur = map.get(key) || { taskId:key, hrs:0, sek:0 };
      cur.hrs += hrs;
      cur.sek += sek;
      map.set(key, cur);
    }
    return [...map.values()].sort((a,b)=> b.sek - a.sek);
  }

  function uniqueMonths(entries){
    const set = new Set(entries.map(e => monthKey(e.start)));
    const list = [...set].sort().reverse();
    return list.length ? list : [monthKey(new Date())];
  }

  function yearRange(entries){
    const years = new Set(entries.map(e => e.start.getFullYear()));
    const list = [...years].sort((a,b)=> b-a);
    return list.length ? list : [new Date().getFullYear()];
  }

  // Responsibility map: customerId|taskId -> responsible
  function respKey(customerId, taskId){ return `${customerId}|${taskId}`; }

  function loadPersisted(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    }catch{
      return null;
    }
  }
  function savePersisted(data){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }catch{}
  }

  function buildDefaultState(){
    const activityMap = new Map();
    const customerMap = new Map();
    const respMap = {}; // key -> responsible
    const entries = [];

    RAW_ROWS.forEach(([dateStr, inStr, outStr, rate, cat, customer, responsible]) => {
      const taskId = slugify(cat);
      activityMap.set(taskId, { id: taskId, name: cat, rate: Number(rate) });

      const customerId = slugify(customer);
      if(!customerMap.has(customerId)){
        customerMap.set(customerId, { id: customerId, name: customer });
      }

      // per task per customer responsibility
      respMap[respKey(customerId, taskId)] = responsible;

      entries.push({
        id: Math.random().toString(16).slice(2),
        customerId,
        taskId,
        start: parseDateTime(dateStr, inStr),
        end: parseDateTime(dateStr, outStr),
      });
    });

    const activities = [
      ...[...activityMap.values()].sort((a,b)=> b.rate - a.rate),
      { id:"break", name:"Break", rate:0 }
    ];

    const customers = [...customerMap.values()].sort((a,b)=> a.name.localeCompare(b.name));

    return { activities, customers, respMap, entries };
  }

  function hydrateState(){
    const defaults = buildDefaultState();
    const persisted = loadPersisted();

    if(!persisted) return defaults;

    // Merge persisted edits (activities/customers/respMap), but keep entries from defaults (sample data)
    return {
      activities: Array.isArray(persisted.activities) ? persisted.activities : defaults.activities,
      customers: Array.isArray(persisted.customers) ? persisted.customers : defaults.customers,
      respMap: persisted.respMap && typeof persisted.respMap === "object" ? persisted.respMap : defaults.respMap,
      entries: defaults.entries
    };
  }

  const state = hydrateState();

  function rateLookup(taskId){
    return state.activities.find(a => a.id === taskId)?.rate ?? 0;
  }
  function taskName(taskId){
    return state.activities.find(a => a.id === taskId)?.name ?? taskId;
  }
  function customerName(customerId){
    return state.customers.find(c => c.id === customerId)?.name ?? customerId;
  }
  function responsibleFor(customerId, taskId){
    return state.respMap[respKey(customerId, taskId)] || "";
  }

  function persistEdits(){
    savePersisted({
      activities: state.activities,
      customers: state.customers,
      respMap: state.respMap
    });
  }

  // Expose a small API to the pages
  window.TR = {
    state,
    slugify,
    fmtDate,
    fmtTime,
    monthKey,
    round2,
    calcEntry: (e) => calcEntry(e, rateLookup),
    sumEntries: (es) => sumEntries(es, rateLookup),
    taskBreakdown: (es) => taskBreakdown(es, rateLookup),
    uniqueMonths: () => uniqueMonths(state.entries),
    yearRange: () => yearRange(state.entries),
    rateLookup,
    taskName,
    customerName,
    responsibleFor,
    respKey,
    persistEdits
  };
})();
