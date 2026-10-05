import { net } from 'electron'
import { encodeMp3Chunks } from './encode-audio'
import { extractSpeakerSegments } from './extract-speaker'
import { extractJsonObject } from './extract-json'
import { parseFishTranscript, assignSpeakers, stripHallucinations, SpeakerTurn, TimedText, WordTiming } from './fish-transcript'
import type { DialogSegment } from '../../shared/types'

// Голоса размечает fish по всей записи целиком: метки общие на всю встречу, есть времена слов.
// Слова она коверкает, поэтому текст берём у mai-transcribe-2 — fish отдаёт только «кто говорил».
// У mai времена отрезков есть, только пока запись короткая (на длинной они нулевые), поэтому текст берём кусками.
const VOICES_STT_MODEL = 'fish-audio/transcribe-1-pro'
const TEXT_STT_MODEL = 'microsoft/mai-transcribe-2'
const TEXT_CHUNK_SEC = 600
// Включает у mai времена отрезков; голоса mai не используем — они нестабильны между кусками
const TEXT_STT_OPTIONS = { provider: { options: { azure: { diarization: { enabled: true } } } } }
const STT_URL = 'https://openrouter.ai/api/v1/audio/transcriptions'
const RETRYABLE_STATUSES = [429, 502, 503]
const MAX_ATTEMPTS = 3

// Имена профилей и имена по контексту — audio-chat модель:
// STT-эндпоинт OpenRouter не принимает образцы голосов.
const CHAT_MODEL = 'google/gemini-3.5-flash'
const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'

// Сколько профилей голосов отправляем на сопоставление
const MAX_REFERENCE_VOICES = 8
// Соседние реплики одного спикера склеиваем, пока пауза короткая, а сегмент не длиннее лимита
const MERGE_GAP_SEC = 2
const MERGE_MAX_SEC = 30

export interface KnownSpeaker {
  name: string
  audio: Buffer  // WAV
}

class DiarizationError extends Error {}

/**
 * Диаризация встречи: STT размечает голоса по всей записи, затем голосам даются имена —
 * из голосовых профилей (только при явном совпадении) и из смысла разговора.
 */
export async function transcribeDiarized(
  audioBuffer: Buffer,
  apiKey: string,
  language: string,
  knownSpeakers: KnownSpeaker[] = []
): Promise<{ segments: DialogSegment[]; error?: string }> {
  try {
    console.log(`[diarize] Известных голосов: ${knownSpeakers.length}`)
    const turns = await diarize(audioBuffer, apiKey, language)

    const names = await nameSpeakers(apiKey, audioBuffer, knownSpeakers, turns)
    const segments = mergeNeighbors(turns.map((turn) => ({
      speaker: names.get(turn.speaker) as string,
      text: turn.text,
      start: turn.start,
      end: turn.end
    })))

    const unnamed = new Set(segments.map((s) => s.speaker).filter((name) => name.startsWith('Speaker ')))
    // Имена — дополнение: если модель не ответила, расшифровка остаётся пригодной
    const inferred = await inferNames(apiKey, segments, unnamed).catch((err) => {
      console.warn('[diarize] Имена по контексту не определены:', err instanceof Error ? err.message : err)
      return new Map<string, string>()
    })
    return { segments: segments.map((s) => ({ ...s, speaker: inferred.get(s.speaker) ?? s.speaker })) }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[diarize] Ошибка:', message)
    return { segments: [], error: err instanceof DiarizationError ? message : `Ошибка диаризации: ${message}` }
  }
}

/** Голоса и времена — от fish, текст — от mai: fish путает слова, зато лучше всех отличает людей. */
async function diarize(audioBuffer: Buffer, apiKey: string, language: string): Promise<SpeakerTurn[]> {
  const [[whole], chunks] = await Promise.all([encodeMp3Chunks(audioBuffer), encodeMp3Chunks(audioBuffer, TEXT_CHUNK_SEC)])
  const [voices, texts] = await Promise.all([
    transcribe<{ text?: string; words?: WordTiming[] }>(whole, apiKey, language, VOICES_STT_MODEL),
    transcribeText(chunks, apiKey, language)
  ])
  if (!voices.text) throw new DiarizationError('STT не вернул разметку голосов')
  if (texts.length === 0) throw new DiarizationError('STT не вернул текст')

  const turns = parseFishTranscript(voices.text, voices.words ?? [])
  const labelled = assignSpeakers(texts, turns)
  console.log(`[diarize] Отрезков текста: ${labelled.length}, голосов: ${new Set(labelled.map((t) => t.speaker)).size}`)
  return labelled
}

