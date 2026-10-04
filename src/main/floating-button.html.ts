export const FLOATING_BUTTON_HTML = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;background:transparent;overflow:hidden;user-select:none}
  #btn{
    width:100%;height:100%;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    background:rgba(24,24,27,0.85);border:1px solid rgba(255,255,255,0.35);
    opacity:0.35;transition:opacity .15s,background .15s;
  }
  #btn:hover{opacity:1}
  #btn.recording{opacity:1;background:#dc2626;animation:pulse 1.2s ease-in-out infinite}
  #btn.processing{opacity:1;background:#d97706;animation:pulse .6s ease-in-out infinite}
  @keyframes pulse{50%{opacity:0.6}}
  svg{width:12px;height:12px;pointer-events:none}
</style>
</head><body>
<div id="btn">
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="2" width="6" height="12" rx="3"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" x2="12" y1="19" y2="22"/>
  </svg>
</div>
<script>
const { ipcRenderer } = require('electron');
const btn = document.getElementById('btn');
const DRAG_THRESHOLD = 3;

// Нажатие без сдвига — клик, со сдвигом — перетаскивание окна
let press = null;

btn.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  btn.setPointerCapture(e.pointerId);
  press = { x: e.screenX, y: e.screenY, winX: window.screenX, winY: window.screenY, dragging: false };
});

btn.addEventListener('pointermove', (e) => {
  if (!press) return;
  const dx = e.screenX - press.x, dy = e.screenY - press.y;
  if (!press.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
  press.dragging = true;
  ipcRenderer.send('floating-button:move', press.winX + dx, press.winY + dy);
});

btn.addEventListener('pointerup', () => {
  if (!press) return;
  ipcRenderer.send(press.dragging ? 'floating-button:drag-end' : 'floating-button:click');
  press = null;
});

btn.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  ipcRenderer.send('floating-button:menu');
});

ipcRenderer.on('floating-button:state', (_e, state) => {
  btn.className = state === 'idle' ? '' : state;
});
</script>
</body></html>`
