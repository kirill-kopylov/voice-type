import { describe, expect, it } from 'vitest'
import { DateInputError, formatLocalDateTime, isInRange, parseDateInput, resolveDateRange } from './dates'

// Среда, 7 октября 2026, 15:30 по локальному времени
const NOW = new Date(2026, 9, 7, 15, 30)

describe('parseDateInput', () => {
  it('дата без времени: начало и конец суток включительно', () => {
    expect(parseDateInput('2026-10-05', 'start', NOW)).toEqual(new Date(2026, 9, 5, 0, 0, 0, 0))
    expect(parseDateInput('2026-10-05', 'end', NOW)).toEqual(new Date(2026, 9, 5, 23, 59, 59, 999))
  })

  it('месяц целиком', () => {
    expect(parseDateInput('2026-02', 'start', NOW)).toEqual(new Date(2026, 1, 1))
    expect(parseDateInput('2026-02', 'end', NOW)).toEqual(new Date(2026, 1, 28, 23, 59, 59, 999))
  })

  it('today и yesterday, в том числе по-русски', () => {
    expect(parseDateInput('yesterday', 'start', NOW)).toEqual(new Date(2026, 9, 6))
    expect(parseDateInput('вчера', 'end', NOW)).toEqual(new Date(2026, 9, 6, 23, 59, 59, 999))
    expect(parseDateInput('today', 'start', NOW)).toEqual(new Date(2026, 9, 7))
  })

  it('относительные сроки отсчитываются назад от «сейчас»', () => {
    expect(parseDateInput('7d', 'start', NOW)).toEqual(new Date(2026, 9, 0, 15, 30))
    expect(parseDateInput('2w', 'start', NOW)).toEqual(new Date(2026, 8, 23, 15, 30))
    expect(parseDateInput('12h', 'start', NOW)).toEqual(new Date(2026, 9, 7, 3, 30))
  })

  it('полный ISO-момент берётся как есть', () => {
    expect(parseDateInput('2026-10-05T12:00:00Z', 'start', NOW)?.toISOString()).toBe('2026-10-05T12:00:00.000Z')
  })

  it('мусор и несуществующие даты не разбираются', () => {
    expect(parseDateInput('когда-нибудь', 'start', NOW)).toBeNull()
    expect(parseDateInput('2026-02-30', 'start', NOW)).toBeNull()
    expect(parseDateInput('2026-13', 'start', NOW)).toBeNull()
  })
})

describe('resolveDateRange', () => {
  it('одинаковые from и to дают ровно одни сутки', () => {
    const range = resolveDateRange('2026-10-05', '2026-10-05', NOW)
    expect(isInRange(new Date(2026, 9, 5, 0, 0).toISOString(), range)).toBe(true)
    expect(isInRange(new Date(2026, 9, 5, 23, 59).toISOString(), range)).toBe(true)
    expect(isInRange(new Date(2026, 9, 4, 23, 59).toISOString(), range)).toBe(false)
    expect(isInRange(new Date(2026, 9, 6, 0, 1).toISOString(), range)).toBe(false)
  })

  it('открытые границы пропускают всё с соответствующей стороны', () => {
    const range = resolveDateRange('2026-10-01', undefined, NOW)
    expect(isInRange(new Date(2030, 0, 1).toISOString(), range)).toBe(true)
    expect(isInRange(new Date(2026, 8, 30).toISOString(), range)).toBe(false)
  })

  it('невалидная дата и перевёрнутый диапазон — понятная ошибка для агента', () => {
    expect(() => resolveDateRange('abc', undefined, NOW)).toThrow(DateInputError)
    expect(() => resolveDateRange('2026-10-05', '2026-10-01', NOW)).toThrow(DateInputError)
  })
})

describe('formatLocalDateTime', () => {
  it('форматирует по локальному времени', () => {
    expect(formatLocalDateTime(new Date(2026, 9, 5, 9, 7).toISOString())).toBe('2026-10-05 09:07')
  })
})
