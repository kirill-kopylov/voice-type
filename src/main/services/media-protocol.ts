import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { protocol } from 'electron'
import { parseByteRange } from './byte-range'
import { videoPath } from './video-storage'
import { audioPath } from './audio-storage'

// Звук и видео встреч отдаём плееру по своей схеме: файлы большие, а перемотка требует диапазонов (Range)
export const MEDIA_SCHEME = 'voicetype-media'

// Записанные приложением встречи — webm, загруженные — в своём контейнере; mov и m4v — то же семейство, что mp4
const VIDEO_CONTENT_TYPES: Record<string, string> = { '.webm': 'video/webm', '.mkv': 'video/x-matroska' }

/** Хост URL — вид файла: где он лежит и как его назвать плееру. Имя файла — только последняя часть пути, чтобы не выйти из папки. */
const MEDIA_KINDS: Record<string, { resolve: (fileName: string) => string; contentType: (filePath: string) => string }> = {
  video: {
    resolve: videoPath,
    contentType: (filePath) => VIDEO_CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'video/mp4'
  },
  audio: {
    resolve: (fileName) => audioPath(path.basename(fileName)),
    contentType: () => 'audio/webm'
  }
}

/** До app.ready: без регистрации схемы <video> не сможет читать поток и перематывать. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: MEDIA_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true }
  }])
}

const CORS = { 'Access-Control-Allow-Origin': '*' }

export function handleMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, (request) => {
    const url = new URL(request.url)
    const kind = MEDIA_KINDS[url.hostname]
    if (!kind) return new Response('Not found', { status: 404 })

    const filePath = kind.resolve(decodeURIComponent(url.pathname.slice(1)))
    if (!fs.existsSync(filePath)) return new Response('Not found', { status: 404 })

    const size = fs.statSync(filePath).size
    const headers = { ...CORS, 'Content-Type': kind.contentType(filePath), 'Accept-Ranges': 'bytes' }
    const rangeHeader = request.headers.get('range')
    if (!rangeHeader) {
      return new Response(Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream, {
        status: 200, headers: { ...headers, 'Content-Length': String(size) }
      })
    }

    const range = parseByteRange(rangeHeader, size)
    if (!range) return new Response(null, { status: 416, headers: { ...CORS, 'Content-Range': `bytes */${size}` } })

    return new Response(Readable.toWeb(fs.createReadStream(filePath, range)) as ReadableStream, {
      status: 206,
      headers: {
        ...headers,
        'Content-Length': String(range.end - range.start + 1),
        'Content-Range': `bytes ${range.start}-${range.end}/${size}`
      }
    })
  })
}
