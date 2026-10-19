import { app, clipboard, Notification, shell } from 'electron'
import type { IncomingMessage, ServerResponse } from 'http'
import { createWriteStream, existsSync } from 'fs'
import { mkdir, rename, rm, writeFile } from 'fs/promises'
import { pipeline } from 'stream/promises'
import { randomUUID } from 'crypto'
import path from 'path'
import { fileStamp, numberedName, safeFileName, textDrop } from './phone-drop-files'

const DROP_FOLDER = 'С телефона'
const MAX_TEXT_BYTES = 1024 * 1024
/** Пачку фото телефон шлёт по одному — уведомление одно на всю пачку */
const NOTIFY_DEBOUNCE_MS = 3000

type Authorize = (ts: number | undefined, proof: string | undefined) => boolean

class DropError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

interface Received {
  path: string
  /** Текст и ссылка ещё и в буфере обмена — об этом стоит сказать в уведомлении */
  copied: boolean
}

export const phoneDropFolder = (): string => path.join(app.getPath('desktop'), DROP_FOLDER)

function header(request: IncomingMessage, name: string): string {
  const value = request.headers[name]
  if (typeof value !== 'string') return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return ''
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

async function readText(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += (chunk as Buffer).length
    if (size > MAX_TEXT_BYTES) throw new DropError(413, 'текст больше мегабайта')
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function receiveText(request: IncomingMessage, folder: string, title: string): Promise<Received> {
  const drop = textDrop(await readText(request), title, new Date())
  if (!drop.content) throw new DropError(400, 'пустой текст')
  const target = freePath(folder, drop.name)
  await writeFile(target, drop.content, 'utf8')
  clipboard.writeText(drop.clipboard)
  return { path: target, copied: true }
}

/** Файл пишется во временный и получает имя только целиком: оборванная передача не оставит огрызок. */
async function receiveFile(request: IncomingMessage, folder: string, name: string): Promise<Received> {
  const temp = path.join(folder, `.${randomUUID()}.part`)
  try {
    await pipeline(request, createWriteStream(temp))
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
  const target = freePath(folder, safeFileName(name, `Файл ${fileStamp(new Date())}`))
  await rename(temp, target)
  return { path: target, copied: false }
}

const plural = (count: number, one: string, few: string, many: string): string => {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

class DropAnnouncer {
  private pending: Received[] = []
  private timer: NodeJS.Timeout | null = null
  // Без ссылки уведомление собирает сборщик мусора, и клик по нему уже ничего не открывает
  private shown: Notification | null = null

  add(received: Received): void {
    this.pending.push(received)
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.show(), NOTIFY_DEBOUNCE_MS)
  }

  private show(): void {
    const batch = this.pending
    this.pending = []
    this.timer = null
    if (!Notification.isSupported()) return

    const [first] = batch
    const body = batch.length > 1
      ? `${batch.length} ${plural(batch.length, 'файл', 'файла', 'файлов')} в папке «${DROP_FOLDER}»`
      : `${path.basename(first.path)}${first.copied ? ' — и в буфере обмена' : ''}`
    this.shown = new Notification({ title: 'С телефона', body })
    this.shown.on('click', () => {
      if (batch.length === 1) shell.showItemInFolder(first.path)
      else void shell.openPath(phoneDropFolder())
    })
    this.shown.show()
  }
}

const announcer = new DropAnnouncer()

/**
 * «Поделиться → На компьютер» с телефона: POST /drop, тело — сам файл или текст в UTF-8.
 * Заголовки: x-drop-ts и x-drop-proof — одноразовая подпись ключом пары, x-drop-kind — file или text,
 * x-drop-name — имя файла или тема текста (encodeURIComponent: заголовки HTTP — только ASCII).
 * Всё складывается в папку «С телефона» на рабочем столе.
 */
export function handlePhoneDrop(request: IncomingMessage, response: ServerResponse, authorize: Authorize): void {
  if (request.method !== 'POST' || request.url !== '/drop') return reply(response, 404, { error: 'not found' })
  const ts = Number(request.headers['x-drop-ts'])
  if (!authorize(Number.isFinite(ts) ? ts : undefined, header(request, 'x-drop-proof'))) {
    return reply(response, 401, { error: 'unauthorized' })
  }
  const kind = header(request, 'x-drop-kind')
  if (kind !== 'file' && kind !== 'text') return reply(response, 400, { error: 'unknown kind' })

  const name = header(request, 'x-drop-name')
  const folder = phoneDropFolder()
  mkdir(folder, { recursive: true })
    .then(() => (kind === 'text' ? receiveText(request, folder, name) : receiveFile(request, folder, name)))
    .then((received) => {
      console.log(`[phone-drop] получено: ${received.path}`)
      reply(response, 200, { name: path.basename(received.path) })
      announcer.add(received)
    })
    .catch((error: Error) => {
      console.warn('[phone-drop] не принято:', error.message)
      if (!response.headersSent && !request.destroyed) reply(response, error instanceof DropError ? error.status : 500, { error: error.message })
    })
}
