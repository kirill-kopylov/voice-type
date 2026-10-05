/**
 * Разбор ответа fish-audio/transcribe-1-pro: спикеры — метки <|speaker:N|> прямо в тексте,
 * а времена есть только у слов отдельным списком. Здесь метки привязываются к временам.
 */

export interface WordTiming {
  word: string
  start: number
  end: number
}

export interface SpeakerTurn {
  speaker: number
  text: string
  start: number
  end: number
}

// Пометки звуков вида [смех], [тихий шепот] — не речь, в списке слов их нет
const SOUND_TAG = /\[[^\]]*\]/g
// Текст реплик и список слов расходятся на пару процентов: слово ищем среди ближайших следующих
const WORD_LOOKAHEAD = 12
// Голос с долей слов меньше этой — артефакт диаризации, а не участник встречи
const MINOR_SPEAKER_SHARE = 0.01

const normalize = (word: string): string => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const tokensOf = (text: string): string[] => text.split(/\s+/).map(normalize).filter(Boolean)

export function parseFishTranscript(text: string, words: WordTiming[]): SpeakerTurn[] {
  return absorbMinorSpeakers(alignTimings(splitTurns(text), words))
}

interface UntimedTurn {
  speaker: number
  text: string
}

function splitTurns(text: string): UntimedTurn[] {
  const parts = text.split(/<\|speaker:(\d+)\|>/)
  // Одиночный спикер без меток: весь текст — один говорящий
  const turns: UntimedTurn[] = parts[0].trim() ? [{ speaker: 0, text: parts[0] }] : []
  for (let i = 1; i < parts.length; i += 2) turns.push({ speaker: Number(parts[i]), text: parts[i + 1] })

  return turns
    .map((turn) => ({ ...turn, text: turn.text.replace(SOUND_TAG, ' ').replace(/\s+/g, ' ').trim() }))
    .filter((turn) => turn.text)
}

function alignTimings(turns: UntimedTurn[], words: WordTiming[]): SpeakerTurn[] {
  const timed = words.map((w) => ({ ...w, token: normalize(w.word) })).filter((w) => w.token)
  let cursor = 0
  let previousEnd = 0

  return turns.map((turn) => {
    let start: number | null = null
    let end: number | null = null
    for (const token of tokensOf(turn.text)) {
      const lookahead = timed.slice(cursor, cursor + WORD_LOOKAHEAD)
      const offset = lookahead.findIndex((w) => w.token === token)
      if (offset < 0) continue
      const hit = timed[cursor + offset]
      start ??= hit.start
      end = hit.end
      cursor += offset + 1
    }
    // Реплика целиком из слов без пары в списке времён: ставим её в точку конца предыдущей
    const turnStart = start ?? previousEnd
    const turnEnd = end ?? turnStart
    previousEnd = turnEnd
    return { speaker: turn.speaker, text: turn.text, start: turnStart, end: turnEnd }
  })
}

export interface TimedText {
  text: string
  start: number
  end: number
}

// Whisper на паузах и тихих местах дописывает фразы из субтитров обучающих видео
const HALLUCINATED_PHRASES = [
  /продолжение следует[.!…]*/giu,
  /субтитры\s+(?:сделал|делал|создал|подготовил)\w*[^.!?…]*[.!?…]*/giu,
  /спасибо за просмотр[.!…]*/giu,
  /редактор субтитров[^.!?…]*[.!?…]*/giu
]

/** Вырезает из отрезков фразы-галлюцинации; отрезок, где ничего кроме них не было, пропадает. */
export function stripHallucinations(texts: TimedText[]): TimedText[] {
  return texts
    .map((item) => ({
      ...item,
      text: HALLUCINATED_PHRASES.reduce((text, phrase) => text.replace(phrase, ' '), item.text).replace(/\s+/g, ' ').trim()
    }))
    .filter((item) => /[\p{L}\p{N}]/u.test(item.text))
}

/**
 * Голоса от одной модели, текст от другой: отрезок текста достаётся голосу, который звучал в нём дольше всех.
 * Отрезок в паузе между репликами — ближайшему по времени.
 */
export function assignSpeakers(texts: TimedText[], turns: SpeakerTurn[]): SpeakerTurn[] {
  return texts.map((text) => ({ ...text, speaker: speakerAt(text, turns) }))
}

function speakerAt(text: TimedText, turns: SpeakerTurn[]): number {
  const overlapBySpeaker = new Map<number, number>()
  for (const turn of turns) {
    const overlap = Math.min(text.end, turn.end) - Math.max(text.start, turn.start)
    if (overlap > 0) overlapBySpeaker.set(turn.speaker, (overlapBySpeaker.get(turn.speaker) ?? 0) + overlap)
  }
  const [loudest] = [...overlapBySpeaker].sort((a, b) => b[1] - a[1])
  if (loudest) return loudest[0]

  const middle = (text.start + text.end) / 2
  const distanceTo = (turn: SpeakerTurn): number => Math.max(turn.start - middle, middle - turn.end, 0)
  const [nearest] = [...turns].sort((a, b) => distanceTo(a) - distanceTo(b))
  return nearest?.speaker ?? 0
}

/** Реплики мелких голосов достаются тому, кто говорил перед ними (или первому крупному, если реплика в начале). */
function absorbMinorSpeakers(turns: SpeakerTurn[]): SpeakerTurn[] {
  const wordsBySpeaker = new Map<number, number>()
  for (const turn of turns) {
    wordsBySpeaker.set(turn.speaker, (wordsBySpeaker.get(turn.speaker) ?? 0) + tokensOf(turn.text).length)
  }
  const totalWords = [...wordsBySpeaker.values()].reduce((sum, n) => sum + n, 0)
  const isMinor = (speaker: number): boolean => (wordsBySpeaker.get(speaker) ?? 0) / totalWords < MINOR_SPEAKER_SHARE

  const firstMajor = turns.find((turn) => !isMinor(turn.speaker))?.speaker
  if (firstMajor === undefined) return turns

  return turns.reduce<SpeakerTurn[]>((result, turn) => {
    const speaker = isMinor(turn.speaker) ? (result.at(-1)?.speaker ?? firstMajor) : turn.speaker
    result.push({ ...turn, speaker })
    return result
  }, [])
}
