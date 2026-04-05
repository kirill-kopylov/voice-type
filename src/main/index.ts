import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  clipboard,
  screen,
  session,
  nativeImage
} from 'electron'
import path from 'path'
import { writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { store } from './services/store'
import { transcribeAudio, testConnection } from './services/transcription'
import { pasteText } from './services/paste'
import { saveAudio, loadAudio, deleteAudio } from './services/audio-storage'
import { createTray, setTrayRecording } from './services/tray'
import { createCircleIcon } from './services/icon'

let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let isRecording = false
let currentHotkey: string | null = null

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1050,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: '#e8725a',
    icon: nativeImage.createFromBuffer(createCircleIcon(232, 114, 90)),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })
}

function createOverlayWindow(): void {
  const display = screen.getPrimaryDisplay()
  const { width: screenWidth, height: workAreaHeight } = display.workAreaSize

  // Сохраняем HTML в файл — data: URL не даёт доступ к микрофону
  const overlayPath = path.join(app.getPath('userData'), 'overlay.html')
  writeFileSync(overlayPath, OVERLAY_HTML, 'utf-8')

  overlayWindow = new BrowserWindow({
    width: 150,
    height: 44,
    x: screenWidth - 166,
    y: workAreaHeight - 60,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false
    }
  })

  overlayWindow.loadFile(overlayPath)
  overlayWindow.hide()
}

function showOverlay(state: 'recording' | 'processing' | 'hidden'): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return

  if (state === 'hidden') {
    overlayWindow.webContents.executeJavaScript(`setState('hidden')`)
    overlayWindow.hide()
    return
  }

  overlayWindow.show()
  overlayWindow.webContents.executeJavaScript(`setState('${state}')`)
}

function playSound(type: 'start' | 'stop'): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.webContents.executeJavaScript(`playBeep('${type}')`)
}

function registerHotkey(): void {
  if (currentHotkey) {
    globalShortcut.unregister(currentHotkey)
  }

  const settings = store.getSettings()
  currentHotkey = settings.hotkey

  const registered = globalShortcut.register(currentHotkey, () => {
    toggleRecording()
  })

  if (!registered) {
    console.error(`Не удалось зарегистрировать горячую клавишу: ${currentHotkey}`)
  }
}

function toggleRecording(): void {
  isRecording = !isRecording

  setTrayRecording(isRecording)
  mainWindow?.webContents.send('recording-state-changed', isRecording)

  if (isRecording) {
    playSound('start')
    showOverlay('recording')
  } else {
    playSound('stop')
    showOverlay('processing')
  }
}

function applyAutoStart(): void {
  const settings = store.getSettings()
  app.setLoginItemSettings({ openAtLogin: settings.autoStart })
}

function setupIpcHandlers(): void {
  ipcMain.handle('submit-audio', async (_event, audioData: ArrayBuffer, durationMs: number) => {
    console.log(`[ipc] submit-audio: ${audioData.byteLength} байт, ${durationMs}мс`)
    const settings = store.getSettings()
    const id = randomUUID()
    const audioBuffer = Buffer.from(audioData)

    const audioFileName = saveAudio(id, audioBuffer)
    const result = await transcribeAudio(audioBuffer, settings)

    const record = {
      id,
      text: result.text,
      audioFileName,
      durationMs,
      createdAt: new Date().toISOString(),
      provider: settings.provider,
      model: settings.model,
      status: result.error ? 'error' as const : 'success' as const,
      error: result.error
    }

    store.addHistory(record)

    if (!result.error && settings.autoPaste && result.text.trim()) {
      pasteText(result.text, settings.keepInClipboard)
    }

    showOverlay('hidden')
    mainWindow?.webContents.send('transcription-complete', record)
    return record
  })

  ipcMain.handle('get-history', () => store.getHistory())

  ipcMain.handle('delete-history-item', (_event, id: string) => {
    const item = store.getHistoryItem(id)
    if (item) {
      deleteAudio(item.audioFileName)
      store.deleteHistory(id)
    }
  })

  ipcMain.handle('clear-history', () => {
    const history = store.getHistory()
    for (const item of history) {
      deleteAudio(item.audioFileName)
    }
    store.clearHistory()
  })

  ipcMain.handle('re-paste', (_event, id: string) => {
    const item = store.getHistoryItem(id)
    if (item?.text) {
      const settings = store.getSettings()
      pasteText(item.text, settings.keepInClipboard)
    }
  })

  ipcMain.handle('copy-text', (_event, text: string) => {
    clipboard.writeText(text)
  })

  ipcMain.handle('get-audio', (_event, fileName: string) => {
    const buffer = loadAudio(fileName)
    return buffer ? buffer.buffer : null
  })

  ipcMain.handle('get-settings', () => store.getSettings())

  ipcMain.handle('update-settings', (_event, partial: Record<string, unknown>) => {
    const updated = store.updateSettings(partial)
    if ('hotkey' in partial) registerHotkey()
    if ('autoStart' in partial) applyAutoStart()
    return updated
  })

  ipcMain.handle('test-connection', async () => {
    const settings = store.getSettings()
    return testConnection(settings)
  })

  ipcMain.handle('window-minimize', () => mainWindow?.minimize())
  ipcMain.handle('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.handle('window-close', () => mainWindow?.hide())
}

declare module 'electron' {
  interface App { isQuitting: boolean }
}
app.isQuitting = false

app.whenReady().then(() => {
  // Разрешаем доступ к микрофону для overlay
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(true))
  session.defaultSession.setPermissionCheckHandler(() => true)

  createMainWindow()
  createOverlayWindow()
  setupIpcHandlers()
  registerHotkey()
  applyAutoStart()

  if (mainWindow) {
    createTray(
      mainWindow,
      () => toggleRecording(),
      () => { app.isQuitting = true; app.quit() }
    )
  }
})