/** Куски идут по очереди (параллельные запросы провайдер режет по 429); времена сдвигаем на начало куска. */
async function transcribeText(chunks: Buffer[], apiKey: string, language: string): Promise<TimedText[]> {
  const texts: TimedText[] = []
  for (const [index, chunk] of chunks.entries()) {
    const offset = index * TEXT_CHUNK_SEC
    const { segments = [] } = await transcribe<{ segments?: TimedText[] }>(chunk, apiKey, language, TEXT_STT_MODEL, TEXT_STT_OPTIONS)
    texts.push(...segments.map((s) => ({ text: (s.text ?? '').trim(), start: s.start + offset, end: s.end + offset })))
  }
  return stripHallucinations(texts)
}

async function transcribe<T>(mp3: Buffer, apiKey: string, language: string, model: string, options: object = {}): Promise<T> {
  const body = JSON.stringify({
    model,
    input_audio: { data: mp3.toString('base64'), format: 'mp3' },
    language,
    response_format: 'verbose_json',
    ...options
  })

  // Провайдер временно отвечает 429/502 — повторяем, запрос не тарифицируется при отказе
  for (let attempt = 1; ; attempt++) {
    const response = await net.fetch(STT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body
    })
    if (response.ok) return (await response.json()) as T

    if (!RETRYABLE_STATUSES.includes(response.status) || attempt >= MAX_ATTEMPTS) {
      throw new DiarizationError(`STT (${model}) вернул ${response.status}: ${(await response.text()).slice(0, 300)}`)
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000))
  }
}

/**
 * Имя каждого голоса: профиль, если голос явно его, иначе «Speaker N» по порядку появления.
 * Ошибка сопоставления с профилями не валит диаризацию: голоса просто остаются безымянными.
 */
async function nameSpeakers(
  apiKey: string,
  audioBuffer: Buffer,
  knownSpeakers: KnownSpeaker[],
  turns: SpeakerTurn[]
): Promise<Map<number, string>> {
  const speakers = [...new Set(turns.map((t) => t.speaker))]
  const profileNames = knownSpeakers.length === 0
    ? new Map<number, string>()
    : await matchProfiles(apiKey, audioBuffer, knownSpeakers.slice(0, MAX_REFERENCE_VOICES), turns, speakers).catch((err) => {
      console.warn('[diarize] Профили не сопоставлены:', err instanceof Error ? err.message : err)
      return new Map<number, string>()
    })

  let unknownCounter = 0
  return new Map(speakers.map((speaker) => [speaker, profileNames.get(speaker) ?? `Speaker ${++unknownCounter}`]))
}

/**
 * Голос получает имя профиля только при явном совпадении. Ответу модели не доверяем:
 * имя профиля должно существовать, и если его назвали двум голосам — это ошибка модели, не называем ни одного.
 */
