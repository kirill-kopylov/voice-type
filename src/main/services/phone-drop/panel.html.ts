// Панель приёма с телефона (panel.ts). Имена файлов присылает телефон — в разметку они попадают только
// через textContent: страница работает с nodeIntegration
export const DROP_PANEL_HTML = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
  :root{
    --accent:#5B47F5;--accent-soft:#EFEDFE;--ok:#16A34A;--ok-soft:#E8F6EE;--bad:#DC2626;--bad-soft:#FDEDED;
    --text:#1C1F2A;--muted:#6E7385;--line:#ECEEF3;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{background:transparent;overflow:hidden;user-select:none;cursor:default;color:var(--text);
    font:13px/1.4 "Segoe UI Variable Text","Segoe UI",system-ui,sans-serif}
  svg{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  #card{background:#fff;border:1px solid #DFE2EA;border-radius:12px;overflow:hidden}

  header{display:flex;align-items:center;gap:10px;padding:12px 8px 0 12px}
  .badge{flex:none;width:32px;height:32px;border-radius:9px;display:grid;place-items:center;
    background:var(--accent-soft);color:var(--accent);transition:background .2s,color .2s}
  .done .badge{background:var(--ok-soft);color:var(--ok)}
  .failed .badge{background:var(--bad-soft);color:var(--bad)}
  .badge svg{width:17px;height:17px}
  .title{flex:1;min-width:0;font-weight:600;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .position{flex:none;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--accent);
    background:var(--accent-soft);border-radius:999px;padding:2px 9px}
  .icon-button{flex:none;width:26px;height:26px;border:0;border-radius:7px;background:none;color:#9AA0B2;
    display:grid;place-items:center;cursor:pointer}
  .icon-button:hover{background:#F2F3F7;color:var(--text)}
  .icon-button svg{width:14px;height:14px}

  .meta{display:flex;justify-content:space-between;gap:12px;padding:6px 12px 10px;color:var(--muted);
    font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
  .meta span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis}
  .bar{margin:12px 12px 0;height:4px;border-radius:2px;background:var(--line);overflow:hidden}
  .bar i{display:block;height:100%;width:0;border-radius:2px;background:var(--accent);transition:width .3s ease,background .2s}
  .bar.unknown i{width:35%;animation:slide 1.2s ease-in-out infinite}
  @keyframes slide{from{transform:translateX(-100%)}to{transform:translateX(290%)}}
  .done .bar i{background:var(--ok)}
  .failed .bar i{background:var(--bad)}

  ul{list-style:none;border-top:1px solid var(--line);max-height:226px;overflow-y:auto;padding:4px 0}
  ul:empty{display:none}
  ul::-webkit-scrollbar{width:6px}
  ul::-webkit-scrollbar-thumb{background:#D9DCE5;border-radius:3px}
  li{display:flex;align-items:center;gap:10px;height:34px;padding:0 6px 0 12px}
  li.done{cursor:pointer}
  li.done:hover{background:#F6F7FB}
  .row-icon{flex:none;width:18px;height:18px}
  .spin{animation:spin 1s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .ring-track{stroke:#E4E1FD}
  .ring{stroke:var(--accent);transition:stroke-dashoffset .3s ease}
  .name{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .note{flex:none;max-width:150px;color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  li.failed .note{color:var(--bad)}
  li .icon-button{visibility:hidden}
  li.done:hover .icon-button{visibility:visible}
  .footnote{padding:0 12px 8px;color:var(--muted);font-size:12px}
  .footnote:empty{display:none}

  footer{display:flex;justify-content:flex-end;border-top:1px solid var(--line);padding:6px 8px}
  .text-button{display:flex;align-items:center;gap:6px;border:0;border-radius:7px;background:none;cursor:pointer;
    padding:5px 10px;font:inherit;font-weight:600;color:var(--accent)}
  .text-button:hover{background:var(--accent-soft)}
  .text-button svg{width:15px;height:15px}
</style>
</head><body>
<div id="card">
  <header>
    <div class="badge" id="badge"></div>
    <div class="title" id="title"></div>
    <div class="position" id="position"></div>
    <button class="icon-button" id="close" title="Закрыть">
      <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
  </header>
  <div class="bar" id="bar"><i id="fill"></i></div>
  <div class="meta" id="meta"><span id="detail"></span><span id="remaining"></span></div>
  <ul id="rows"></ul>
  <div class="footnote" id="footnote"></div>
  <footer>
    <button class="text-button" id="folder">
      <svg viewBox="0 0 24 24"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>
      Открыть папку
    </button>
  </footer>
</div>
<script>
const { ipcRenderer } = require('electron');
const $ = (id) => document.getElementById(id);
const card = $('card'), rowsList = $('rows');

const BADGES = {
  receiving: '<svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18h2"/></svg>',
  done: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  failed: '<svg viewBox="0 0 24 24"><path d="M12 7v6M12 17v.01"/><circle cx="12" cy="12" r="9"/></svg>'
};
const ROW_ICONS = {
  done: '<svg class="row-icon" viewBox="0 0 18 18"><circle cx="9" cy="9" r="8" fill="#16A34A" stroke="none"/><path d="M5.6 9.3l2.2 2.2 4.6-4.8" stroke="#fff" stroke-width="1.8"/></svg>',
  failed: '<svg class="row-icon" viewBox="0 0 18 18"><circle cx="9" cy="9" r="8" fill="#DC2626" stroke="none"/><path d="M6.6 6.6l4.8 4.8M11.4 6.6l-4.8 4.8" stroke="#fff" stroke-width="1.8"/></svg>',
  receiving: '<svg class="row-icon" viewBox="0 0 18 18"><circle class="ring-track" cx="9" cy="9" r="7" stroke-width="2.2"/><circle class="ring" cx="9" cy="9" r="7" stroke-width="2.2" transform="rotate(-90 9 9)"/></svg>'
};
const REVEAL = '<svg viewBox="0 0 24 24"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>';
const RING = 2 * Math.PI * 7;

let shownState = '';
const rowElements = new Map();

function createRow(key) {
  const li = document.createElement('li');
  li.innerHTML = '<span class="icon"></span><span class="name"></span><span class="note"></span>'
    + '<button class="icon-button" title="Показать в папке">' + REVEAL + '</button>';
  li.addEventListener('click', () => {
    if (li.classList.contains('done')) ipcRenderer.send('drop-panel:open', key);
  });
  li.querySelector('button').addEventListener('click', (event) => {
    event.stopPropagation();
    ipcRenderer.send('drop-panel:reveal', key);
  });
  return li;
}

function updateRow(li, row) {
  if (li.dataset.state !== row.state) {
    li.dataset.state = row.state;
    li.className = row.state;
    li.querySelector('.icon').innerHTML = ROW_ICONS[row.state];
  }
  if (row.state === 'receiving') {
    const ring = li.querySelector('.ring');
    const unknown = row.progress === null;
    li.querySelector('.row-icon').classList.toggle('spin', unknown);
    ring.setAttribute('stroke-dasharray', String(RING));
    ring.setAttribute('stroke-dashoffset', String(RING * (1 - (unknown ? 0.3 : row.progress))));
  }
  li.querySelector('.name').textContent = row.name;
  li.querySelector('.note').textContent = row.note;
  li.title = row.state === 'done' ? 'Открыть' : '';
}

// Строки обновляются на месте: пересоздание каждые 150 мс съедало бы клики
function renderRows(rows) {
  const keys = new Set(rows.map((row) => row.key));
  for (const [key, li] of rowElements) {
    if (!keys.has(key)) { li.remove(); rowElements.delete(key); }
  }
  rows.forEach((row, index) => {
    let li = rowElements.get(row.key);
    if (!li) { li = createRow(row.key); rowElements.set(row.key, li); }
    updateRow(li, row);
    if (rowsList.children[index] !== li) rowsList.insertBefore(li, rowsList.children[index] || null);
  });
}

function render(view) {
  if (shownState !== view.state) {
    shownState = view.state;
    card.className = view.state;
    $('badge').innerHTML = BADGES[view.state];
  }
  $('title').textContent = view.title;
  $('detail').textContent = view.detail;
  $('remaining').textContent = view.remaining;
  $('meta').style.visibility = view.detail || view.remaining ? '' : 'hidden';
  $('position').textContent = view.position ? view.position.current + ' из ' + view.position.total : '';
  $('position').style.display = view.position ? '' : 'none';
  $('bar').classList.toggle('unknown', view.progress === null);
  $('fill').style.width = view.progress === null ? '' : (view.progress * 100).toFixed(1) + '%';
  $('footnote').textContent = view.footnote;
  renderRows(view.rows);
  if (!rendered) { rendered = true; sendSize(); }
}

// Пока данных нет, окно не показываем: пустая карточка мелькнула бы перед настоящей
let rendered = false;
const sendSize = () => ipcRenderer.send('drop-panel:size', card.getBoundingClientRect().height);
ipcRenderer.on('drop-panel:view', (_event, view) => render(view));
new ResizeObserver(() => { if (rendered) sendSize(); }).observe(card);
card.addEventListener('mouseenter', () => ipcRenderer.send('drop-panel:hover', true));
card.addEventListener('mouseleave', () => ipcRenderer.send('drop-panel:hover', false));
$('close').addEventListener('click', () => ipcRenderer.send('drop-panel:close'));
$('folder').addEventListener('click', () => ipcRenderer.send('drop-panel:folder'));
</script>
</body></html>`
