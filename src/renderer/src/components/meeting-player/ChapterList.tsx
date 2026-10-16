import { useRef } from 'react'
import { Copy, ListVideo } from 'lucide-react'
import type { DialogSegment } from '@shared/types'
import { formatClock, indexAt, type ChapterRange } from '@shared/meeting-timeline'
import { useMediaPaint, useMediaValue, type MediaPlayer } from '../../hooks/useMediaPlayer'

interface Props {
  chapters: ChapterRange[]
  player: MediaPlayer
  segments: DialogSegment[]
  speakerName: (raw: string) => string
  onCopy: (text: string) => void
}

/** Текст главы для вставки в задачу или чат: заголовок с границами и реплики с тайм-кодами. */
function chapterText(chapter: ChapterRange, segments: DialogSegment[], speakerName: (raw: string) => string): string {
  const lines = segments
    .filter((segment) => segment.start >= chapter.start && segment.start < chapter.end)
    .map((segment) => `[${formatClock(segment.start)}] ${speakerName(segment.speaker)}: ${segment.text}`)
  return [`${chapter.title} (${formatClock(chapter.start)}–${formatClock(chapter.end)})`, ...lines].join('\n')
}

/** Оглавление встречи: клик — смотреть с начала главы; текущая подсвечена и показывает, сколько из неё прошло. */
export function ChapterList({ chapters, player, segments, speakerName, onCopy }: Props): JSX.Element {
  const fillRefs = useRef<Array<HTMLDivElement | null>>([])
  const current = useMediaValue(player.media, (timeSec) => indexAt(chapters, timeSec))

  useMediaPaint(player.media, player.playing, (timeSec) => {
    const playingIndex = indexAt(chapters, timeSec)
    chapters.forEach((chapter, index) => {
      const fill = fillRefs.current[index]
      if (!fill) return
      const progress = index === playingIndex ? (timeSec - chapter.start) / Math.max(chapter.end - chapter.start, 0.001) : 0
      fill.style.width = `${Math.min(Math.max(progress, 0), 1) * 100}%`
    })
  })

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <ListVideo size={13} style={{ color: 'var(--text-3)' }} />
        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>Оглавление</span>
      </div>
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {chapters.map((chapter, index) => (
          <div
            key={chapter.start}
            className="group relative flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors hover:bg-[var(--accent-bg)]"
            style={{
              background: index === current ? 'var(--accent-bg)' : undefined,
              borderTop: index > 0 ? '1px solid var(--border)' : undefined
            }}
            onClick={() => player.seek(chapter.start, true)}
          >
            <span className="w-11 shrink-0 text-xs tabular-nums font-medium" style={{ color: 'var(--accent)' }}>{formatClock(chapter.start)}</span>
            <span className={`flex-1 min-w-0 text-sm truncate ${index === current ? 'font-semibold' : ''}`} style={{ color: 'var(--text-1)' }}>
              {chapter.title}
            </span>
            <span className="text-[11px] shrink-0 tabular-nums" style={{ color: 'var(--text-4)' }}>
              {Math.max(1, Math.round((chapter.end - chapter.start) / 60))} мин
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCopy(chapterText(chapter, segments, speakerName))
              }}
              className="p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              style={{ color: 'var(--text-3)' }}
              title="Скопировать реплики этой главы"
            >
              <Copy size={12} />
            </button>
            <div ref={(el) => { fillRefs.current[index] = el }} className="absolute left-0 bottom-0 h-0.5" style={{ background: 'var(--accent)' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