async function matchProfiles(
  apiKey: string,
  audioBuffer: Buffer,
  references: KnownSpeaker[],
  turns: SpeakerTurn[],
  speakers: number[]
): Promise<Map<number, string>> {
  const samples = new Map<number, Buffer>()
  for (const speaker of speakers) {
    const sample = await extractSpeakerSegments(audioBuffer, turns.filter((t) => t.speaker === speaker))
    if (sample) samples.set(speaker, sample)
  }

  const content: Array<Record<string, unknown>> = [{
    type: 'text',
    text: `First come reference voices with names, then voices from a meeting recording. ` +
      `For each meeting voice name the reference voice it clearly belongs to, otherwise null. ` +
      `Do not force a match: when unsure, answer null. Different meeting voices are different people. ` +
      `Return ONLY JSON: {"matches":[{"voice":"<voice label>","reference":"<reference name or null>"}]}`
  }]
  for (const reference of references) {
    content.push({ type: 'text', text: `Reference voice "${reference.name}":` })
    content.push({ type: 'input_audio', input_audio: { data: reference.audio.toString('base64'), format: 'wav' } })
  }
  for (const [speaker, audio] of samples) {
    content.push({ type: 'text', text: `Voice ${speaker}:` })
    content.push({ type: 'input_audio', input_audio: { data: audio.toString('base64'), format: 'wav' } })
  }

  const parsed = await askJson<{ matches?: Array<{ voice?: string | number; reference?: string | null }> }>(apiKey, content, 'Сопоставление профилей')
  const referenceNames = new Set(references.map((r) => r.name))

  const matches = new Map<number, string>()
  for (const { voice, reference } of parsed.matches ?? []) {
    const speaker = Number(String(voice).replace(/\D/g, ''))
    if (reference && referenceNames.has(reference) && samples.has(speaker)) matches.set(speaker, reference)
  }
  return dropDuplicateNames(matches)
}

/** Одно имя двум голосам — признак ошибки модели: не называем ни одного. */
function dropDuplicateNames<K>(names: Map<K, string>): Map<K, string> {
  const counts = [...names.values()].reduce((acc, name) => acc.set(name, (acc.get(name) ?? 0) + 1), new Map<string, number>())
  return new Map([...names].filter(([, name]) => counts.get(name) === 1))
}

/**
 * Имена безымянных голосов по смыслу разговора: представились, к ним обратились по имени.
 * Без явных указаний в тексте голос остаётся «Speaker N».
 */
async function inferNames(apiKey: string, segments: DialogSegment[], unnamed: Set<string>): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  if (unnamed.size === 0) return names

  const transcript = segments.map((s) => `${s.speaker}: ${s.text}`).join('\n')
  const parsed = await askJson<{ names?: Record<string, string | null> }>(apiKey, [{
    type: 'text',
    text: `Below is a meeting transcript where some speakers have only placeholder labels like "Speaker 1". ` +
      `For each unnamed speaker, give a real first name ONLY if the dialogue itself states it: ` +
      `the person introduces themselves, or others address that exact person by name (use turn order to see who is answered). ` +
      `Never guess from topic, role or tone; when not certain, answer null. Keep the name in the language it was spoken in. ` +
      `Return ONLY JSON: {"names":{"<label>":"<name or null>"}}\n\n` +
      `Unnamed speakers: ${[...unnamed].join(', ')}\n\nTranscript:\n${transcript}`
  }], 'Имена по контексту')

  for (const [label, name] of Object.entries(parsed.names ?? {})) {
    const trimmed = name?.trim()
    if (trimmed && trimmed.toLowerCase() !== 'null' && unnamed.has(label)) names.set(label, trimmed)
  }
  return dropDuplicateNames(names)
}

async function askJson<T>(apiKey: string, content: Array<Record<string, unknown>>, label: string): Promise<T> {
  const response = await net.fetch(CHAT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [{ role: 'user', content }],
      response_format: { type: 'json_object' },
      reasoning: { effort: 'low' },
      temperature: 0
    })
  })
  if (!response.ok) {
    const body = await response.text()
    throw new DiarizationError(`${label}: ${response.status}: ${body.slice(0, 300)}`)
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const json = extractJsonObject(data.choices?.[0]?.message?.content ?? '')
  if (!json) throw new DiarizationError(`${label}: модель вернула не JSON`)
  return JSON.parse(json) as T
}

function mergeNeighbors(segments: DialogSegment[]): DialogSegment[] {
  return segments.reduce<DialogSegment[]>((merged, seg) => {
    const last = merged[merged.length - 1]
    const canMerge = last
      && last.speaker === seg.speaker
      && seg.start - last.end <= MERGE_GAP_SEC
      && seg.end - last.start <= MERGE_MAX_SEC
    if (canMerge) {
      last.text = `${last.text} ${seg.text}`
      last.end = seg.end
    } else {
      merged.push({ ...seg })
    }
    return merged
  }, [])
}
