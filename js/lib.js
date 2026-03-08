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

  // Store segment geometry for hover hit-testing
  canvas._donutSegments = [];
  canvas._donutTotal = total;
  canvas._donutItems = items;

  if(total <= 0){
    ctx.beginPath();
    ctx.arc(w/2, h/2, Math.min(w,h)/2 - 6, 0, Math.PI*2);
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.stroke();
    return;
  }

  const outerR = Math.min(w,h)/2 - 2;
  const innerR = Math.min(w,h)/2 - 18;

  let start = -Math.PI/2;
  items.forEach((it, idx)=>{
    const val = Math.max(0, Number(it.value||0));
    if(val <= 0) return;
    const ang = (val/total) * Math.PI*2;
    const end = start + ang;

    const alpha = 0.18 + (idx % 6) * 0.08;

    ctx.beginPath();
    ctx.moveTo(w/2, h/2);
    ctx.arc(w/2, h/2, outerR, start, end);
    ctx.closePath();
    ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.fill();

    canvas._donutSegments.push({ start, end, label: it.label, value: val, idx });
    start = end;
  });

  // Inner hole
  ctx.beginPath();
  ctx.arc(w/2, h/2, innerR, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.50)';
  ctx.fill();

  // Set up hover listener once
  if(!canvas._donutHoverBound){
    canvas._donutHoverBound = true;

    // Create tooltip element
    const tip = document.createElement('div');
    tip.className = 'donutTip';
    canvas.parentElement.style.position = 'relative';
    canvas.parentElement.appendChild(tip);
    canvas._donutTip = tip;

    canvas.addEventListener('mousemove', function(e){
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const dx = mx - cx;
      const dy = my - cy;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const oR = Math.min(canvas.width, canvas.height)/2 - 2;
      const iR = Math.min(canvas.width, canvas.height)/2 - 18;

      if(dist < iR || dist > oR || !canvas._donutSegments?.length){
        tip.style.opacity = '0';
        return;
      }

      let angle = Math.atan2(dy, dx);
      if(angle < -Math.PI/2) angle += Math.PI*2;

      const seg = canvas._donutSegments.find(s => angle >= s.start && angle < s.end);
      if(!seg){
        tip.style.opacity = '0';
        return;
      }

      const pct = canvas._donutTotal > 0 ? ((seg.value / canvas._donutTotal) * 100).toFixed(1) : '0';
      tip.textContent = `${seg.label}: ${Math.round(seg.value)} (${pct}%)`;
      tip.style.opacity = '1';
      tip.style.left = `${(e.clientX - rect.left)}px`;
      tip.style.top = `${(e.clientY - rect.top) - 32}px`;
    });

    canvas.addEventListener('mouseleave', function(){
      tip.style.opacity = '0';
    });
  }
}
