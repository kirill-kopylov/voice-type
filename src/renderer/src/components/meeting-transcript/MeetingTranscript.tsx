import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MousePointerClick, Keyboard, Type, Clipboard, Pencil, PanelTop, Eye, EyeOff, Search, ChevronUp, ChevronDown, X, LocateFixed } from 'lucide-react'
import type { DialogSegment, MeetingRecord, ScreenEvent } from '@shared/types'
import { describeEvents, type EventLine } from '@shared/screen-events'
import { formatClock, indexAt, normalizeForSearch, type ChapterRange } from '@shared/meeting-timeline'
import { useMediaValue, type MediaPlayer } from '../../hooks/useMediaPlayer'

interface Props {
  meeting: MeetingRecord
  /** Реплики по времени */
  segments: DialogSegment[]
  chapters: ChapterRange[]
  player: MediaPlayer
  colors: Map<string, string>
  speakerName: (raw: string) => string
  query: string
  onQueryChange: (query: string) => void
  /** Индексы реплик, где нашёлся запрос */
  matches: number[]
}

const MATCH_COLOR = '#F59E0B'
const SHOW_EVENTS_KEY = 'meeting-screen-events'
// Событие экрана показываем с секундой до него — чтобы увидеть, что к нему привело
const EVENT_LEAD_SEC = 1

type TranscriptItem =
  | { type: 'chapter'; chapter: ChapterRange }
  | { type: 'line'; index: number; segment: DialogSegment }
  | { type: 'event'; line: EventLine }

/** Главы, реплики и события экрана одной лентой по времени; заголовок главы — перед её первой репликой. */
function buildItems(segments: DialogSegment[], chapters: ChapterRange[], events: EventLine[]): TranscriptItem[] {
  const timed: Array<{ atSec: number; item: TranscriptItem }> = [
    ...chapters.map((chapter) => ({ atSec: chapter.start - 0.001, item: { type: 'chapter' as const, chapter } })),
    ...segments.map((segment, index) => ({ atSec: segment.start, item: { type: 'line' as const, index, segment } })),
    ...events.map((line) => ({ atSec: line.atMs / 1000, item: { type: 'event' as const, line } }))
  ]
  return timed.sort((a, b) => a.atSec - b.atSec).map(({ item }) => item)
}

