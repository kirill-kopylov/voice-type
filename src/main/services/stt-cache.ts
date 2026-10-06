import { app } from 'electron'
import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'

// Кэш живёт только между сбоем и повтором: после успешной обработки встречи его чистят,
// а забытые записи (например, встречу удалили) стираются по возрасту
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Кэш валидных ответов STT на время одной обработки встречи: ответ привязан к аудио, модели и языку.
 * Если одна из двух моделей упала, повтор берёт ответ второй из кэша и не платит за него снова.
 */
export class SttCache {
  private readonly dir = path.join(app.getPath('userData'), 'stt-cache')
  private readonly usedKeys = new Set<string>()

  constructor() {
    fs.mkdirSync(this.dir, { recursive: true })
    this.removeStale()
  }

  /** Ответ из кэша или результат fetch; в кэш попадает только валидный ответ. */
  async run<T>(
    request: { model: string; language: string; audio: Buffer; options?: object },
    isValid: (response: T) => boolean,
    fetch: () => Promise<T>
  ): Promise<T> {
    const key = createHash('sha256')
      .update(JSON.stringify([request.model, request.language, request.options ?? null]))
      .update(request.audio)
      .digest('hex')
    this.usedKeys.add(key)
    const file = path.join(this.dir, `${key}.json`)

    const cached = this.read<T>(file)
    if (cached !== null && isValid(cached)) {
      console.log(`[stt-cache] ${request.model}: ответ из кэша`)
      return cached
    }

    const response = await fetch()
    if (isValid(response)) fs.writeFileSync(file, JSON.stringify(response))
    return response
  }

  /** Встреча обработана целиком — ответы этой обработки больше не нужны. */
  dropUsed(): void {
    for (const key of this.usedKeys) fs.rmSync(path.join(this.dir, `${key}.json`), { force: true })
    this.usedKeys.clear()
  }

  private read<T>(file: string): T | null {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as T
    } catch {
      return null
    }
  }

  private removeStale(): void {
    const now = Date.now()
    for (const name of fs.readdirSync(this.dir)) {
      const file = path.join(this.dir, name)
      if (now - fs.statSync(file).mtimeMs > STALE_AFTER_MS) fs.rmSync(file, { force: true })
    }
  }
}
