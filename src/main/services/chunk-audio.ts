import { spawn } from 'child_process'
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import ffmpegStaticPath from 'ffmpeg-static'

const ffmpegPath = ffmpegStaticPath?.replace('app.asar', 'app.asar.unpacked') ?? null

export interface AudioChunk {
  buffer: Buffer
  startSec: number
  endSec: number
}

interface SilenceRange {
  start: number
  end: number
}

// Лимит модели gpt-4o-transcribe-diarize — 1400с. Берём с запасом.
const MAX_CHUNK_SEC = 1380
// Минимальный размер куска — чтобы не плодить крошечные.
const MIN_CHUNK_SEC = 120
// Порог тишины для поиска точки реза.
const SILENCE_THRESHOLD_DB = -35
const SILENCE_MIN_DURATION = 0.4

/**
 * Режет webm на куски длиной ≤ maxChunkSec, стараясь резать по ближайшей тишине.
 * Если тишина не найдена в допустимом окне — режет жёстко.
 */
export async function chunkWebmBySilence(
  webmBuffer: Buffer,
  maxChunkSec: number = MAX_CHUNK_SEC
): Promise<AudioChunk[]> {
  if (!ffmpegPath) throw new Error('ffmpeg-static не найден')

  const tmpDir = join(tmpdir(), 'voice-type-chunk')
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })

  const inputPath = join(tmpDir, `in-${randomUUID()}.webm`)
  writeFileSync(inputPath, webmBuffer)

  try {
    const { duration, silences } = await analyzeAudio(inputPath)
    console.log(`[chunk] Длительность ${duration.toFixed(1)}с, тишин найдено: ${silences.length}`)

    if (duration <= maxChunkSec) {
      return [{ buffer: webmBuffer, startSec: 0, endSec: duration }]
    }

    const splitPoints = computeSplitPoints(duration, silences, maxChunkSec)
    console.log(`[chunk] Точки реза: ${splitPoints.map((n) => n.toFixed(1)).join(', ')}`)

    const chunks: AudioChunk[] = []
    let cursor = 0
    for (const point of [...splitPoints, duration]) {
      const chunkPath = join(tmpDir, `chunk-${randomUUID()}.webm`)
      try {
        await extractChunk(inputPath, chunkPath, cursor, point)
        chunks.push({ buffer: readFileSync(chunkPath), startSec: cursor, endSec: point })
      } finally {
        try { unlinkSync(chunkPath) } catch {}
      }
      cursor = point
    }

    return chunks
  } finally {
    try { unlinkSync(inputPath) } catch {}
  }
}

async function analyzeAudio(inputPath: string): Promise<{ duration: number; silences: SilenceRange[] }> {
  const stderr = await runFfmpegCapture([
    '-hide_banner',
    '-i', inputPath,
    '-af', `silencedetect=noise=${SILENCE_THRESHOLD_DB}dB:d=${SILENCE_MIN_DURATION}`,
    '-f', 'null',
    '-'
  ])

  const silences: SilenceRange[] = []
  let pendingStart: number | null = null
  for (const line of stderr.split('\n')) {
    const ms = line.match(/silence_start:\s*([\d.]+)/)
    if (ms) { pendingStart = parseFloat(ms[1]); continue }
    const me = line.match(/silence_end:\s*([\d.]+)/)
    if (me && pendingStart !== null) {
      silences.push({ start: pendingStart, end: parseFloat(me[1]) })
      pendingStart = null
    }
  }

  // Длительность: ищем последний "time=HH:MM:SS.xx" из прогресса или Duration из шапки
  let duration = 0
  const durHeader = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/)
  if (durHeader) {
    duration = parseInt(durHeader[1]) * 3600 + parseInt(durHeader[2]) * 60 + parseFloat(durHeader[3])
  }
  const timeMatches = [...stderr.matchAll(/time=(\d+):(\d+):([\d.]+)/g)]
  if (timeMatches.length > 0) {
    const last = timeMatches[timeMatches.length - 1]
    const t = parseInt(last[1]) * 3600 + parseInt(last[2]) * 60 + parseFloat(last[3])
    if (t > duration) duration = t
  }

  return { duration, silences }
}

function computeSplitPoints(duration: number, silences: SilenceRange[], maxChunkSec: number): number[] {
  const points: number[] = []
  let cursor = 0

  while (duration - cursor > maxChunkSec) {
    const target = cursor + maxChunkSec
    const minAcceptable = cursor + MIN_CHUNK_SEC

    // Ищем ближайшую тишину, середина которой в [minAcceptable, target].
    // Предпочитаем ту, что ближе к target (= куски длиннее, меньше резов).
    let best: number | null = null
    for (const s of silences) {
      const mid = (s.start + s.end) / 2
      if (mid >= minAcceptable && mid <= target) {
        if (best === null || mid > best) best = mid
      }
    }

    const splitAt = best ?? target
    points.push(splitAt)
    cursor = splitAt
  }

  return points
}

async function extractChunk(input: string, output: string, startSec: number, endSec: number): Promise<void> {
  // Re-encode в opus — надёжнее, чем -c copy для webm из MediaRecorder
  // (keyframe alignment, timestamps).
  await runFfmpegCapture([
    '-y', '-hide_banner',
    '-ss', startSec.toFixed(3),
    '-to', endSec.toFixed(3),
    '-i', input,
    '-vn',
    '-c:a', 'libopus',
    '-b:a', '64k',
    '-ar', '48000',
    '-ac', '1',
    output
  ])
}

function runFfmpegCapture(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath as string, args)
    let stderr = ''
    proc.stderr.on('data', (c) => { stderr += c.toString() })
    proc.on('error', reject)
    proc.on('close', (code) => {
      // ffmpeg с -f null - завершается 0 если всё ок, иначе ненулевым
      if (code === 0 || code === null) resolve(stderr)
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`))
    })
  })
}
