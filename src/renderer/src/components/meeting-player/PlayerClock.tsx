import { formatClock } from '@shared/meeting-timeline'
import { useMediaValue } from '../../hooks/useMediaPlayer'

/** «12:04 / 45:30» — перерисовывается раз в секунду записи. */
export function PlayerClock({ media, duration }: { media: HTMLMediaElement | null; duration: number }): JSX.Element {
  const second = useMediaValue(media, (timeSec) => Math.floor(timeSec))
  return (
    <span className="text-xs tabular-nums whitespace-nowrap px-1" style={{ color: 'var(--text-2)' }}>
      {formatClock(second)} <span style={{ color: 'var(--text-4)' }}>/ {formatClock(duration)}</span>
    </span>
  )
}
