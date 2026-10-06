import fs from 'fs'
import path from 'path'
import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron'
import type { Rect } from '../../../shared/types'
import { DRAW_OVERLAY_HTML } from './draw-overlay.html'
import { DRAW_TOOLBAR_COLLAPSED_WIDTH, DRAW_TOOLBAR_HTML, DRAW_TOOLBAR_SIZE } from './draw-toolbar.html'
import { DEFAULT_DRAW_STYLE, type DrawStyle, type DrawTool } from './draw-style'

export interface DrawnShape {
  displayId: string
  tool: string
  color: string
  text?: string
  rect: Rect
}

export interface DrawingOverlay {
  /** Инструмент взят и ждёт рисунка: мышь перехвачена оверлеем */
  isDrawing: () => boolean
  /** Короткое кольцо на месте клика: видно на кадрах записи */
  showClickRing: (displayId: string, x: number, y: number) => void
  destroy: () => void
}

interface OverlayOptions {
  displayIds: string[]
  onShapeDrawn: (shape: DrawnShape) => void
}

const TOOLBAR_TOP_MARGIN = 16

function writePage(name: string, html: string): string {
  const file = path.join(app.getPath('userData'), name)
  fs.writeFileSync(file, html, 'utf-8')
  return file
}

function createTransparentWindow(bounds: Rect, options: Electron.BrowserWindowConstructorOptions): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    fullscreenable: false,
    show: false,
    webPreferences: { contextIsolation: false, nodeIntegration: true },
    ...options
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  return win
}

/**
 * Прозрачные окна поверх выбранных мониторов и панель инструментов, которая видна всю запись.
 * Оверлеи пропускают мышь сквозь себя, пока инструмент не выбран на панели; выбранный инструмент
 * перехватывает мышь на один рисунок и сам отпускает её обратно. Панель скрыта от записи экрана,
 * а нарисованное остаётся в видео, потому что оверлеи — обычные окна поверх экрана.
 */
