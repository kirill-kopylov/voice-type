import { BrowserWindow, Menu, ipcMain, screen } from 'electron'
import { FLOATING_BUTTON_HTML } from '../floating-button.html'
import { store } from './store'
import type { ScreenPoint } from './types'

const SIZE = 20

export type FloatingButtonState = 'idle' | 'recording' | 'processing'

export interface FloatingButtonCallbacks {
  toggleRecording: () => void
  hide: () => void
}

let buttonWindow: BrowserWindow | null = null

// По умолчанию — над индикатором записи в правом нижнем углу, по его правому краю
function defaultPosition(): ScreenPoint {
  const { workArea } = screen.getPrimaryDisplay()
  return {
    x: workArea.x + workArea.width - 16 - SIZE,
    y: workArea.y + workArea.height - 68 - SIZE
  }
}

// Сохранённая позиция могла остаться на отключённом мониторе
function isOnScreen({ x, y }: ScreenPoint): boolean {
  return screen.getAllDisplays().some(({ workArea: a }) =>
    x >= a.x && y >= a.y && x + SIZE <= a.x + a.width && y + SIZE <= a.y + a.height
  )
}

function initialPosition(): ScreenPoint {
  const saved = store.getSettings().floatingButtonPosition
  return saved && isOnScreen(saved) ? saved : defaultPosition()
}

export function createFloatingButton(cb: FloatingButtonCallbacks): void {
  const { x, y } = initialPosition()

  // focusable: false — клик не забирает фокус, текст вставится туда, где стоял курсор
  buttonWindow = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    x,
    y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    hasShadow: false,
    show: false,
    type: 'toolbar',
    webPreferences: {
      // Своя локальная страница без внешнего контента — ipcRenderer прямо в ней
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false
    }
  })
  // Прозрачное окно на Windows не бывает меньше 64×64 — без региона невидимый остаток
  // справа и снизу от кнопки перехватывал бы клики по окнам под ним
  buttonWindow.setShape([{ x: 0, y: 0, width: SIZE, height: SIZE }])
  buttonWindow.setAlwaysOnTop(true, 'screen-saver')
  buttonWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(FLOATING_BUTTON_HTML)}`)

  const menu = Menu.buildFromTemplate([{ label: 'Скрыть кнопку', click: cb.hide }])

  ipcMain.on('floating-button:click', cb.toggleRecording)
  ipcMain.on('floating-button:menu', () => {
    if (buttonWindow) menu.popup({ window: buttonWindow })
  })
  // setBounds, а не setPosition: на экранах с масштабом setPosition раздувает окно
  ipcMain.on('floating-button:move', (_event, nextX: number, nextY: number) => {
    buttonWindow?.setBounds({ x: Math.round(nextX), y: Math.round(nextY), width: SIZE, height: SIZE })
  })
  ipcMain.on('floating-button:drag-end', () => {
    if (!buttonWindow) return
    const [savedX, savedY] = buttonWindow.getPosition()
    store.updateSettings({ floatingButtonPosition: { x: savedX, y: savedY } })
  })
}

export function setFloatingButtonVisible(visible: boolean): void {
  if (!buttonWindow) return
  if (visible) buttonWindow.showInactive()
  else buttonWindow.hide()
}

export function setFloatingButtonState(state: FloatingButtonState): void {
  buttonWindow?.webContents.send('floating-button:state', state)
}
