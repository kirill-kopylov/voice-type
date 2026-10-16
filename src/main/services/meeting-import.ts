import fs from 'fs'
import path from 'path'
import { runFfmpeg } from './ffmpeg'
import { probeMedia } from './media-info'
import { audioPath, deleteAudio } from './audio-storage'
import { deleteVideo, videoPath } from './video-storage'

// Что предлагать в окне выбора файла; перетащить можно любой файл — ffmpeg разберётся сам
export const MEETING_MEDIA_EXTENSIONS = [
  'mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'wmv', 'flv', '3gp', 'ts',
  'mp3', 'm4a', 'wav', 'ogg', 'oga', 'opus', 'flac', 'aac', 'wma', 'amr'
]

// Контейнеры, которые плеер приложения (Chromium) открывает сам; у остальных берём только звук
const PLAYABLE_VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.mov', '.webm', '.mkv'])

export interface ImportedMedia {
  audioFileName: string
  videoFileName?: string
  durationMs: number
  /** Когда файл дописан — момент окончания встречи, как у записанных приложением */
  createdAt: string
}

/**
 * Готовая запись (видео или аудио) становится материалом встречи. Звук перекодируется в opus/webm,
 * как у записанных приложением встреч, — с ним работают плеер, расшифровка и профили голосов.
 * Видео копируется: встреча не должна зависеть от того, что станет с исходным файлом.
 */
export async function importMeetingMedia(id: string, sourcePath: string): Promise<ImportedMedia> {
  const source = await probeMedia(sourcePath).catch(() => null)
  if (!source) throw new Error('не открывается как видео или аудио')
  if (!source.hasAudio) throw new Error('в файле нет звука')

  const extension = path.extname(sourcePath).toLowerCase()
  const audioFileName = `${id}.webm`
  const videoFileName = source.hasVideo && PLAYABLE_VIDEO_EXTENSIONS.has(extension) ? `${id}${extension}` : undefined

  try {
    await runFfmpeg([
      '-y', '-hide_banner',
      '-i', sourcePath,
      '-map', '0:a:0',
      '-c:a', 'libopus', '-b:a', '48k', '-ac', '1',
      audioPath(audioFileName)
    ])
    if (videoFileName) await fs.promises.copyFile(sourcePath, videoPath(videoFileName))

    // Длительность — по извлечённому звуку: в нём она есть всегда, а у исходника может не быть
    const { durationMs } = await probeMedia(audioPath(audioFileName))
    const { mtime } = await fs.promises.stat(sourcePath)
    return { audioFileName, videoFileName, durationMs: durationMs ?? 0, createdAt: mtime.toISOString() }
  } catch (error) {
    deleteAudio(audioFileName)
    if (videoFileName) deleteVideo(videoFileName)
    throw error
  }
}
