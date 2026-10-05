import { describe, expect, it } from 'vitest'
import { buildSearchDocs, makeSnippet, searchDocs } from './search'
import type { MeetingRecord, TranscriptionRecord } from './types'

const dictation = (id: string, text: string, createdAt = '2026-10-01T10:00:00.000Z'): TranscriptionRecord => ({
  id, text, createdAt, audioFileName: `${id}.webm`, durationMs: 5000,
  provider: 'openrouter', model: 'm', status: 'success'
})

const meeting: MeetingRecord = {
  id: 'm1',
  title: 'Планёрка по бюджету',
  audioFileName: 'm1.webm',
  durationMs: 600000,
  createdAt: '2026-10-02T09:00:00.000Z',
  segments: [
    { speaker: 'Speaker 1', text: 'Давайте обсудим бюджет на маркетинг', start: 5, end: 9 },
    { speaker: 'Speaker 2', text: 'Я подготовлю презентацию к пятнице', start: 12, end: 16 }
  ],
  speakerNames: { 'Speaker 1': 'Кирилл' },
  summary: {
    brief: 'Обсудили бюджет.',
    topics: ['маркетинг'],
    decisions: [{ text: 'Утвердить бюджет', assignee: 'Кирилл', deadline: 'пятница' }]
  },
  notes: [{ id: 'n1', text: 'Задача создана: TASK-42', source: 'agent', author: 'Claude', createdAt: '2026-10-03T08:00:00.000Z' }],
  status: 'success'
}

const docs = buildSearchDocs([dictation('d1', 'Купить молоко и хлеб'), dictation('d2', 'Позвонить маме')], [meeting])

describe('buildSearchDocs', () => {
  it('индексирует диктовки, саммари, реплики и заметки; имена спикеров — пользовательские', () => {
    const types = docs.map((d) => d.type)
    expect(types.filter((t) => t === 'dictation')).toHaveLength(2)
    expect(types).toContain('meeting_summary')
    expect(types.filter((t) => t === 'meeting_dialog')).toHaveLength(2)
    expect(types).toContain('meeting_note')
    expect(docs.find((d) => d.type === 'meeting_dialog')?.speaker).toBe('Кирилл')
  })

  it('пропускает пустые диктовки (ошибки распознавания)', () => {
    expect(buildSearchDocs([dictation('d3', '')], [])).toHaveLength(0)
  })

  it('решения попадают в текст саммари вместе с исполнителем и сроком', () => {
    const summary = docs.find((d) => d.type === 'meeting_summary')
    expect(summary?.text).toContain('Утвердить бюджет (Кирилл) до пятница')
  })
})

describe('searchDocs', () => {
  it('нечёткий поиск переживает опечатку', () => {
    const hits = searchDocs(docs, 'молако')
    expect(hits[0]?.recordId).toBe('d1')
  })

  it('несколько слов должны встретиться в одной записи, порядок не важен', () => {
    const hits = searchDocs(docs, 'маркетинг бюджет')
    expect(hits.some((h) => h.type === 'meeting_dialog' && h.recordId === 'm1')).toBe(true)
    expect(hits.every((h) => h.recordId !== 'd1')).toBe(true)
  })

  it('служебные символы Fuse в запросе не меняют смысл поиска', () => {
    expect(searchDocs(docs, '!молоко')[0]?.recordId).toBe('d1')
  })

  it('exact не терпит опечаток и ищет по подстроке без учёта регистра', () => {
    expect(searchDocs(docs, 'молако', { mode: 'exact' })).toHaveLength(0)
    expect(searchDocs(docs, 'МОЛОКО', { mode: 'exact' }).map((h) => h.recordId)).toEqual(['d1'])
  })

  it('поиск находит заметки агента', () => {
    const hits = searchDocs(docs, 'TASK-42', { mode: 'exact' })
    expect(hits).toHaveLength(1)
    expect(hits[0].type).toBe('meeting_note')
  })

  it('пустой запрос ничего не возвращает; limit ограничивает выдачу', () => {
    expect(searchDocs(docs, '   ')).toEqual([])
    expect(searchDocs(docs, 'а', { mode: 'exact', limit: 2 }).length).toBeLessThanOrEqual(2)
  })
})

describe('makeSnippet', () => {
  it('вырезает фрагмент вокруг найденного слова', () => {
    const text = `${'слово '.repeat(50)}нужное ${'хвост '.repeat(50)}`
    const snippet = makeSnippet(text, 'нужное', 20)
    expect(snippet).toContain('нужное')
    expect(snippet.length).toBeLessThan(80)
    expect(snippet.startsWith('…')).toBe(true)
  })

  it('без совпадения отдаёт начало текста', () => {
    expect(makeSnippet('Короткий текст', 'zzz')).toBe('Короткий текст')
  })
})
