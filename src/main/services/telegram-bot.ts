import { net } from 'electron'
import { simulateEnter } from './paste'
import { detectAudioFormat, handleRemoteVoice, insertTextIntoActiveWindow, textPreview } from './remote-input'

// Текст кнопки в reply-клавиатуре. Получив такое сообщение, бот эмулирует Enter в активном окне.
const SEND_BUTTON_LABEL = 'Отправить'

// Пауза long-poll'а — сколько ждёт сервер Telegram прежде чем вернуть пустоту
const LONG_POLL_TIMEOUT_SEC = 25

interface TelegramUser {
  id: number
}

interface TelegramVoice {
  file_id: string
  duration: number
  mime_type?: string
}

interface TelegramAudio {
  file_id: string
  duration: number
  mime_type?: string
  file_name?: string
}

interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  chat: { id: number }
  text?: string
  voice?: TelegramVoice
  audio?: TelegramAudio
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  // Посты в канале-ретрансляторе: так диктует телефон (там пишет второй бот, а не пользователь)
  channel_post?: TelegramMessage
}

interface TelegramFile {
  file_id: string
  file_path?: string
}

interface TelegramResponse<T> {
  ok: boolean
  result?: T
  description?: string
}

class TelegramBotService {
  private token = ''
  private allowedUserIds: number[] = []
  private relayChannelId = 0
  private offset = 0
  private pollAbort: AbortController | null = null
  private running = false
  private stopRequested = false

  start(token: string, allowedUserIds: number[], relayChannelId: number): void {
    if (this.running && this.token === token && this.relayChannelId === relayChannelId && this.sameWhitelist(allowedUserIds)) {
      // Ничего не изменилось — не дёргаем ботa
      return
    }

    this.stop()
    if (!token) return

    this.token = token
    this.allowedUserIds = [...allowedUserIds]
    this.relayChannelId = relayChannelId
    this.offset = 0
    this.stopRequested = false
    this.running = true

    console.log(`[telegram] Старт: whitelist=${this.allowedUserIds.join(',') || 'пустой'}`)

    // Запускаем cycle, не ждём — это фоновый процесс
    this.pollLoop().catch((err) => {
      console.error('[telegram] Цикл polling упал:', err)
      this.running = false
    })
  }

  stop(): void {
    if (!this.running) return
    console.log('[telegram] Стоп')
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
        const updates = await this.getUpdates()
        for (const upd of updates) {
          this.offset = Math.max(this.offset, upd.update_id + 1)
          if (upd.message) {
            // Не блокируем цикл обработкой — но в случае ошибки логируем
            this.handleMessage(upd.message).catch((err) =>
              console.error('[telegram] Ошибка обработки сообщения:', err)
            )
          }
          if (upd.channel_post) this.handleRelayPost(upd.channel_post)
        }
      } catch (err) {
        if (this.stopRequested) break
        const message = err instanceof Error ? err.message : String(err)
        console.error('[telegram] Ошибка getUpdates:', message)
        // Бэк-офф при ошибках сети, чтобы не спамить API
        await this.sleep(3000)
      }
    }
  }

  private async getUpdates(): Promise<TelegramUpdate[]> {
    this.pollAbort = new AbortController()
    const url = `https://api.telegram.org/bot${this.token}/getUpdates?timeout=${LONG_POLL_TIMEOUT_SEC}&offset=${this.offset}&allowed_updates=${encodeURIComponent('["message","channel_post"]')}`

    const res = await net.fetch(url, { signal: this.pollAbort.signal })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    const data = (await res.json()) as TelegramResponse<TelegramUpdate[]>
    if (!data.ok) {
      throw new Error(data.description ?? 'Telegram API вернул ok=false')
    }
    return data.result ?? []
  }

  // Текст из приложения на телефоне: вставляем как есть, «Отправить» — Enter.
  // Доверяем только заранее заданному каналу: писать туда могут лишь его админы (боты).
  private handleRelayPost(post: TelegramMessage): void {
    if (!this.relayChannelId || post.chat.id !== this.relayChannelId || !post.text) return

    if (post.text === SEND_BUTTON_LABEL) simulateEnter()
    else insertTextIntoActiveWindow(post.text)
  }

  private async handleMessage(message: TelegramMessage): Promise<void> {
    const userId = message.from?.id
    if (!userId || !this.allowedUserIds.includes(userId)) {
      // Молча игнорируем чужих
      return
    }

    const chatId = message.chat.id

    // Кнопка "Отправить" из reply-клавиатуры — приходит просто как text-сообщение
    if (message.text === SEND_BUTTON_LABEL) {
      simulateEnter()
      await this.sendKeyboard(chatId, '✓ Enter отправлен').catch(() => undefined)
      return
    }

    if (message.text) {
      insertTextIntoActiveWindow(message.text)
      await this.sendKeyboard(chatId, `✓ Вставлено (${message.text.length} симв.)`).catch(() => undefined)
      return
    }

    const voice = message.voice ?? message.audio
    if (voice) {
      await this.handleVoice(chatId, voice)
      return
    }

    await this.sendKeyboard(chatId, 'Поддерживается только текст и голосовые').catch(() => undefined)
  }

  private async handleVoice(chatId: number, voice: TelegramVoice | TelegramAudio): Promise<void> {
    try {
      const buffer = await this.downloadFile(voice.file_id)
      if (!buffer) {
        await this.sendKeyboard(chatId, '❌ Не удалось скачать аудио').catch(() => undefined)
        return
      }

      // Telegram отдаёт voice как OGG/Opus, audio может быть mp3/m4a/ogg
      const format = detectAudioFormat(voice.mime_type)
      const outcome = await handleRemoteVoice(buffer, format, Math.round((voice.duration ?? 0) * 1000))

      if (!outcome.ok) {
        await this.sendKeyboard(chatId, `❌ ${outcome.error}`).catch(() => undefined)
        return
      }

      await this.sendKeyboard(chatId, `✓ Вставлено:\n${textPreview(outcome.text)}`).catch(() => undefined)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[telegram] Ошибка обработки голоса:', message)
      await this.sendKeyboard(chatId, `❌ Ошибка: ${message}`).catch(() => undefined)
    }
  }

  private async downloadFile(fileId: string): Promise<Buffer | null> {
    const infoUrl = `https://api.telegram.org/bot${this.token}/getFile?file_id=${encodeURIComponent(fileId)}`
    const infoRes = await net.fetch(infoUrl)
    if (!infoRes.ok) return null
    const info = (await infoRes.json()) as TelegramResponse<TelegramFile>
    const filePath = info.result?.file_path
    if (!filePath) return null

    const fileUrl = `https://api.telegram.org/file/bot${this.token}/${filePath}`
    const fileRes = await net.fetch(fileUrl)
    if (!fileRes.ok) return null
    const arrayBuffer = await fileRes.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  private async sendKeyboard(chatId: number, text: string): Promise<void> {
    const url = `https://api.telegram.org/bot${this.token}/sendMessage`
    const body = JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: {
        keyboard: [[{ text: SEND_BUTTON_LABEL }]],
        resize_keyboard: true,
        is_persistent: true,
        input_field_placeholder: 'Текст или голосовое — будет вставлено'
      }
    })
    await net.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    })
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

export const telegramBot = new TelegramBotService()
