export const OVERLAY_HTML = `<!DOCTYPE html>
<html><head>
<style>
  *{margin:0;padding:0}
  body{background:transparent;overflow:hidden}
  .badge{
    display:flex;align-items:center;
    height:38px;
    overflow:hidden;position:relative;
    border:none;
  }
  .badge.has-padding{padding:0 14px}
  .badge.no-padding{padding:0}
  canvas{display:block}
  .hide{display:none}
</style>
</head><body>
<div class="badge has-padding" id="badge">
  <div id="recUI">
    <div style="display:flex;align-items:center;gap:10px;position:relative;z-index:5">
      <div id="dot" style="width:7px;height:7px;border-radius:50%;flex-shrink:0"></div>
      <canvas id="cv"></canvas>
    </div>
  </div>
  <div id="recWaveUI" class="hide" style="position:absolute;inset:0;z-index:5">
    <canvas id="rwcv" style="width:100%;height:100%"></canvas>
  </div>
  <div id="procUI" class="hide" style="position:absolute;inset:0;z-index:5">
    <canvas id="pcv" style="width:100%;height:100%"></canvas>
  </div>
</div>
<script>
// ═══════ ТЕМА ═══════
let T = {
  recordingStyle:'bars', processingStyle:'tunnel',
  gradient:'linear-gradient(135deg,rgba(240,128,48,0.92),rgba(168,56,120,0.92))',
  waveColor:'rgba(255,255,255,0.7)', dotColor:'#fbbf24',
  dotGlow:'rgba(251,191,36,0.6)', textColor:'rgba(255,255,255,0.7)', radius:14
};

function applyOverlayTheme(cfg){
  T=cfg;
  const badge=document.getElementById('badge');
  badge.style.background=T.gradient;
  badge.style.borderRadius=T.radius+'px';
  document.getElementById('dot').style.background=T.dotColor;
  document.getElementById('dot').style.boxShadow='0 0 6px '+T.dotGlow;
}

const dpr=window.devicePixelRatio||1;

// ═══════ BARS WAVEFORM (запись — бары) ═══════
const cv=document.getElementById('cv');
const c=cv.getContext('2d');
const SRC=10,TOTAL=SRC*2,BW=2.5,GAP=2,RH=22;
const RW=TOTAL*(BW+GAP)-GAP;
cv.width=RW*dpr;cv.height=RH*dpr;
cv.style.width=RW+'px';cv.style.height=RH+'px';
c.scale(dpr,dpr);
const cur=new Float32Array(SRC);

// ═══════ WAVE RECORDING (запись — синусоида) ═══════
const rwcv=document.getElementById('rwcv');
const rwc=rwcv.getContext('2d');
const RWW=150,RWH=38;
rwcv.width=RWW*dpr;rwcv.height=RWH*dpr;
rwc.scale(dpr,dpr);

// ═══════ PROCESSING CANVAS ═══════
const pcv=document.getElementById('pcv');
const pc=pcv.getContext('2d');
const PW=150,PH=38;
pcv.width=PW*dpr;pcv.height=PH*dpr;
pc.scale(dpr,dpr);

let analyser=null,freqData=null,micStream=null,raf=null,praf=null;

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
    if(T.recordingStyle==='scope') renderRecScope();
    else if(T.recordingStyle==='wave') renderRecWave();
    else renderBars();
  }).catch(()=>{});
}

function stopMic(){
  if(micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null}
  analyser=null;
  c.clearRect(0,0,RW,RH);
  rwc.clearRect(0,0,RWW,RWH);
  cur.fill(0);
}

// ─── Bars ───
function renderBars(){
  if(!analyser)return;
  c.clearRect(0,0,RW,RH);
  analyser.getByteFrequencyData(freqData);
  for(let i=0;i<SRC;i++) cur[i]+=(freqData[i]/255-cur[i])*0.38;
  for(let i=0;i<TOTAL;i++){
    const si=i<SRC?(SRC-1-i):(i-SRC);
    const v=cur[si];
    const h=Math.max(2,v*RH);
    const x=i*(BW+GAP),y=(RH-h)/2;
    c.fillStyle=T.waveColor.replace(/[\\d.]+\\)$/,(0.3+v*0.65)+')');
    c.beginPath();c.roundRect(x,y,BW,h,1.2);c.fill();
  }
  raf=requestAnimationFrame(renderBars);
}

// ─── Wave recording (синусоида от голоса) ───
let smoothAmp=0;
function renderRecWave(){
  if(!analyser)return;
  rwc.clearRect(0,0,RWW,RWH);
  analyser.getByteFrequencyData(freqData);

  // Средняя амплитуда с плавным сглаживанием
  let sum=0;
  for(let i=0;i<freqData.length;i++) sum+=freqData[i];
  const rawAmp=(sum/freqData.length/255)*50;
  smoothAmp+=(rawAmp-smoothAmp)*0.12; // медленный lerp — плавность
  const amp=smoothAmp;

  const t=performance.now()*0.004;
  const midY=RWH/2;

  for(let layer=0;layer<3;layer++){
    const ph=layer*1.5;
    const a=amp*(1-layer*0.25);
    const alpha=0.5-layer*0.12;
    rwc.beginPath();
    rwc.moveTo(0,midY);
    for(let x=0;x<RWW;x++){
      const y=midY+Math.sin(x*0.06+t+ph)*a+Math.sin(x*0.1+t*0.7+ph)*a*0.3;
      rwc.lineTo(x,y);
    }
    rwc.strokeStyle=T.waveColor.replace(/[\\d.]+\\)$/,alpha+')');
    rwc.lineWidth=2-layer*0.5;
    rwc.stroke();
  }
  raf=requestAnimationFrame(renderRecWave);
}

// ═══════ PROCESSING ═══════

// ─── Tunnel ───
const NRINGS=50,NSEG=28;
const rings=[];
function spawnRing(z){
  const segs=[];for(let j=0;j<NSEG;j++)segs.push(0.6+Math.random()*0.8);
  return{z,ho:Math.random()*40,segs,rot:Math.random()*6.28,drift:Math.random()*2-1};
}
for(let i=0;i<NRINGS;i++)rings.push(spawnRing(i/NRINGS));

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
    const brx=p*PW*0.6,bry=p*PH*0.55;
    if(brx<1)continue;
    const a=Math.sin(r.z*Math.PI)*0.22;
    const hue=15+r.ho+Math.sin(t*1.2+r.z*5)*20;
    const lit=35+p*22;
    const lw=0.3+p*2;
    const offx=r.drift*p*6,offy=r.drift*p*2*Math.sin(t+r.rot);
    pc.strokeStyle='hsla('+hue+',70%,'+lit+'%,'+a+')';
    pc.lineWidth=lw;
    pc.beginPath();
    for(let j=0;j<=NSEG;j++){
      const angle=r.rot+(j/NSEG)*Math.PI*2;
      const n=r.segs[j%NSEG];
      const x=cx+offx+Math.cos(angle)*brx*n;
      const y=cy+offy+Math.sin(angle)*bry*n;
      if(j===0)pc.moveTo(x,y);else pc.lineTo(x,y);
    }
    pc.stroke();
  }
  pc.globalCompositeOperation='source-over';
  praf=requestAnimationFrame(renderTunnel);
}

// ─── Wave processing (бегущая синусоида) ───
let waveOffset=0;
function renderWaveProc(){
  pc.clearRect(0,0,PW,PH);
  waveOffset+=0.03;
  const midY=PH/2;
  for(let layer=0;layer<3;layer++){
    const ph=layer*1.2;
    const amp=8-layer*2;
    const freq=0.04+layer*0.01;
    const alpha=0.3-layer*0.08;
    pc.beginPath();pc.moveTo(0,midY);
    for(let x=0;x<PW;x++){
      const y=midY+Math.sin(x*freq+waveOffset+ph)*amp+Math.sin(x*freq*1.7+waveOffset*0.7+ph)*amp*0.4;
      pc.lineTo(x,y);
    }
    pc.strokeStyle=T.waveColor.replace(/[\\d.]+\\)$/,alpha+')');
    pc.lineWidth=2-layer*0.4;
    pc.stroke();
  }
  praf=requestAnimationFrame(renderWaveProc);
}

// ─── Scope recording (осциллограф — raw waveform) ───
let scopeSmooth=new Float32Array(128);
function renderRecScope(){
  if(!analyser)return;
  rwc.clearRect(0,0,RWW,RWH);

  // Сетка
  rwc.strokeStyle='rgba(0,255,65,0.08)';
  rwc.lineWidth=0.5;
  for(let gx=0;gx<RWW;gx+=15){rwc.beginPath();rwc.moveTo(gx,0);rwc.lineTo(gx,RWH);rwc.stroke()}
  for(let gy=0;gy<RWH;gy+=9){rwc.beginPath();rwc.moveTo(0,gy);rwc.lineTo(RWW,gy);rwc.stroke()}

  // Центральная линия
  rwc.strokeStyle='rgba(0,255,65,0.15)';
  rwc.lineWidth=0.5;
  rwc.beginPath();rwc.moveTo(0,RWH/2);rwc.lineTo(RWW,RWH/2);rwc.stroke();

  // Raw time-domain waveform
  const timeData=new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(timeData);

  // Сглаживание
  const step=timeData.length/RWW;
  for(let i=0;i<RWW;i++){
    const raw=(timeData[Math.floor(i*step)]-128)/128;
    if(scopeSmooth.length<RWW) scopeSmooth=new Float32Array(RWW);
    scopeSmooth[i]+=(raw-scopeSmooth[i])*0.3;
  }

  // Послесвечение (тень)
  rwc.strokeStyle='rgba(0,255,65,0.15)';
  rwc.lineWidth=4;
  rwc.beginPath();
  for(let x=0;x<RWW;x++){
    const y=RWH/2+scopeSmooth[x]*(RWH*0.42);
    if(x===0)rwc.moveTo(x,y);else rwc.lineTo(x,y);
  }
  rwc.stroke();

  // Основной луч
  rwc.strokeStyle=T.waveColor;
  rwc.lineWidth=1.5;
  rwc.shadowColor=T.dotColor;
  rwc.shadowBlur=6;
  rwc.beginPath();
  for(let x=0;x<RWW;x++){
    const y=RWH/2+scopeSmooth[x]*(RWH*0.42);
    if(x===0)rwc.moveTo(x,y);else rwc.lineTo(x,y);
  }
  rwc.stroke();
  rwc.shadowBlur=0;

  raf=requestAnimationFrame(renderRecScope);
}

// ─── Scope processing (развёртка с шумом) ───
let scopeScanX=0;
function renderScopeProc(){
  // Затухание
  pc.fillStyle='rgba(0,0,0,0.06)';
  pc.fillRect(0,0,PW,PH);

  // Сетка
  pc.strokeStyle='rgba(0,255,65,0.06)';
  pc.lineWidth=0.5;
  for(let gx=0;gx<PW;gx+=15){pc.beginPath();pc.moveTo(gx,0);pc.lineTo(gx,PH);pc.stroke()}
  for(let gy=0;gy<PH;gy+=9){pc.beginPath();pc.moveTo(0,gy);pc.lineTo(PW,gy);pc.stroke()}

  // Луч развёртки
  scopeScanX=(scopeScanX+1.2)%PW;
  const y=PH/2+Math.sin(scopeScanX*0.08+performance.now()*0.002)*4
           +Math.sin(scopeScanX*0.2)*2+(Math.random()-0.5)*3;

  pc.shadowColor=T.dotColor;
  pc.shadowBlur=8;
  pc.fillStyle=T.waveColor;
  pc.beginPath();
  pc.arc(scopeScanX,y,1.5,0,Math.PI*2);
  pc.fill();
  pc.shadowBlur=0;

  // Вертикальная линия курсора
  pc.strokeStyle='rgba(0,255,65,0.1)';
  pc.lineWidth=1;
  pc.beginPath();pc.moveTo(scopeScanX,0);pc.lineTo(scopeScanX,PH);pc.stroke();

  praf=requestAnimationFrame(renderScopeProc);
}

// ═══════ STATE ═══════
function setState(s){
  if(raf){cancelAnimationFrame(raf);raf=null}
  if(praf){cancelAnimationFrame(praf);praf=null}

  const badge=document.getElementById('badge');
  const recBars=document.getElementById('recUI');
  const recWave=document.getElementById('recWaveUI');
  const proc=document.getElementById('procUI');

  badge.style.background=T.gradient;
  badge.style.borderRadius=T.radius+'px';

  recBars.className='hide';
  recWave.className='hide';
  proc.className='hide';

  if(s==='recording'){
    if(T.recordingStyle==='wave' || T.recordingStyle==='scope'){
      recWave.className='';
      badge.className='badge no-padding';
    }else{
      recBars.className='';
      badge.className='badge has-padding';
    }
    startMic();
  }else{
    stopMic();
  }

  if(s==='processing'){
    proc.className='';
    badge.className='badge no-padding';
    pc.clearRect(0,0,PW,PH);
    waveOffset=0;
    scopeScanX=0;
    if(T.processingStyle==='scope') renderScopeProc();
    else if(T.processingStyle==='wave') renderWaveProc();
    else renderTunnel();
  }
}

// ═══════ SOUND ═══════
let audioCtx=null;
function playBeep(type){
  if(!audioCtx)audioCtx=new AudioContext();
  const ac=audioCtx;
  if(type==='start')bip(ac,880,0.11,0.2,0);
  else{bip(ac,520,0.08,0.16,0);bip(ac,640,0.08,0.16,0.1)}
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

applyOverlayTheme(T);
</script>
</body></html>`;
