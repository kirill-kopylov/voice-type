import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Play, Pause, RotateCcw, RotateCw, Subtitles, Maximize, Minimize, PictureInPicture2, StickyNote, AlertCircle } from 'lucide-react'
import type { DialogSegment, MeetingRecord } from '@shared/types'
import { captionIndexAt, captionText, indexAt, type ChapterRange } from '@shared/meeting-timeline'
import { meetingMediaUrl, useMediaValue, type MediaPlayer } from '../../hooks/useMediaPlayer'
import { PlayerTimeline, type TimelineMarker } from './PlayerTimeline'
import { PlayerClock } from './PlayerClock'
import { MiniPlayer } from './MiniPlayer'
import { OVERLAY_STYLE } from './overlay-style'
import { useAutoHide } from './useAutoHide'

interface Props {
  meeting: MeetingRecord
  player: MediaPlayer
  /** Реплики по времени */
  segments: DialogSegment[]
  /** Оглавление; пусто — встреча без глав */
  chapters: ChapterRange[]
  colors: Map<string, string>
  speakerName: (raw: string) => string
  markers: TimelineMarker[]
  matchTimes: number[]
  /** Пользователь хочет записать мысль к текущему моменту */
  onNoteAtMoment: (atSec: number) => void
}

const CAPTIONS_KEY = 'meeting-captions'
const SHORT_SKIP_SEC = 5
const LONG_SKIP_SEC = 15

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

