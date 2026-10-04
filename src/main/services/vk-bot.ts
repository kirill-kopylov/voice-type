import { net } from 'electron'
import { simulateEnter } from './paste'
import { detectAudioFormat, handleRemoteVoice, insertTextIntoActiveWindow, textPreview } from './remote-input'

// Текст кнопки в reply-клавиатуре. Получив такое сообщение, бот эмулирует Enter в активном окне.
const SEND_BUTTON_LABEL = 'Отправить'

// Пауза long-poll'а — сколько ждёт сервер VK прежде чем вернуть пустоту
const LONG_POLL_WAIT_SEC = 25

const API_VERSION = '5.199'

interface VkAudioMessage {
  duration?: number
  link_ogg?: string
  link_mp3?: string
}

interface VkAttachment {
  type: string
  audio_message?: VkAudioMessage
}

interface VkMessage {
  from_id: number
  peer_id: number
  text?: string
  attachments?: VkAttachment[]
}

interface VkUpdate {
  type: string
  object?: { message?: VkMessage }
}

interface VkLongPollServer {
  key: string
  server: string
  ts: string
}

// failed: 1 — устарел ts (новый в ответе), 2/3 — нужен новый key/сессия
interface VkPollResult {
  ts?: string
  updates?: VkUpdate[]
  failed?: number
}

interface VkApiEnvelope<T> {
  response?: T
  error?: { error_code: number; error_msg: string }
}

class VkBotService {
  private token = ''
  private groupId = 0
  private allowedUserIds: number[] = []
  private server = ''
  private key = ''
  private ts = ''
  private pollAbort: AbortController | null = null
  private running = false
  private stopRequested = false

  start(token: string, allowedUserIds: number[]): void {
    if (this.running && this.token === token && this.sameWhitelist(allowedUserIds)) {
      // Ничего не изменилось — не дёргаем бота
      return
    }

    this.stop()
    if (!token) return

    this.token = token
    this.allowedUserIds = [...allowedUserIds]
    this.groupId = 0
    this.server = ''
    this.stopRequested = false
    this.running = true

    console.log(`[vk] Старт: whitelist=${this.allowedUserIds.join(',') || 'пустой'}`)

    // Запускаем cycle, не ждём — это фоновый процесс
    this.pollLoop().catch((err) => {
      console.error('[vk] Цикл polling упал:', err)
      this.running = false
    })
  }

  stop(): void {
    if (!this.running) return
    console.log('[vk] Стоп')
    this.stopRequested = true
    this.running = false
    this.pollAbort?.abort()
    this.pollAbort = null
  }

  private sameWhitelist(ids: number[]): boolean {
    if (ids.length !== this.allowedUserIds.length) return false
    const a = [...ids].sort()
    const b = [...this.allowedUserIds].sort()
    return a.every((v, i) => v === b[i])
  }

  private async pollLoop(): Promise<void> {
    while (!this.stopRequested) {
      try {
        if (!this.server) await this.connect()

        const result = await this.poll()
        if (result.failed !== undefined) {
          // ts устарел — сервер сразу присылает актуальный; иначе пересоздаём сессию
          if (result.failed === 1 && result.ts) this.ts = result.ts
          else this.server = ''
          continue
        }

        if (result.ts) this.ts = result.ts
        for (const upd of result.updates ?? []) {
          if (upd.type === 'message_new' && upd.object?.message) {
            // Не блокируем цикл обработкой — но в случае ошибки логируем
            this.handleMessage(upd.object.message).catch((err) =>
              console.error('[vk] Ошибка обработки сообщения:', err)
            )
          }
        }
      } catch (err) {
        if (this.stopRequested) break
        const message = err instanceof Error ? err.message : String(err)
        console.error('[vk] Ошибка long poll:', message)
        // Сессия могла протухнуть — пересоздаём; бэк-офф, чтобы не спамить API
        this.server = ''
        await this.sleep(3000)
      }
    }
  }

