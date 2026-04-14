import { spawn } from 'child_process'
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import ffmpegStaticPath from 'ffmpeg-static'

// В production asar упакован, ffmpeg распакован в .unpacked
const ffmpegPath = ffmpegStaticPath?.replace('app.asar', 'app.asar.unpacked') ?? null

interface SpeakerSegment {
  start: number
  end: number
}

// API: known_speaker_references — каждый между 2 и 10 секунд.
// Берём ~8с лучших сегментов.
const MAX_DURATION_SEC = 8
const MIN_DURATION_SEC = 2

/**
 * Извлекает аудио конкретного спикера из webm-файла, склеивает в WAV.
 * Делается в main process через ffmpeg — стабильнее и не валит renderer.
 *
 * Возвращает WAV (моно 16kHz) или null если аудио меньше минимума.
 */
export async function extractSpeakerSegments(
  webmBuffer: Buffer,
  segments: SpeakerSegment[]
): Promise<Buffer | null> {
  if (!ffmpegPath) {
    console.error('[extract-speaker] ffmpeg-static не найден')
    return null
  }
  if (segments.length === 0) return null

  // Отбираем сегменты до лимита по длительности
  let totalSec = 0
  const picked: SpeakerSegment[] = []
  for (const seg of segments) {
    const dur = seg.end - seg.start
    if (dur < 0.3) continue
    if (totalSec + dur > MAX_DURATION_SEC) {
      const remaining = MAX_DURATION_SEC - totalSec
      if (remaining < 1) break
      picked.push({ start: seg.start, end: seg.start + remaining })
      totalSec = MAX_DURATION_SEC
      break
    }
    picked.push(seg)
    totalSec += dur
  }

  if (totalSec < MIN_DURATION_SEC) {
    console.warn(`[extract-speaker] мало аудио: ${totalSec.toFixed(1)}с`)
    return null
  }

  const tmpDir = join(tmpdir(), 'voice-type-extract')
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })

  const inputPath = join(tmpDir, `in-${randomUUID()}.webm`)
  const outputPath = join(tmpDir, `out-${randomUUID()}.wav`)

  try {
    writeFileSync(inputPath, webmBuffer)

    // Формируем фильтр: trim каждого сегмента + concat
    const trims = picked
      .map((s, i) => `[0:a]atrim=start=${s.start.toFixed(3)}:end=${s.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`)
      .join(';')
    const concatLabels = picked.map((_, i) => `[a${i}]`).join('')
    const filter = `${trims};${concatLabels}concat=n=${picked.length}:v=0:a=1[out]`

    await runFfmpeg([
      '-y',
      '-i', inputPath,
      '-filter_complex', filter,
      '-map', '[out]',
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      outputPath
    ])

    const wav = readFileSync(outputPath)
    return wav
  } catch (err) {
    console.error('[extract-speaker] ffmpeg ошибка:', err)
    return null
  } finally {
    try { unlinkSync(inputPath) } catch {}
    try { unlinkSync(outputPath) } catch {}
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath as string, args)
    let stderr = ''
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`))
    })
  })
}
