import { useEffect, useRef, type RefObject } from 'react'
import { unlockSeeking } from '../../hooks/useMediaPlayer'

export const PREVIEW_WIDTH = 160
// Ближе этого нужный кадр уже нарисован — не перематываем ради долей секунды
const SAME_FRAME_SEC = 0.5

/**
 * Кадр под курсором на таймлайне: второй, невидимый плеер того же видео перематывается к моменту
 * и рисует кадр в canvas. Пока ищется один кадр, курсор может уйти дальше — тогда ищем следующий.
 */
export function useFramePreview(src: string | null, atSec: number | null): RefObject<HTMLCanvasElement> {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const wantedRef = useRef<number | null>(null)
  const drawnRef = useRef<number | null>(null)

  useEffect(() => {
    if (!src) return
    const video = document.createElement('video')
    video.muted = true
    video.preload = 'metadata'
    video.src = src

    const draw = (): void => {
      const canvas = canvasRef.current
      if (canvas && video.videoWidth > 0) {
        const height = Math.round(PREVIEW_WIDTH * video.videoHeight / video.videoWidth)
        if (canvas.height !== height) canvas.height = height
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
        drawnRef.current = video.currentTime
      }
      const wanted = wantedRef.current
      if (wanted !== null && Math.abs(wanted - video.currentTime) > SAME_FRAME_SEC) video.currentTime = wanted
    }

    video.addEventListener('seeked', draw)
    video.addEventListener('loadedmetadata', () => void unlockSeeking(video), { once: true })
    videoRef.current = video
    return () => {
      video.removeEventListener('seeked', draw)
      video.removeAttribute('src')
      video.load()
      videoRef.current = null
      drawnRef.current = null
    }
  }, [src])

  useEffect(() => {
    wantedRef.current = atSec
    const video = videoRef.current
    if (!video || atSec === null || video.seeking || video.readyState < HTMLMediaElement.HAVE_METADATA) return
    const drawn = drawnRef.current
    if (drawn === null || Math.abs(atSec - drawn) > SAME_FRAME_SEC) video.currentTime = atSec
  }, [atSec])

  return canvasRef
}