  // group_id вытягиваем по токену, чтобы пользователь вводил только сам токен
  private async connect(): Promise<void> {
    if (!this.groupId) {
      const info = await this.api<{ groups: Array<{ id: number }> }>('groups.getById', {})
      const id = info?.groups?.[0]?.id
      if (!id) throw new Error('Не удалось определить сообщество по токену')
      this.groupId = id
      console.log(`[vk] Сообщество: club${this.groupId}`)
    }

    const lp = await this.api<VkLongPollServer>('groups.getLongPollServer', { group_id: String(this.groupId) })
    if (!lp) throw new Error('getLongPollServer вернул пустой ответ')
    this.server = lp.server
    this.key = lp.key
    this.ts = lp.ts
  }

  private async poll(): Promise<VkPollResult> {
    this.pollAbort = new AbortController()
    const url = `${this.server}?act=a_check&key=${encodeURIComponent(this.key)}&ts=${encodeURIComponent(this.ts)}&wait=${LONG_POLL_WAIT_SEC}`

    const res = await net.fetch(url, { signal: this.pollAbort.signal })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    return (await res.json()) as VkPollResult
  }

  private async handleMessage(message: VkMessage): Promise<void> {
    if (!this.allowedUserIds.includes(message.from_id)) {
      // Молча игнорируем чужих
      return
    }

    const peerId = message.peer_id

    // Кнопка "Отправить" из reply-клавиатуры — приходит просто как text-сообщение
    if (message.text === SEND_BUTTON_LABEL) {
      simulateEnter()
      await this.sendKeyboard(peerId, '✓ Enter отправлен').catch(() => undefined)
      return
    }

    const voice = message.attachments?.find((a) => a.type === 'audio_message')?.audio_message
    if (voice) {
      await this.handleVoice(peerId, voice)
      return
    }

    if (message.text) {
      insertTextIntoActiveWindow(message.text)
      await this.sendKeyboard(peerId, `✓ Вставлено (${message.text.length} симв.)`).catch(() => undefined)
      return
    }

    await this.sendKeyboard(peerId, 'Поддерживается только текст и голосовые').catch(() => undefined)
  }

  private async handleVoice(peerId: number, voice: VkAudioMessage): Promise<void> {
    try {
      // VK кладёт прямые ссылки на аудио прямо в событие — getFile не нужен
      const url = voice.link_ogg ?? voice.link_mp3
      if (!url) {
        await this.sendKeyboard(peerId, '❌ Не удалось получить ссылку на аудио').catch(() => undefined)
        return
      }

      const res = await net.fetch(url)
      if (!res.ok) {
        await this.sendKeyboard(peerId, '❌ Не удалось скачать аудио').catch(() => undefined)
        return
      }
      const buffer = Buffer.from(await res.arrayBuffer())

      const format = detectAudioFormat(voice.link_ogg ? 'audio/ogg' : 'audio/mpeg')
      const outcome = await handleRemoteVoice(buffer, format, Math.round((voice.duration ?? 0) * 1000))

      if (!outcome.ok) {
        await this.sendKeyboard(peerId, `❌ ${outcome.error}`).catch(() => undefined)
        return
      }

      await this.sendKeyboard(peerId, `✓ Вставлено:\n${textPreview(outcome.text)}`).catch(() => undefined)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[vk] Ошибка обработки голоса:', message)
      await this.sendKeyboard(peerId, `❌ Ошибка: ${message}`).catch(() => undefined)
    }
  }

  private async sendKeyboard(peerId: number, text: string): Promise<void> {
    await this.api('messages.send', {
      peer_id: String(peerId),
      // random_id — защита VK от дублей, int32
      random_id: String(Math.floor(Math.random() * 2147483647)),
      message: text,
      keyboard: JSON.stringify({
        one_time: false,
        buttons: [[{ action: { type: 'text', label: SEND_BUTTON_LABEL } }]]
      })
    })
  }

  private async api<T>(method: string, params: Record<string, string>): Promise<T | null> {
    const body = new URLSearchParams({ ...params, access_token: this.token, v: API_VERSION })
    const res = await net.fetch(`https://api.vk.com/method/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    const data = (await res.json()) as VkApiEnvelope<T>
    if (data.error) {
      throw new Error(`VK API ${data.error.error_code}: ${data.error.error_msg}`)
    }
    return data.response ?? null
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

export const vkBot = new VkBotService()
