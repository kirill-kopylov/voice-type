// Запись экрана для встречи: потоки мониторов → канвас по плану раскладки → MediaRecorder → куски в main.
import { planScreenRecording, type ScreenPlan } from '@shared/screen-layout'
import type { ScreenCaptureMode } from '@shared/types'

export const VIDEO_FPS = 16
const VIDEO_BITS_PER_SECOND = 4_000_000
const CHUNK_INTERVAL_MS = 2000
const VIDEO_MIME_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']

/**
 * План записи по настройке. Для области сначала просит выделить её мышью.
 * null — снимать нечего (выключено, область не выбрана).
 */
export async function planFromMode(mode: ScreenCaptureMode): Promise<ScreenPlan | null> {
  if (mode === 'off') return null
  const displays = await window.api.getScreenDisplays()
  const region = mode === 'region' ? await window.api.selectScreenRegion() : null
  return planScreenRecording(mode, displays, region)
}

export interface DisplayStreams {
  /** Системный звук, если запрошен и получен */
  systemAudio: MediaStream | null
  /** Потоки мониторов по слоям плана, в том же порядке */
  layerStreams: MediaStream[]
  /** Всё, что нужно остановить по окончании встречи */
  allStreams: MediaStream[]
  /** Видео не удалось включить — звук при этом записывается */
  videoFailed: boolean
}

async function openDisplayStream(displayId: string, withAudio: boolean): Promise<MediaStream> {
  await window.api.selectCaptureSource(displayId)
  return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: VIDEO_FPS }, audio: withAudio })
}

/**
 * Открывает мониторы под план и системный звук. Звук берётся с первого потока:
 * loopback один на всю систему. Если видео не открылось — пробуем получить хотя бы звук.
 */
export async function openDisplayStreams(plan: ScreenPlan | null, captureSystemAudio: boolean): Promise<DisplayStreams> {
  if (plan) {
    try {
      return await openForPlan(plan, captureSystemAudio)
    } catch (error) {
      console.warn('Экран не захвачен:', error)
      return { ...(await openAudioOnly(captureSystemAudio)), videoFailed: true }
    }
  }
  return { ...(await openAudioOnly(captureSystemAudio)), videoFailed: false }
}

async function openForPlan(plan: ScreenPlan, captureSystemAudio: boolean): Promise<DisplayStreams> {
  const layerStreams: MediaStream[] = []
  try {
    for (const [index, layer] of plan.layers.entries()) {
      layerStreams.push(await openDisplayStream(layer.displayId, captureSystemAudio && index === 0))
    }
  } catch (error) {
    layerStreams.forEach(stopStream)
    throw error
  }
  const audioTracks = layerStreams[0].getAudioTracks()
  return {
    systemAudio: audioTracks.length > 0 ? new MediaStream(audioTracks) : null,
    layerStreams,
    allStreams: layerStreams,
    videoFailed: false
  }
}

/** Без видео: поток монитора нужен только ради системного звука, картинку выбрасываем. */
async function openAudioOnly(captureSystemAudio: boolean): Promise<Omit<DisplayStreams, 'videoFailed'>> {
  const none = { systemAudio: null, layerStreams: [], allStreams: [] }
  if (!captureSystemAudio) return none

  const displays = await window.api.getScreenDisplays()
  const display = displays.find((d) => d.primary) ?? displays[0]
  if (!display) return none

  try {
    const stream = await openDisplayStream(display.id, true)
    stream.getVideoTracks().forEach((track) => track.stop())
    const audioTracks = stream.getAudioTracks()
    return {
      systemAudio: audioTracks.length > 0 ? new MediaStream(audioTracks) : null,
      layerStreams: [],
      allStreams: [stream]
    }
  } catch (error) {
    console.warn('Системный звук не захвачен:', error)
    return none
  }
}

export const stopStream = (stream: MediaStream): void => stream.getTracks().forEach((track) => track.stop())

export interface ScreenRecorder {
  /** Запускает запись; возвращает момент старта (мс), чтобы сверить с началом аудио */
  start: () => number
  /** Останавливает и дожидается, пока все куски видео уйдут в main */
  stop: () => Promise<void>
}

async function playMuted(stream: MediaStream): Promise<HTMLVideoElement> {
  const video = document.createElement('video')
  video.muted = true
  video.srcObject = stream
  await video.play()
  return video
}

export async function createScreenRecorder(plan: ScreenPlan, layerStreams: MediaStream[]): Promise<ScreenRecorder> {
  const canvas = document.createElement('canvas')
  canvas.width = plan.width
  canvas.height = plan.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Канвас недоступен')

  const videos = await Promise.all(layerStreams.map(playMuted))

  const drawFrame = (): void => {
    plan.layers.forEach((layer, index) => {
      const video = videos[index]
      // Размер потока в пикселях ↔ размер монитора в DIP: переводим выбранную часть в пиксели потока
      const toStreamX = video.videoWidth / layer.displaySize.width
      const toStreamY = video.videoHeight / layer.displaySize.height
      context.drawImage(
        video,
        layer.source.x * toStreamX, layer.source.y * toStreamY, layer.source.width * toStreamX, layer.source.height * toStreamY,
        layer.target.x, layer.target.y, layer.target.width, layer.target.height
      )
    })
  }
  drawFrame()

  const mimeType = VIDEO_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
  const recorder = new MediaRecorder(canvas.captureStream(VIDEO_FPS), { mimeType, videoBitsPerSecond: VIDEO_BITS_PER_SECOND })

  await window.api.beginVideoUpload()
  // Куски уходят строго по порядку: следующий ждёт предыдущий
  let uploads = Promise.resolve()
  recorder.ondataavailable = (event) => {
    if (event.data.size === 0) return
    uploads = uploads.then(async () => window.api.sendVideoChunk(await event.data.arrayBuffer()))
  }

  let drawTimer: number | null = null
  return {
    start: () => {
      drawTimer = window.setInterval(drawFrame, 1000 / VIDEO_FPS)
      recorder.start(CHUNK_INTERVAL_MS)
      return Date.now()
    },
    stop: async () => {
      if (drawTimer !== null) window.clearInterval(drawTimer)
      if (recorder.state !== 'inactive') {
        await new Promise<void>((resolve) => {
          recorder.onstop = () => resolve()
          recorder.stop()
        })
      }
      await uploads
      videos.forEach((video) => { video.srcObject = null })
    }
  }
}
