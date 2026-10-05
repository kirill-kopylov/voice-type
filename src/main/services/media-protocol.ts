import fs from 'fs'
import { Readable } from 'stream'
import { protocol } from 'electron'
import { parseByteRange } from './byte-range'
import { videoPath } from './video-storage'

// Видео встреч отдаём плееру по своей схеме: файл большой, а перемотка требует диапазонов (Range)
export const MEDIA_SCHEME = 'voicetype-media'
const VIDEO_HOST = 'video'

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
    if (url.hostname !== VIDEO_HOST) return new Response('Not found', { status: 404 })

    const filePath = videoPath(decodeURIComponent(url.pathname.slice(1)))
    if (!fs.existsSync(filePath)) return new Response('Not found', { status: 404 })

    const size = fs.statSync(filePath).size
    const headers = { ...CORS, 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes' }
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
