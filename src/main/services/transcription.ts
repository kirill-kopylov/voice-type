import { AppSettings, DialogSegment } from './types'
import { randomUUID } from 'crypto'
import { net } from 'electron'
import { chunkWebmBySilence } from './chunk-audio'
import { extractSpeakerSegments } from './extract-speaker'

// Лимит модели gpt-4o-transcribe-diarize — 1400с
const DIARIZE_MAX_SEC = 1380

interface TranscriptionResult {
  text: string
  error?: string
}

// OpenAI — multipart/form-data на /audio/transcriptions
async function transcribeOpenAI(
  audioBuffer: Buffer,
  apiKey: string,
  model: string,
  language: string
): Promise<TranscriptionResult> {
  const boundary = `----VoiceType${randomUUID().replace(/-/g, '')}`

  const parts: Buffer[] = []
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="recording.webm"\r\nContent-Type: audio/webm\r\n\r\n`))
  parts.push(audioBuffer)
  parts.push(Buffer.from('\r\n'))
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model || 'whisper-1'}\r\n`))
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language || 'ru'}\r\n`))
  parts.push(Buffer.from(`--${boundary}--\r\n`))

  const body = Buffer.concat(parts)

  const response = await net.fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body
  })

  if (!response.ok) {
    const errorBody = await response.text()
    return { text: '', error: `API ошибка ${response.status}: ${errorBody}` }
  }

  const data = (await response.json()) as { text: string }
  return { text: data.text }
}

// Groq — тот же формат что OpenAI, другой baseUrl
async function transcribeGroq(
  audioBuffer: Buffer,
  apiKey: string,
  model: string,
  language: string
): Promise<TranscriptionResult> {
  const boundary = `----VoiceType${randomUUID().replace(/-/g, '')}`
  const parts: Buffer[] = []
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="recording.webm"\r\nContent-Type: audio/webm\r\n\r\n`))
  parts.push(audioBuffer)
  parts.push(Buffer.from('\r\n'))
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model || 'whisper-large-v3-turbo'}\r\n`))
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language || 'ru'}\r\n`))
  parts.push(Buffer.from(`--${boundary}--\r\n`))

  const body = Buffer.concat(parts)

  const response = await net.fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body
  })

  if (!response.ok) {
    const errorBody = await response.text()
    return { text: '', error: `API ошибка ${response.status}: ${errorBody}` }
  }

  const data = (await response.json()) as { text: string }
  return { text: data.text }
}

// OpenRouter — base64 аудио через /chat/completions
async function transcribeOpenRouter(
  audioBuffer: Buffer,
  apiKey: string,
  model: string,
  language: string
): Promise<TranscriptionResult> {
  const base64Audio = audioBuffer.toString('base64')

  const langHint = language === 'ru' ? 'Russian' : language === 'en' ? 'English' : language
  const requestBody = {
    model: model || 'openai/whisper-1',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Transcribe this audio. Language: ${langHint}. Return ONLY the transcribed text, nothing else.`
          },
          {
            type: 'input_audio',
            input_audio: {
              data: base64Audio,
              format: 'webm'
            }
          }
        ]
      }
    ]
  }

  const response = await net.fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorBody = await response.text()
    // Обрезаем HTML-мусор если сервер вернул страницу
    const short = errorBody.startsWith('<!') ? errorBody.slice(0, 200) : errorBody
    return { text: '', error: `API ошибка ${response.status}: ${short}` }
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] }
  const text = data.choices?.[0]?.message?.content?.trim() ?? ''
  return { text }
}

function getApiKey(settings: AppSettings): string {
  if (settings.provider === 'groq') return settings.groqApiKey
  if (settings.provider === 'openrouter') return settings.openRouterApiKey
  return settings.openAiApiKey
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  settings: AppSettings
): Promise<TranscriptionResult> {
  const apiKey = getApiKey(settings)

  if (!apiKey) {
    return { text: '', error: `API ключ для ${settings.provider} не задан` }
  }

  console.log(`[transcribe] ${audioBuffer.length} байт, ${settings.provider}, модель: ${settings.model}`)

  try {
    if (settings.provider === 'openrouter') {
      return await transcribeOpenRouter(audioBuffer, apiKey, settings.model, settings.language)
    }
    if (settings.provider === 'groq') {
      return await transcribeGroq(audioBuffer, apiKey, settings.model, settings.language)
    }
    return await transcribeOpenAI(audioBuffer, apiKey, settings.model, settings.language)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[transcribe] Ошибка:`, message)
    return { text: '', error: `Ошибка сети: ${message}` }
  }
}

export interface KnownSpeaker {
  name: string
  audio: Buffer  // WAV
}

