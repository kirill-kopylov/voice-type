import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { Play, Pause, X } from 'lucide-react'
import type { DialogSegment } from '@shared/types'
import { indexAt } from '@shared/meeting-timeline'
import { useMediaPaint, useMediaValue, type MediaPlayer } from '../../hooks/useMediaPlayer'
import { PlayerClock } from './PlayerClock'
import { OVERLAY_STYLE } from './overlay-style'

interface Props {
  player: MediaPlayer
  title: string
  segments: DialogSegment[]
  colors: Map<string, string>
  speakerName: (raw: string) => string
  /** Прокрутить к большому плееру */
  onReturn: () => void
  onClose: () => void
}

/**
 * Плашка внизу окна, пока большой плеер прокручен из виду: читаешь саммари или диалог и не теряешь, что звучит.
 * В портале: карточка встречи со стеклом темы (backdrop-filter) удерживала бы fixed внутри себя.
 */
export function MiniPlayer({ player, title, segments, colors, speakerName, onReturn, onClose }: Props): JSX.Element {
  const progressRef = useRef<HTMLDivElement>(null)
  const index = useMediaValue(player.media, (timeSec) => indexAt(segments, timeSec))
  const segment = index >= 0 ? segments[index] : null

  useMediaPaint(player.media, player.playing, (timeSec) => {
    if (progressRef.current) progressRef.current.style.width = `${Math.min(timeSec / Math.max(player.duration, 1), 1) * 100}%`
  })

  return createPortal(
    <div
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 w-[min(560px,calc(100vw-2rem))] rounded-xl overflow-hidden motion-safe:animate-rise-in"
      style={{ ...OVERLAY_STYLE, boxShadow: '0 12px 32px rgba(0,0,0,0.3)' }}
    >
      <div className="flex items-center gap-3 px-3 py-2">
        <button
          onClick={player.toggle}
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'var(--accent-bg-hover)', color: 'var(--accent-on-bg)' }}
          title={player.playing ? 'Пауза' : 'Смотреть'}
        >
          {player.playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
        </button>
        <button onClick={onReturn} className="flex-1 min-w-0 text-left" title="Вернуться к плееру">
          <p className="text-[11px] truncate" style={{ color: 'var(--text-3)' }}>{title}</p>
          <p className="text-xs truncate" style={{ color: 'var(--text-1)' }}>
            {segment ? (
              <>
                <span className="font-semibold" style={{ color: colors.get(segment.speaker) }}>{speakerName(segment.speaker)}:</span> {segment.text}
              </>
            ) : 'Начало записи'}
          </p>
        </button>
        <PlayerClock media={player.media} duration={player.duration} />
        <button onClick={onClose} className="p-1 rounded-md shrink-0" style={{ color: 'var(--text-3)' }} title="Остановить и скрыть">
          <X size={14} />
        </button>
      </div>
      <div className="h-0.5" style={{ background: 'var(--border)' }}>
        <div ref={progressRef} className="h-full" style={{ background: 'var(--accent)' }} />
      </div>
    </div>,
    document.body
  )
}
