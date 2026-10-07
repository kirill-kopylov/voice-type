import type { AppSettings, Provider } from '../../shared/types'
import { randomUUID } from 'crypto'
import { net } from 'electron'
import { encodeMp3Chunks } from './encode-audio'

// Все три провайдера принимают OpenAI-совместимый multipart на /audio/transcriptions
const PROVIDER_BASE_URLS: Record<Provider, string> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1'
}

const DEFAULT_MODELS: Record<Provider, string> = {
  openai: 'whisper-1',
  openrouter: 'openai/gpt-4o-mini-transcribe',
  groq: 'whisper-large-v3-turbo'
}

interface TranscriptionResult {
  text: string
  error?: string
}

// Формат аудио для multipart-запроса. STT API ориентируется по расширению файла.
export interface AudioFormat {
  filename: string
  mimeType: string
}

const DEFAULT_AUDIO_FORMAT: AudioFormat = { filename: 'recording.webm', mimeType: 'audio/webm' }
const MP3_AUDIO_FORMAT: AudioFormat = { filename: 'recording.mp3', mimeType: 'audio/mpeg' }

// Проверено запросом на /audio/transcriptions: на webm отвечают 400, на mp3 — 200
const MP3_ONLY_MODELS = ['microsoft/mai-transcribe-2']

function getApiKey(settings: AppSettings): string {
  if (settings.provider === 'groq') return settings.groqApiKey
  if (settings.provider === 'openrouter') return settings.openRouterApiKey
  return settings.openAiApiKey
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  settings: AppSettings,
  format: AudioFormat = DEFAULT_AUDIO_FORMAT
): Promise<TranscriptionResult> {
  const apiKey = getApiKey(settings)
  if (!apiKey) {
    return { text: '', error: `API ключ для ${settings.provider} не задан` }
  }

  const model = settings.model || DEFAULT_MODELS[settings.provider]

  // Часть моделей отвергает webm/ogg с 400 — им отдаём тот же звук в mp3
  if (settings.provider === 'openrouter' && MP3_ONLY_MODELS.includes(model)) {
    try {
      const [mp3] = await encodeMp3Chunks(audioBuffer)
      audioBuffer = mp3
      format = MP3_AUDIO_FORMAT
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { text: '', error: `Не удалось перекодировать звук в mp3: ${message}` }
    }
  }
  console.log(`[transcribe] ${audioBuffer.length} байт, ${settings.provider}, модель: ${model}, формат: ${format.filename}`)

  const boundary = `----VoiceType${randomUUID().replace(/-/g, '')}`
  const parts: Buffer[] = []
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${format.filename}"\r\nContent-Type: ${format.mimeType}\r\n\r\n`))
  parts.push(audioBuffer)
  parts.push(Buffer.from('\r\n'))
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}\r\n`))
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${settings.language || 'ru'}\r\n`))
  parts.push(Buffer.from(`--${boundary}--\r\n`))

  try {
    const response = await net.fetch(`${PROVIDER_BASE_URLS[settings.provider]}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: Buffer.concat(parts)
    })

    if (!response.ok) {
      const errorBody = await response.text()
      const short = errorBody.startsWith('<!') ? errorBody.slice(0, 200) : errorBody.slice(0, 500)
      return { text: '', error: `API ошибка ${response.status}: ${short}` }
    }

    const data = (await response.json()) as { text?: string }
    return { text: data.text ?? '' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[transcribe] Ошибка:', message)
    return { text: '', error: `Ошибка сети: ${message}` }
  }
}

export async function testConnection(settings: AppSettings): Promise<{ ok: boolean; error?: string }> {
  const apiKey = getApiKey(settings)
  if (!apiKey) {
    return { ok: false, error: `API ключ для ${settings.provider} не задан` }
  }

  try {
    const response = await net.fetch(`${PROVIDER_BASE_URLS[settings.provider]}/models`, {
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
