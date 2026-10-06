import { BrowserWindow, screen } from 'electron'

const SIZE = 32
/** Курсор пульта гаснет, когда тачпад отпустили: настоящий курсор снова на своём месте */
const IDLE_HIDE_MS = 1200

// Стрелка с белой обводкой и акцентной каймой: видна на любом фоне, кончик — в точке (2, 2)
const CURSOR_HTML = `<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden">
<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <path d="M2 2 L2 25 L8.5 19 L13 29 L17.5 27 L13 17.5 L22 17.5 Z" fill="#5B47F5" stroke="#5B47F5" stroke-width="3.5" stroke-linejoin="round" opacity="0.45"/>
  <path d="M2 2 L2 25 L8.5 19 L13 29 L17.5 27 L13 17.5 L22 17.5 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>
</svg></body></html>`

/**
 * Курсор, нарисованный окном поверх экрана, пока мышью водит пульт. RDP-клиент рисует курсор сам по своей
 * мыши и за границей своего экрана его не показывает, а окно на компьютере попадает в картинку RDP как есть —
 * так настоящее положение курсора видно и через удалённый рабочий стол.
 */
class RemoteCursor {
  private window: BrowserWindow | null = null
  private hideTimer: NodeJS.Timeout | null = null

  /** Встать на место настоящего курсора и погаснуть, если пульт перестанет им водить. */
  follow(): void {
    const win = this.ensureWindow()
    const { x, y } = screen.getCursorScreenPoint()
    // setBounds, а не setPosition: на экранах с масштабом setPosition раздувает окно
    win.setBounds({ x: x - 2, y: y - 2, width: SIZE, height: SIZE })
    if (!win.isVisible()) win.showInactive()
    if (this.hideTimer) clearTimeout(this.hideTimer)
    this.hideTimer = setTimeout(() => this.window?.hide(), IDLE_HIDE_MS)
  }

  destroy(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer)
    this.window?.destroy()
    this.window = null
  }

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window
    const win = new BrowserWindow({
      width: SIZE,
      height: SIZE,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      movable: false,
      hasShadow: false,
      show: false,
      type: 'toolbar'
    })
    // Клики проходят сквозь нарисованный курсор к окну под ним
    win.setIgnoreMouseEvents(true)
    // Прозрачное окно на Windows не бывает меньше 64×64 — регион оставляет только саму стрелку
    win.setShape([{ x: 0, y: 0, width: SIZE, height: SIZE }])
    win.setAlwaysOnTop(true, 'screen-saver')
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(CURSOR_HTML)}`)
    this.window = win
    return win
  }
}

export const remoteCursor = new RemoteCursor()
