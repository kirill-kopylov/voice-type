import { writeFileSync, readFileSync, readdirSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { runFfmpeg } from './ffmpeg'

export interface Mp3Options {
  /** Резать на куски по столько секунд */
  chunkSec?: number
  /** Ускорение речи без смены тона: 1.2 — запись становится в 1.2 раза короче */
  tempo?: number
  bitrate?: string
}

/**
 * Перекодирует запись встречи (webm из MediaRecorder) в mp3, моно 16 кГц, при необходимости ускоряет и режет на куски.
 * Не opus: ogg/opus из webm встреч провайдер STT отвергает с 400, тот же звук в mp3/wav проходит.
 * Перекодирование надёжнее копирования потока: в webm из MediaRecorder нет индекса и длительности.
 */
export function encodeMp3Chunks(webmBuffer: Buffer, { chunkSec, tempo = 1, bitrate = '48k' }: Mp3Options = {}): Promise<Buffer[]> {
  return inWorkDir(async (workDir) => {
    const inputPath = join(workDir, 'in.webm')
    writeFileSync(inputPath, webmBuffer)
    await runFfmpeg([
      '-y', '-hide_banner',
      '-i', inputPath,
      '-vn',
      ...(tempo !== 1 ? ['-af', `atempo=${tempo}`] : []),
      '-c:a', 'libmp3lame',
      '-b:a', bitrate,
      '-ar', '16000',
      '-ac', '1',
      ...(chunkSec ? ['-f', 'segment', '-segment_time', String(chunkSec), '-reset_timestamps', '1'] : []),
      join(workDir, 'out-%03d.mp3')
    ])
    return readdirSync(workDir)
      .filter((name) => name.startsWith('out-'))
      .sort()
      .map((name) => readFileSync(join(workDir, name)))
  })
}

/** Любая запись (webm, ogg, mp3…) → сырые отсчёты float32, моно 16 кГц: так звук принимает локальное распознавание. */
export function decodePcm16k(audio: Buffer): Promise<Float32Array> {
  return inWorkDir(async (workDir) => {
    // Без расширения: формат ffmpeg определяет по содержимому
    const inputPath = join(workDir, 'in')
    const outputPath = join(workDir, 'out.f32')
    writeFileSync(inputPath, audio)
    await runFfmpeg(['-y', '-hide_banner', '-i', inputPath, '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', outputPath])
    const pcm = readFileSync(outputPath)
    // Копия: смещение буфера файла не обязано быть кратным 4 байтам
    return new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength))
  })
}

async function inWorkDir<T>(work: (workDir: string) => Promise<T>): Promise<T> {
  const workDir = join(tmpdir(), 'voice-type-encode', randomUUID())
  mkdirSync(workDir, { recursive: true })
  try {
    return await work(workDir)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}