/** Диалог встречи, который идёт вместе с записью: текущая реплика подсвечена, тайм-код перематывает, поиск по всей встрече. */
export function MeetingTranscript({ meeting, segments, chapters, player, colors, speakerName, query, onQueryChange, matches }: Props): JSX.Element {
  const [showEvents, setShowEvents] = useState(() => localStorage.getItem(SHOW_EVENTS_KEY) !== 'off')
  const [follow, setFollow] = useState(true)
  const [activeMatch, setActiveMatch] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const eventLines = useScreenEventLines(meeting)
  const items = useMemo(() => buildItems(segments, chapters, showEvents ? eventLines : []), [segments, chapters, eventLines, showEvents])
  const current = useMediaValue(player.media, (timeSec) => indexAt(segments, timeSec))
  const seekAndPlay = useCallback((atSec: number) => player.seek(atSec, true), [player.seek])

  // Прокручиваем только список, не страницу: плеер остаётся на месте
  const scrollToLine = useCallback((index: number): void => {
    const list = listRef.current
    const line = list?.querySelector<HTMLElement>(`[data-segment="${index}"]`)
    if (!list || !line) return
    list.scrollTo({ top: line.offsetTop - list.clientHeight / 3, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (follow && player.playing && current >= 0) scrollToLine(current)
  }, [current, follow, player.playing, scrollToLine])

  useEffect(() => setActiveMatch(0), [query])

  useEffect(() => {
    if (matches.length === 0) return
    setFollow(false)
    scrollToLine(matches[Math.min(activeMatch, matches.length - 1)])
  }, [activeMatch, matches, scrollToLine])

  // Ctrl+F — поиск по этой встрече
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.code !== 'KeyF') return
      e.preventDefault()
      searchRef.current?.focus()
      searchRef.current?.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const stepMatch = (delta: number): void => {
    if (matches.length > 0) setActiveMatch((index) => (index + delta + matches.length) % matches.length)
  }

  // Выбор общий для всех встреч: кому события мешают читать диалог, выключит их один раз
  const toggleEvents = (): void => {
    localStorage.setItem(SHOW_EVENTS_KEY, showEvents ? 'off' : 'on')
    setShowEvents(!showEvents)
  }

  const followAgain = (): void => {
    setFollow(true)
    if (current >= 0) scrollToLine(current)
  }

  const activeMatchLine = matches.length > 0 ? matches[Math.min(activeMatch, matches.length - 1)] : -1

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>Диалог</p>
        <div className="flex items-center gap-1.5 h-7 px-2 rounded-lg" style={{ background: 'var(--accent-bg)', border: '1px solid var(--border)' }}>
          <Search size={12} style={{ color: 'var(--text-3)' }} />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); stepMatch(e.shiftKey ? -1 : 1) }
              if (e.key === 'ArrowUp') { e.preventDefault(); stepMatch(-1) }
              if (e.key === 'Escape') onQueryChange('')
            }}
            placeholder="Найти в разговоре (Ctrl+F)"
            className="w-44 text-xs bg-transparent focus:outline-none select-text"
            style={{ color: 'var(--text-1)' }}
          />
          {query.trim() && (
            <>
              <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: matches.length > 0 ? 'var(--text-3)' : '#fca5a5' }}>
                {matches.length > 0 ? `${Math.min(activeMatch, matches.length - 1) + 1} из ${matches.length}` : 'нет'}
              </span>
              <button onClick={() => stepMatch(-1)} disabled={matches.length === 0} className="disabled:opacity-30" style={{ color: 'var(--text-3)' }} title="Предыдущее (Shift+Enter)"><ChevronUp size={13} /></button>
              <button onClick={() => stepMatch(1)} disabled={matches.length === 0} className="disabled:opacity-30" style={{ color: 'var(--text-3)' }} title="Следующее (Enter)"><ChevronDown size={13} /></button>
              <button onClick={() => onQueryChange('')} style={{ color: 'var(--text-4)' }} title="Очистить (Esc)"><X size={12} /></button>
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ToggleButton
            on={follow}
            onClick={() => (follow ? setFollow(false) : followAgain())}
            title="Диалог прокручивается за записью; колесо мыши отключает"
          >
            <LocateFixed size={12} /> Следить
          </ToggleButton>
          {eventLines.length > 0 && (
            <ToggleButton on={showEvents} onClick={toggleEvents} title="Клики, окна, набранный и скопированный текст, рисунки — по времени между репликами">
              {showEvents ? <Eye size={12} /> : <EyeOff size={12} />} События экрана ({eventLines.length})
            </ToggleButton>
          )}
        </div>
      </div>

      <div
        ref={listRef}
        className="relative max-h-[min(70vh,640px)] overflow-y-auto pr-2 space-y-0.5"
        onWheel={() => { if (follow) setFollow(false) }}
      >
        {items.map((item) => {
          if (item.type === 'chapter') {
            return <ChapterHeading key={`chapter-${item.chapter.start}`} chapter={item.chapter} onSeek={seekAndPlay} />
          }
          if (item.type === 'event') {
            return <ScreenEventRow key={`event-${item.line.atMs}-${item.line.kind}`} line={item.line} onSeek={seekAndPlay} />
          }
          return (
            <DialogLine
              key={`line-${item.index}`}
              index={item.index}
              segment={item.segment}
              name={speakerName(item.segment.speaker)}
              color={colors.get(item.segment.speaker) ?? 'var(--accent)'}
              active={item.index === current}
              matched={item.index === activeMatchLine}
              query={query}
              onSeek={seekAndPlay}
            />
          )
        })}
      </div>
    </div>
  )
}

function ToggleButton({ on, onClick, title, children }: { on: boolean; onClick: () => void; title: string; children: ReactNode }): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg transition-colors"
      style={{ background: on ? 'var(--accent-bg-hover)' : 'var(--accent-bg)', color: on ? 'var(--accent)' : 'var(--text-3)' }}
      title={title}
    >
      {children}
    </button>
  )
}

