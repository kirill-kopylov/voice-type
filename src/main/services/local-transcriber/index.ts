import { net, utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'path'
// Подпуть без нативного аддона: sherpa-onnx грузится только в процессе распознавания
import { defaultModelsDir, ensureModels } from 'local-stt/models'
import { decodePcm16k } from '../encode-audio'
import type { LocalSttEvent, LocalSttRequest } from './protocol'

export const LOCAL_MODEL = 'gigaam-v3'

// Модели держат ~300 МБ памяти: без диктовок процесс гасится, следующая поднимает его за секунду
const IDLE_SHUTDOWN_MS = 15 * 60_000

interface PendingRequest {
  resolve: (text: string) => void
  reject: (error: Error) => void
}

/**
 * Распознавание GigaAM на этом компьютере. Модели (~230 МБ) общие с «Железным другом»,
 * качаются при первом запуске; сам процесс поднимается по первой диктовке.
 */
class LocalTranscriber {
  private child: Promise<UtilityProcess> | null = null
  private readonly pending = new Map<number, PendingRequest>()
  private nextId = 1
  private idleTimer: NodeJS.Timeout | null = null

  /** Скачивает модели, если их нет, и загружает их в процесс распознавания. */
  async prepare(): Promise<void> {
    this.cancelIdleShutdown()
    await this.ensureChild().finally(() => this.scheduleIdleShutdown())
  }

  async transcribe(audio: Buffer): Promise<string> {
    // Сразу: иначе процесс могут погасить, пока звук декодируется
    this.cancelIdleShutdown()
    try {
      const [child, samples] = await Promise.all([this.ensureChild(), decodePcm16k(audio)])
      const id = this.nextId++
      return await new Promise<string>((resolve, reject) => {
        this.pending.set(id, { resolve, reject })
        const request: LocalSttRequest = { type: 'transcribe', id, samples }
        child.postMessage(request)
      })
    } finally {
      this.scheduleIdleShutdown()
    }
  }

  private ensureChild(): Promise<UtilityProcess> {
    this.child ??= this.spawn().catch((error: Error) => {
      this.child = null
      throw error
    })
    return this.child
  }

  private async spawn(): Promise<UtilityProcess> {
    const modelsDir = defaultModelsDir()
    // net.fetch, а не fetch Node: Касперский подменяет TLS своим корнем, которому верит только Chromium
    await ensureModels(modelsDir, { fetch: (url) => net.fetch(url) })

    return new Promise((resolve, reject) => {
      const child = utilityProcess.fork(join(__dirname, 'local-transcriber.js'), [], { serviceName: 'VoiceType STT' })
      child.on('message', (event: LocalSttEvent) => {
        if (event.type === 'ready') return resolve(child)
        if (event.type === 'result') return this.takePending(event.id)?.resolve(event.text)
        if (event.id !== undefined) return this.takePending(event.id)?.reject(new Error(event.message))
        reject(new Error(`модели не загрузились: ${event.message}`))
        child.kill()
      })
      child.on('exit', (code) => {
        this.child = null
        const error = new Error(`процесс распознавания завершился (код ${code})`)
        reject(error)
        this.pending.forEach((request) => request.reject(error))
        this.pending.clear()
      })
      const start: LocalSttRequest = { type: 'start', modelsDir }
      child.postMessage(start)
    })
  }

  private takePending(id: number): PendingRequest | undefined {
    const request = this.pending.get(id)
    this.pending.delete(id)
    return request
  }

  private cancelIdleShutdown(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
  }

  private scheduleIdleShutdown(): void {
    this.cancelIdleShutdown()
    if (this.pending.size > 0) return
    this.idleTimer = setTimeout(() => void this.child?.then((child) => child.kill()), IDLE_SHUTDOWN_MS)
  }
}

export const localTranscriber = new LocalTranscriber()
