const API = {
  async get(url){
    const r = await fetch(url);
    if(!r.ok) throw await r.text();
    return r.json();
  },
  async post(url,body){
    const r = await fetch(url,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    if(!r.ok) throw await r.text();
    return r.json();
  }
};

function polarArc(cx,cy,r,start,end){
  const rad = d => (d-90)*Math.PI/180;
  const p = a => [cx+r*Math.cos(rad(a)),cy+r*Math.sin(rad(a))];
  const [sx,sy]=p(start),[ex,ey]=p(end);
  const large=end-start>180?1:0;
  return `M${sx} ${sy} A${r} ${r} 0 ${large} 1 ${ex} ${ey}`;
}