export function MeetingPlayer({ meeting, player, segments, chapters, colors, speakerName, markers, matchTimes, onNoteAtMoment }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [captions, setCaptions] = useState(() => localStorage.getItem(CAPTIONS_KEY) !== 'off')
  const [inView, setInView] = useState(true)
  const [miniDismissed, setMiniDismissed] = useState(false)
  const [overControls, setOverControls] = useState(false)
  const { media, playing, duration } = player
  const { hidden: controlsHidden, wake: showControls } = useAutoHide(fullscreen && playing && !overControls)

  const videoSrc = meeting.videoFileName ? meetingMediaUrl('video', meeting.videoFileName) : null
  const timelineChapters = chapters.length > 0 ? chapters : [{ start: 0, end: duration, title: '' }]
  const chapterIndex = useMediaValue(media, (timeSec) => indexAt(chapters, timeSec))

  const toggleCaptions = (): void => {
    localStorage.setItem(CAPTIONS_KEY, captions ? 'off' : 'on')
    setCaptions(!captions)
  }

  const toggleFullscreen = (): void => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void containerRef.current?.requestFullscreen()
  }

  const togglePictureInPicture = (): void => {
    if (document.pictureInPictureElement) void document.exitPictureInPicture()
    else if (media instanceof HTMLVideoElement) void media.requestPictureInPicture()
  }

  const noteAtMoment = (): void => {
    if (!media) return
    media.pause()
    if (document.fullscreenElement) void document.exitFullscreen()
    onNoteAtMoment(media.currentTime)
  }

  useEffect(() => {
    const onChange = (): void => setFullscreen(document.fullscreenElement === containerRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // Плеер ушёл за край экрана, а запись идёт — показываем мини-плеер
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.2 })
    observer.observe(container)
    return () => observer.disconnect()
  }, [player.failed])

  useEffect(() => {
    if (playing) setMiniDismissed(false)
  }, [playing])

  // Клавиши как на YouTube; пока печатают в поле — не перехватываем
  const keysRef = useRef<Record<string, () => void>>({})
  keysRef.current = {
    Space: player.toggle,
    KeyK: player.toggle,
    ArrowLeft: () => player.skip(-SHORT_SKIP_SEC),
    ArrowRight: () => player.skip(SHORT_SKIP_SEC),
    KeyJ: () => player.skip(-LONG_SKIP_SEC),
    KeyL: () => player.skip(LONG_SKIP_SEC),
    KeyN: noteAtMoment,
    ...(videoSrc ? { KeyF: toggleFullscreen, KeyC: toggleCaptions } : {}),
    ...Object.fromEntries(Array.from({ length: 10 }, (_, digit) => [`Digit${digit}`, () => player.seek((duration * digit) / 10)]))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || isTyping(e.target)) return
      const action = keysRef.current[e.code]
      if (!action) return
      e.preventDefault()
      action()
      showControls()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showControls])

  if (player.failed) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs" style={{ background: 'var(--accent-bg)', color: 'var(--text-3)' }}>
        <AlertCircle size={13} /> Запись не открывается: файл удалён с диска или повреждён. Расшифровка ниже цела.
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-hidden ${fullscreen ? 'relative bg-black' : 'rounded-xl'}`}
      style={fullscreen ? undefined : { border: '1px solid var(--border)' }}
      onPointerMove={fullscreen ? showControls : undefined}
    >
      {videoSrc ? (
        <div className={`bg-black ${fullscreen ? 'absolute inset-0' : 'relative'}`}>
          <video
            ref={player.attach}
            src={videoSrc}
            preload="metadata"
            playsInline
            onClick={player.toggle}
            onDoubleClick={toggleFullscreen}
            className={`block w-full object-contain ${controlsHidden ? 'cursor-none' : 'cursor-pointer'} ${fullscreen ? 'h-full' : 'max-h-[460px]'}`}
          />
          {captions && <Captions media={media} segments={segments} colors={colors} speakerName={speakerName} large={fullscreen} />}
          {!playing && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
                <Play size={24} fill="white" color="white" className="ml-1" />
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <audio ref={player.attach} src={meetingMediaUrl('audio', meeting.audioFileName)} preload="metadata" />
          <AudioStage media={media} segments={segments} colors={colors} speakerName={speakerName} onClick={player.toggle} />
        </>
      )}

      {/* Во весь экран панель лежит поверх кадра и уезжает вниз — видео и субтитры не двигаются */}
      <div
        className={`px-3 pb-2 ${fullscreen ? 'absolute inset-x-0 bottom-0 transition-[opacity,transform] duration-200' : ''} ${controlsHidden ? 'opacity-0 translate-y-full pointer-events-none' : ''}`}
        style={fullscreen ? OVERLAY_STYLE : undefined}
        onPointerEnter={() => setOverControls(true)}
        onPointerLeave={() => setOverControls(false)}
      >
        <PlayerTimeline
          player={player}
          chapters={timelineChapters}
          segments={segments}
          colors={colors}
          speakerName={speakerName}
          markers={markers}
          matchTimes={matchTimes}
          previewSrc={videoSrc}
        />
        <div className="flex items-center gap-1 pt-1">
          <button
            onClick={player.toggle}
            className="w-8 h-8 mr-1 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95"
            style={{ background: 'var(--accent-bg-hover)', color: 'var(--accent-on-bg)' }}
            title={playing ? 'Пауза (K)' : 'Смотреть (K)'}
          >
            {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
          </button>
          <ControlButton title={`Назад на ${LONG_SKIP_SEC} с (J)`} onClick={() => player.skip(-LONG_SKIP_SEC)}><RotateCcw size={15} /></ControlButton>
          <ControlButton title={`Вперёд на ${LONG_SKIP_SEC} с (L)`} onClick={() => player.skip(LONG_SKIP_SEC)}><RotateCw size={15} /></ControlButton>
          <PlayerClock media={media} duration={duration} />
          {chapterIndex >= 0 && (
            <span className="ml-1 text-xs truncate min-w-0" style={{ color: 'var(--text-3)' }}>{chapters[chapterIndex].title}</span>
          )}

          <div className="ml-auto flex items-center gap-1 shrink-0">
            <ControlButton title="Заметка к этому моменту (N)" onClick={noteAtMoment}><StickyNote size={15} /></ControlButton>
            <ControlButton title="Скорость" onClick={player.cycleRate} active={player.rate !== 1}>
              <span className="text-xs font-semibold tabular-nums w-8">{player.rate}×</span>
            </ControlButton>
            {videoSrc && (
              <>
                <ControlButton title="Субтитры (C)" onClick={toggleCaptions} active={captions}><Subtitles size={15} /></ControlButton>
                <ControlButton title="Поверх всех окон" onClick={togglePictureInPicture}><PictureInPicture2 size={15} /></ControlButton>
                <ControlButton title={fullscreen ? 'Свернуть (F)' : 'Во весь экран (F)'} onClick={toggleFullscreen}>
                  {fullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
                </ControlButton>
              </>
            )}
          </div>
        </div>
      </div>

      {player.started && !inView && !miniDismissed && !fullscreen && (
        <MiniPlayer
          player={player}
          title={meeting.title}
          segments={segments}
          colors={colors}
          speakerName={speakerName}
          onReturn={() => containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          onClose={() => { media?.pause(); setMiniDismissed(true) }}
        />
      )}
    </div>
  )
}

function ControlButton({ title, onClick, active = false, children }: { title: string; onClick: () => void; active?: boolean; children: ReactNode }): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      className="h-8 min-w-8 px-1.5 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--accent-bg)]"
      style={{ color: active ? 'var(--accent)' : 'var(--text-2)' }}
    >
      {children}
    </button>
  )
}

interface CaptionProps {
  media: HTMLMediaElement | null
  segments: DialogSegment[]
  colors: Map<string, string>
  speakerName: (raw: string) => string
}

/** Субтитры поверх видео: кто говорит и строка реплики, которая звучит сейчас. */
function Captions({ media, segments, colors, speakerName, large }: CaptionProps & { large: boolean }): JSX.Element | null {
  const index = useMediaValue(media, (timeSec) => captionIndexAt(segments, timeSec))
  const text = useMediaValue(media, (timeSec) => (index >= 0 ? captionText(segments[index], timeSec) : ''))
  if (index < 0 || !text) return null

  const segment = segments[index]
  return (
    // Во весь экран — постоянно над местом панели управления, чтобы её появление их не двигало
    <div className={`absolute inset-x-0 bottom-0 px-6 flex justify-center pointer-events-none ${large ? 'pb-28' : 'pb-4'}`}>
      <p
        className={`max-w-[85%] text-center rounded-md px-3 py-1.5 leading-snug ${large ? 'text-2xl' : 'text-[15px]'}`}
        style={{ background: 'rgba(0,0,0,0.72)', color: '#fff' }}
      >
        <span className="font-semibold" style={{ color: colors.get(segment.speaker) }}>{speakerName(segment.speaker)}</span>{' '}
        {text}
      </p>
    </div>
  )
}

/** Записи без видео: вместо картинки крупно — кто говорит и что, строка за строкой. */
function AudioStage({ media, segments, colors, speakerName, onClick }: CaptionProps & { onClick: () => void }): JSX.Element {
  const index = useMediaValue(media, (timeSec) => indexAt(segments, timeSec))
  const live = useMediaValue(media, (timeSec) => captionIndexAt(segments, timeSec) >= 0)
  const shown = Math.max(index, 0)
  const text = useMediaValue(media, (timeSec) => (segments.length > 0 ? captionText(segments[shown], timeSec) : ''))

  if (segments.length === 0) {
    return (
      <div className="px-5 pt-6 pb-3 text-sm cursor-pointer" style={{ color: 'var(--text-3)' }} onClick={onClick}>
        Расшифровки пока нет — запись можно слушать.
      </div>
    )
  }

  const segment = segments[shown]
  const previous = index > 0 ? segments[index - 1] : null
  const next = segments[shown + 1]
  return (
    <div className="px-5 pt-5 pb-1 min-h-[132px] flex flex-col justify-end gap-1.5 cursor-pointer" onClick={onClick}>
      {previous && (
        <p className="text-xs truncate mb-1" style={{ color: 'var(--text-4)' }}>
          {speakerName(previous.speaker)}: {previous.text}
        </p>
      )}
      <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: colors.get(segment.speaker) }}>
        <span className="w-2 h-2 rounded-full" style={{ background: colors.get(segment.speaker) }} />
        {speakerName(segment.speaker)}
      </div>
      <p
        key={`${shown}-${text}`}
        className="text-xl leading-snug font-medium motion-safe:animate-rise-in transition-opacity"
        style={{ color: 'var(--text-1)', opacity: live || index < 0 ? 1 : 0.5 }}
      >
        {text}
      </p>
      <p className="text-xs truncate" style={{ color: 'var(--text-4)', visibility: next ? 'visible' : 'hidden' }}>
        {next && `Дальше — ${speakerName(next.speaker)}: ${next.text}`}
      </p>
    </div>
  )
}
