import { useEffect, useMemo, useRef, useState } from 'react'
import Fuse from 'fuse.js'
import { Search, X, Clock, Users, FileText } from 'lucide-react'
import { TranscriptionRecord, MeetingRecord, Page } from '../types'
import { Modal } from './Modal'

interface SearchHit {
  type: 'transcription' | 'meeting' | 'segment' | 'summary'
  id: string
  text: string
  meta: string
  score?: number
}

interface SearchModalProps {
  history: TranscriptionRecord[]
  meetings: MeetingRecord[]
  onClose: () => void
  onNavigate: (target: { page: Page; id?: string }) => void
}

export function SearchModal({ history, meetings, onClose, onNavigate }: SearchModalProps): JSX.Element {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const haystack = useMemo<SearchHit[]>(() => {
    const items: SearchHit[] = []

    for (const r of history) {
      if (r.text) {
        items.push({
          type: 'transcription',
          id: r.id,
          text: r.text,
          meta: new Date(r.createdAt).toLocaleString('ru-RU')
        })
      }
    }

    for (const m of meetings) {
      if (m.summary?.brief) {
        items.push({
          type: 'summary',
          id: m.id,
          text: m.summary.brief,
          meta: m.title
        })
      }
      for (const seg of m.segments) {
        const speaker = m.speakerNames[seg.speaker] ?? seg.speaker
        items.push({
          type: 'segment',
          id: m.id,
          text: seg.text,
          meta: `${m.title} · ${speaker}`
        })
      }
    }

    return items
  }, [history, meetings])

  const fuse = useMemo(
    () =>
      new Fuse(haystack, {
        keys: ['text', 'meta'],
        threshold: 0.4,
        ignoreLocation: true,
        includeScore: true
      }),
    [haystack]
  )

  const results = useMemo(() => {
    if (!query.trim()) return []
    return fuse.search(query, { limit: 30 }).map((r) => ({ ...r.item, score: r.score }))
  }, [query, fuse])

  const handleSelect = (hit: SearchHit): void => {
    if (hit.type === 'transcription') onNavigate({ page: 'history', id: hit.id })
    else onNavigate({ page: 'meetings', id: hit.id })
  }

  return (
    <Modal onClose={onClose} align="top" topOffset={96}>
      <div
        className="w-[640px] max-w-[90vw] rounded-2xl overflow-hidden"
        style={{
          background: 'var(--surface-strong)',
          border: '1px solid var(--border)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.4)'
        }}
      >
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <Search size={16} style={{ color: 'var(--text-3)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по транскрипциям и встречам..."
            className="flex-1 bg-transparent text-sm focus:outline-none"
            style={{ color: 'var(--text-1)' }}
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--text-4)', background: 'var(--accent-bg)' }}>Esc</kbd>
          <button onClick={onClose} style={{ color: 'var(--text-4)' }}><X size={14} /></button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {!query.trim() && (
            <div className="px-4 py-8 text-center text-xs" style={{ color: 'var(--text-4)' }}>
              Введите текст для поиска по {haystack.length} {pluralize(haystack.length)}
            </div>
          )}

          {query.trim() && results.length === 0 && (
            <div className="px-4 py-8 text-center text-xs" style={{ color: 'var(--text-4)' }}>
              Ничего не найдено
            </div>
          )}

          {results.map((hit, i) => (
            <button
              key={`${hit.type}-${hit.id}-${i}`}
              onClick={() => handleSelect(hit)}
              className="w-full px-4 py-3 text-left transition-colors flex items-start gap-3"
              style={{ borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-bg)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div className="shrink-0 mt-0.5">
                {hit.type === 'transcription' && <FileText size={14} style={{ color: 'var(--text-4)' }} />}
                {hit.type === 'segment' && <Users size={14} style={{ color: 'var(--text-4)' }} />}
                {hit.type === 'summary' && <Clock size={14} style={{ color: 'var(--accent)' }} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-snug" style={{ color: 'var(--text-1)' }}>
                  {highlight(hit.text, query)}
                </p>
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-4)' }}>
                  {labelFor(hit.type)} · {hit.meta}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

function labelFor(type: SearchHit['type']): string {
  if (type === 'transcription') return 'Диктовка'
  if (type === 'segment') return 'Реплика встречи'
  if (type === 'summary') return 'Саммари встречи'
  return 'Встреча'
}

function pluralize(n: number): string {
  const m100 = n % 100
  if (m100 >= 11 && m100 <= 14) return 'записям'
  const m10 = n % 10
  if (m10 === 1) return 'записи'
  if (m10 >= 2 && m10 <= 4) return 'записям'
  return 'записям'
}

function highlight(text: string, query: string): JSX.Element {
  if (!query.trim()) return <>{text}</>
  const q = query.trim().toLowerCase()
  const lower = text.toLowerCase()
  const idx = lower.indexOf(q)

  if (idx === -1) {
    // Не нашли точное совпадение — показываем как есть, но обрезаем
    return <>{truncate(text, 200)}</>
  }

  const start = Math.max(0, idx - 60)
  const end = Math.min(text.length, idx + q.length + 120)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''

  return (
    <>
      {prefix}
      {text.slice(start, idx)}
      <mark style={{ background: 'var(--accent)', color: 'var(--accent-on-bg, #000)', padding: '0 2px', borderRadius: 2 }}>
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length, end)}
      {suffix}
    </>
  )
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}
