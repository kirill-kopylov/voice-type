const { deflateSync } = require('zlib')
const fs = require('fs')
const path = require('path')

const SIZE = 256
const PADDING = 28
const CORNER = 48

// Sunset градиент
const COLORS = [
  [240, 128, 48],   // #f08030
  [212, 82, 74],    // #d4524a
  [168, 56, 120],   // #a83878
]

function lerp(a, b, t) {
  return a + (b - a) * t
}

function gradientColor(x, y) {
  const t = (x + y) / (SIZE * 2)
  let r, g, b
  if (t < 0.5) {
    const lt = t * 2
    r = lerp(COLORS[0][0], COLORS[1][0], lt)
    g = lerp(COLORS[0][1], COLORS[1][1], lt)
    b = lerp(COLORS[0][2], COLORS[1][2], lt)
  } else {
    const lt = (t - 0.5) * 2
    r = lerp(COLORS[1][0], COLORS[2][0], lt)
    g = lerp(COLORS[1][1], COLORS[2][1], lt)
    b = lerp(COLORS[1][2], COLORS[2][2], lt)
  }
  return [Math.round(r), Math.round(g), Math.round(b)]
}

function inRoundedRect(x, y, rx, ry, rw, rh, radius) {
  if (x < rx || x > rx + rw || y < ry || y > ry + rh) return false

  // Проверяем каждый угол отдельно
  const left = x < rx + radius
  const right = x > rx + rw - radius
  const top = y < ry + radius
  const bottom = y > ry + rh - radius

  if (left && top) return (x - (rx + radius)) ** 2 + (y - (ry + radius)) ** 2 <= radius * radius
  if (right && top) return (x - (rx + rw - radius)) ** 2 + (y - (ry + radius)) ** 2 <= radius * radius
  if (left && bottom) return (x - (rx + radius)) ** 2 + (y - (ry + rh - radius)) ** 2 <= radius * radius
  if (right && bottom) return (x - (rx + rw - radius)) ** 2 + (y - (ry + rh - radius)) ** 2 <= radius * radius

  return true
}

function inCircle(x, y, cx, cy, r) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

function inMicrophone(x, y) {
  const cx = SIZE / 2
  const s = SIZE / 256 // масштаб

  // Голова микрофона — верхний полукруг
  const headCx = cx, headCy = 82 * s, headR = 30 * s
  if (inCircle(x, y, headCx, headCy, headR)) return true

  // Тело — прямоугольник
  const bodyX = cx - 30 * s, bodyY = 82 * s, bodyW = 60 * s, bodyH = 50 * s
  if (x >= bodyX && x <= bodyX + bodyW && y >= bodyY && y <= bodyY + bodyH) return true

  // Нижний полукруг тела
  if (inCircle(x, y, cx, bodyY + bodyH, headR)) return true

  // Дуга подставки — U-форма
  const arcCy = 115 * s, arcR = 46 * s, arcThick = 8 * s
  const dx = x - cx, dy = y - arcCy
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (y > arcCy && dist > arcR - arcThick && dist < arcR + arcThick && y < arcCy + arcR) return true

  // Ножка
  const legW = 8 * s, legH = 25 * s
  const legX = cx - legW / 2, legY = arcCy + arcR - arcThick
  if (x >= legX && x <= legX + legW && y >= legY && y <= legY + legH) return true

  // Основание
  const baseW = 44 * s, baseH = 8 * s
  const baseX = cx - baseW / 2, baseY = legY + legH - 2 * s
  if (x >= baseX && x <= baseX + baseW && y >= baseY && y <= baseY + baseH) {
    // Скруглённые углы основания
    const br = baseH / 2
    if (x < baseX + br && !inCircle(x, y, baseX + br, baseY + br, br)) return false
    if (x > baseX + baseW - br && !inCircle(x, y, baseX + baseW - br, baseY + br, br)) return false
    return true
  }

  return false
}

// Рендеринг
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)

for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0 // filter: none
  for (let x = 0; x < SIZE; x++) {
    const offset = y * (SIZE * 4 + 1) + 1 + x * 4

    const bgArea = inRoundedRect(x, y, PADDING, PADDING, SIZE - PADDING * 2, SIZE - PADDING * 2, CORNER)

    if (bgArea) {
      if (inMicrophone(x, y)) {
        // Белый микрофон
        raw[offset] = 255
        raw[offset + 1] = 255
        raw[offset + 2] = 255
        raw[offset + 3] = 240
      } else {
        // Градиентный фон
        const [r, g, b] = gradientColor(x, y)
        // Лёгкий шум
        const noise = (Math.random() - 0.5) * 12
        raw[offset] = Math.min(255, Math.max(0, r + noise))
        raw[offset + 1] = Math.min(255, Math.max(0, g + noise))
        raw[offset + 2] = Math.min(255, Math.max(0, b + noise))
        raw[offset + 3] = 255
      }
    } else {
      raw[offset + 3] = 0 // прозрачный
    }
  }
}

// PNG
const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const t = Buffer.from(type)
  const td = Buffer.concat([t, data])
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

const ihdrData = Buffer.alloc(13)
ihdrData.writeUInt32BE(SIZE, 0)
ihdrData.writeUInt32BE(SIZE, 4)
ihdrData[8] = 8; ihdrData[9] = 6

const png = Buffer.concat([
  signature,
  chunk('IHDR', ihdrData),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0))
])

const outDir = path.join(__dirname, '..', 'resources')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'icon.png'), png)
console.log('Icon generated: resources/icon.png (' + SIZE + 'x' + SIZE + ')')
