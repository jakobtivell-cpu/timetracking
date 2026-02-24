/* Shared browser utilities */

function getApiBase(){
  const meta = document.querySelector('meta[name="api-base"]')?.getAttribute('content')?.trim();
  return meta || localStorage.getItem('tt_api_base') || '';
}

function apiUrl(path){
  if(!path) return path;
  if(/^https?:\/\/+/i.test(path)) return path;

  const base = getApiBase();
  if(!base) return path;

  const b = base.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

class ApiHttpError extends Error {
  constructor(message, { url, status, bodyText } = {}) {
    super(message);
    this.name = 'ApiHttpError';
    this.url = url;
    this.status = status;
    this.bodyText = bodyText;
  }
}

async function readBodyTextSafe(r){
  try { return await r.text(); } catch { return ''; }
}

const API = {
  async get(url){
    const finalUrl = apiUrl(url);
    const r = await fetch(finalUrl, { headers: { 'Accept': 'application/json' } });
    if(!r.ok){
      const t = await readBodyTextSafe(r);
      throw new ApiHttpError(`GET failed (${r.status})`, { url: finalUrl, status: r.status, bodyText: t });
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
      const t = await readBodyTextSafe(r);
      throw new ApiHttpError(`POST failed (${r.status})`, { url: finalUrl, status: r.status, bodyText: t });
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
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0,0,w,h);

  const total = items.reduce((a,x)=>a + (x.value||0), 0);
  if(total <= 0){
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

    const alpha = 0.18 + (idx % 6) * 0.08;

    ctx.beginPath();
    ctx.moveTo(w/2, h/2);
    ctx.arc(w/2, h/2, Math.min(w,h)/2 - 2, start, end);
    ctx.closePath();
    ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.fill();

    start = end;
  });

  ctx.beginPath();
  ctx.arc(w/2, h/2, Math.min(w,h)/2 - 18, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.50)';
  ctx.fill();
}

if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/pwa/sw.js').catch(()=>{});
  });
}
