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
