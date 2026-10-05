import fs from 'fs'
import path from 'path'
import { app, BrowserWindow, ipcMain, screen } from 'electron'
import type { Rect, ScreenRegion } from '../../shared/types'

const RESULT_CHANNEL = 'region-selector-result'
const MIN_SIDE_PX = 80

// Страница на каждый монитор: затемнение и выделение рамкой. Координаты окна — те же DIP, что у монитора.
const SELECTOR_HTML = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  html, body { margin: 0; height: 100%; overflow: hidden; cursor: crosshair; user-select: none; background: rgba(0,0,0,0.35); font-family: Segoe UI, sans-serif; }
  #hint { position: fixed; top: 24px; left: 50%; transform: translateX(-50%); padding: 10px 18px; border-radius: 10px;
          background: rgba(20,20,20,0.85); color: #fff; font-size: 14px; pointer-events: none; }
  #box { position: fixed; display: none; border: 2px solid #4ade80; box-shadow: 0 0 0 9999px rgba(0,0,0,0.45); pointer-events: none; }
</style></head><body>
  <div id="hint">Выделите область для записи мышью. Esc — отмена</div>
  <div id="box"></div>
  <script>
    const { ipcRenderer } = require('electron')
    const displayId = new URLSearchParams(location.search).get('display')
    const MIN = ${MIN_SIDE_PX}
    const box = document.getElementById('box')
    let start = null

    const rectOf = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) })
    const draw = (r) => Object.assign(box.style, { display: 'block', left: r.x + 'px', top: r.y + 'px', width: r.width + 'px', height: r.height + 'px' })

    addEventListener('mousedown', (e) => { start = { x: e.clientX, y: e.clientY }; draw(rectOf(start, start)) })
    addEventListener('mousemove', (e) => { if (start) draw(rectOf(start, { x: e.clientX, y: e.clientY })) })
    addEventListener('mouseup', (e) => {
      if (!start) return
      const r = rectOf(start, { x: e.clientX, y: e.clientY })
      start = null
      if (r.width < MIN || r.height < MIN) { box.style.display = 'none'; return }
      ipcRenderer.send('${RESULT_CHANNEL}', displayId, r)
    })
    addEventListener('keydown', (e) => { if (e.key === 'Escape') ipcRenderer.send('${RESULT_CHANNEL}', displayId, null) })
  </script>
</body></html>`

/** Пользователь выделяет область мышью на любом мониторе. null — отменил (Esc). */
export function selectScreenRegion(): Promise<ScreenRegion | null> {
  const pagePath = path.join(app.getPath('userData'), 'region-selector.html')
  fs.writeFileSync(pagePath, SELECTOR_HTML, 'utf-8')

  const windows = screen.getAllDisplays().map((display) => {
    const win = new BrowserWindow({
      ...display.bounds,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      hasShadow: false,
      fullscreenable: false,
      webPreferences: { contextIsolation: false, nodeIntegration: true }
    })
    win.setAlwaysOnTop(true, 'screen-saver')
    void win.loadFile(pagePath, { query: { display: String(display.id) } })
    return win
  })

  return new Promise((resolve) => {
    const finish = (result: ScreenRegion | null): void => {
      ipcMain.removeListener(RESULT_CHANNEL, onResult)
      windows.forEach((win) => { if (!win.isDestroyed()) win.close() })
      resolve(result)
    }
    const onResult = (_event: Electron.IpcMainEvent, displayId: string, rect: Rect | null): void => {
      finish(rect && {
        displayId,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      })
    }
    ipcMain.on(RESULT_CHANNEL, onResult)
    windows[0]?.once('ready-to-show', () => windows[0].focus())
  })
}
