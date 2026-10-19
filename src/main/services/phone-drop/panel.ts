import { BrowserWindow, ipcMain, screen, shell } from 'electron'
import { DROP_PANEL_HTML } from './panel.html'
import { openPhoneDropFolder } from './folder'
import { DropTransfers, type DropStart } from './transfers'

const WIDTH = 340
/** Над индикатором записи и кнопкой микрофона, которые живут в правом нижнем углу */
const BOTTOM_GAP = 96
const SIDE_GAP = 16
/** Кусок файла приходит каждые миллисекунды — панель перерисовывается несколько раз в секунду */
const RENDER_INTERVAL_MS = 150
const HIDE_AFTER_MS = 6000
/** Между файлами пачки телефон бывает заново ищет компьютер (до ~20 с); дольше — он бросил отправку */
const STALL_MS = 45_000

/**
 * Панель в правом нижнем углу: что идёт с телефона, сколько осталось, что пришло и что нет. Появляется
 * с первым файлом, после удачного приёма сама гаснет, с ошибками — висит, пока не закроют. Фокус не забирает.
 */
class DropPanel {
  private window: BrowserWindow | null = null
  private loaded = false
  private transfers: DropTransfers | null = null
  /** Закрыли посреди приёма — больше не мешаем, вернёмся, только если что-то не дошло */
  private dismissed = false
  private hovered = false
  /** Высота содержимого от страницы; 0 — страница ещё не сообщила */
  private height = 0
  private renderTimer: NodeJS.Timeout | null = null
  private hideTimer: NodeJS.Timeout | null = null
  private stallTimer: NodeJS.Timeout | null = null

  constructor() {
    ipcMain.on('drop-panel:size', (_event, height: number) => this.resize(height))
    ipcMain.on('drop-panel:hover', (_event, hovered: boolean) => {
      this.hovered = hovered
      if (hovered) this.clearTimer('hideTimer')
      else this.render()
    })
    ipcMain.on('drop-panel:close', () => this.close())
    ipcMain.on('drop-panel:open', (_event, key: string) => this.withPath(key, (path) => void shell.openPath(path)))
    ipcMain.on('drop-panel:reveal', (_event, key: string) => this.withPath(key, (path) => shell.showItemInFolder(path)))
    ipcMain.on('drop-panel:folder', () => void openPhoneDropFolder())
  }

  begin(start: DropStart): string {
    this.transfers ??= new DropTransfers()
    const key = this.transfers.begin(start, Date.now())
    this.render()
    return key
  }

  progress(key: string, bytes: number): void {
    this.transfers?.progress(key, bytes, Date.now())
    this.scheduleRender()
  }

  finish(key: string, path: string, copied: boolean): void {
    this.transfers?.finish(key, path, copied, Date.now())
    this.render()
  }

  fail(key: string, error: string): void {
    this.transfers?.fail(key, error, Date.now())
    this.render()
  }

  private scheduleRender(): void {
    this.renderTimer ??= setTimeout(() => this.render(), RENDER_INTERVAL_MS)
  }

  private render(): void {
    this.clearTimer('renderTimer')
    const transfers = this.transfers
    if (!transfers) return
    const view = transfers.view()
    const finished = view.state !== 'receiving'

    this.clearTimer('stallTimer')
    if (!finished) {
      this.stallTimer = setTimeout(() => {
        if (transfers.isReceiving()) return
        transfers.abandon()
        this.render()
      }, STALL_MS)
    }

    if (this.dismissed) {
      if (!finished) return
      if (view.state === 'done') return this.reset()
      this.dismissed = false
    }

    const win = this.ensureWindow()
    if (this.loaded) win.webContents.send('drop-panel:view', view)
    // Панель, скрытую посреди приёма, страница сама не покажет: её размер мог и не поменяться
    if (!win.isVisible() && this.height > 0) this.resize(this.height)
    this.clearTimer('hideTimer')
    if (view.state === 'done' && !this.hovered) this.hideTimer = setTimeout(() => this.reset(), HIDE_AFTER_MS)
  }

  private close(): void {
    if (this.transfers?.view().state === 'receiving') {
      this.dismissed = true
      this.window?.hide()
      return
    }
    this.reset()
  }

  /** Приём закончен и показан: следующий файл начнёт новый список. */
  private reset(): void {
    for (const timer of ['renderTimer', 'hideTimer', 'stallTimer'] as const) this.clearTimer(timer)
    this.transfers = null
    this.dismissed = false
    this.hovered = false
    this.window?.destroy()
    this.window = null
    this.loaded = false
    this.height = 0
  }

  /** Высоту знает только страница: список растёт с каждым файлом. Нижний край панели стоит на месте. */
  private resize(height: number): void {
    this.height = height
    const win = this.window
    if (!win || win.isDestroyed() || this.dismissed) return
    const { workArea } = screen.getPrimaryDisplay()
    const fitted = Math.min(Math.ceil(height), workArea.height - BOTTOM_GAP)
    // setBounds, а не setPosition: на экранах с масштабом setPosition раздувает окно
    win.setBounds({
      x: workArea.x + workArea.width - SIDE_GAP - WIDTH,
      y: workArea.y + workArea.height - BOTTOM_GAP - fitted,
      width: WIDTH,
      height: fitted
    })
    if (!win.isVisible()) win.showInactive()
  }

  private withPath(key: string, action: (path: string) => void): void {
    const path = this.transfers?.pathOf(key)
    if (path) action(path)
  }

  private clearTimer(name: 'renderTimer' | 'hideTimer' | 'stallTimer'): void {
    const timer = this[name]
    if (timer) clearTimeout(timer)
    this[name] = null
  }

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window
    // focusable: false — клик по панели не уводит фокус из окна, где сейчас работают
    const win = new BrowserWindow({
      width: WIDTH,
      height: 120,
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
        // Своя локальная страница без внешнего контента — ipcRenderer прямо в ней; имена с телефона она
        // выводит только через textContent
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false
      }
    })
    win.setAlwaysOnTop(true, 'screen-saver')
    win.webContents.once('did-finish-load', () => {
      this.loaded = true
      this.render()
    })
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(DROP_PANEL_HTML)}`)
    this.window = win
    return win
  }
}

export const dropPanel = new DropPanel()
