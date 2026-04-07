const { deflateSync } = require('zlib')
const fs = require('fs')
const path = require('path')

const SIZE = 256
const R = SIZE / 2 - 2

// Простой шум для текстуры поверхности
function hash(x, y) {
  let h = x * 374761393 + y * 668265263
  h = (h ^ (h >> 13)) * 1274126177
  return (h ^ (h >> 16)) & 0xff
}

function smoothNoise(x, y, scale) {
  const sx = x / scale
  const sy = y / scale
  const ix = Math.floor(sx)
  const iy = Math.floor(sy)
  const fx = sx - ix
  const fy = sy - iy
  const a = hash(ix, iy)
  const b = hash(ix + 1, iy)
  const c = hash(ix, iy + 1)
  const d = hash(ix + 1, iy + 1)
  const ab = a + (b - a) * fx
  const cd = c + (d - c) * fx
  return ab + (cd - ab) * fy
}

function fbm(x, y) {
  let v = 0
  v += smoothNoise(x, y, 40) * 0.4
  v += smoothNoise(x, y, 20) * 0.25
  v += smoothNoise(x, y, 10) * 0.2
  v += smoothNoise(x, y, 5) * 0.15
  return v
}

// "Моря" — крупные тёмные области
const seas = [
  { x: -0.2, y: -0.3, r: 0.35 },
  { x: 0.25, y: 0.1, r: 0.28 },
  { x: -0.05, y: 0.35, r: 0.22 },
  { x: 0.35, y: -0.3, r: 0.18 },
  { x: -0.4, y: 0.1, r: 0.15 },
]

// Кратеры
const craters = []
for (let i = 0; i < 30; i++) {
  const angle = Math.random() * Math.PI * 2
  const dist = Math.random() * 0.85
  craters.push({
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    r: 0.02 + Math.random() * 0.06
  })
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)

for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0
  for (let x = 0; x < SIZE; x++) {
    const offset = y * (SIZE * 4 + 1) + 1 + x * 4
    const dx = x - SIZE / 2
    const dy = y - SIZE / 2
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist > R) {
      raw[offset + 3] = 0
      continue
    }

    const nx = dx / R
    const ny = dy / R

    // Базовая яркость
    let brightness = 180 + fbm(x + 100, y + 100) * 0.3

    // Моря — затемнение
    for (const sea of seas) {
      const sd = Math.sqrt((nx - sea.x) ** 2 + (ny - sea.y) ** 2)
      if (sd < sea.r) {
        const seaFactor = 1 - sd / sea.r
        brightness -= seaFactor * 45
      }
    }

    // Кратеры — тёмный край, светлый центр
    for (const cr of craters) {
      const cd = Math.sqrt((nx - cr.x) ** 2 + (ny - cr.y) ** 2)
      if (cd < cr.r) {
        const t = cd / cr.r
        if (t > 0.7) brightness -= (1 - t) / 0.3 * 20  // тёмный обод
        else brightness += (1 - t / 0.7) * 8  // светлый центр
      }
    }

    // Шум поверхности
    const noise = fbm(x, y)
    brightness += (noise - 128) * 0.15

    // Край луны — мягкое затемнение (limb darkening)
    const limb = dist / R
    brightness *= 1 - limb * limb * 0.15

    const v = Math.max(0, Math.min(255, Math.round(brightness)))

    // Серо-белый с лёгким тёплым оттенком
    raw[offset] = v
    raw[offset + 1] = Math.max(0, v - 3)
    raw[offset + 2] = Math.max(0, v - 8)

    // Мягкий край — anti-aliasing
    if (dist > R - 1.5) {
      raw[offset + 3] = Math.round(Math.max(0, (R - dist) / 1.5) * 255)
    } else {
      raw[offset + 3] = 255
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

fs.writeFileSync(path.join(__dirname, '..', 'resources', 'moon.png'), png)
console.log('Moon texture generated: resources/moon.png (' + SIZE + 'x' + SIZE + ')')
