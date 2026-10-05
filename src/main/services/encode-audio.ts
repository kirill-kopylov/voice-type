import { writeFileSync, readFileSync, readdirSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { runFfmpeg } from './ffmpeg'

/**
 * Перекодирует запись встречи (webm из MediaRecorder) в mp3, моно 16 кГц, и режет её на куски по chunkSec секунд.
 * Не opus: ogg/opus из webm встреч провайдер STT отвергает с 400, тот же звук в mp3/wav проходит.
 * Перекодирование надёжнее копирования потока: в webm из MediaRecorder нет индекса и длительности.
 */
export async function encodeMp3Chunks(webmBuffer: Buffer, chunkSec?: number): Promise<Buffer[]> {
  const workDir = join(tmpdir(), 'voice-type-encode', randomUUID())
  mkdirSync(workDir, { recursive: true })

  try {
    const inputPath = join(workDir, 'in.webm')
    writeFileSync(inputPath, webmBuffer)
    await runFfmpeg([
      '-y', '-hide_banner',
      '-i', inputPath,
      '-vn',
      '-c:a', 'libmp3lame',
      '-b:a', '48k',
      '-ar', '16000',
      '-ac', '1',
      ...(chunkSec ? ['-f', 'segment', '-segment_time', String(chunkSec), '-reset_timestamps', '1'] : []),
      join(workDir, 'out-%03d.mp3')
    ])
    return readdirSync(workDir)
      .filter((name) => name.startsWith('out-'))
      .sort()
      .map((name) => readFileSync(join(workDir, name)))
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}
