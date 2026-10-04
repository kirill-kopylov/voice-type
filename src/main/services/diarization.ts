import { net } from 'electron'
import { chunkWebmBySilence } from './chunk-audio'
import { extractSpeakerSegments } from './extract-speaker'
import { extractJsonObject } from './extract-json'
import type { DialogSegment } from './types'

// Диаризацию делает STT-модель: она разделяет голоса внутри куска.
const DIARIZE_STT_MODEL = 'microsoft/mai-transcribe-2'
const STT_URL = 'https://openrouter.ai/api/v1/audio/transcriptions'

// Сопоставление голосов между кусками и с профилями — audio-chat модель:
// STT-эндпоинт OpenRouter не принимает образцы голосов.
const MATCH_MODEL = 'google/gemini-3.5-flash'
const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'

// Диаризация mai-transcribe-2 падает от ~15 минут (Microsoft Q&A, 09.2026); Microsoft советует куски ~10 минут
const CHUNK_SEC = 600
// Сколько профилей голосов отправляем на группировку
const MAX_REFERENCE_VOICES = 8
// Соседние реплики одного спикера склеиваем, пока пауза короткая, а сегмент не длиннее лимита
const MERGE_GAP_SEC = 2
const MERGE_MAX_SEC = 30

export interface KnownSpeaker {
  name: string
  audio: Buffer  // WAV
}

interface SttSegment {
  start: number
  end: number
  text: string
  speaker?: number
}

interface ChunkResult {
  startSec: number
  local: SttSegment[]
  /** Образец голоса (WAV) для каждой локальной метки STT, у которой хватило речи */
  samples: Map<number, Buffer>
}

interface VoiceCandidate {
  key: string
  partIndex: number
  audio: Buffer
}

interface VoiceGroup {
  keys: string[]
  /** Имя профиля, если группа — его голос */
  reference: string | null
}

class DiarizationError extends Error {}

/**
 * Диаризация встречи. Запись режется на куски ≤10 минут по тишине, в каждом куске STT делит голоса,
 * затем все голоса всех кусков группируются по человеку и привязываются к профилям, чтобы метки
 * в разных кусках означали одного и того же человека.
 */
export async function transcribeDiarized(
  audioBuffer: Buffer,
  apiKey: string,
  language: string,
  knownSpeakers: KnownSpeaker[] = []
): Promise<{ segments: DialogSegment[]; error?: string }> {
  try {
    const chunks = await chunkWebmBySilence(audioBuffer, CHUNK_SEC)
    console.log(`[diarize] Кусков: ${chunks.length}, известных голосов: ${knownSpeakers.length}`)

    // Метки STT локальны для каждого куска: сначала собираем голоса всех кусков, потом определяем, кто есть кто
    const parts: ChunkResult[] = []
    for (const [index, chunk] of chunks.entries()) {
      console.log(`[diarize] Кусок ${index + 1}/${chunks.length}: ${chunk.startSec.toFixed(1)}-${chunk.endSec.toFixed(1)}с`)
      const local = await diarizeChunk(chunk.buffer, apiKey, language)

      const byLocalSpeaker = new Map<number, SttSegment[]>()
      for (const seg of local) {
        const id = seg.speaker ?? 0
        byLocalSpeaker.set(id, [...(byLocalSpeaker.get(id) ?? []), seg])
      }

      const samples = new Map<number, Buffer>()
      for (const [id, segs] of byLocalSpeaker) {
        const sample = await extractSpeakerSegments(chunk.buffer, segs)
        if (sample) samples.set(id, sample)
      }
      console.log(`[diarize] Кусок ${index + 1}: голосов ${byLocalSpeaker.size}, образцов ${samples.size}`)
      parts.push({ startSec: chunk.startSec, local, samples })
    }

    const names = await nameVoices(apiKey, knownSpeakers, parts)
    const segments: DialogSegment[] = parts.flatMap((part, partIndex) =>
      part.local.map((seg) => ({
        speaker: names.get(voiceKey(partIndex, seg.speaker ?? 0)) as string,
        text: seg.text,
        start: seg.start + part.startSec,
        end: seg.end + part.startSec
      }))
    )

    const merged = mergeNeighbors(segments)
    const unnamed = new Set(merged.map((s) => s.speaker).filter((name) => name.startsWith('Speaker ')))
    // Имена — дополнение: если модель не ответила, расшифровка остаётся пригодной
    const inferred = await inferNames(apiKey, merged, unnamed).catch((err) => {
      console.warn('[diarize] Имена по контексту не определены:', err instanceof Error ? err.message : err)
      return new Map<string, string>()
    })
    return { segments: merged.map((s) => ({ ...s, speaker: inferred.get(s.speaker) ?? s.speaker })) }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[diarize] Ошибка:', message)
    return { segments: [], error: err instanceof DiarizationError ? message : `Ошибка диаризации: ${message}` }
  }
}

async function diarizeChunk(audio: Buffer, apiKey: string, language: string): Promise<SttSegment[]> {
  const response = await net.fetch(STT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: DIARIZE_STT_MODEL,
      input_audio: { data: audio.toString('base64'), format: 'mp3' },
      language,
      response_format: 'verbose_json',
      provider: { options: { azure: { diarization: { enabled: true } } } }
    })
  })

  if (!response.ok) {
    const body = await response.text()
    throw new DiarizationError(`STT вернул ${response.status}: ${body.slice(0, 300)}`)
  }

  const data = (await response.json()) as { segments?: SttSegment[] }
  if (!Array.isArray(data.segments)) throw new DiarizationError('STT не вернул сегменты с разметкой спикеров')

  return data.segments
    .map((s) => ({ ...s, text: (s.text ?? '').trim() }))
    .filter((s) => s.text)
}

