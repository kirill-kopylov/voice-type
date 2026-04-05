import { deflateSync } from 'zlib'

/**
 * Генерирует PNG-буфер с кругом заданного цвета (32x32).
 * Используется для иконок трея без внешних файлов.
 */
export function createCircleIcon(r: number, g: number, b: number, size = 32): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(size, 0)
  ihdrData.writeUInt32BE(size, 4)
  ihdrData[8] = 8 // bit depth
  ihdrData[9] = 6 // RGBA
  const ihdr = createChunk('IHDR', ihdrData)

  const rowBytes = size * 4 + 1
  const raw = Buffer.alloc(rowBytes * size)
  const cx = size / 2
  const cy = size / 2
  const radius = size / 2 - 1

  for (let y = 0; y < size; y++) {
    raw[y * rowBytes] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const offset = y * rowBytes + 1 + x * 4
      const dx = x - cx + 0.5
      const dy = y - cy + 0.5
      if (dx * dx + dy * dy <= radius * radius) {
        raw[offset] = r
        raw[offset + 1] = g
        raw[offset + 2] = b
        raw[offset + 3] = 255
      } else {
        raw[offset] = 0
        raw[offset + 1] = 0
        raw[offset + 2] = 0
        raw[offset + 3] = 0
      }
    }
  }

  const compressed = deflateSync(raw)
  const idat = createChunk('IDAT', compressed)
  const iend = createChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdr, idat, iend])
}

function createChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii')
  const typeAndData = Buffer.concat([typeBuffer, data])

  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)

  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData))

  return Buffer.concat([length, typeAndData, crc])
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}
