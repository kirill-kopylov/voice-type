import fs from 'fs'
import path from 'path'
import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron'
import type { Rect } from '../../../shared/types'
import { DRAW_OVERLAY_HTML } from './draw-overlay.html'
import { DRAW_TOOLBAR_HTML, DRAW_TOOLBAR_SIZE } from './draw-toolbar.html'
import { DEFAULT_DRAW_STYLE, type DrawStyle } from './draw-style'

export interface DrawnShape {
  displayId: string
  tool: string
  color: string
  text?: string
  rect: Rect
}

export interface DrawingOverlay {
  isDrawing: () => boolean
  /** Короткое кольцо на месте клика: видно на кадрах записи */
  showClickRing: (displayId: string, x: number, y: number) => void
  destroy: () => void
}

interface OverlayOptions {
  displayIds: string[]
  /** Клавиша включения и выключения режима рисования */
  hotkey: string
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
 * Прозрачные окна поверх выбранных мониторов. Пока режим рисования выключен, они пропускают мышь
 * и ничем не мешают; включённый — перехватывает мышь, а панель инструментов скрыта от записи экрана.
 * Нарисованное остаётся в записи, потому что оверлеи — обычные окна поверх экрана.
 */
export function createDrawingOverlay({ displayIds, hotkey, onShapeDrawn }: OverlayOptions): DrawingOverlay {
  const overlayPage = writePage('draw-overlay.html', DRAW_OVERLAY_HTML)
  const toolbarPage = writePage('draw-toolbar.html', DRAW_TOOLBAR_HTML)

  const displays = screen.getAllDisplays().filter((display) => displayIds.includes(String(display.id)))
  const overlays = new Map<string, BrowserWindow>()
  for (const display of displays) {
    const win = createTransparentWindow(display.bounds, { focusable: false })
    win.setIgnoreMouseEvents(true)
    // Окно, на которое кликнули, поднимается выше остальных: без этого оверлей перекрывает панель
    win.on('focus', () => { if (drawing && !toolbar.isDestroyed()) toolbar.moveTop() })
    void win.loadFile(overlayPage, { query: { display: String(display.id) } })
    win.once('ready-to-show', () => win.showInactive())
    overlays.set(String(display.id), win)
  }

  const toolbar = createTransparentWindow(
    { x: 0, y: 0, ...DRAW_TOOLBAR_SIZE },
    { focusable: true, skipTaskbar: true }
  )
  // Панель не должна попадать в видео
  toolbar.setContentProtection(true)
  void toolbar.loadFile(toolbarPage)

  let style: DrawStyle = DEFAULT_DRAW_STYLE
  let drawing = false
  // Порядок рисунков для отмены: id и монитор, на котором нарисовано
  let history: Array<{ id: string; displayId: string }> = []

  const eachOverlay = (action: (win: BrowserWindow) => void): void => {
    overlays.forEach((win) => { if (!win.isDestroyed()) action(win) })
  }
  const broadcastStyle = (): void => {
    eachOverlay((win) => win.webContents.send('draw:style', style))
    if (!toolbar.isDestroyed()) toolbar.webContents.send('draw:style', style)
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

  const placeToolbar = (): void => {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const { x, y, width } = display.workArea
    toolbar.setPosition(Math.round(x + (width - DRAW_TOOLBAR_SIZE.width) / 2), y + TOOLBAR_TOP_MARGIN)
  }

  const enterDrawing = (): void => {
    drawing = true
    eachOverlay((win) => {
      win.setFocusable(true)
      win.setIgnoreMouseEvents(false)
      win.webContents.send('draw:mode', true)
    })
    placeToolbar()
    const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    ;(overlays.get(String(cursorDisplay.id)) ?? overlays.values().next().value)?.focus()
    toolbar.show()
    toolbar.moveTop()
    globalShortcut.register('Escape', exitDrawing)
    globalShortcut.register('CommandOrControl+Z', undo)
  }

  function exitDrawing(): void {
    if (!drawing) return
    drawing = false
    globalShortcut.unregister('Escape')
    globalShortcut.unregister('CommandOrControl+Z')
    toolbar.hide()
    eachOverlay((win) => {
      win.webContents.send('draw:mode', false)
      win.setIgnoreMouseEvents(true)
      win.setFocusable(false)
    })
  }

  const unsubscribers: Array<() => void> = []
  function listen<Args extends unknown[]>(channel: string, listener: (...args: Args) => void): void {
    const wrapped = (_event: Electron.IpcMainEvent, ...args: unknown[]): void => listener(...(args as Args))
    ipcMain.on(channel, wrapped)
    unsubscribers.push(() => ipcMain.removeListener(channel, wrapped))
  }

  listen('draw:set-style', (patch: Partial<DrawStyle>) => { style = { ...style, ...patch }; broadcastStyle() })
  listen('draw:undo', undo)
  listen('draw:clear', clear)
  listen('draw:exit', exitDrawing)
  listen('draw:stroke-added', (displayId: string, id: string, shape: Omit<DrawnShape, 'displayId'>) => {
    history.push({ id, displayId })
    onShapeDrawn({ displayId, ...shape })
  })
  listen('draw:stroke-gone', (id: string) => { history = history.filter((entry) => entry.id !== id) })

  if (!globalShortcut.register(hotkey, () => (drawing ? exitDrawing() : enterDrawing()))) {
    console.error(`[screen-session] не удалось занять клавишу рисования: ${hotkey}`)
  }

  return {
    isDrawing: () => drawing,
    showClickRing: (displayId, x, y) => overlays.get(displayId)?.webContents.send('draw:ring', { x, y }),
    destroy: () => {
      exitDrawing()
      globalShortcut.unregister(hotkey)
      unsubscribers.forEach((unsubscribe) => unsubscribe())
      eachOverlay((win) => win.destroy())
      if (!toolbar.isDestroyed()) toolbar.destroy()
    }
  }
}
