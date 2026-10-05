import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { runFfmpeg } from './ffmpeg'

/**
 * Перекодирует запись встречи (webm из MediaRecorder) в mp3, моно 16 кГц.
 * Не opus: ogg/opus из webm встреч провайдер STT отвергает с 400, тот же звук в mp3/wav проходит.
 * Перекодирование надёжнее копирования потока: в webm из MediaRecorder нет индекса и длительности.
 */
export async function encodeMp3(webmBuffer: Buffer): Promise<Buffer> {
  const tmpDir = join(tmpdir(), 'voice-type-encode')
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })

  const inputPath = join(tmpDir, `in-${randomUUID()}.webm`)
  const outputPath = join(tmpDir, `out-${randomUUID()}.mp3`)

  try {
    writeFileSync(inputPath, webmBuffer)
    await runFfmpeg([
      '-y', '-hide_banner',
      '-i', inputPath,
      '-vn',
      '-c:a', 'libmp3lame',
      '-b:a', '48k',
      '-ar', '16000',
      '-ac', '1',
      outputPath
    ])
    return readFileSync(outputPath)
  } finally {
    try { unlinkSync(inputPath) } catch {}
    try { unlinkSync(outputPath) } catch {}
  }
}
