import { AppSettings } from './types'
import { writeFileSync, unlinkSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { net } from 'electron'

interface TranscriptionResult {
  text: string
  error?: string
}

function getApiConfig(settings: AppSettings): { baseUrl: string; apiKey: string } {
  if (settings.provider === 'openrouter') {
    return {
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: settings.openRouterApiKey
    }
  }

  return {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: settings.openAiApiKey
  }
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  settings: AppSettings
): Promise<TranscriptionResult> {
  const { baseUrl, apiKey } = getApiConfig(settings)

  if (!apiKey) {
    return { text: '', error: `API ключ для ${settings.provider} не задан` }
  }

  console.log(`[transcribe] Аудио: ${audioBuffer.length} байт, провайдер: ${settings.provider}`)

  // Собираем multipart/form-data вручную — Node.js Blob+FormData ненадёжен
  const boundary = `----VoiceType${randomUUID().replace(/-/g, '')}`

  const parts: Buffer[] = []

  // Файл
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="recording.webm"\r\nContent-Type: audio/webm\r\n\r\n`
  ))
  parts.push(audioBuffer)
  parts.push(Buffer.from('\r\n'))

  // model
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${settings.model || 'whisper-1'}\r\n`
  ))

  // language
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${settings.language || 'ru'}\r\n`
  ))

  parts.push(Buffer.from(`--${boundary}--\r\n`))

  const body = Buffer.concat(parts)

  try {
    console.log(`[transcribe] Отправляю запрос на ${baseUrl}/audio/transcriptions`)

    const response = await net.fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body
    })

    console.log(`[transcribe] Ответ: ${response.status}`)

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`[transcribe] Ошибка API:`, errorBody)
      return { text: '', error: `API ошибка ${response.status}: ${errorBody}` }
    }

    const data = (await response.json()) as { text: string }
    console.log(`[transcribe] Распознано: "${data.text}"`)
    return { text: data.text }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[transcribe] Ошибка:`, message)
    return { text: '', error: `Ошибка сети: ${message}` }
  }
}

export async function testConnection(settings: AppSettings): Promise<{ ok: boolean; error?: string }> {
  const { baseUrl, apiKey } = getApiConfig(settings)

  if (!apiKey) {
    return { ok: false, error: `API ключ для ${settings.provider} не задан` }
  }

  try {
    const response = await net.fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    })

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` }
    }

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}