// Диаризация через gpt-4o-transcribe-diarize.
// При превышении лимита модели режет на куски по ближайшей тишине и склеивает результат.
export async function transcribeDiarized(
  audioBuffer: Buffer,
  apiKey: string,
  language: string,
  knownSpeakers: KnownSpeaker[] = []
): Promise<{ segments: DialogSegment[]; error?: string }> {
  try {
    const chunks = await chunkWebmBySilence(audioBuffer, DIARIZE_MAX_SEC)
    if (chunks.length === 1) {
      return diarizeOnce(chunks[0].buffer, apiKey, language, knownSpeakers)
    }

    console.log(`[diarize] Файл разбит на ${chunks.length} кусков`)

    // Прогрессивное обучение: после каждого куска извлекаем сэмплы голосов
    // неизвестных спикеров и передаём как known_speaker_references в следующий.
    // Так "Speaker 1" из первого куска и второго — это тот же человек по голосу.
    const knownPool: KnownSpeaker[] = [...knownSpeakers]
    let syntheticCounter = 1
    const all: DialogSegment[] = []

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      console.log(`[diarize] Кусок ${i + 1}/${chunks.length}: ${chunk.startSec.toFixed(1)}-${chunk.endSec.toFixed(1)}с, известных голосов: ${knownPool.length}`)
      const res = await diarizeOnce(chunk.buffer, apiKey, language, knownPool.slice(0, 4))
      if (res.error) return { segments: [], error: `Кусок ${i + 1}: ${res.error}` }

      // Группируем сегменты по спикеру в пределах куска
      const bySpeaker = new Map<string, DialogSegment[]>()
      for (const seg of res.segments) {
        const arr = bySpeaker.get(seg.speaker) ?? []
        arr.push(seg)
        bySpeaker.set(seg.speaker, arr)
      }

      for (const [label, segs] of bySpeaker) {
        let finalName = label
        const isGeneric = /^Speaker\s/i.test(label)

        // Если спикер не распознан и в пуле есть место — извлекаем сэмпл и заводим синтетический профиль
        if (isGeneric && knownPool.length < 4) {
          const sample = await extractSpeakerSegments(
            chunk.buffer,
            segs.map((s) => ({ start: s.start, end: s.end }))
          )
          if (sample) {
            finalName = `Говорящий ${syntheticCounter++}`
            knownPool.push({ name: finalName, audio: sample })
            console.log(`[diarize] Новый голос: "${finalName}" (сэмпл из куска ${i + 1})`)
          }
        }

        for (const seg of segs) {
          all.push({
            speaker: finalName,
            text: seg.text,
            start: seg.start + chunk.startSec,
            end: seg.end + chunk.startSec
          })
        }
      }
    }
    return { segments: all }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[diarize] Ошибка чанкинга:', message)
    return { segments: [], error: `Ошибка разбиения аудио: ${message}` }
  }
}

async function diarizeOnce(
  audioBuffer: Buffer,
  apiKey: string,
  language: string,
  knownSpeakers: KnownSpeaker[] = []
): Promise<{ segments: DialogSegment[]; error?: string }> {
  const boundary = `----VoiceType${randomUUID().replace(/-/g, '')}`

  const parts: Buffer[] = []
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="meeting.webm"\r\nContent-Type: audio/webm\r\n\r\n`))
  parts.push(audioBuffer)
  parts.push(Buffer.from('\r\n'))
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\ngpt-4o-transcribe-diarize\r\n`))
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\ndiarized_json\r\n`))
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chunking_strategy"\r\n\r\nauto\r\n`))
  if (language) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}\r\n`))
  }

  // Известные спикеры — до 4 профилей.
  // OpenAI ждёт два JSON-массива:
  //  known_speaker_names = ["Имя1", ...]
  //  known_speaker_references = ["data:audio/wav;base64,...", ...]
  const limited = knownSpeakers.slice(0, 4)
  if (limited.length > 0) {
    const names = JSON.stringify(limited.map((s) => s.name))
    const refs = JSON.stringify(limited.map((s) => `data:audio/wav;base64,${s.audio.toString('base64')}`))
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="known_speaker_names"\r\n\r\n${names}\r\n`))
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="known_speaker_references"\r\n\r\n${refs}\r\n`))
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`))

  const body = Buffer.concat(parts)

  try {
    console.log(`[diarize] Отправка ${audioBuffer.length} байт`)
    const response = await net.fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`[diarize] Ошибка API:`, errorBody)
      return { segments: [], error: `API ошибка ${response.status}: ${errorBody.slice(0, 300)}` }
    }

    const data = (await response.json()) as { segments?: Array<{ speaker?: string; text: string; start: number; end: number }> }
    const segments: DialogSegment[] = (data.segments ?? []).map((s) => ({
      speaker: s.speaker ?? 'Speaker 1',
      text: s.text,
      start: s.start,
      end: s.end
    }))

    console.log(`[diarize] Получено ${segments.length} сегментов`)
    return { segments }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[diarize] Ошибка:`, message)
    return { segments: [], error: `Ошибка сети: ${message}` }
  }
}

export async function testConnection(settings: AppSettings): Promise<{ ok: boolean; error?: string }> {
  const apiKey = getApiKey(settings)
  const baseUrls: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    groq: 'https://api.groq.com/openai/v1'
  }
  const baseUrl = baseUrls[settings.provider]

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
