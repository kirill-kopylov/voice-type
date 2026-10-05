import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { runFfmpeg } from './ffmpeg'
import { audioPath } from './audio-storage'
import type { ScreenEvent } from '../../shared/types'

const VIDEO_DIR = 'meeting-videos'
const PENDING_FILE = '_recording.webm'

function videoDir(): string {
  const dir = path.join(app.getPath('userData'), VIDEO_DIR)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function videoPath(fileName: string): string {
  // Имя приходит снаружи (протокол, IPC): берём только последнюю часть, чтобы не выйти из папки
  return path.join(videoDir(), path.basename(fileName))
}

const pendingPath = (): string => path.join(videoDir(), PENDING_FILE)

/** Начало записи: пишем видео кусками на диск, пока встреча идёт. */
export function beginVideoRecording(): void {
  fs.writeFileSync(pendingPath(), Buffer.alloc(0))
}

export function appendVideoChunk(chunk: Buffer): void {
  fs.appendFileSync(pendingPath(), chunk)
}

function discardPendingVideo(): void {
  fs.rmSync(pendingPath(), { force: true })
}

/**
 * Склеивает записанное видео со звуком встречи в один файл без перекодирования.
 * Заодно ffmpeg пишет в файл длительность и индекс — иначе плеер не умеет перематывать.
 * Звук встречи при этом остаётся отдельным файлом: видео можно удалить, не трогая расшифровку.
 */
export async function saveMeetingVideo(meetingId: string, audioFileName: string, videoOffsetMs: number): Promise<string | null> {
  const pending = pendingPath()
  if (!fs.existsSync(pending) || fs.statSync(pending).size === 0) return null

  const fileName = `${meetingId}.webm`
  const offsetSec = (Math.abs(videoOffsetMs) / 1000).toFixed(3)
  // Сдвигаем тот поток, что стартовал раньше, чтобы времена не ушли в минус
  const [videoShift, audioShift] = videoOffsetMs >= 0 ? [offsetSec, '0'] : ['0', offsetSec]

  try {
    await runFfmpeg([
      '-y', '-hide_banner',
      '-itsoffset', videoShift, '-i', pending,
      '-itsoffset', audioShift, '-i', audioPath(audioFileName),
      '-map', '0:v:0', '-map', '1:a:0',
      '-c', 'copy',
      videoPath(fileName)
    ])
    return fileName
  } catch (error) {
    console.error('[video] Не удалось собрать видео встречи:', error instanceof Error ? error.message : error)
    return null
  } finally {
    discardPendingVideo()
  }
}

// События экрана живут рядом с видео и уходят вместе с ним: без картинки они никому не нужны
const eventsPath = (videoFileName: string): string => videoPath(videoFileName.replace(/\.webm$/, '.events.json'))

export function saveEvents(videoFileName: string, events: ScreenEvent[]): void {
  if (events.length > 0) fs.writeFileSync(eventsPath(videoFileName), JSON.stringify(events), 'utf-8')
}

export function loadEvents(videoFileName: string): ScreenEvent[] {
  try {
    return JSON.parse(fs.readFileSync(eventsPath(videoFileName), 'utf-8')) as ScreenEvent[]
  } catch {
    return []
  }
}

export function deleteVideo(fileName: string): void {
  fs.rmSync(videoPath(fileName), { force: true })
  fs.rmSync(eventsPath(fileName), { force: true })
}
