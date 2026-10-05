import fs from 'fs'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'
import { runFfmpeg } from './ffmpeg'
import { frameTimes, pickDistinctFrames, type FrameCandidate } from '../mcp/frame-selection'

const SIGNATURE_WIDTH = 32
const SIGNATURE_HEIGHT = 18
// Одновременно запущенных ffmpeg: быстрее последовательного, но не душит машину
const PARALLEL_EXTRACTIONS = 4
// Сколько кадров-кандидатов снимаем на один нужный, чтобы было из чего выбрать разные
const CANDIDATES_PER_FRAME = 3
const MAX_CANDIDATES = 60

export interface VideoFrame {
  atSec: number
  jpeg: Buffer
}

export interface FramesRequest {
  fromSec: number
  toSec: number
  count: number
  skipSimilar: boolean
  maxWidth: number
}

export interface FramesResult {
  frames: VideoFrame[]
  /** Сколько кадров отброшено как почти одинаковые */
  skippedSimilar: number
}

interface ExtractedFrame extends FrameCandidate {
  jpeg: Buffer
}

/** Один кадр на момент atSec: картинка JPEG и уменьшенный серый отпечаток для сравнения. null — момента нет в видео. */
async function extractFrame(videoFile: string, atSec: number, maxWidth: number, workDir: string): Promise<ExtractedFrame | null> {
  const id = randomUUID()
  const jpegPath = path.join(workDir, `${id}.jpg`)
  const signaturePath = path.join(workDir, `${id}.raw`)

  await runFfmpeg([
    '-y', '-hide_banner',
    '-ss', String(atSec), '-i', videoFile,
    '-filter_complex',
    `[0:v]split=2[a][b];[a]scale='min(${maxWidth},iw)':-2[full];[b]scale=${SIGNATURE_WIDTH}:${SIGNATURE_HEIGHT},format=gray[small]`,
    '-map', '[full]', '-frames:v', '1', '-q:v', '4', jpegPath,
    '-map', '[small]', '-frames:v', '1', '-f', 'rawvideo', signaturePath
  ])
  if (!fs.existsSync(jpegPath) || !fs.existsSync(signaturePath)) return null

  return { atSec, jpeg: fs.readFileSync(jpegPath), signature: new Uint8Array(fs.readFileSync(signaturePath)) }
}

export async function extractFrames(videoFile: string, request: FramesRequest): Promise<FramesResult> {
  const { fromSec, toSec, count, skipSimilar, maxWidth } = request
  const candidateCount = skipSimilar ? Math.min(count * CANDIDATES_PER_FRAME, MAX_CANDIDATES) : count
  const times = frameTimes(fromSec, toSec, candidateCount)

  const workDir = path.join(os.tmpdir(), 'voice-type-frames', randomUUID())
  fs.mkdirSync(workDir, { recursive: true })
  try {
    const extracted: ExtractedFrame[] = []
    for (let i = 0; i < times.length; i += PARALLEL_EXTRACTIONS) {
      const batch = await Promise.all(times.slice(i, i + PARALLEL_EXTRACTIONS).map((t) => extractFrame(videoFile, t, maxWidth, workDir)))
      extracted.push(...batch.filter((frame): frame is ExtractedFrame => frame !== null))
    }

    const picked = skipSimilar ? pickDistinctFrames(extracted, count) : extracted
    return {
      frames: picked.map(({ atSec, jpeg }) => ({ atSec, jpeg })),
      skippedSimilar: skipSimilar ? extracted.length - picked.length : 0
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
}