export function createDrawingOverlay({ displayIds, onShapeDrawn }: OverlayOptions): DrawingOverlay {
  const overlayPage = writePage('draw-overlay.html', DRAW_OVERLAY_HTML)
  const toolbarPage = writePage('draw-toolbar.html', DRAW_TOOLBAR_HTML)

  const displays = screen.getAllDisplays().filter((display) => displayIds.includes(String(display.id)))
  const overlays = new Map<string, BrowserWindow>()
  for (const display of displays) {
    const win = createTransparentWindow(display.bounds, { focusable: false })
    win.setIgnoreMouseEvents(true)
    void win.loadFile(overlayPage, { query: { display: String(display.id) } })
    win.once('ready-to-show', () => win.showInactive())
    overlays.set(String(display.id), win)
  }

  // Панель не берёт фокус, чтобы приложение, с которым работают, оставалось активным
  const toolbar = createTransparentWindow(
    { x: 0, y: 0, ...DRAW_TOOLBAR_SIZE },
    { focusable: false, movable: true }
  )
  // Панель не должна попадать в видео
  toolbar.setContentProtection(true)
  void toolbar.loadFile(toolbarPage)
  toolbar.once('ready-to-show', () => {
    placeToolbar()
    toolbar.showInactive()
  })

  let style: DrawStyle = DEFAULT_DRAW_STYLE
  let armed = false
  let collapsed = false
  // Порядок рисунков для отмены: id и монитор, на котором нарисовано
  let history: Array<{ id: string; displayId: string }> = []

  const eachOverlay = (action: (win: BrowserWindow) => void): void => {
    overlays.forEach((win) => { if (!win.isDestroyed()) action(win) })
  }
  const broadcastStyle = (): void => {
    eachOverlay((win) => win.webContents.send('draw:style', style))
    if (!toolbar.isDestroyed()) toolbar.webContents.send('draw:state', { style, armed })
  }
  toolbar.webContents.once('did-finish-load', broadcastStyle)
  overlays.forEach((win) => win.webContents.once('did-finish-load', () => win.webContents.send('draw:style', style)))

  const undo = (): void => {
    const last = history.pop()
    if (last) overlays.get(last.displayId)?.webContents.send('draw:remove', last.id)
  }
  const clear = (): void => {
    history = []
    eachOverlay((win) => win.webContents.send('draw:clear'))
  }

  function placeToolbar(): void {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const { x, y, width } = display.workArea
    toolbar.setBounds({ x: Math.round(x + (width - DRAW_TOOLBAR_SIZE.width) / 2), y: y + TOOLBAR_TOP_MARGIN, ...DRAW_TOOLBAR_SIZE })
  }

  // Текст набирают в поле оверлея, ему нужен фокус; остальные инструменты фокус не отбирают
  function arm(tool: DrawTool): void {
    style = { ...style, tool }
    armed = true
    eachOverlay((win) => {
      win.setFocusable(tool === 'text')
      win.setIgnoreMouseEvents(false)
    })
    broadcastStyle()
    eachOverlay((win) => win.webContents.send('draw:mode', true))
    toolbar.moveTop()
    globalShortcut.register('Escape', disarm)
    globalShortcut.register('CommandOrControl+Z', undo)
  }

  function disarm(): void {
    if (!armed) return
    armed = false
    globalShortcut.unregister('Escape')
    globalShortcut.unregister('CommandOrControl+Z')
    eachOverlay((win) => {
      win.webContents.send('draw:mode', false)
      win.setIgnoreMouseEvents(true)
      win.setFocusable(false)
    })
    if (!toolbar.isDestroyed()) toolbar.webContents.send('draw:state', { style, armed })
  }

  // Свёрнутая панель остаётся на месте левым краем; развёрнутая не выходит за край своего монитора
  function toggleCollapse(): void {
    collapsed = !collapsed
    const { x, y } = toolbar.getBounds()
    const width = collapsed ? DRAW_TOOLBAR_COLLAPSED_WIDTH : DRAW_TOOLBAR_SIZE.width
    const area = screen.getDisplayNearestPoint({ x, y }).workArea
    const fittedX = Math.max(area.x, Math.min(x, area.x + area.width - width))
    toolbar.setBounds({ x: fittedX, y, width, height: DRAW_TOOLBAR_SIZE.height })
    toolbar.webContents.send('draw:collapsed', collapsed)
  }

  const unsubscribers: Array<() => void> = []
  function listen<Args extends unknown[]>(channel: string, listener: (...args: Args) => void): void {
    const wrapped = (_event: Electron.IpcMainEvent, ...args: unknown[]): void => listener(...(args as Args))
    ipcMain.on(channel, wrapped)
    unsubscribers.push(() => ipcMain.removeListener(channel, wrapped))
  }

  // Повторный клик по взятому инструменту снимает его
  listen('draw:toggle-tool', (tool: DrawTool) => (armed && style.tool === tool ? disarm() : arm(tool)))
  listen('draw:set-style', (patch: Partial<DrawStyle>) => { style = { ...style, ...patch }; broadcastStyle() })
  listen('draw:toggle-collapse', toggleCollapse)
  listen('draw:undo', undo)
  listen('draw:clear', clear)
  listen('draw:stroke-added', (displayId: string, id: string, shape: Omit<DrawnShape, 'displayId'>) => {
    history.push({ id, displayId })
    onShapeDrawn({ displayId, ...shape })
    disarm()
  })
  listen('draw:stroke-gone', (id: string) => { history = history.filter((entry) => entry.id !== id) })

  return {
    isDrawing: () => armed,
    showClickRing: (displayId, x, y) => overlays.get(displayId)?.webContents.send('draw:ring', { x, y }),
    destroy: () => {
      disarm()
      unsubscribers.forEach((unsubscribe) => unsubscribe())
      eachOverlay((win) => win.destroy())
      if (!toolbar.isDestroyed()) toolbar.destroy()
    }
  }
}
