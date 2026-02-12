/* Shared browser utilities (keep this file dependency-free and tiny-ish). */

const API = {
  async get(url){
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if(!r.ok){
      const t = await r.text();
      throw new Error(t || `GET ${url} failed`);
    }
    return r.json();
  },
  async post(url, body){
    const r = await fetch(url,{
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body: JSON.stringify(body || {})
    });
    if(!r.ok){
      const t = await r.text();
      throw new Error(t || `POST ${url} failed`);
    }
    return r.json();
  }
};

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function pad2(n){ return String(n).padStart(2,'0'); }

function formatHMS(totalSeconds){
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s/3600);
  const m = Math.floor((s%3600)/60);
  const ss = s%60;
  return `${pad2(h)}:${pad2(m)}:${pad2(ss)}`;
}

function formatHHMM(date){
  const d = (date instanceof Date) ? date : new Date(date);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatYYYYMMDD(date){
  const d = (date instanceof Date) ? date : new Date(date);
  const y = d.getFullYear();
  const m = pad2(d.getMonth()+1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(date=new Date()){
  const d = new Date(date);
  d.setHours(0,0,0,0);
  return d;
}

function addDays(date, days){
  const d = new Date(date);
  d.setDate(d.getDate()+days);
  return d;
}

function daysInMonth(year, monthIndex0){
  return new Date(year, monthIndex0+1, 0).getDate();
}

function drawDonut(canvas, items){
  // items: [{label, value}]
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0,0,w,h);

  const total = items.reduce((a,x)=>a + (x.value||0), 0);
  if(total <= 0) return;

  const cx = w/2;
  const cy = h/2;
  const outer = Math.min(w,h)/2 - 6;
  const inner = outer * 0.64;

  let a = -Math.PI/2;
  items.forEach((it, idx)=>{
    const frac = (it.value||0)/total;
    const b = a + frac*2*Math.PI;

    // Use a simple brightness variation so slices are distinguishable (no custom colors).
    const alpha = 0.18 + (idx % 6) * 0.08;
    ctx.beginPath();
    ctx.arc(cx, cy, outer, a, b);
    ctx.arc(cx, cy, inner, b, a, true);
    ctx.closePath();
    ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.fill();

    a = b;
  });

  // hole edge
  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, 2*Math.PI);
  ctx.strokeStyle = 'rgba(255,255,255,.10)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

// PWA (optional): register service worker if available.
// This is what enables "Add to Home Screen" + standalone mode.
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/pwa/sw.js').catch(()=>{});
  });
}
