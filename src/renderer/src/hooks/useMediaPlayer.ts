import { useCallback, useEffect, useRef, useState } from 'react'

export type MediaKind = 'video' | 'audio'

export const meetingMediaUrl = (kind: MediaKind, fileName: string): string => `voicetype-media://${kind}/${encodeURIComponent(fileName)}`

export const PLAYBACK_RATES = [1, 1.25, 1.5, 2]

// Место, где остановился, — чтобы вернуться к встрече и смотреть дальше. Начало и самый конец не запоминаем
const POSITION_KEY = (meetingId: string): string => `meeting-position:${meetingId}`
const MIN_REMEMBERED_SEC = 5
const POSITION_SAVE_INTERVAL_MS = 5000

export interface MediaPlayer {
  media: HTMLMediaElement | null
  /** ref для <video>/<audio> */
  attach: (element: HTMLMediaElement | null) => void
  playing: boolean
  /** Хоть раз запускали — после этого плеер есть смысл показывать мини-версией */
  started: boolean
  rate: number
  duration: number
  /** Файл не открылся: удалён с диска или повреждён */
  failed: boolean
  /** Перейти к моменту; play — сразу играть оттуда */
  seek: (sec: number, play?: boolean) => void
  toggle: () => void
  skip: (deltaSec: number) => void
  cycleRate: () => void
}

/**
 * Один медиаэлемент встречи: видео, а без него — звук. Длительность — из файла,
 * пока она неизвестна (webm из MediaRecorder) — из записи встречи.
 */
export function useMediaPlayer(meetingId: string, fallbackDurationSec: number): MediaPlayer {
  const [media, setMedia] = useState<HTMLMediaElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [started, setStarted] = useState(false)
  const [rate, setRate] = useState(1)
  const [mediaDuration, setMediaDuration] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const lastSavedRef = useRef(0)

  useEffect(() => {
    if (!media) return
    const savePosition = (): void => {
      lastSavedRef.current = Date.now()
      const position = media.currentTime
      const end = Number.isFinite(media.duration) ? media.duration : fallbackDurationSec
      if (position > MIN_REMEMBERED_SEC && position < end - MIN_REMEMBERED_SEC) localStorage.setItem(POSITION_KEY(meetingId), String(position))
      else localStorage.removeItem(POSITION_KEY(meetingId))
    }
    const onPlay = (): void => { setPlaying(true); setStarted(true) }
    const onPause = (): void => { setPlaying(false); savePosition() }
    const onTimeUpdate = (): void => { if (Date.now() - lastSavedRef.current > POSITION_SAVE_INTERVAL_MS) savePosition() }
    const onRate = (): void => setRate(media.playbackRate)
    const onError = (): void => setFailed(true)
    const onDuration = (): void => setMediaDuration(Number.isFinite(media.duration) && media.duration > 0 ? media.duration : null)
    const onMetadata = async (): Promise<void> => {
      await unlockSeeking(media)
      onDuration()
      const saved = Number(localStorage.getItem(POSITION_KEY(meetingId)))
      if (saved > 0 && media.currentTime === 0) media.currentTime = saved
    }

    media.addEventListener('play', onPlay)
    media.addEventListener('pause', onPause)
    media.addEventListener('timeupdate', onTimeUpdate)
    media.addEventListener('ratechange', onRate)
    media.addEventListener('durationchange', onDuration)
    media.addEventListener('loadedmetadata', onMetadata)
    media.addEventListener('error', onError)
    if (media.readyState >= HTMLMediaElement.HAVE_METADATA) void onMetadata()
    if (media.error) onError()
    return () => {
      if (!media.paused) savePosition()
      media.removeEventListener('play', onPlay)
      media.removeEventListener('pause', onPause)
      media.removeEventListener('timeupdate', onTimeUpdate)
      media.removeEventListener('ratechange', onRate)
      media.removeEventListener('durationchange', onDuration)
      media.removeEventListener('loadedmetadata', onMetadata)
      media.removeEventListener('error', onError)
    }
  }, [media, meetingId, fallbackDurationSec])

  const duration = mediaDuration ?? fallbackDurationSec

  const seek = useCallback((sec: number, play = false): void => {
    if (!media) return
    media.currentTime = Math.min(Math.max(0, sec), duration)
    if (play) void media.play()
  }, [media, duration])

  const toggle = useCallback((): void => {
    if (!media) return
    if (media.paused) void media.play()
    else media.pause()
  }, [media])

  const skip = useCallback((deltaSec: number): void => {
    if (media) seek(media.currentTime + deltaSec)
  }, [media, seek])

  const cycleRate = useCallback((): void => {
    if (!media) return
    media.playbackRate = PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(media.playbackRate) + 1) % PLAYBACK_RATES.length]
  }, [media])

  return { media, attach: setMedia, playing, started, rate, duration, failed, seek, toggle, skip, cycleRate }
}

/**
 * Значение, зависящее от текущего момента записи: компонент перерисовывается, только когда значение меняется
 * (реплика сменилась, секунда прошла), а не на каждое событие плеера.
 */
export function useMediaValue<T>(media: HTMLMediaElement | null, select: (timeSec: number) => T): T {
  const selectRef = useRef(select)
  selectRef.current = select
  const [value, setValue] = useState(() => select(media?.currentTime ?? 0))

  const update = useCallback((): void => setValue(selectRef.current(media?.currentTime ?? 0)), [media])

  useEffect(() => {
    if (!media) return
    const events = ['timeupdate', 'seeking', 'seeked', 'loadedmetadata'] as const
    events.forEach((event) => media.addEventListener(event, update))
    return () => events.forEach((event) => media.removeEventListener(event, update))
  }, [media, update])

  // Входы select (реплики, главы) могли поменяться — пересчёт после каждой отрисовки; то же значение отрисовку не вызывает
  useEffect(update)

  return value
}

/**
 * Рисует положение записи прямо в DOM, минуя React: на каждом кадре, пока играет, и на каждую перемотку.
 * Так ползунок едет плавно, а компоненты не перерисовываются 60 раз в секунду.
 */
export function useMediaPaint(media: HTMLMediaElement | null, playing: boolean, paint: (timeSec: number) => void): void {
  const paintRef = useRef(paint)
  paintRef.current = paint

  useEffect(() => {
    if (!media) return
    const run = (): void => paintRef.current(media.currentTime)
    const events = ['seeking', 'timeupdate', 'durationchange', 'loadedmetadata'] as const
    events.forEach((event) => media.addEventListener(event, run))
    let frame = 0
    const tick = (): void => {
      run()
      frame = requestAnimationFrame(tick)
    }
    if (playing) frame = requestAnimationFrame(tick)
    else run()
    return () => {
      cancelAnimationFrame(frame)
      events.forEach((event) => media.removeEventListener(event, run))
    }
  }, [media, playing])

  // Главы и длительность могли поменяться — перерисовать с ними
  useEffect(() => {
    if (media) paintRef.current(media.currentTime)
  })
}

/**
 * Запись MediaRecorder — webm без индекса: длительность Infinity, перемотка не работает.
 * Прыжок в «бесконечность» заставляет Chromium просканировать файл и узнать длительность.
 */
export async function unlockSeeking(media: HTMLMediaElement): Promise<void> {
  if (media.duration !== Infinity) return
  await new Promise<void>((resolve) => {
    media.addEventListener('timeupdate', () => {
      media.currentTime = 0
      resolve()
    }, { once: true })
    media.currentTime = 1e101
  })
}
