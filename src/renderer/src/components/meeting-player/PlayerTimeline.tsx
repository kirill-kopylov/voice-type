import { useRef, useState } from 'react'
import type { DialogSegment } from '@shared/types'
import { captionIndexAt, formatClock, indexAt, type ChapterRange } from '@shared/meeting-timeline'
import { useMediaPaint, type MediaPlayer } from '../../hooks/useMediaPlayer'
import { PREVIEW_WIDTH, useFramePreview } from './useFramePreview'

/** Отметка над таймлайном: договорённость из саммари или заметка к моменту */
export interface TimelineMarker {
  atSec: number
  kind: 'decision' | 'note'
  label: string
}

const MARKER_COLORS: Record<TimelineMarker['kind'], string> = { decision: '#10B981', note: 'var(--accent)' }
const MATCH_COLOR = '#F59E0B'
// Подсказка шириной 220px не должна вылезать за края плеера
const TOOLTIP_HALF_WIDTH = 110

interface Props {
  player: MediaPlayer
  /** Хотя бы одна глава: без оглавления — вся запись одним куском */
  chapters: ChapterRange[]
  segments: DialogSegment[]
  colors: Map<string, string>
  speakerName: (raw: string) => string
  markers: TimelineMarker[]
  /** Начала реплик, где нашёлся поиск по встрече */
  matchTimes: number[]
  /** Видео для кадров в подсказке; null — запись без видео */
  previewSrc: string | null
}

interface Hover {
  x: number
  width: number
  sec: number
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)

/**
 * Таймлайн как на YouTube: главы отрезками с зазорами, под ними полоса «кто говорит» цветами спикеров.
 * Наведение показывает момент: кадр, время, главу и реплику; клик и протяжка перематывают.
 */
