// Время встречи: тайм-коды, главы и «что идёт сейчас». Общее для плеера, саммари и MCP.
import type { MeetingChapter } from './types'

// Главы ближе этого друг к другу — дробление, а не смена темы
const MIN_CHAPTER_GAP_SEC = 20
// Реплика остаётся в субтитрах ещё немного после конца — чтобы короткие паузы не мигали пустотой
const CAPTION_HOLD_SEC = 1.5

/** «мм:сс», минуты не ограничены: 75:03 */
export const formatClock = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(total / 60)
  return `${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** «мм:сс» или «ч:мм:сс» в секунды; null — не тайм-код. */
export function parseClock(clock: string): number | null {
  const match = clock.trim().match(/^(?:(\d+):)?(\d+):(\d{1,2})$/)
  if (!match) return null
  const [, hours = '0', minutes, seconds] = match
  return (Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)
}

/** Последний элемент, начавшийся не позже atSec; -1 — момент раньше первого. Элементы отсортированы по start. */
export function indexAt<T extends { start: number }>(items: T[], atSec: number): number {
  let low = 0
  let high = items.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (items[middle].start <= atSec) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found
}

/** Реплика для субтитров: идёт сейчас или только что закончилась. */
export function captionIndexAt<T extends { start: number; end: number }>(segments: T[], atSec: number): number {
  const index = indexAt(segments, atSec)
  return index >= 0 && atSec <= segments[index].end + CAPTION_HOLD_SEC ? index : -1
}

// Сколько слов помещается в строку субтитров, не превращая её в абзац
const CAPTION_LINE_WORDS = 12

/**
 * Живой субтитр: длинная реплика делится на равные строки, показывается та, что звучит сейчас, —
 * по доле прошедшего времени реплики (времён отдельных слов у расшифровки нет).
 */
export function captionText(segment: { text: string; start: number; end: number }, atSec: number): string {
  const words = segment.text.split(/\s+/).filter(Boolean)
  if (words.length <= CAPTION_LINE_WORDS) return words.join(' ')

  const lineCount = Math.ceil(words.length / CAPTION_LINE_WORDS)
  const wordsPerLine = Math.ceil(words.length / lineCount)
  const progress = (atSec - segment.start) / Math.max(segment.end - segment.start, 0.001)
  const line = Math.min(lineCount - 1, Math.max(0, Math.floor(progress * lineCount)))
  return words.slice(line * wordsPerLine, (line + 1) * wordsPerLine).join(' ')
}

/** Доля времени речи каждого спикера, от 0 до 1. */
export function speakerShares(segments: Array<{ speaker: string; start: number; end: number }>): Map<string, number> {
  const talk = segments.reduce((acc, s) => acc.set(s.speaker, (acc.get(s.speaker) ?? 0) + Math.max(0, s.end - s.start)), new Map<string, number>())
  const total = [...talk.values()].reduce((sum, seconds) => sum + seconds, 0)
  return new Map([...talk].map(([speaker, seconds]) => [speaker, total > 0 ? seconds / total : 0]))
}

// Поиск не различает регистр и «ё»: в расшифровке они расставлены как попало
export const normalizeForSearch = (text: string): string => text.toLowerCase().replace(/ё/g, 'е')

/** Индексы реплик, где встречается запрос; пустой запрос — ничего. */
export function matchingSegments(segments: Array<{ text: string }>, query: string): number[] {
  const needle = normalizeForSearch(query.trim())
  if (!needle) return []
  return segments.flatMap((segment, index) => (normalizeForSearch(segment.text).includes(needle) ? [index] : []))
}

export interface ChapterRange extends MeetingChapter {
  end: number
}

/** Главы с концами: каждая длится до начала следующей, последняя — до конца записи. */
export function chapterRanges(chapters: MeetingChapter[], durationSec: number): ChapterRange[] {
  return chapters.map((chapter, index) => ({ ...chapter, end: chapters[index + 1]?.start ?? durationSec }))
}

/**
 * Главы от модели — в порядок: тайм-коды разобраны и попадают в запись, идут по времени,
 * не дробят тему, первая начинается с начала. Одна глава оглавлением не является — тогда пусто.
 */
export function normalizeChapters(raw: Array<{ start?: string | number | null; title?: string | null }>, durationSec: number): MeetingChapter[] {
  const parsed = raw
    .map((chapter) => ({
      start: typeof chapter.start === 'number' ? chapter.start : parseClock(String(chapter.start ?? '')),
      title: (chapter.title ?? '').trim()
    }))
    .filter((chapter): chapter is MeetingChapter => chapter.start !== null && chapter.start >= 0 && chapter.start < durationSec && chapter.title !== '')
    .sort((a, b) => a.start - b.start)

  const chapters = parsed.reduce<MeetingChapter[]>((kept, chapter) => {
    const previous = kept[kept.length - 1]
    if (!previous || chapter.start - previous.start >= MIN_CHAPTER_GAP_SEC) kept.push(chapter)
    return kept
  }, [])

  if (chapters.length < 2) return []
  return [{ ...chapters[0], start: 0 }, ...chapters.slice(1)]
}