app.on('before-quit', () => { app.isQuitting = true })
app.on('will-quit', () => { globalShortcut.unregisterAll() })
app.on('window-all-closed', () => {})

// ────────────────────────────────────────────────────────────
// Overlay HTML — sunset стиль с шумом и sparkles
// ────────────────────────────────────────────────────────────
const OVERLAY_HTML = `<!DOCTYPE html>
<html><head>
<style>
  *{margin:0;padding:0}
  body{background:transparent;overflow:hidden}
  .badge{
    display:flex;align-items:center;
    height:38px;padding:0 14px;
    background:linear-gradient(135deg, rgba(240,128,48,0.92), rgba(212,82,74,0.92), rgba(168,56,120,0.92));
    border-radius:14px;
    box-shadow:0 4px 20px rgba(0,0,0,0.25);
    overflow:hidden;position:relative;
  }
  .badge.recording{border:1px solid rgba(255,255,255,0.2)}
  .badge.processing{border:1px solid rgba(255,255,255,0.15);padding:0}

  /* Шум поверх бейджа */
  .badge::after{
    content:'';position:absolute;inset:0;
    pointer-events:none;z-index:10;
    border-radius:inherit;
    opacity:0.12;
  }

  .dot{
    width:7px;height:7px;background:#fbbf24;border-radius:50%;flex-shrink:0;
    animation:glow 1.4s ease-in-out infinite;
  }
  @keyframes glow{
    0%,100%{box-shadow:0 0 4px rgba(251,191,36,0.6);opacity:1}
    50%{box-shadow:0 0 10px rgba(251,191,36,0.9);opacity:0.65}
  }

  .rec-row{display:flex;align-items:center;gap:10px;position:relative;z-index:5}
  canvas{display:block}

  .proc-wrap{position:relative;width:100%;height:100%;z-index:5}
  #pcv{display:block;width:100%;height:100%}

  .hide{display:none}
</style>
</head><body>
<div class="badge recording" id="badge">
  <div id="recUI">
    <div class="rec-row">
      <div class="dot"></div>
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
// ═══════ NOISE+SPARKLES ═══════
(function(){
  const nc=document.createElement('canvas');
  nc.width=150;nc.height=38;
  const nx=nc.getContext('2d');
  const nd=nx.createImageData(150,38);
  for(let i=0;i<nd.data.length;i+=4){
    const v=Math.random()*255;
    nd.data[i]=v;nd.data[i+1]=v;nd.data[i+2]=v;nd.data[i+3]=8;
    if(Math.random()<0.01){nd.data[i]=nd.data[i+1]=nd.data[i+2]=255;nd.data[i+3]=90+Math.random()*80;}
  }
  nx.putImageData(nd,0,0);
  document.querySelector('.badge').style.setProperty('--noise',
    'url('+nc.toDataURL()+')');
  const style=document.querySelector('.badge::after');
})();
// Применяем шум через стиль
document.querySelector('.badge').insertAdjacentHTML('beforeend',
  '<div style="position:absolute;inset:0;pointer-events:none;z-index:10;border-radius:inherit;opacity:0.15;background-image:var(--noise);background-size:150px 38px"></div>');

// ═══════ WAVEFORM (запись) ═══════
const cv=document.getElementById('cv');
const c=cv.getContext('2d');
const SRC=10,TOTAL=SRC*2,BW=2.5,GAP=2,RH=22;
const RW=TOTAL*(BW+GAP)-GAP;
const dpr=window.devicePixelRatio||1;
cv.width=RW*dpr;cv.height=RH*dpr;
cv.style.width=RW+'px';cv.style.height=RH+'px';
c.scale(dpr,dpr);

const cur=new Float32Array(SRC);
let analyser=null,freqData=null,micStream=null,raf=null;

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
  if(!analyser){return}
  c.clearRect(0,0,RW,RH);
  analyser.getByteFrequencyData(freqData);
  for(let i=0;i<SRC;i++){
    cur[i]+=(freqData[i]/255-cur[i])*0.38;
  }
  for(let i=0;i<TOTAL;i++){
    const si=i<SRC?(SRC-1-i):(i-SRC);
    const v=cur[si];
    const h=Math.max(2,v*RH);
    const x=i*(BW+GAP), y=(RH-h)/2;
    c.fillStyle='rgba(255,255,255,'+(0.35+v*0.6)+')';
    c.beginPath();c.roundRect(x,y,BW,h,1.2);c.fill();
  }
  raf=requestAnimationFrame(renderWave);
}

// ═══════ TUNNEL (обработка) ═══════
const pcv=document.getElementById('pcv');
const pc=pcv.getContext('2d');
let praf=null;

const PW=150,PH=36;
pcv.width=PW*dpr;pcv.height=PH*dpr;
pcv.style.width=PW+'px';pcv.style.height=PH+'px';
pc.scale(dpr,dpr);

const NRINGS=50;
const NSEG=28; // сегменты на кольцо — рваные края
const rings=[];
function spawnRing(z){
  const segs=[];
  for(let j=0;j<NSEG;j++){
    segs.push(0.6+Math.random()*0.8); // шум радиуса на каждом сегменте
  }
  return{z,ho:Math.random()*40,segs,rot:Math.random()*6.28,drift:Math.random()*2-1};
}
for(let i=0;i<NRINGS;i++) rings.push(spawnRing(i/NRINGS));

function renderTunnel(){
  const t=performance.now()*0.001;

  // Центр тоннеля дрейфует — повороты
  const cx=PW/2+Math.sin(t*0.7)*8+Math.sin(t*1.9)*3;
  const cy=PH/2+Math.cos(t*0.9)*4+Math.sin(t*2.3)*1.5;

  // Шлейф — более агрессивное затухание
  pc.globalCompositeOperation='source-over';
  pc.fillStyle='rgba(120,40,60,0.22)';
  pc.fillRect(0,0,PW,PH);

  pc.globalCompositeOperation='lighter';

  for(const r of rings){
    r.z+=0.018; // быстрый полёт
    if(r.z>1){
      const nr=spawnRing(r.z-1);
      r.z=nr.z;r.ho=nr.ho;r.segs=nr.segs;r.rot=nr.rot;r.drift=nr.drift;
    }

    const p=r.z*r.z;
    const baseRx=p*PW*0.6;
    const baseRy=p*PH*0.55;
    if(baseRx<1)continue;

    const a=Math.sin(r.z*Math.PI)*0.22;
    const hue=15+r.ho+Math.sin(t*1.2+r.z*5)*20;
    const lit=35+p*22;
    const lw=0.3+p*2;

    // Смещение отдельного кольца — перспектива поворотов
    const offx=r.drift*p*6;
    const offy=r.drift*p*2*Math.sin(t+r.rot);

    pc.strokeStyle='hsla('+hue+',70%,'+lit+'%,'+a+')';
    pc.lineWidth=lw;
    pc.beginPath();

    // Рисуем "перьевое" кольцо — каждый сегмент со своим шумом радиуса
    for(let j=0;j<=NSEG;j++){
      const angle=r.rot+(j/NSEG)*Math.PI*2;
      const noise=r.segs[j%NSEG];
      const rx=baseRx*noise;
      const ry=baseRy*noise;
      const x=cx+offx+Math.cos(angle)*rx;
      const y=cy+offy+Math.sin(angle)*ry;
      if(j===0)pc.moveTo(x,y);
      else pc.lineTo(x,y);
    }

    pc.stroke();
  }

  pc.globalCompositeOperation='source-over';
  praf=requestAnimationFrame(renderTunnel);
}

// ═══════ STATE ═══════
let mode='hidden';

function setState(s){
  if(raf){cancelAnimationFrame(raf);raf=null}
  if(praf){cancelAnimationFrame(praf);praf=null}

  const b=document.getElementById('badge');
  const r=document.getElementById('recUI');
  const p=document.getElementById('procUI');
  mode=s;
  b.className='badge '+s;
  r.className=s==='recording'?'':'hide';
  p.className=s==='processing'?'':'hide';

  if(s==='recording'){
    startMic();
  }else{
    stopMic();
  }
  if(s==='processing'){
    pc.clearRect(0,0,PW,PH);
    renderTunnel();
  }
}

// ═══════ SOUND ═══════
let audioCtx=null;
function playBeep(type){
  if(!audioCtx)audioCtx=new AudioContext();
  const ac=audioCtx;
  if(type==='start'){
    bip(ac,880,0.11,0.2,0);
  }else{
    bip(ac,520,0.08,0.16,0);
    bip(ac,640,0.08,0.16,0.1);
  }
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
</script>
</body></html>`;
