import { io, Socket } from 'socket.io-client'
import { z } from 'zod'
import type { RemoteControlStatus } from '../../shared/types'
import { inputInjector, VK } from './input-injector'

const SERVER_URL = 'https://api.chatalert.cc/remote-control'
/** Alt отпускается сам, если телефон пропал посреди переключения окон — иначе Alt «залипнет» */
const WINDOW_SWITCH_IDLE_MS = 1500

const delta = z.number().finite().min(-2000).max(2000)

/**
 * Что телефон вправе попросить. Всё остальное отбрасывается: произвольный текст, сочетания и запуск
 * программ пульт не умеет by design — даже с утёкшим ключом им нельзя набрать команду в терминале.
 */
const remoteCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('key'), key: z.enum(['esc', 'tab', 'shift-tab', 'enter', 'backspace', 'up', 'down', 'left', 'right']) }),
  z.object({ type: z.literal('window'), step: z.union([z.literal(1), z.literal(-1)]) }),
  z.object({ type: z.literal('window-release') }),
  z.object({ type: z.literal('group'), step: z.union([z.literal(1), z.literal(-1)]) }),
  z.object({ type: z.literal('move'), dx: delta, dy: delta }),
  z.object({ type: z.literal('click'), button: z.enum(['left', 'right']) }),
  z.object({ type: z.literal('drag'), pressed: z.boolean() }),
  z.object({ type: z.literal('scroll'), dx: delta, dy: delta })
])

type RemoteCommand = z.infer<typeof remoteCommand>
type RemoteKey = Extract<RemoteCommand, { type: 'key' }>['key']

const KEYS: Record<RemoteKey, () => Promise<void>> = {
  esc: () => inputInjector.tap(VK.ESC),
  tab: () => inputInjector.tap(VK.TAB),
  'shift-tab': () => inputInjector.tap(VK.TAB, 'shift'),
  enter: () => inputInjector.tap(VK.ENTER),
  backspace: () => inputInjector.tap(VK.BACKSPACE),
  up: () => inputInjector.tap(VK.UP),
  down: () => inputInjector.tap(VK.DOWN),
  left: () => inputInjector.tap(VK.LEFT),
  right: () => inputInjector.tap(VK.RIGHT)
}

/**
 * Пульт с телефона: команды приходят через ретранслятор api.chatalert.cc (комната по общему ключу)
 * и исполняются здесь через SendInput.
 */
class RemoteControl {
  private socket: Socket | null = null
  private status: RemoteControlStatus = 'off'
  private altHeld = false
  private altReleaseTimer: NodeJS.Timeout | null = null
  /** Команды исполняются строго по очереди: шаг колеса не должен обогнать нажатие Alt */
  private queue: Promise<void> = Promise.resolve()

  start(key: string, onStatus: (status: RemoteControlStatus) => void): void {
    this.stop()
    const setStatus = (status: RemoteControlStatus): void => {
      this.status = status
      onStatus(status)
    }

    inputInjector.warmUp()
    const socket = io(SERVER_URL, { path: '/socket.io/', transports: ['websocket'], auth: { key, role: 'desktop' } })
    socket.on('connect', () => setStatus('connected'))
    socket.on('disconnect', () => {
      void this.releaseAlt()
      setStatus('connecting')
    })
    socket.on('connect_error', (error) => {
      console.warn('[remote] нет связи с сервером:', error.message)
      setStatus('connecting')
    })
    socket.on('command', (payload: object) => {
      const parsed = remoteCommand.safeParse(payload)
      if (!parsed.success) return
      this.queue = this.queue.then(() => this.execute(parsed.data)).catch((error: Error) => console.error('[remote]', error.message))
    })

    this.socket = socket
    setStatus('connecting')
  }

  stop(): void {
    this.socket?.disconnect()
    this.socket = null
    this.status = 'off'
    void this.releaseAlt()
  }

  getStatus(): RemoteControlStatus {
    return this.status
  }

  private async execute(command: RemoteCommand): Promise<void> {
    switch (command.type) {
      case 'key': return KEYS[command.key]()
      case 'window': return this.switchWindow(command.step)
      case 'window-release': return this.releaseAlt()
      // Привязаны к workbench.action.focusNext/PreviousGroup в keybindings.json VS Code
      case 'group': return inputInjector.tap(command.step > 0 ? VK.PAGE_DOWN : VK.PAGE_UP, 'ctrl', 'alt', 'shift')
      case 'move': return inputInjector.move(command.dx, command.dy)
      case 'click':
        await inputInjector.button(command.button, true)
        return inputInjector.button(command.button, false)
      case 'drag': return inputInjector.button('left', command.pressed)
      case 'scroll': return inputInjector.wheel(command.dy, command.dx)
    }
  }

  /** Alt держится, пока крутится колесо: так Windows показывает переключатель окон и листает по нему. */
  private async switchWindow(step: 1 | -1): Promise<void> {
    if (!this.altHeld) {
      this.altHeld = true
      await inputInjector.keyDown(VK.ALT)
    }
    if (this.altReleaseTimer) clearTimeout(this.altReleaseTimer)
    this.altReleaseTimer = setTimeout(() => void this.releaseAlt(), WINDOW_SWITCH_IDLE_MS)
    await (step > 0 ? inputInjector.tap(VK.TAB) : inputInjector.tap(VK.TAB, 'shift'))
  }

  private async releaseAlt(): Promise<void> {
    if (this.altReleaseTimer) clearTimeout(this.altReleaseTimer)
    this.altReleaseTimer = null
    if (!this.altHeld) return
    this.altHeld = false
    await inputInjector.keyUp(VK.ALT)
  }
}

export const remoteControl = new RemoteControl()
