// Поиск по диктовкам и встречам: один и тот же код для окна поиска и для MCP-сервера.
import Fuse from 'fuse.js'
import type { MeetingRecord, TranscriptionRecord } from './types'

export type SearchDocType = 'dictation' | 'meeting_summary' | 'meeting_dialog' | 'meeting_note'

export interface SearchDoc {
  type: SearchDocType
  recordId: string          // id диктовки или встречи
  text: string
  meta: string              // заголовок встречи, спикер — тоже участвует в поиске
  createdAt: string
  speaker?: string
  startSec?: number
  noteId?: string
}

export interface SearchHit extends SearchDoc {
  score: number             // 0 — точное совпадение, 1 — совсем далёкое
}

export type SearchMode = 'fuzzy' | 'exact'

export interface SearchOptions {
  mode?: SearchMode
  limit?: number
}

const FUZZY_THRESHOLD = 0.4
// Служебные символы расширенного синтаксиса Fuse: в запросе пользователя они ничего не значат
const FUSE_SYNTAX_CHARS = /['"^!=$|]/g

export function buildSearchDocs(history: TranscriptionRecord[], meetings: MeetingRecord[]): SearchDoc[] {
  const docs: SearchDoc[] = []

  for (const record of history) {
    if (!record.text) continue
    docs.push({ type: 'dictation', recordId: record.id, text: record.text, meta: '', createdAt: record.createdAt })
  }

  for (const meeting of meetings) {
    const speakerLabel = (raw: string): string => meeting.speakerNames[raw] ?? raw

    const summaryText = summaryToText(meeting)
    if (summaryText) {
      docs.push({
        type: 'meeting_summary', recordId: meeting.id, text: summaryText,
        meta: meeting.title, createdAt: meeting.createdAt
      })
    }

    for (const segment of meeting.segments) {
      const speaker = speakerLabel(segment.speaker)
      docs.push({
        type: 'meeting_dialog', recordId: meeting.id, text: segment.text,
        meta: `${meeting.title} · ${speaker}`, createdAt: meeting.createdAt,
        speaker, startSec: segment.start
      })
    }

    for (const note of meeting.notes ?? []) {
      docs.push({
        type: 'meeting_note', recordId: meeting.id, text: note.text,
        meta: `${meeting.title} · ${note.author}`, createdAt: note.createdAt, noteId: note.id
      })
    }
  }

  return docs
}

export function summaryToText(meeting: MeetingRecord): string {
  const summary = meeting.summary
  if (!summary?.brief) return ''
  const topics = summary.topics.length > 0 ? `\nТемы: ${summary.topics.join('; ')}` : ''
  const decisions = summary.decisions
    .map((d) => `\n— ${d.text}${d.assignee ? ` (${d.assignee})` : ''}${d.deadline ? ` до ${d.deadline}` : ''}`)
    .join('')
  return `${summary.brief}${topics}${decisions}`
}

export function tokenizeQuery(query: string): string[] {
  return query.replace(FUSE_SYNTAX_CHARS, ' ').split(/\s+/).filter(Boolean)
}

/** Нечёткий (по умолчанию) или точный поиск; несколько слов — все должны встретиться в одной записи. */
export function searchDocs(docs: SearchDoc[], query: string, options: SearchOptions = {}): SearchHit[] {
  const { mode = 'fuzzy', limit = 30 } = options
  const tokens = tokenizeQuery(query)
  if (tokens.length === 0) return []

  return mode === 'exact' ? searchExact(docs, tokens, limit) : searchFuzzy(docs, tokens, limit)
}

function searchFuzzy(docs: SearchDoc[], tokens: string[], limit: number): SearchHit[] {
  const fuse = new Fuse(docs, {
    keys: ['text', 'meta'],
    threshold: FUZZY_THRESHOLD,
    ignoreLocation: true,
    includeScore: true,
    useExtendedSearch: true
  })
  return fuse
    .search(tokens.join(' '), { limit })
    .map((result) => ({ ...result.item, score: result.score ?? 0 }))
}

function searchExact(docs: SearchDoc[], tokens: string[], limit: number): SearchHit[] {
  const needles = tokens.map((token) => token.toLowerCase())
  const phrase = needles.join(' ')

  return docs
    .map((doc) => ({ doc, haystack: `${doc.text}\n${doc.meta}`.toLowerCase() }))
    .filter(({ haystack }) => needles.every((needle) => haystack.includes(needle)))
    .map(({ doc, haystack }) => ({ doc, phraseCount: countOccurrences(haystack, phrase) }))
    // Сначала записи, где слова идут подряд и чаще, потом — свежие
    .sort((a, b) => b.phraseCount - a.phraseCount || b.doc.createdAt.localeCompare(a.doc.createdAt))
    .slice(0, limit)
    .map(({ doc, phraseCount }) => ({ ...doc, score: phraseCount > 0 ? 0 : 0.3 }))
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0
  for (let index = haystack.indexOf(needle); index !== -1; index = haystack.indexOf(needle, index + needle.length)) {
    count++
  }
  return count
}

/** Фрагмент текста вокруг первого найденного слова запроса (или начало текста). */
export function makeSnippet(text: string, query: string, radius = 90): string {
  const lower = text.toLowerCase()
  const positions = tokenizeQuery(query)
    .map((token) => lower.indexOf(token.toLowerCase()))
    .filter((index) => index !== -1)

  if (positions.length === 0) return text.length > radius * 2 ? `${text.slice(0, radius * 2)}…` : text

  const center = Math.min(...positions)
  const start = Math.max(0, center - radius)
  const end = Math.min(text.length, center + radius)
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}
