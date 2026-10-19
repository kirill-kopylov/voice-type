import { clipboard } from 'electron'
import type { IncomingMessage, ServerResponse } from 'http'
import { createWriteStream, existsSync } from 'fs'
import { mkdir, rename, rm, writeFile } from 'fs/promises'
import { Transform } from 'stream'
import { pipeline } from 'stream/promises'
import { randomUUID } from 'crypto'
import path from 'path'
import { fileStamp, numberedName, safeFileName, textDrop } from './files'
import { phoneDropFolder } from './folder'
import { dropPanel } from './panel'
import type { DropStart } from './transfers'

const MAX_TEXT_BYTES = 1024 * 1024
/** Wi-Fi пропал посреди файла — сокет висит молча; минута тишины — приём оборвался */
const IDLE_TIMEOUT_MS = 60_000

type Authorize = (ts: number | undefined, proof: string | undefined) => boolean
type OnBytes = (bytes: number) => void

class DropError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

interface Received {
  path: string
  /** Текст и ссылка ещё и в буфере обмена */
  copied: boolean
}

function header(request: IncomingMessage, name: string): string {
  const value = request.headers[name]
  if (typeof value !== 'string') return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return ''
  }
}

/** Число из заголовка; чего нет или что не число — undefined. */
function numberHeader(request: IncomingMessage, name: string, min: number): number | undefined {
  const raw = header(request, name)
  const value = raw ? Number(raw) : NaN
  return Number.isSafeInteger(value) && value >= min ? value : undefined
}

/** Старый телефон место в пачке не присылает — тогда файл сам себе пачка. */
function startOf(request: IncomingMessage, kind: DropStart['kind']): DropStart {
  const count = numberHeader(request, 'x-drop-count', 1) ?? 1
  return {
    batch: header(request, 'x-drop-batch') || randomUUID(),
    index: Math.min(numberHeader(request, 'x-drop-index', 1) ?? 1, count),
    count,
    batchBytes: numberHeader(request, 'x-drop-batch-bytes', 0),
    name: header(request, 'x-drop-name'),
    kind,
    size: numberHeader(request, 'x-drop-size', 0)
  }
}

function reply(response: ServerResponse, status: number, body: object): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', connection: 'close' })
  response.end(JSON.stringify(body))
}

/** Первый свободный вариант имени: «фото.jpg», «фото (2).jpg», … */
function freePath(folder: string, name: string): string {
  let copy = 1
  while (existsSync(path.join(folder, numberedName(name, copy)))) copy++
  return path.join(folder, numberedName(name, copy))
}

async function readText(request: IncomingMessage, onBytes: OnBytes): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += (chunk as Buffer).length
    if (size > MAX_TEXT_BYTES) throw new DropError(413, 'текст больше мегабайта')
    chunks.push(chunk as Buffer)
    onBytes((chunk as Buffer).length)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function receiveText(request: IncomingMessage, folder: string, title: string, onBytes: OnBytes): Promise<Received> {
  const drop = textDrop(await readText(request, onBytes), title, new Date())
  if (!drop.content) throw new DropError(400, 'пустой текст')
  const target = freePath(folder, drop.name)
  await writeFile(target, drop.content, 'utf8')
  clipboard.writeText(drop.clipboard)
  return { path: target, copied: true }
}

/** Файл пишется во временный и получает имя только целиком: оборванная передача не оставит огрызок. */
async function receiveFile(request: IncomingMessage, folder: string, name: string, onBytes: OnBytes): Promise<Received> {
  const temp = path.join(folder, `.${randomUUID()}.part`)
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      onBytes(chunk.length)
      done(null, chunk)
    }
  })
  try {
    await pipeline(request, counter, createWriteStream(temp))
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
  const target = freePath(folder, safeFileName(name, `Файл ${fileStamp(new Date())}`))
  await rename(temp, target)
  return { path: target, copied: false }
}

/**
 * «Поделиться → На компьютер» с телефона: POST /drop, тело — сам файл или текст в UTF-8.
 * Заголовки: x-drop-ts и x-drop-proof — одноразовая подпись ключом пары, x-drop-kind — file или text,
 * x-drop-name — имя файла или тема текста (encodeURIComponent: заголовки HTTP — только ASCII), x-drop-size —
 * размер, если известен. Место в пачке для панели приёма: x-drop-batch, x-drop-index (с 1), x-drop-count,
 * x-drop-batch-bytes — размер всей пачки, если известен. Всё складывается в папку «С телефона» на рабочем столе.
 */
export function handlePhoneDrop(request: IncomingMessage, response: ServerResponse, authorize: Authorize): void {
  if (request.method !== 'POST' || request.url !== '/drop') return reply(response, 404, { error: 'not found' })
  const ts = Number(request.headers['x-drop-ts'])
  if (!authorize(Number.isFinite(ts) ? ts : undefined, header(request, 'x-drop-proof'))) {
    return reply(response, 401, { error: 'unauthorized' })
  }
  const kind = header(request, 'x-drop-kind')
  if (kind !== 'file' && kind !== 'text') return reply(response, 400, { error: 'unknown kind' })

  const start = startOf(request, kind)
  const key = dropPanel.begin(start)
  const onBytes: OnBytes = (bytes) => dropPanel.progress(key, bytes)
  request.socket.setTimeout(IDLE_TIMEOUT_MS, () => request.destroy())
  const folder = phoneDropFolder()
  mkdir(folder, { recursive: true })
    .then(() => (kind === 'text' ? receiveText(request, folder, start.name, onBytes) : receiveFile(request, folder, start.name, onBytes)))
    .then((received) => {
      console.log(`[phone-drop] получено: ${received.path}`)
      reply(response, 200, { name: path.basename(received.path) })
      dropPanel.finish(key, received.path, received.copied)
    })
    .catch((error: Error) => {
      console.warn('[phone-drop] не принято:', error.message)
      const reason = error instanceof DropError ? error.message : request.destroyed ? 'связь оборвалась' : error.message
      dropPanel.fail(key, reason)
      if (!response.headersSent && !request.destroyed) reply(response, error instanceof DropError ? error.status : 500, { error: error.message })
    })
}
