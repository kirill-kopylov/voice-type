import { useEffect, useRef } from 'react'
import { AlertCircle } from 'lucide-react'
import { meetingLevels } from '../utils/audio-levels'

const SMOOTHING = 0.35

/** Два индикатора записи встречи: ваш микрофон и звук компьютера (коллеги). */
export function MeetingLevelMeter(): JSX.Element {
  const micRef = useRef<HTMLDivElement>(null)
  const systemRef = useRef<HTMLDivElement>(null)
  const warningRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let frame = 0
    let mic = 0
    let system = 0

    const tick = (): void => {
      const levels = meetingLevels.get()
      mic += (levels.mic - mic) * SMOOTHING
      system += (levels.system - system) * SMOOTHING
      if (micRef.current) micRef.current.style.transform = `scaleX(${mic})`
      if (systemRef.current) systemRef.current.style.transform = `scaleX(${system})`
      if (warningRef.current) warningRef.current.style.display = levels.systemCaptured ? 'none' : 'flex'
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="space-y-1.5 min-w-[220px]">
      <LevelRow label="Вы" fillRef={micRef} />
      <LevelRow label="Коллеги" fillRef={systemRef} />
      <div ref={warningRef} className="items-center gap-1 text-[11px]" style={{ display: 'none', color: '#fca5a5' }}>
        <AlertCircle size={11} /> Звук компьютера не захвачен — коллег в записи не будет
      </div>
    </div>
  )
}

function LevelRow({ label, fillRef }: { label: string; fillRef: React.RefObject<HTMLDivElement> }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-[11px]" style={{ color: 'var(--text-3)' }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--accent-bg)' }}>
        <div ref={fillRef} className="h-full w-full rounded-full origin-left" style={{ background: 'var(--accent)', transform: 'scaleX(0)' }} />
      </div>
    </div>
  )
}
