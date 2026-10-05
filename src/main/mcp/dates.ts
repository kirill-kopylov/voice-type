// Разбор дат из аргументов MCP-инструментов. Все сутки — по локальному времени компьютера.

export type RangeBoundary = 'start' | 'end'

export interface DateRange {
  from?: Date
  to?: Date
}

const DAY_MS = 24 * 60 * 60 * 1000
const RELATIVE_UNIT_MS: Record<string, number> = { h: 60 * 60 * 1000, d: DAY_MS, w: 7 * DAY_MS }

const KEYWORD_DAY_OFFSETS: Record<string, number> = {
  today: 0, сегодня: 0, yesterday: -1, вчера: -1
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

function dayWithOffset(now: Date, offsetDays: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays)
}

/**
 * Принимает: `2026-10-05`, `2026-10` (месяц целиком), полный ISO-момент, `today`/`yesterday`
 * (и `сегодня`/`вчера`), относительное `7d` / `2w` / `3m` / `12h` — «столько назад».
 * Для даты без времени граница `start` — начало суток, `end` — конец суток (включительно).
 */
export function parseDateInput(input: string, boundary: RangeBoundary, now: Date = new Date()): Date | null {
  const text = input.trim().toLowerCase()

  if (text in KEYWORD_DAY_OFFSETS) {
    const day = dayWithOffset(now, KEYWORD_DAY_OFFSETS[text])
    return boundary === 'start' ? startOfDay(day) : endOfDay(day)
  }

  const relative = /^(\d+)([hdwm])$/.exec(text)
  if (relative) {
    const amount = Number(relative[1])
    if (relative[2] === 'm') return new Date(now.getFullYear(), now.getMonth() - amount, now.getDate(), now.getHours(), now.getMinutes())
    return new Date(now.getTime() - amount * RELATIVE_UNIT_MS[relative[2]])
  }

  const month = /^(\d{4})-(\d{2})$/.exec(text)
  if (month) {
    const year = Number(month[1])
    const monthIndex = Number(month[2]) - 1
    if (monthIndex < 0 || monthIndex > 11) return null
    return boundary === 'start' ? new Date(year, monthIndex, 1) : endOfDay(new Date(year, monthIndex + 1, 0))
  }

  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (day) {
    const date = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]))
    if (Number.isNaN(date.getTime()) || date.getDate() !== Number(day[3])) return null
    return boundary === 'start' ? date : endOfDay(date)
  }

  const moment = new Date(input.trim())
  return Number.isNaN(moment.getTime()) ? null : moment
}

export class DateInputError extends Error {}

/** Диапазон `from`..`to`; невалидная дата или перевёрнутый диапазон — DateInputError с понятным текстом. */
export function resolveDateRange(from: string | undefined, to: string | undefined, now: Date = new Date()): DateRange {
  const range: DateRange = {}

  if (from) {
    const parsed = parseDateInput(from, 'start', now)
    if (!parsed) throw new DateInputError(`Не удалось разобрать дату from="${from}". Формат: 2026-10-05, 2026-10, today, yesterday, 7d, 2w`)
    range.from = parsed
  }
  if (to) {
    const parsed = parseDateInput(to, 'end', now)
    if (!parsed) throw new DateInputError(`Не удалось разобрать дату to="${to}". Формат: 2026-10-05, 2026-10, today, yesterday, 7d, 2w`)
    range.to = parsed
  }
  if (range.from && range.to && range.from > range.to) {
    throw new DateInputError('from позже to — диапазон пуст')
  }
  return range
}

export function isInRange(iso: string, range: DateRange): boolean {
  const time = new Date(iso).getTime()
  if (range.from && time < range.from.getTime()) return false
  if (range.to && time > range.to.getTime()) return false
  return true
}

const pad = (value: number): string => String(value).padStart(2, '0')

/** `2026-10-05 14:30` по локальному времени — так агенту проще сопоставлять с «вчера в обед». */
export function formatLocalDateTime(iso: string): string {
  const date = new Date(iso)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatLocalDate(iso: string): string {
  return formatLocalDateTime(iso).slice(0, 10)
}