export function PlayerTimeline({ player, chapters, segments, colors, speakerName, markers, matchTimes, previewSrc }: Props): JSX.Element {
  const { media, playing, seek } = player
  const duration = player.duration > 0 ? player.duration : 1
  const trackRef = useRef<HTMLDivElement>(null)
  const fillRefs = useRef<Array<HTMLDivElement | null>>([])
  const knobRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<Hover | null>(null)
  const [scrubbing, setScrubbing] = useState(false)
  const canvasRef = useFramePreview(previewSrc, hover?.sec ?? null)

  const percent = (sec: number): number => clamp(sec / duration, 0, 1) * 100
  const spaced = chapters.length > 1

  useMediaPaint(media, playing, (timeSec) => {
    chapters.forEach((chapter, index) => {
      const fill = fillRefs.current[index]
      if (fill) fill.style.width = `${clamp((timeSec - chapter.start) / Math.max(chapter.end - chapter.start, 0.001), 0, 1) * 100}%`
    })
    if (knobRef.current) knobRef.current.style.left = `${percent(timeSec)}%`
  })

  const hoverAt = (clientX: number): Hover | null => {
    const track = trackRef.current
    if (!track) return null
    const rect = track.getBoundingClientRect()
    const x = clamp(clientX - rect.left, 0, rect.width)
    return { x, width: rect.width, sec: (x / rect.width) * duration }
  }

  const hoverChapter = hover && spaced ? indexAt(chapters, hover.sec) : -1
  const hoverSegmentIndex = hover ? captionIndexAt(segments, hover.sec) : -1
  const hoverSegment = hoverSegmentIndex >= 0 ? segments[hoverSegmentIndex] : null

  return (
    <div
      className="group relative pt-3 pb-1 cursor-pointer touch-none"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        setScrubbing(true)
        const next = hoverAt(e.clientX)
        setHover(next)
        if (next) seek(next.sec)
      }}
      onPointerMove={(e) => {
        const next = hoverAt(e.clientX)
        setHover(next)
        if (scrubbing && next) seek(next.sec)
      }}
      onLostPointerCapture={() => setScrubbing(false)}
      onPointerLeave={() => { if (!scrubbing) setHover(null) }}
    >
      {/* Подсказка: всегда в DOM, чтобы canvas с кадром не пересоздавался */}
      <div
        className="absolute bottom-full mb-1 -translate-x-1/2 w-[220px] p-2 rounded-lg space-y-1 pointer-events-none z-10"
        style={{
          left: hover ? clamp(hover.x, TOOLTIP_HALF_WIDTH, hover.width - TOOLTIP_HALF_WIDTH) : 0,
          visibility: hover ? 'visible' : 'hidden',
          background: 'var(--surface-strong)',
          backdropFilter: 'blur(16px)',
          border: '1px solid var(--border-strong)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)'
        }}
      >
        {previewSrc && <canvas ref={canvasRef} width={PREVIEW_WIDTH} height={90} className="w-full rounded bg-black" />}
        <div className="flex items-baseline gap-2 text-[11px]">
          <span className="font-semibold tabular-nums" style={{ color: 'var(--text-1)' }}>{formatClock(hover?.sec ?? 0)}</span>
          {hoverChapter >= 0 && <span className="truncate" style={{ color: 'var(--text-3)' }}>{chapters[hoverChapter].title}</span>}
        </div>
        {hoverSegment && (
          <p className="text-[11px] leading-snug line-clamp-2" style={{ color: 'var(--text-2)' }}>
            <span className="font-semibold" style={{ color: colors.get(hoverSegment.speaker) }}>{speakerName(hoverSegment.speaker)}:</span> {hoverSegment.text}
          </p>
        )}
      </div>

      {/* Договорённости и заметки — точками над полосой */}
      <div className="absolute top-0 inset-x-0 h-2.5">
        {markers.map((marker) => (
          <button
            key={`${marker.kind}-${marker.atSec}-${marker.label}`}
            className="absolute top-0.5 w-2 h-2 -translate-x-1/2 rounded-full transition-transform hover:scale-150"
            style={{ left: `${percent(marker.atSec)}%`, background: MARKER_COLORS[marker.kind], boxShadow: '0 0 0 2px var(--surface-strong)' }}
            title={`${formatClock(marker.atSec)} ${marker.label}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => seek(marker.atSec, true)}
          />
        ))}
      </div>

      <div ref={trackRef} className="relative h-[5px] transition-[height] duration-150 group-hover:h-2">
        {chapters.map((chapter, index) => (
          <div
            key={chapter.start}
            className="absolute inset-y-0 rounded-full overflow-hidden transition-transform duration-150"
            style={{
              left: spaced ? `calc(${percent(chapter.start)}% + 1.5px)` : 0,
              width: spaced ? `calc(${percent(chapter.end) - percent(chapter.start)}% - 3px)` : '100%',
              background: 'var(--border-strong)',
              transform: hoverChapter === index ? 'scaleY(1.6)' : undefined
            }}
          >
            <div ref={(el) => { fillRefs.current[index] = el }} className="absolute inset-y-0 left-0" style={{ background: 'var(--accent)' }} />
          </div>
        ))}
        {matchTimes.map((atSec) => (
          <div key={atSec} className="absolute -inset-y-0.5 w-0.5 rounded-full pointer-events-none" style={{ left: `${percent(atSec)}%`, background: MATCH_COLOR }} />
        ))}
        {hover && <div className="absolute -inset-y-1 w-px pointer-events-none" style={{ left: hover.x, background: 'var(--text-2)' }} />}
        <div
          ref={knobRef}
          className={`absolute top-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform duration-150 group-hover:scale-110 ${scrubbing ? 'scale-125' : 'scale-75'}`}
          style={{ background: 'var(--accent)', boxShadow: '0 0 0 2px var(--surface-strong)' }}
        />
      </div>

      {/* Кто говорит: каждая реплика — отрезок цвета спикера */}
      <div className="relative h-1 mt-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        {segments.map((segment) => (
          <div
            key={`${segment.start}-${segment.speaker}`}
            className="absolute inset-y-0"
            style={{
              left: `${percent(segment.start)}%`,
              width: `${Math.max(percent(segment.end) - percent(segment.start), 0.15)}%`,
              background: colors.get(segment.speaker)
            }}
          />
        ))}
      </div>
    </div>
  )
}
