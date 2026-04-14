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
// На входе берём с запасом (silenceremove потом ужмёт), на выходе обрезаем до 8с.
const MAX_INPUT_SEC = 25
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

  // Отбираем сегменты с запасом — silenceremove потом ужмёт.
  // Сортируем по длине: длинные сегменты обычно содержательнее.
  const sorted = [...segments]
    .filter((s) => s.end - s.start >= 0.5)
    .sort((a, b) => (b.end - b.start) - (a.end - a.start))

  let totalSec = 0
  const picked: SpeakerSegment[] = []
  for (const seg of sorted) {
    const dur = seg.end - seg.start
    picked.push(seg)
    totalSec += dur
    if (totalSec >= MAX_INPUT_SEC) break
  }
  // Обратно по времени — удобнее ffmpeg'у склеивать
  picked.sort((a, b) => a.start - b.start)

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

    // Берём с запасом по времени — потом silenceremove выкинет паузы
    const trims = picked
      .map((s, i) => `[0:a]atrim=start=${s.start.toFixed(3)}:end=${s.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`)
      .join(';')
    const concatLabels = picked.map((_, i) => `[a${i}]`).join('')

    // silenceremove: убираем тишину в начале, в конце и долгие паузы (>0.4с тише -35dB)
    // loudnorm: нормализация громкости — модели проще распознать
    const filter = `${trims};${concatLabels}concat=n=${picked.length}:v=0:a=1[joined];` +
      `[joined]silenceremove=start_periods=1:start_duration=0.1:start_threshold=-40dB:` +
      `stop_periods=-1:stop_duration=0.4:stop_threshold=-40dB,` +
      `loudnorm=I=-16:LRA=11:TP=-1.5[out]`

    await runFfmpeg([
      '-y',
      '-i', inputPath,
      '-filter_complex', filter,
      '-map', '[out]',
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      // ограничение по длительности на выходе — на случай если сегментов много
      '-t', String(MAX_DURATION_SEC),
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
