export const OVERLAY_HTML = `<!DOCTYPE html>
<html><head>
<style>
  *{margin:0;padding:0}
  body{background:transparent;overflow:hidden}
  .badge{
    display:flex;align-items:center;
    height:38px;padding:0 14px;
    overflow:hidden;position:relative;
    border:none;
  }

  .rec-row{display:flex;align-items:center;gap:10px;position:relative;z-index:5}
  canvas{display:block}
  .proc-wrap{position:relative;width:100%;height:100%;z-index:5}
  #pcv{display:block;width:100%;height:100%}
  .hide{display:none}
</style>
</head><body>
<div class="badge" id="badge">
  <div id="recUI">
    <div class="rec-row">
      <div id="dot" style="width:7px;height:7px;border-radius:50%;flex-shrink:0"></div>
      <canvas id="cv"></canvas>
    </div>
  </div>
  <div id="procUI" class="hide">
    <div class="proc-wrap">
      <canvas id="pcv"></canvas>
    </div>
  </div>
</div>
<script>
// ═══════ КОНФИГ ТЕМЫ ═══════
let T = {
  animation: 'tunnel',
  gradient: 'linear-gradient(135deg, rgba(240,128,48,0.92), rgba(168,56,120,0.92))',
  waveColor: 'rgba(255,255,255,0.7)',
  dotColor: '#fbbf24',
  dotGlow: 'rgba(251,191,36,0.6)',
  textColor: 'rgba(255,255,255,0.7)',
  radius: 14
};

function applyOverlayTheme(cfg) {
  T = cfg;
  const badge = document.getElementById('badge');
  badge.style.background = T.gradient;
  badge.style.borderRadius = T.radius + 'px';
  const dot = document.getElementById('dot');
  dot.style.background = T.dotColor;
  dot.style.boxShadow = '0 0 6px ' + T.dotGlow;
}

// ═══════ WAVEFORM (запись) ═══════
const cv = document.getElementById('cv');
const c = cv.getContext('2d');
const SRC=10, TOTAL=SRC*2, BW=2.5, GAP=2, RH=22;
const RW = TOTAL*(BW+GAP)-GAP;
const dpr = window.devicePixelRatio||1;
cv.width=RW*dpr; cv.height=RH*dpr;
cv.style.width=RW+'px'; cv.style.height=RH+'px';
c.scale(dpr,dpr);

const cur = new Float32Array(SRC);
let analyser=null, freqData=null, micStream=null, raf=null;

function startMic(){
  navigator.mediaDevices.getUserMedia({audio:true}).then(s=>{
    micStream=s;
    const ac=new AudioContext();
    const src=ac.createMediaStreamSource(s);
    analyser=ac.createAnalyser();
    analyser.fftSize=64;
    analyser.smoothingTimeConstant=0.55;
    src.connect(analyser);
    freqData=new Uint8Array(analyser.frequencyBinCount);
    renderWave();
  }).catch(()=>{});
}

function stopMic(){
  if(micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null}
  analyser=null;
  c.clearRect(0,0,RW,RH);
  cur.fill(0);
}

function renderWave(){
  if(!analyser) return;
  c.clearRect(0,0,RW,RH);
  analyser.getByteFrequencyData(freqData);
  for(let i=0;i<SRC;i++){
    cur[i]+=(freqData[i]/255-cur[i])*0.38;
  }
  // Парсим цвет волны
  for(let i=0;i<TOTAL;i++){
    const si=i<SRC?(SRC-1-i):(i-SRC);
    const v=cur[si];
    const h=Math.max(2,v*RH);
    const x=i*(BW+GAP), y=(RH-h)/2;
    c.fillStyle=T.waveColor.replace(/[\\d.]+\\)$/,(0.3+v*0.65)+')');
    c.beginPath();c.roundRect(x,y,BW,h,1.2);c.fill();
  }
  raf=requestAnimationFrame(renderWave);
}

// ═══════ PROCESSING CANVAS ═══════
const pcv=document.getElementById('pcv');
const pc=pcv.getContext('2d');
let praf=null;

const PW=150, PH=38;
pcv.width=PW*dpr; pcv.height=PH*dpr;
pcv.style.width=PW+'px'; pcv.style.height=PH+'px';
pc.scale(dpr,dpr);

// ─── TUNNEL ───
const NRINGS=50, NSEG=28;
const rings=[];
function spawnRing(z){
  const segs=[];
  for(let j=0;j<NSEG;j++) segs.push(0.6+Math.random()*0.8);
  return{z,ho:Math.random()*40,segs,rot:Math.random()*6.28,drift:Math.random()*2-1};
}
for(let i=0;i<NRINGS;i++) rings.push(spawnRing(i/NRINGS));

function renderTunnel(){
  const t=performance.now()*0.001;
  const cx=PW/2+Math.sin(t*0.7)*8+Math.sin(t*1.9)*3;
  const cy=PH/2+Math.cos(t*0.9)*4+Math.sin(t*2.3)*1.5;

  pc.globalCompositeOperation='source-over';
  pc.fillStyle='rgba(120,40,60,0.22)';
  pc.fillRect(0,0,PW,PH);
  pc.globalCompositeOperation='lighter';

  for(const r of rings){
    r.z+=0.018;
    if(r.z>1){const nr=spawnRing(r.z-1);r.z=nr.z;r.ho=nr.ho;r.segs=nr.segs;r.rot=nr.rot;r.drift=nr.drift}
    const p=r.z*r.z;
    const baseRx=p*PW*0.6, baseRy=p*PH*0.55;
    if(baseRx<1)continue;
    const a=Math.sin(r.z*Math.PI)*0.22;
    const hue=15+r.ho+Math.sin(t*1.2+r.z*5)*20;
    const lit=35+p*22;
    const lw=0.3+p*2;
    const offx=r.drift*p*6;
    const offy=r.drift*p*2*Math.sin(t+r.rot);
    pc.strokeStyle='hsla('+hue+',70%,'+lit+'%,'+a+')';
    pc.lineWidth=lw;
    pc.beginPath();
    for(let j=0;j<=NSEG;j++){
      const angle=r.rot+(j/NSEG)*Math.PI*2;
      const noise=r.segs[j%NSEG];
      const rx=baseRx*noise, ry=baseRy*noise;
      const x=cx+offx+Math.cos(angle)*rx;
      const y=cy+offy+Math.sin(angle)*ry;
      if(j===0)pc.moveTo(x,y);else pc.lineTo(x,y);
    }
    pc.stroke();
  }
  pc.globalCompositeOperation='source-over';
  praf=requestAnimationFrame(renderTunnel);
}

// ─── WAVE (синусоида) ───
let waveOffset=0;

function renderWaveProcessing(){
  const t=performance.now()*0.001;
  pc.clearRect(0,0,PW,PH);

  waveOffset+=0.03;
  const midY=PH/2;

  // Рисуем 3 слоя волн с разной фазой и прозрачностью
  for(let layer=0;layer<3;layer++){
    const phaseOff=layer*1.2;
    const amp=(8-layer*2);
    const freq=0.04+layer*0.01;
    const alpha=0.3-layer*0.08;

    pc.beginPath();
    pc.moveTo(0,midY);
    for(let x=0;x<PW;x++){
      const y=midY+Math.sin((x*freq)+waveOffset+phaseOff)*amp
               +Math.sin((x*freq*1.7)+waveOffset*0.7+phaseOff)*amp*0.4;
      pc.lineTo(x,y);
    }
    pc.strokeStyle=T.waveColor.replace(/[\\d.]+\\)$/,alpha+')');
    pc.lineWidth=2-layer*0.4;
    pc.stroke();
  }

  praf=requestAnimationFrame(renderWaveProcessing);
}

// ═══════ STATE ═══════
let mode='hidden';

function setState(s){
  if(raf){cancelAnimationFrame(raf);raf=null}
  if(praf){cancelAnimationFrame(praf);praf=null}

  const badge=document.getElementById('badge');
  const r=document.getElementById('recUI');
  const p=document.getElementById('procUI');
  mode=s;
  r.className=s==='recording'?'':'hide';
  p.className=s==='processing'?'':'hide';

  // Применяем стиль
  badge.style.background=T.gradient;
  badge.style.borderRadius=T.radius+'px';

  if(s==='recording'){
    startMic();
  }else{
    stopMic();
  }
  if(s==='processing'){
    pc.clearRect(0,0,PW,PH);
    waveOffset=0;
    if(T.animation==='wave') renderWaveProcessing();
    else renderTunnel();
  }
}

// ═══════ SOUND ═══════
let audioCtx=null;
function playBeep(type){
  if(!audioCtx)audioCtx=new AudioContext();
  const ac=audioCtx;
  if(type==='start') bip(ac,880,0.11,0.2,0);
  else{ bip(ac,520,0.08,0.16,0); bip(ac,640,0.08,0.16,0.1); }
}
function bip(ac,f,d,v,dl){
  const tm=ac.currentTime+(dl||0);
  const o=ac.createOscillator(),g=ac.createGain();
  o.connect(g);g.connect(ac.destination);
  o.type='sine';o.frequency.value=f;
  g.gain.setValueAtTime(v,tm);
  g.gain.exponentialRampToValueAtTime(0.001,tm+d);
  o.start(tm);o.stop(tm+d);
}

// Инициализация
applyOverlayTheme(T);
</script>
</body></html>`;
