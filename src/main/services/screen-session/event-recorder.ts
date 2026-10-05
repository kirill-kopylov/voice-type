import { clipboard, screen } from 'electron'
import type { Rect, ScreenEvent } from '../../../shared/types'
import { describeShortcut } from './shortcut-format'
import { isSensitiveWindow } from './sensitive-window'
import { WindowWatcher } from './window-watcher'

type ClickEvent = Extract<ScreenEvent, { kind: 'click' }>
type EventBody = ScreenEvent extends infer E ? (E extends ScreenEvent ? Omit<E, 'atMs' | 'window'> : never) : never
export type ClickBody = Omit<ClickEvent, 'atMs' | 'window'>

// Номера кнопок в libuiohook
const MOUSE_BUTTONS: Record<number, ClickEvent['button']> = { 1: 'left', 2: 'right', 3: 'middle' }
// Удерживаемая клавиша шлёт повторы — слишком частые одинаковые нажатия считаем одним
const KEY_REPEAT_WINDOW_MS = 150
// Пауза в наборе, после которой напечатанное считается законченной фразой
const TYPING_PAUSE_MS = 2500
const CLIPBOARD_POLL_MS = 600
const MAX_EVENTS = 20000
const MAX_CLIPBOARD_LENGTH = 1000
const MODIFIER_KEYS = new Set(['Ctrl', 'CtrlRight', 'Alt', 'AltRight', 'Shift', 'ShiftRight', 'Meta', 'MetaRight'])

export interface RecorderOptions {
  /** Момент начала встречи (Date.now): от него считаются времена событий */
  meetingStartMs: number
  recordTypedText: boolean
  /** Пока false (идёт рисование), ввод не пишется */
  shouldRecord: () => boolean
  onClick: (click: ClickBody) => void
}

interface RawKey {
  atMs: number
  keycode: number
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}

/**
 * Что происходит на экране во время записи: клики, сочетания клавиш, набранный текст,
 * скопированное, окна и рисунки. Каждое событие помнит заголовок окна, в котором случилось.
 */
export class EventRecorder {
  private events: ScreenEvent[] = []
  private options: RecorderOptions | null = null
  private currentWindow: string | undefined
  private typing: { text: string; atMs: number; window: string | undefined } | null = null
  private typingTimer: NodeJS.Timeout | null = null
  private clipboardTimer: NodeJS.Timeout | null = null
  private lastClipboard = ''
  private lastKey = { shortcut: '', atMs: -Infinity }
  private keyQueue: Promise<void> = Promise.resolve()
  private readonly watcher = new WindowWatcher()
  private stopHook: (() => void) | null = null

  async start(options: RecorderOptions): Promise<void> {
    this.events = []
    this.options = options
    this.watcher.start((change) => this.onWindowChange(change))
    this.startClipboardWatch()
    await this.startInputHook()
  }

  /** Рисунок пользователя: оверлей сообщает, что появилась фигура. */
  addDrawing(displayId: string, tool: string, color: string, rect: Rect, text?: string): void {
    this.push({ kind: 'drawing', displayId, tool, color, rect, text })
  }

  async stop(): Promise<ScreenEvent[]> {
    this.stopHook?.()
    this.stopHook = null
    if (this.clipboardTimer) clearInterval(this.clipboardTimer)
    this.clipboardTimer = null
    this.watcher.stop()
    // Ответы по уже нажатым клавишам разбираем до конца, чтобы не потерять хвост набранного
    await this.keyQueue
    this.flushTyping()
    const recorded = this.events
    this.events = []
    this.options = null
    return recorded
  }