const voiceKey = (partIndex: number, localId: number) => `${partIndex}:${localId}`

/**
 * Имя каждого голоса каждого куска. Все образцы уходят в одну модель разом: она группирует голоса по человеку
 * и привязывает группы к профилям. Попарное сопоставление кусок за куском почти не находило совпадений —
 * один человек превращался в несколько «Speaker N».
 */
async function nameVoices(
  apiKey: string,
  knownSpeakers: KnownSpeaker[],
  parts: ChunkResult[]
): Promise<Map<string, string>> {
  const candidates: VoiceCandidate[] = parts.flatMap((part, partIndex) =>
    [...part.samples].map(([localId, audio]) => ({ key: voiceKey(partIndex, localId), partIndex, audio }))
  )
  const groups = await groupVoices(apiKey, knownSpeakers.slice(0, MAX_REFERENCE_VOICES), candidates)
  console.log(`[diarize] Голосов в кусках: ${candidates.length}, людей: ${groups.length}`)

  const names = new Map<string, string>()
  let unknownCounter = 0
  for (const group of groups) {
    const name = group.reference ?? `Speaker ${++unknownCounter}`
    for (const key of group.keys) names.set(key, name)
  }
  // Голос без образца (слишком короткий) остаётся отдельным говорящим
  parts.forEach((part, partIndex) => {
    for (const seg of part.local) {
      const key = voiceKey(partIndex, seg.speaker ?? 0)
      if (!names.has(key)) names.set(key, `Speaker ${++unknownCounter}`)
    }
  })
  return names
}

async function groupVoices(
  apiKey: string,
  references: KnownSpeaker[],
  candidates: VoiceCandidate[]
): Promise<VoiceGroup[]> {
  if (candidates.length === 0) return []

  const content: Array<Record<string, unknown>> = [{
    type: 'text',
    text: `A long meeting was split into parts, and a diarizer labelled voices separately in each part, ` +
      `so the same person has different labels in different parts. ` +
      (references.length > 0 ? `First come reference voices with names, then the voices to group. ` : `Below are the voices to group. `) +
      `Group the voices by actual person. Voices of the same part are always different people. ` +
      `Do not force a match: when unsure, keep the voice in its own group. ` +
      `For a group set "reference" to the name of the reference voice only if the voice clearly belongs to it, otherwise null; ` +
      `a reference name may be used once. Every voice must appear in exactly one group. ` +
      `Return ONLY JSON: {"groups":[{"voices":["<voice label>", ...],"reference":"<reference name or null>"}]}`
  }]
  for (const voice of references) {
    content.push({ type: 'text', text: `Reference voice "${voice.name}":` })
    content.push({ type: 'input_audio', input_audio: { data: voice.audio.toString('base64'), format: 'wav' } })
  }
  for (const candidate of candidates) {
    content.push({ type: 'text', text: `Voice ${candidate.key} (part ${candidate.partIndex + 1}):` })
    content.push({ type: 'input_audio', input_audio: { data: candidate.audio.toString('base64'), format: 'wav' } })
  }

  const parsed = await askJson<{ groups?: Array<{ voices?: string[]; reference?: string | null }> }>(apiKey, content, 'Группировка голосов')
  return validateGroups(parsed.groups ?? [], candidates, new Set(references.map((v) => v.name)))
}

/** Модель часто отвечает меткой как в подписи к аудио («Voice 0:1»), а не голым ключом. */
const voiceKeyFromLabel = (label: string) => label.trim().replace(/^voice\s+/i, '').replace(/\s*\(part \d+\)$/i, '')

/** Ответу модели не доверяем: голоса одного куска не могут быть одним человеком, имя профиля — одно, пропавшие голоса остаются отдельными. */
function validateGroups(
  raw: Array<{ voices?: string[]; reference?: string | null }>,
  candidates: VoiceCandidate[],
  referenceNames: Set<string>
): VoiceGroup[] {
  const partOf = new Map(candidates.map((c) => [c.key, c.partIndex]))
  const placed = new Set<string>()
  const usedReferences = new Set<string>()
  const groups: VoiceGroup[] = []

  for (const item of raw) {
    const reference = item.reference && referenceNames.has(item.reference) && !usedReferences.has(item.reference) ? item.reference : null
    const partsInGroup = new Set<number>()
    const keys: string[] = []
    for (const label of item.voices ?? []) {
      const key = voiceKeyFromLabel(label)
      const part = partOf.get(key)
      if (part === undefined || placed.has(key)) continue
      placed.add(key)
      if (partsInGroup.has(part)) {
        groups.push({ keys: [key], reference: null })
        continue
      }
      partsInGroup.add(part)
      keys.push(key)
    }
    if (keys.length === 0) continue
    if (reference) usedReferences.add(reference)
    groups.push({ keys, reference })
  }
  for (const candidate of candidates) {
    if (!placed.has(candidate.key)) groups.push({ keys: [candidate.key], reference: null })
  }
  // Порядок по первому появлению: «Speaker 1» — тот, кто заговорил раньше
  const order = new Map(candidates.map((c, i) => [c.key, i]))
  return groups.sort((a, b) => Math.min(...a.keys.map((k) => order.get(k) as number)) - Math.min(...b.keys.map((k) => order.get(k) as number)))
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
  // Одно имя двум голосам — признак ошибки модели: не называем ни одного
  const counts = [...names.values()].reduce((acc, n) => acc.set(n, (acc.get(n) ?? 0) + 1), new Map<string, number>())
  for (const [label, name] of names) if ((counts.get(name) ?? 0) > 1) names.delete(label)
  return names
}

async function askJson<T>(apiKey: string, content: Array<Record<string, unknown>>, label: string): Promise<T> {
  const response = await net.fetch(CHAT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MATCH_MODEL,
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
