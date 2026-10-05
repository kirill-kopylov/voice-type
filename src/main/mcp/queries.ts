// Чистые запросы к диктовкам и встречам для MCP-инструментов: без electron и без store,
// на вход — массивы записей, поэтому тестируются напрямую.
import {
  buildSearchDocs, makeSnippet, searchDocs, summaryToText,
  type SearchDocType, type SearchMode
} from '../../shared/search'
import type { MeetingDecision, MeetingNote, MeetingRecord, TranscriptionRecord } from '../../shared/types'
import { formatLocalDate, formatLocalDateTime, isInRange, type DateRange } from './dates'

// Внутренний запас: сортировка по дате применяется к лучшим совпадениям, а не к первым попавшимся
const SEARCH_CANDIDATES = 500

const clock = (seconds: number): string => {
  const total = Math.floor(seconds)
  const minutes = Math.floor(total / 60)
  return `${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

const minutesOf = (durationMs: number): number => Math.round(durationMs / 6000) / 10

const speakerName = (meeting: MeetingRecord, raw: string): string => meeting.speakerNames[raw] ?? raw

export function meetingSpeakers(meeting: MeetingRecord): string[] {
  return [...new Set(meeting.segments.map((segment) => speakerName(meeting, segment.speaker)))]
}

const includesText = (value: string, needle: string): boolean => value.toLowerCase().includes(needle.toLowerCase())

// ─── Поиск ───

export type SearchSort = 'relevance' | 'newest' | 'oldest'

export interface SearchParams {
  query: string
  mode?: SearchMode
  types?: SearchDocType[]
  range?: DateRange
  speaker?: string
  meetingId?: string
  sort?: SearchSort
  limit?: number
}

export interface SearchHitView {
  type: SearchDocType
  id: string                 // id диктовки или встречи
  title?: string             // заголовок встречи
  date: string
  snippet: string
  score: number
  speaker?: string
  at?: string                // mm:ss от начала встречи
  noteId?: string
}

export function searchRecords(history: TranscriptionRecord[], meetings: MeetingRecord[], params: SearchParams): SearchHitView[] {
  const { query, mode, types, range = {}, speaker, meetingId, sort = 'relevance', limit = 20 } = params
  const titles = new Map(meetings.map((meeting) => [meeting.id, meeting.title]))

  const docs = buildSearchDocs(history, meetings).filter((doc) =>
    (!types || types.includes(doc.type))
    && isInRange(doc.createdAt, range)
    && (!meetingId || doc.recordId === meetingId)
    && (!speaker || (doc.speaker !== undefined && includesText(doc.speaker, speaker)))
  )

  const hits = searchDocs(docs, query, { mode, limit: SEARCH_CANDIDATES })
  if (sort === 'newest') hits.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  if (sort === 'oldest') hits.sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  return hits.slice(0, limit).map((hit) => ({
    type: hit.type,
    id: hit.recordId,
    title: titles.get(hit.recordId),
    date: formatLocalDateTime(hit.createdAt),
    snippet: makeSnippet(hit.text, query),
    score: Math.round(hit.score * 100) / 100,
    speaker: hit.speaker,
    at: hit.startSec === undefined ? undefined : clock(hit.startSec),
    noteId: hit.noteId
  }))
}

// ─── Встречи ───

export type MeetingSort = 'newest' | 'oldest' | 'longest' | 'shortest'

export interface ListMeetingsParams {
  range?: DateRange
  query?: string             // слова из заголовка, саммари, тем и решений
  speaker?: string
  hasNotes?: boolean
  hasSummary?: boolean
  sort?: MeetingSort
  limit?: number
  offset?: number
}

export interface MeetingListItem {
  id: string
  title: string
  date: string
  durationMin: number
  speakers: string[]
  brief?: string
  topics?: string[]
  decisionsCount: number
  notesCount: number
}

export interface Page<T> {
  total: number
  items: T[]
}

const MEETING_COMPARATORS: Record<MeetingSort, (a: MeetingRecord, b: MeetingRecord) => number> = {
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
  longest: (a, b) => b.durationMs - a.durationMs,
  shortest: (a, b) => a.durationMs - b.durationMs
}

function matchesAllWords(haystack: string, query: string): boolean {
  return query.split(/\s+/).filter(Boolean).every((word) => includesText(haystack, word))
}

function meetingHaystack(meeting: MeetingRecord): string {
  return `${meeting.title}\n${summaryToText(meeting)}`
}

export function listMeetings(meetings: MeetingRecord[], params: ListMeetingsParams): Page<MeetingListItem> {
  const { range = {}, query, speaker, hasNotes, hasSummary, sort = 'newest', limit = 20, offset = 0 } = params

  const matched = meetings
    .filter((meeting) =>
      isInRange(meeting.createdAt, range)
      && (!query || matchesAllWords(meetingHaystack(meeting), query))
      && (!speaker || meetingSpeakers(meeting).some((name) => includesText(name, speaker)))
      && (hasNotes === undefined || Boolean(meeting.notes?.length) === hasNotes)
      && (hasSummary === undefined || Boolean(meeting.summary) === hasSummary)
    )
    .sort(MEETING_COMPARATORS[sort])

  return {
    total: matched.length,
    items: matched.slice(offset, offset + limit).map(toMeetingListItem)
  }
}

function toMeetingListItem(meeting: MeetingRecord): MeetingListItem {
  return {
    id: meeting.id,
    title: meeting.title,
    date: formatLocalDateTime(meeting.createdAt),
    durationMin: minutesOf(meeting.durationMs),
    speakers: meetingSpeakers(meeting),
    brief: meeting.summary?.brief,
    topics: meeting.summary?.topics,
    decisionsCount: meeting.summary?.decisions.length ?? 0,
    notesCount: meeting.notes?.length ?? 0
  }
}

export type MeetingPart = 'summary' | 'notes' | 'transcript'

export interface MeetingViewParams {
  include?: MeetingPart[]
  fromSec?: number
  toSec?: number
  speaker?: string
  maxChars?: number
}

export interface NoteView {
  id: string
  text: string
  source: MeetingNote['source']
  author: string
  date: string
  edited?: boolean
}

export interface TranscriptView {
  text: string
  lines: number
  truncated: boolean
  nextFromSec?: number       // с какой секунды продолжить чтение, если текст обрезан
}

export interface MeetingView extends Omit<MeetingListItem, 'brief' | 'topics' | 'decisionsCount' | 'notesCount'> {
  status: MeetingRecord['status']
  error?: string
  summaryStatus?: MeetingRecord['summaryStatus']
  summary?: { brief: string; topics: string[]; decisions: MeetingDecision[] }
  notes?: NoteView[]
  transcript?: TranscriptView
}

export const DEFAULT_TRANSCRIPT_CHARS = 20000

export function toNoteView(note: MeetingNote): NoteView {
  return {
    id: note.id,
    text: note.text,
    source: note.source,
    author: note.author,
    date: formatLocalDateTime(note.createdAt),
    edited: note.updatedAt ? true : undefined
  }
}

export function getMeetingView(meeting: MeetingRecord, params: MeetingViewParams = {}): MeetingView {
  const { include = ['summary', 'notes'] } = params
  const { id, title, createdAt, durationMs, status, error, summaryStatus } = meeting

  return {
    id, title, status, error, summaryStatus,
    date: formatLocalDateTime(createdAt),
    durationMin: minutesOf(durationMs),
    speakers: meetingSpeakers(meeting),
    summary: include.includes('summary') ? meeting.summary : undefined,
    notes: include.includes('notes') ? (meeting.notes ?? []).map(toNoteView) : undefined,
    transcript: include.includes('transcript') ? formatTranscript(meeting, params) : undefined
  }
}

export function formatTranscript(meeting: MeetingRecord, params: MeetingViewParams = {}): TranscriptView {
  const { fromSec = 0, toSec = Infinity, speaker, maxChars = DEFAULT_TRANSCRIPT_CHARS } = params

  const segments = meeting.segments.filter((segment) =>
    segment.start >= fromSec
    && segment.start <= toSec
    && (!speaker || includesText(speakerName(meeting, segment.speaker), speaker))
  )

  const lines: string[] = []
  let length = 0
  for (const segment of segments) {
    const line = `[${clock(segment.start)}] ${speakerName(meeting, segment.speaker)}: ${segment.text}`
    // Первую строку отдаём всегда, даже если она длиннее лимита
    if (lines.length > 0 && length + line.length + 1 > maxChars) {
      return { text: lines.join('\n'), lines: lines.length, truncated: true, nextFromSec: Math.floor(segment.start) }
    }
    lines.push(line)
    length += line.length + 1
  }
  return { text: lines.join('\n'), lines: lines.length, truncated: false }
}

// ─── Диктовки ───

export type DictationSort = 'newest' | 'oldest' | 'longest' | 'shortest'

export interface ListDictationsParams {
  range?: DateRange
  query?: string             // слова, которые должны встретиться в тексте
  minChars?: number
  sort?: DictationSort
  limit?: number
  offset?: number
  previewChars?: number
}

export interface DictationListItem {
  id: string
  date: string
  durationSec: number
  chars: number
  text: string
  truncated: boolean
}

const DICTATION_COMPARATORS: Record<DictationSort, (a: TranscriptionRecord, b: TranscriptionRecord) => number> = {
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
  longest: (a, b) => b.text.length - a.text.length,
  shortest: (a, b) => a.text.length - b.text.length
}

export function listDictations(history: TranscriptionRecord[], params: ListDictationsParams): Page<DictationListItem> {
  const { range = {}, query, minChars, sort = 'newest', limit = 20, offset = 0, previewChars = 300 } = params

  const matched = history
    .filter((record) =>
      record.status === 'success'
      && record.text.length > 0
      && isInRange(record.createdAt, range)
      && (minChars === undefined || record.text.length >= minChars)
      && (!query || matchesAllWords(record.text, query))
    )
    .sort(DICTATION_COMPARATORS[sort])

  return {
    total: matched.length,
    items: matched.slice(offset, offset + limit).map((record) => ({
      id: record.id,
      date: formatLocalDateTime(record.createdAt),
      durationSec: Math.round(record.durationMs / 1000),
      chars: record.text.length,
      text: record.text.length > previewChars ? `${record.text.slice(0, previewChars)}…` : record.text,
      truncated: record.text.length > previewChars
    }))
  }
}

export function getDictationView(record: TranscriptionRecord): Omit<DictationListItem, 'truncated'> {
  return {
    id: record.id,
    date: formatLocalDateTime(record.createdAt),
    durationSec: Math.round(record.durationMs / 1000),
    chars: record.text.length,
    text: record.text
  }
}

// ─── Дайджест по дням ───

export interface DigestMeeting {
  id: string
  title: string
  time: string
  durationMin: number
  brief?: string
  decisions: MeetingDecision[]
  notesCount: number
}

export interface DigestDay {
  date: string
  dictations: { count: number; totalChars: number }
  meetings: DigestMeeting[]
}

/** Что происходило по дням: встречи с саммари и счётчики диктовок. Дни без активности пропускаются. */
export function buildDigest(history: TranscriptionRecord[], meetings: MeetingRecord[], range: DateRange): DigestDay[] {
  const days = new Map<string, DigestDay>()
  const dayOf = (iso: string): DigestDay => {
    const date = formatLocalDate(iso)
    const existing = days.get(date)
    if (existing) return existing
    const created: DigestDay = { date, dictations: { count: 0, totalChars: 0 }, meetings: [] }
    days.set(date, created)
    return created
  }

  for (const record of history) {
    if (record.status !== 'success' || !record.text || !isInRange(record.createdAt, range)) continue
    const day = dayOf(record.createdAt)
    day.dictations.count++
    day.dictations.totalChars += record.text.length
  }

  for (const meeting of meetings) {
    if (!isInRange(meeting.createdAt, range)) continue
    dayOf(meeting.createdAt).meetings.push({
      id: meeting.id,
      title: meeting.title,
      time: formatLocalDateTime(meeting.createdAt).slice(11),
      durationMin: minutesOf(meeting.durationMs),
      brief: meeting.summary?.brief,
      decisions: meeting.summary?.decisions ?? [],
      notesCount: meeting.notes?.length ?? 0
    })
  }

  return [...days.values()]
    .map((day) => ({ ...day, meetings: day.meetings.sort((a, b) => a.time.localeCompare(b.time)) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}
