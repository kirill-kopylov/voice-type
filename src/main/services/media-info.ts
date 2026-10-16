import { runFfmpeg } from './ffmpeg'

export interface MediaInfo {
  /** null — контейнер не знает длительности (так у webm из MediaRecorder) */
  durationMs: number | null
  hasAudio: boolean
  /** Настоящий видеопоток: обложка mp3/m4a (attached pic) видео не считается */
  hasVideo: boolean
}

/** Разбирает описание входного файла, которое ffmpeg пишет в stderr. */
export function parseMediaInfo(stderr: string): MediaInfo {
  // Следом ffmpeg описывает выход, и там тоже есть строки Stream — берём только вход
  const input = stderr.split(/^Output #0/m)[0]
  const streams = input.split('\n').filter((line) => /^\s*Stream #\d+:\d+/.test(line))
  const duration = input.match(/Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/)

  return {
    durationMs: duration
      ? Math.round(((Number(duration[1]) * 60 + Number(duration[2])) * 60 + Number(duration[3])) * 1000)
      : null,
    hasAudio: streams.some((line) => line.includes(': Audio:')),
    hasVideo: streams.some((line) => line.includes(': Video:') && !line.includes('(attached pic)'))
  }
}

/** Что внутри файла. Не медиафайл — ошибка ffmpeg. */
export async function probeMedia(filePath: string): Promise<MediaInfo> {
  // Выход ffmetadata пустой: ffmpeg описывает вход и завершается без ошибки, ничего не перекодируя
  return parseMediaInfo(await runFfmpeg(['-hide_banner', '-i', filePath, '-f', 'ffmetadata', '-']))
}
