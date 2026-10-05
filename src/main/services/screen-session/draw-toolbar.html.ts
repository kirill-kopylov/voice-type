// Панель инструментов рисования. Окно скрыто от записи экрана, так что в видео её нет.
import { DRAW_COLORS, DRAW_TOOLS, DRAW_WIDTHS } from './draw-style'

export const DRAW_TOOLBAR_SIZE = { width: 760, height: 56 }

const TOOL_ICONS: Record<string, string> = {
  arrow: '<path d="M5 19L19 5M10 5h9v9"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="6"/>',
  rectangle: '<rect x="4" y="6" width="16" height="12"/>',
  pen: '<path d="M4 20l4-1 11-11-3-3L5 16z"/>',
  marker: '<path d="M5 15l3-3 5 5-3 3H5zM9 11l6-6 4 4-6 6M3 21h18"/>',
  line: '<path d="M5 19L19 5"/>',
  text: '<path d="M5 6h14M12 6v13"/>'
}
const ACTION_ICONS = {
  undo: '<path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3"/>',
  clear: '<path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13"/>',
  done: '<path d="M5 12l5 5 9-10"/>',
  fade: '<circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/>'
}

export const DRAW_TOOLBAR_HTML = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: transparent; user-select: none; font-family: Segoe UI, sans-serif; }
  #bar { box-sizing: border-box; height: 100%; display: flex; align-items: center; gap: 4px; padding: 0 10px; border-radius: 14px;
         background: rgba(24,24,28,0.94); border: 1px solid rgba(255,255,255,0.14); color: #e8e8ec; -webkit-app-region: drag; }
  #bar > * { -webkit-app-region: no-drag; }
  #bar > .grip { -webkit-app-region: drag; color: rgba(255,255,255,0.35); font-size: 14px; padding: 0 4px; cursor: move; }
  button { display: flex; align-items: center; justify-content: center; border: 0; border-radius: 9px; background: transparent;
           color: inherit; cursor: pointer; }
  button.icon { width: 34px; height: 34px; }
  button.icon:hover { background: rgba(255,255,255,0.1); }
  button.active { background: rgba(255,255,255,0.2); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.45); }
  svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .sep { width: 1px; height: 26px; margin: 0 5px; background: rgba(255,255,255,0.16); }
  .color { width: 22px; height: 22px; margin: 0 2px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.35); }
  .color.active { border-color: #fff; transform: scale(1.18); }
  .width { width: 30px; height: 30px; }
  .width i { display: block; border-radius: 50%; background: currentColor; }
  #done { margin-left: auto; padding: 0 12px; height: 34px; gap: 6px; background: #22c55e; color: #052e16; font-weight: 600; font-size: 13px; }
  #done:hover { background: #4ade80; }
</style></head><body>
  <div id="bar">
    <span class="grip">⋮⋮</span>
    <span id="tools"></span><div class="sep"></div>
    <span id="colors"></span><div class="sep"></div>
    <span id="widths"></span><div class="sep"></div>
    <button class="icon" id="fade" title="Рисунки исчезают сами через 5 секунд"><svg>${ACTION_ICONS.fade}</svg></button>
    <button class="icon" id="undo" title="Отменить последний рисунок (Ctrl+Z)"><svg>${ACTION_ICONS.undo}</svg></button>
    <button class="icon" id="clear" title="Стереть всё"><svg>${ACTION_ICONS.clear}</svg></button>
    <button id="done" title="Выйти из рисования (Esc)"><svg>${ACTION_ICONS.done}</svg>Готово</button>
  </div>
  <script>
    const { ipcRenderer } = require('electron')
    const TOOLS = ${JSON.stringify(DRAW_TOOLS)}
    const ICONS = ${JSON.stringify(TOOL_ICONS)}
    const COLORS = ${JSON.stringify(DRAW_COLORS)}
    const WIDTHS = ${JSON.stringify(DRAW_WIDTHS)}
    const set = (patch) => ipcRenderer.send('draw:set-style', patch)

    function button(parent, className, title, html, onClick) {
      const el = document.createElement('button')
      el.className = className
      el.title = title
      el.innerHTML = html
      el.addEventListener('click', onClick)
      parent.appendChild(el)
      return el
    }

    const toolButtons = TOOLS.map((tool) =>
      button(document.getElementById('tools'), 'icon', tool.label, '<svg>' + ICONS[tool.id] + '</svg>', () => set({ tool: tool.id })))
    const colorButtons = COLORS.map((color) => {
      const el = button(document.getElementById('colors'), 'color', color, '', () => set({ color }))
      el.style.background = color
      return el
    })
    const widthButtons = WIDTHS.map((width) =>
      button(document.getElementById('widths'), 'icon width', 'Толщина ' + width, '<i style="width:' + (width + 3) + 'px;height:' + (width + 3) + 'px"></i>', () => set({ width })))
    const fadeButton = document.getElementById('fade')

    fadeButton.addEventListener('click', () => set({ fade: !state.fade }))
    document.getElementById('undo').addEventListener('click', () => ipcRenderer.send('draw:undo'))
    document.getElementById('clear').addEventListener('click', () => ipcRenderer.send('draw:clear'))
    document.getElementById('done').addEventListener('click', () => ipcRenderer.send('draw:exit'))

    let state = { tool: '', color: '', width: 0, fade: false }
    ipcRenderer.on('draw:style', (_e, next) => {
      state = next
      toolButtons.forEach((el, i) => el.classList.toggle('active', TOOLS[i].id === next.tool))
      colorButtons.forEach((el, i) => el.classList.toggle('active', COLORS[i] === next.color))
      widthButtons.forEach((el, i) => el.classList.toggle('active', WIDTHS[i] === next.width))
      fadeButton.classList.toggle('active', next.fade)
    })
  </script>
</body></html>`
