import { describe, expect, it } from 'vitest'
import {
  captionIndexAt, captionText, chapterRanges, formatClock, indexAt, matchingSegments, normalizeChapters, parseClock, speakerShares
} from './meeting-timeline'

describe('тайм-коды', () => {
  it('туда и обратно', () => {
    expect(formatClock(4503)).toBe('75:03')
    expect(parseClock('75:03')).toBe(4503)
    expect(parseClock('1:15:03')).toBe(4503)
  })

  it('не тайм-код — null', () => {
    expect(parseClock('примерно 5 минут')).toBeNull()
    expect(parseClock('')).toBeNull()
  })
})

describe('что идёт в момент времени', () => {
  const segments = [
    { start: 0, end: 4 },
    { start: 10, end: 20 },
    { start: 30, end: 31 }
  ]

  it('последняя начавшаяся реплика', () => {
    expect(indexAt(segments, 15)).toBe(1)
    expect(indexAt(segments, 25)).toBe(1)
    expect(indexAt(segments, 100)).toBe(2)
  })

  it('до первой реплики — ничего', () => {
    expect(indexAt([{ start: 5, end: 6 }], 2)).toBe(-1)
  })

  it('субтитр держится чуть дольше реплики, в длинной паузе пропадает', () => {
    expect(captionIndexAt(segments, 5)).toBe(0)
    expect(captionIndexAt(segments, 8)).toBe(-1)
  })
})

describe('живые субтитры', () => {
  const words = Array.from({ length: 30 }, (_, i) => `w${i}`)
  const segment = { text: words.join(' '), start: 10, end: 40 }

  it('короткая реплика — целиком', () => {
    expect(captionText({ text: 'Привет, как дела?', start: 0, end: 2 }, 1)).toBe('Привет, как дела?')
  })

  it('длинная — строка, которая звучит сейчас, без огрызка в конце', () => {
    expect(captionText(segment, 10).split(' ')[0]).toBe('w0')
    expect(captionText(segment, 39).split(' ').at(-1)).toBe('w29')
    expect(captionText(segment, 39).split(' ').length).toBe(10)
  })

  it('за пределами реплики — крайние строки', () => {
    expect(captionText(segment, 0)).toBe(captionText(segment, 10))
    expect(captionText(segment, 100)).toBe(captionText(segment, 39))
  })
})

describe('спикеры и поиск', () => {
  it('доля речи по времени', () => {
    const shares = speakerShares([
      { speaker: 'А', start: 0, end: 30 },
      { speaker: 'Б', start: 30, end: 40 },
      { speaker: 'А', start: 40, end: 50 }
    ])
    expect(shares.get('А')).toBeCloseTo(0.8)
    expect(shares.get('Б')).toBeCloseTo(0.2)
  })

  it('поиск без учёта регистра и «ё»', () => {
    const segments = [{ text: 'Всё ЕЩЁ считаем цену' }, { text: 'Другое' }, { text: 'цена ниже' }]
    expect(matchingSegments(segments, 'еще')).toEqual([0])
    expect(matchingSegments(segments, 'цен')).toEqual([0, 2])
    expect(matchingSegments(segments, '  ')).toEqual([])
  })
})

describe('главы от модели', () => {
  it('в порядке времени, первая с начала записи', () => {
    const chapters = normalizeChapters([
      { start: '12:00', title: 'Рейсы' },
      { start: '00:15', title: 'Знакомство' }
    ], 1800)
    expect(chapters).toEqual([{ start: 0, title: 'Знакомство' }, { start: 720, title: 'Рейсы' }])
  })

  it('мусор, выход за запись и дробление темы отбрасываются', () => {
    const chapters = normalizeChapters([
      { start: '00:00', title: 'Начало' },
      { start: '00:05', title: 'Почти то же' },
      { start: 'потом', title: 'Без времени' },
      { start: '10:00', title: '' },
      { start: '99:00', title: 'За концом' },
      { start: '05:00', title: 'Итоги' }
    ], 600)
    expect(chapters.map((c) => c.title)).toEqual(['Начало', 'Итоги'])
  })

  it('одна глава — не оглавление', () => {
    expect(normalizeChapters([{ start: '00:00', title: 'Всё' }], 600)).toEqual([])
  })

  it('глава длится до следующей, последняя — до конца', () => {
    expect(chapterRanges([{ start: 0, title: 'А' }, { start: 60, title: 'Б' }], 100))
      .toEqual([{ start: 0, end: 60, title: 'А' }, { start: 60, end: 100, title: 'Б' }])
  })
})
