import { useCallback, useEffect, useRef, useState } from 'react'

/** Что сейчас звучит: вся запись или реплика с таким индексом */
export type PlayTarget = 'all' | number

export interface MeetingAudio {
  loading: boolean
  playing: PlayTarget | null
  toggleAll: () => void
  toggleRange: (index: number, start: number, end: number) => void
  stop: () => void
}

/**
 * Один аудиоэлемент на встречу: целиком или отрезком [start, end] (реплика диалога).
 * Файл грузится при первом нажатии и дальше переиспользуется.
 */
export function useMeetingAudio(fileName: string): MeetingAudio {
  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState<PlayTarget | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const frameRef = useRef(0)

  const stopWatchingEnd = (): void => cancelAnimationFrame(frameRef.current)

  useEffect(() => () => {
    stopWatchingEnd()
    audioRef.current?.pause()
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
  }, [])

  const getAudio = useCallback(async (): Promise<HTMLAudioElement | null> => {
    if (audioRef.current) return audioRef.current
    setLoading(true)
    const buffer = await window.api.getMeetingAudio(fileName)
    setLoading(false)
    if (!buffer) return null

    const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/webm' }))
    urlRef.current = url
    const audio = new Audio(url)
    audio.onended = () => setPlaying(null)
    audioRef.current = audio
    await unlockSeeking(audio)
    return audio
  }, [fileName])

  const play = useCallback(async (target: PlayTarget, start: number, end: number | null): Promise<void> => {
    const audio = await getAudio()
    if (!audio) return
    stopWatchingEnd()
    audio.currentTime = start
    await audio.play()
    setPlaying(target)

    if (end === null) return
    const watchEnd = (): void => {
      if (audio.paused) return
      if (audio.currentTime >= end) {
        audio.pause()
        setPlaying(null)
        return
      }
      frameRef.current = requestAnimationFrame(watchEnd)
    }
    frameRef.current = requestAnimationFrame(watchEnd)
  }, [getAudio])

  const stop = useCallback((): void => {
    stopWatchingEnd()
    audioRef.current?.pause()
    setPlaying(null)
  }, [])

  const toggleAll = useCallback((): void => {
    if (playing === 'all') return stop()
    void play('all', audioRef.current?.currentTime ?? 0, null)
  }, [playing, play, stop])

  const toggleRange = useCallback((index: number, start: number, end: number): void => {
    if (playing === index) return stop()
    void play(index, start, end)
  }, [playing, play, stop])

  return { loading, playing, toggleAll, toggleRange, stop }
}

/**
 * Запись MediaRecorder — webm без индекса: длительность Infinity, перемотка не работает.
 * Прыжок в «бесконечность» заставляет Chromium просканировать файл и узнать длительность.
 */
async function unlockSeeking(audio: HTMLAudioElement): Promise<void> {
  await new Promise<void>((resolve) => {
    audio.addEventListener('loadedmetadata', () => resolve(), { once: true })
    audio.addEventListener('error', () => resolve(), { once: true })
  })
  if (audio.duration !== Infinity) return

  await new Promise<void>((resolve) => {
    audio.addEventListener('timeupdate', () => {
      audio.currentTime = 0
      resolve()
    }, { once: true })
    audio.currentTime = 1e101
  })
}