/** Совпадения с поиском — подсвечены; регистр и «ё» не важны, как и в самом поиске. */
function highlight(text: string, query: string): ReactNode {
  const needle = normalizeForSearch(query.trim())
  if (!needle) return text
  const haystack = normalizeForSearch(text)
  const parts: ReactNode[] = []
  let from = 0
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + needle.length)) {
    parts.push(text.slice(from, at), (
      <mark key={at} className="rounded-sm" style={{ background: 'rgba(245,158,11,0.35)', color: 'inherit' }}>{text.slice(at, at + needle.length)}</mark>
    ))
    from = at + needle.length
  }
  parts.push(text.slice(from))
  return parts
}

const DialogLine = memo(function DialogLine({ index, segment, name, color, active, matched, query, onSeek }: {
  index: number
  segment: DialogSegment
  name: string
  color: string
  active: boolean
  /** Текущий результат поиска */
  matched: boolean
  query: string
  onSeek: (atSec: number) => void
}): JSX.Element {
  return (
    <div
      data-segment={index}
      className="flex gap-3 rounded-lg px-2 py-1.5 transition-colors duration-200"
      style={{
        background: active ? 'var(--accent-bg)' : undefined,
        boxShadow: active ? `inset 3px 0 0 ${color}` : undefined,
        outline: matched ? `1px solid ${MATCH_COLOR}` : undefined
      }}
    >
      <button onClick={() => onSeek(segment.start)} className="self-start shrink-0 w-24 pt-0.5 text-left group" title="Смотреть с этой реплики">
        <div className="text-xs font-semibold truncate" style={{ color }}>{name}</div>
        <div className="text-[10px] tabular-nums group-hover:underline" style={{ color: active ? 'var(--accent)' : 'var(--text-4)' }}>{formatClock(segment.start)}</div>
      </button>
      <p className="flex-1 text-sm leading-relaxed select-text" style={{ color: 'var(--text-1)' }}>{highlight(segment.text, query)}</p>
    </div>
  )
})

function ChapterHeading({ chapter, onSeek }: { chapter: ChapterRange; onSeek: (atSec: number) => void }): JSX.Element {
  return (
    <button onClick={() => onSeek(chapter.start)} className="flex items-center gap-2 w-full pt-4 pb-1 px-2 text-left" title="Смотреть главу">
      <span className="text-[11px] tabular-nums font-medium" style={{ color: 'var(--accent)' }}>{formatClock(chapter.start)}</span>
      <span className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>{chapter.title}</span>
      <span className="flex-1 h-px" style={{ background: 'var(--border)' }} />
    </button>
  )
}

/** События экрана встречи с видео: грузятся при открытии диалога и пересчитываются в строки. */
function useScreenEventLines(meeting: MeetingRecord): EventLine[] {
  const [events, setEvents] = useState<ScreenEvent[]>([])

  useEffect(() => {
    if (!meeting.videoFileName) {
      setEvents([])
      return
    }
    let cancelled = false
    window.api.getMeetingEvents(meeting.id).then((loaded) => { if (!cancelled) setEvents(loaded) })
    return () => { cancelled = true }
  }, [meeting.id, meeting.videoFileName])

  return useMemo(() => describeEvents(events), [events])
}

const EVENT_ICONS: Record<ScreenEvent['kind'], typeof Keyboard> = {
  click: MousePointerClick,
  key: Keyboard,
  text: Type,
  clipboard: Clipboard,
  window: PanelTop,
  drawing: Pencil
}

function ScreenEventRow({ line, onSeek }: { line: EventLine; onSeek: (atSec: number) => void }): JSX.Element {
  const Icon = EVENT_ICONS[line.kind]
  const atSec = line.atMs / 1000

  return (
    <div className="flex gap-3 px-2 py-0.5">
      <div className="shrink-0 w-24 text-[10px] tabular-nums pt-1" style={{ color: 'var(--text-4)' }}>{formatClock(atSec)}</div>
      <button
        onClick={() => onSeek(Math.max(0, atSec - EVENT_LEAD_SEC))}
        className="flex-1 flex items-start gap-1.5 text-left text-[11px] leading-snug rounded-md px-2 py-1 transition-colors select-text"
        style={{ background: 'var(--accent-bg)', color: 'var(--text-3)' }}
        title="Показать этот момент на видео"
      >
        <Icon size={11} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
        <span>{line.text}</span>
      </button>
    </div>
  )
}
