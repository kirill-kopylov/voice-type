import { describe, expect, it } from 'vitest'
import { resolveDateRange } from './dates'
import {
  buildDigest, formatTranscript, getMeetingView, listDictations, listMeetings, searchRecords
} from './queries'
import type { MeetingRecord, ScreenEvent, TranscriptionRecord } from '../../shared/types'

const at = (day: number, hour = 12): string => new Date(2026, 9, day, hour).toISOString()

const dictation = (id: string, text: string, createdAt: string): TranscriptionRecord => ({
  id, text, createdAt, audioFileName: `${id}.webm`, durationMs: 4000,
  provider: 'openrouter', model: 'm', status: 'success'
})

const meeting = (id: string, title: string, createdAt: string, overrides: Partial<MeetingRecord> = {}): MeetingRecord => ({
  id, title, createdAt,
  audioFileName: `${id}.webm`,
  durationMs: 600000,
  segments: [],
  speakerNames: {},
  status: 'success',
  ...overrides
})

const planning = meeting('m1', 'Планёрка', at(2), {
  durationMs: 1800000,
  segments: [
    { speaker: 'Speaker 1', text: 'Начнём с бюджета', start: 0, end: 4 },
    { speaker: 'Speaker 2', text: 'Бюджет согласован', start: 65, end: 70 },
    { speaker: 'Speaker 1', text: 'Тогда запускаем кампанию', start: 130, end: 135 }
  ],
  speakerNames: { 'Speaker 1': 'Кирилл', 'Speaker 2': 'Саша' },
  summary: {
    brief: 'Согласовали бюджет и запуск.',
    topics: ['бюджет'],
    decisions: [{ text: 'Запустить кампанию', assignee: 'Кирилл' }]
  }
})

const retro = meeting('m2', 'Ретроспектива', at(5), {
  durationMs: 900000,
  segments: [{ speaker: 'Speaker 1', text: 'Что пошло хорошо', start: 3, end: 6 }],
  notes: [{ id: 'n1', text: 'Создана задача TASK-7', source: 'agent', author: 'Claude', createdAt: at(5, 18) }]
})

const meetings = [retro, planning]
const history = [
  dictation('d1', 'Купить молоко', at(2, 9)),
  dictation('d2', 'Написать отчёт по бюджету, очень длинный текст про цифры и планы на квартал', at(5, 10)),
  dictation('d3', 'Позвонить в банк', at(5, 11))
]

describe('searchRecords', () => {
  it('фильтры по дате, типу и спикеру применяются до поиска', () => {
    const onlyOct2 = searchRecords(history, meetings, { query: 'бюджет', range: resolveDateRange('2026-10-02', '2026-10-02') })
    expect(onlyOct2.every((hit) => hit.id === 'm1')).toBe(true)

    const dictationsOnly = searchRecords(history, meetings, { query: 'бюджет', types: ['dictation'] })
    expect(dictationsOnly.map((hit) => hit.id)).toEqual(['d2'])

    const bySpeaker = searchRecords(history, meetings, { query: 'бюджет', speaker: 'саш' })
    expect(bySpeaker).toHaveLength(1)
    expect(bySpeaker[0]).toMatchObject({ type: 'meeting_dialog', speaker: 'Саша', at: '01:05' })
  })

  it('сортировка по дате применяется ко всем совпадениям, а не к первым попавшимся', () => {
    const newest = searchRecords(history, meetings, { query: 'бюджет', sort: 'newest', limit: 1 })
    expect(newest[0].id).toBe('d2')
    const oldest = searchRecords(history, meetings, { query: 'бюджет', sort: 'oldest', limit: 1 })
    expect(oldest[0].id).toBe('m1')
  })

  it('ограничение meeting_id ищет только внутри встречи', () => {
    const hits = searchRecords(history, meetings, { query: 'задача', meetingId: 'm2' })
    expect(hits.map((hit) => hit.type)).toEqual(['meeting_note'])
  })
})

describe('listMeetings', () => {
  it('по умолчанию свежие первыми; без стенограмм, с саммари и счётчиками', () => {
    const { total, items } = listMeetings(meetings, {})
    expect(total).toBe(2)
    expect(items.map((item) => item.id)).toEqual(['m2', 'm1'])
    expect(items[1]).toMatchObject({ brief: 'Согласовали бюджет и запуск.', decisionsCount: 1, speakers: ['Кирилл', 'Саша'], durationMin: 30 })
    expect(items[0].notesCount).toBe(1)
    expect(JSON.stringify(items)).not.toContain('Начнём с бюджета')
  })

  it('фильтры: период, участник, заметки, слова из саммари', () => {
    expect(listMeetings(meetings, { range: resolveDateRange('2026-10-04', undefined) }).items.map((i) => i.id)).toEqual(['m2'])
    expect(listMeetings(meetings, { speaker: 'саша' }).items.map((i) => i.id)).toEqual(['m1'])
    expect(listMeetings(meetings, { hasNotes: true }).items.map((i) => i.id)).toEqual(['m2'])
    expect(listMeetings(meetings, { hasSummary: false }).items.map((i) => i.id)).toEqual(['m2'])
    expect(listMeetings(meetings, { query: 'кампанию запуск' }).items.map((i) => i.id)).toEqual(['m1'])
  })

  it('сортировка по длительности и постраничная выдача', () => {
    expect(listMeetings(meetings, { sort: 'longest' }).items[0].id).toBe('m1')
    const page = listMeetings(meetings, { sort: 'shortest', limit: 1, offset: 1 })
    expect(page.total).toBe(2)
    expect(page.items.map((i) => i.id)).toEqual(['m1'])
  })
})

