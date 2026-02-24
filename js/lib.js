/* Shared browser utilities (keep this file dependency-free and tiny-ish). */

/**
 * API base support
 *  - By default, requests go to the current origin (same host/port).
 *  - If you serve the HTML from a different dev server than the Functions API,
 *    set either:
 *      1) <meta name="api-base" content="http://localhost:7071">
 *      2) localStorage.setItem('tt_api_base', 'http://localhost:7071')
 */
function getApiBase(){
  const meta = document.querySelector('meta[name="api-base"]')?.getAttribute('content')?.trim();
  return meta || localStorage.getItem('tt_api_base') || '';
}

function apiUrl(path){
  if(!path) return path;
  // Absolute URL? Leave as-is.
  if(/^https?:\/\/+/i.test(path)) return path;

  const base = getApiBase();
  if(!base) return path;

  const b = base.replace(/\/$/, '');
  // Ensure path starts with /
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

const API = {
  async get(url){
    const finalUrl = apiUrl(url);
    const r = await fetch(finalUrl, { headers: { 'Accept': 'application/json' } });
    if(!r.ok){
      const t = await r.text();
      throw new Error(t || `GET ${finalUrl} failed`);
    }
    return r.json();
  },
  async post(url, body){
    const finalUrl = apiUrl(url);
    const r = await fetch(finalUrl,{
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body: JSON.stringify(body || {})
    });
    if(!r.ok){
      const t = await r.text();
      throw new Error(t || `POST ${finalUrl} failed`);
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
  if(total <= 0){
    // Empty ring
    ctx.beginPath();
    ctx.arc(w/2, h/2, Math.min(w,h)/2 - 6, 0, Math.PI*2);
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.stroke();
    return;
  }

  let start = -Math.PI/2;
  items.forEach((it, idx)=>{
    const val = Math.max(0, Number(it.value||0));
    if(val <= 0) return;
    const ang = (val/total) * Math.PI*2;
    const end = start + ang;

    // Vary alpha for slices.
    const alpha = 0.18 + (idx % 6) * 0.08;

    ctx.beginPath();
    ctx.moveTo(w/2, h/2);
    ctx.arc(w/2, h/2, Math.min(w,h)/2 - 2, start, end);
    ctx.closePath();
    ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.fill();

    start = end;
  });

  // Punch hole
  ctx.beginPath();
  ctx.arc(w/2, h/2, Math.min(w,h)/2 - 18, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.50)';
  ctx.fill();
}

// PWA (optional): register service worker if available.
// This is what enables "Add to Home Screen" + standalone mode.
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/pwa/sw.js').catch(()=>{});
  });
}
