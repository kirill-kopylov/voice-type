import { useCallback, useEffect, useRef, useState } from 'react'

export const meetingVideoUrl = (fileName: string): string => `voicetype-media://video/${encodeURIComponent(fileName)}`

export interface MeetingVideo {
  videoRef: React.RefObject<HTMLVideoElement>
  onPause: () => void
  /** Индекс реплики, которая сейчас проигрывается на видео */
  playingLine: number | null
  playLine: (index: number, start: number, end: number) => void
  pause: () => void
}

/**
 * Управление видеоплеером встречи: проиграть кусок видео по реплике и остановиться в её конце.
 * Время видео совпадает со временем встречи — при сохранении оно склеено со звуком с учётом сдвига старта.
 */
export function useMeetingVideo(): MeetingVideo {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playingLine, setPlayingLine] = useState<number | null>(null)
  const frameRef = useRef(0)

  const stopWatchingEnd = (): void => cancelAnimationFrame(frameRef.current)

  useEffect(() => stopWatchingEnd, [])

  // Пауза кнопкой самого плеера тоже снимает отметку «играет реплика»
  const onPause = useCallback((): void => setPlayingLine(null), [])

  const pause = useCallback((): void => {
    stopWatchingEnd()
    videoRef.current?.pause()
    setPlayingLine(null)
  }, [])

  const playLine = useCallback((index: number, start: number, end: number): void => {
    const video = videoRef.current
    if (!video) return
    if (playingLine === index) return pause()

    stopWatchingEnd()
    video.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    video.currentTime = start
    void video.play().then(() => {
      setPlayingLine(index)
      const watchEnd = (): void => {
        if (video.paused) return
        if (video.currentTime >= end) return pause()
        frameRef.current = requestAnimationFrame(watchEnd)
      }
      frameRef.current = requestAnimationFrame(watchEnd)
    })
  }, [playingLine, pause])

  return { videoRef, onPause, playingLine, playLine, pause }
}