  private async startInputHook(): Promise<void> {
    try {
      // Нативный модуль грузим только когда он нужен: без него приложение должно работать
      const { uIOhook, UiohookKey } = await import('uiohook-napi')
      const keyNames = new Map<number, string>(Object.entries(UiohookKey).map(([name, code]) => [code, name]))

      const onMouseDown = (event: { x: number; y: number; button: unknown; clicks: number }): void => {
        const button = MOUSE_BUTTONS[Number(event.button)]
        if (!button || !this.options?.shouldRecord()) return
        this.flushTyping()
        const click = this.toClick(event, button)
        this.push(click)
        this.options.onClick(click)
      }

      const onKeyDown = (event: { keycode: number; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): void => {
        if (!this.options?.shouldRecord()) return
        const key: RawKey = { atMs: this.now(), keycode: event.keycode, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey }
        const keyName = keyNames.get(event.keycode)
        const wantsChar = this.options.recordTypedText && !key.ctrl && !key.alt && !key.meta && !MODIFIER_KEYS.has(keyName ?? '')
        const char = wantsChar ? this.watcher.requestChar(key.keycode, key.shift) : Promise.resolve('')
        // Ответы приходят по порядку, но разбираем их цепочкой: Backspace и Enter не должны обгонять буквы
        this.keyQueue = this.keyQueue.then(async () => this.handleKey(key, keyName, await char))
      }

      uIOhook.on('mousedown', onMouseDown)
      uIOhook.on('keydown', onKeyDown)
      uIOhook.start()
      this.stopHook = () => {
        uIOhook.off('mousedown', onMouseDown)
        uIOhook.off('keydown', onKeyDown)
        uIOhook.stop()
      }
    } catch (error) {
      console.error('[screen-session] клики и клавиши недоступны:', error instanceof Error ? error.message : error)
    }
  }

  private handleKey(key: RawKey, keyName: string | undefined, char: string): void {
    const shortcut = describeShortcut(keyName, { ctrl: key.ctrl, alt: key.alt, shift: key.shift, meta: key.meta })
    if (shortcut) {
      this.flushTyping()
      const isRepeat = shortcut === this.lastKey.shortcut && key.atMs - this.lastKey.atMs < KEY_REPEAT_WINDOW_MS
      this.lastKey = { shortcut, atMs: key.atMs }
      if (!isRepeat) this.push({ kind: 'key', shortcut }, key.atMs)
      return
    }
    if (!this.options?.recordTypedText) return
    if (keyName === 'Backspace') this.eraseTyped()
    else if (char) this.appendTyped(char, key.atMs)
  }

  private appendTyped(char: string, atMs: number): void {
    this.typing ??= { text: '', atMs, window: this.currentWindow }
    this.typing.text += char
    if (this.typingTimer) clearTimeout(this.typingTimer)
    this.typingTimer = setTimeout(() => this.flushTyping(), TYPING_PAUSE_MS)
  }

  private eraseTyped(): void {
    if (this.typing) this.typing.text = this.typing.text.slice(0, -1)
  }

  private flushTyping(): void {
    if (this.typingTimer) clearTimeout(this.typingTimer)
    this.typingTimer = null
    const typing = this.typing
    this.typing = null
    if (!typing || typing.text.length === 0) return
    const hidden = isSensitiveWindow(typing.window)
    this.push({ kind: 'text', text: hidden ? '' : typing.text, hidden }, typing.atMs, typing.window)
  }

  private onWindowChange(change: { change: 'focus' | 'open' | 'close'; title: string; app?: string }): void {
    if (change.change === 'focus') {
      this.flushTyping()
      this.currentWindow = change.title
    }
    this.push({ kind: 'window', change: change.change, title: change.title, app: change.app })
  }

  private startClipboardWatch(): void {
    this.lastClipboard = clipboard.readText()
    this.clipboardTimer = setInterval(() => {
      const text = clipboard.readText()
      if (text === this.lastClipboard) return
      this.lastClipboard = text
      if (!text.trim() || isSensitiveWindow(this.currentWindow)) return
      this.push({ kind: 'clipboard', text: text.slice(0, MAX_CLIPBOARD_LENGTH) })
    }, CLIPBOARD_POLL_MS)
  }

  private now(): number {
    return Date.now() - (this.options?.meetingStartMs ?? Date.now())
  }

  private push(body: EventBody, atMs = this.now(), window = this.currentWindow): void {
    if (this.events.length >= MAX_EVENTS) return
    this.events.push({ ...body, atMs, window } as ScreenEvent)
  }

  private toClick(event: { x: number; y: number; clicks: number }, button: ClickEvent['button']): ClickBody {
    // Перехватчик отдаёт физические пиксели, мониторы и окна в Electron — DIP
    const point = process.platform === 'win32' ? screen.screenToDipPoint({ x: event.x, y: event.y }) : { x: event.x, y: event.y }
    const display = screen.getDisplayNearestPoint(point)
    return {
      kind: 'click',
      displayId: String(display.id),
      x: point.x - display.bounds.x,
      y: point.y - display.bounds.y,
      button,
      double: event.clicks >= 2
    }
  }
}
