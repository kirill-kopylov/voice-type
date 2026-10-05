import { spawn } from 'child_process'
import ffmpegStaticPath from 'ffmpeg-static'

// В production asar упакован, ffmpeg распакован в .unpacked
const ffmpegPath = ffmpegStaticPath?.replace('app.asar', 'app.asar.unpacked') ?? null

/** Запускает ffmpeg, возвращает stderr (там вся диагностика ffmpeg). */
export function runFfmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error('ffmpeg-static не найден'))

    const proc = spawn(ffmpegPath, args)
    let stderr = ''
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve(stderr)
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`))
    })
  })
}