describe('getMeetingView', () => {
  it('по умолчанию отдаёт саммари и заметки без стенограммы', () => {
    const view = getMeetingView(retro)
    expect(view.notes).toHaveLength(1)
    expect(view.transcript).toBeUndefined()
    expect(view.summary).toBeUndefined()
  })

  it('стенограмма с именами и таймкодами; фильтры по времени и спикеру', () => {
    const full = formatTranscript(planning)
    expect(full.text).toBe('[00:00] Кирилл: Начнём с бюджета\n[01:05] Саша: Бюджет согласован\n[02:10] Кирилл: Тогда запускаем кампанию')

    expect(formatTranscript(planning, { fromSec: 60, toSec: 100 }).lines).toBe(1)
    expect(formatTranscript(planning, { speaker: 'кир' }).lines).toBe(2)
  })

  it('события экрана вплетаются в стенограмму по времени и не мешают фильтру по спикеру', () => {
    const events: ScreenEvent[] = [
      { kind: 'window', atMs: 30000, change: 'focus', title: 'Бюджет.xlsx - Excel', app: 'EXCEL' },
      { kind: 'key', atMs: 66000, shortcut: 'Ctrl+S', window: 'Бюджет.xlsx - Excel' }
    ]
    const woven = formatTranscript(planning, { events })
    expect(woven.screenLines).toBe(2)
    expect(woven.text.split('\n').map((line) => line.slice(0, 7))).toEqual(
      ['[00:00]', '[00:30]', '[01:05]', '[01:06]', '[02:10]']
    )
    expect(woven.text).toContain('(экран)')

    const bySpeaker = formatTranscript(planning, { speaker: 'кир', events })
    expect(bySpeaker.screenLines).toBe(0)
    expect(bySpeaker.lines).toBe(2)
  })

  it('длинная стенограмма обрезается и подсказывает, с какой секунды продолжить', () => {
    const part = formatTranscript(planning, { maxChars: 60 })
    expect(part.truncated).toBe(true)
    expect(part.nextFromSec).toBe(65)

    const rest = formatTranscript(planning, { fromSec: part.nextFromSec })
    expect(rest.truncated).toBe(false)
    expect(rest.lines).toBe(2)
  })
})

describe('listDictations', () => {
  it('фильтрует по периоду и словам, сортирует, обрезает превью', () => {
    const result = listDictations(history, { range: resolveDateRange('2026-10-05', '2026-10-05'), previewChars: 20 })
    expect(result.total).toBe(2)
    expect(result.items.map((i) => i.id)).toEqual(['d3', 'd2'])
    expect(result.items[1]).toMatchObject({ truncated: true, chars: history[1].text.length })

    expect(listDictations(history, { query: 'бюджету' }).items).toHaveLength(1)
    expect(listDictations(history, { sort: 'longest', limit: 1 }).items[0].id).toBe('d2')
    expect(listDictations(history, { minChars: 30 }).total).toBe(1)
  })

  it('ошибочные записи без текста не попадают в списки', () => {
    const broken: TranscriptionRecord = { ...history[0], id: 'bad', text: '', status: 'error' }
    expect(listDictations([broken], {}).total).toBe(0)
  })
})

describe('buildDigest', () => {
  it('группирует по дням по возрастанию: встречи с решениями и счётчики диктовок', () => {
    const days = buildDigest(history, meetings, {})
    expect(days.map((d) => d.date)).toEqual(['2026-10-02', '2026-10-05'])
    expect(days[0].meetings[0]).toMatchObject({ id: 'm1', brief: 'Согласовали бюджет и запуск.' })
    expect(days[0].meetings[0].decisions).toHaveLength(1)
    expect(days[0].dictations).toEqual({ count: 1, totalChars: history[0].text.length })
    expect(days[1].dictations.count).toBe(2)
  })

  it('учитывает период и пропускает дни без активности', () => {
    const days = buildDigest(history, meetings, resolveDateRange('2026-10-03', '2026-10-04'))
    expect(days).toEqual([])
  })
})
