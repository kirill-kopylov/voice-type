import { ThemeBlobs } from './themes'

interface BlobState {
  x: number
  y: number
  angle: number
  speed: number
  turnSpeed: number
  radius: number
  r: number
  g: number
  b: number
}

let animationId: number | null = null
let blobStates: BlobState[] = []
let currentConfig: ThemeBlobs & { colors: { r: number; g: number; b: number }[] } | null = null

export function initBlobs(config: ThemeBlobs & { colors: { r: number; g: number; b: number }[] }): void {
  const canvas = document.getElementById('blobs-canvas') as HTMLCanvasElement
  if (!canvas) return

  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = null
  }

  currentConfig = config

  if (!config.enabled || config.count === 0) {
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    return
  }

  const ctx = canvas.getContext('2d')!

  function resize(): void {
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
  }
  resize()
  window.addEventListener('resize', resize)

  function calcRadius(): number {
    const diag = Math.sqrt(canvas.width * canvas.width + canvas.height * canvas.height)
    return diag * 0.5 * config.sizeMultiplier
  }

  let baseRadius = calcRadius()

  window.addEventListener('resize', () => {
    baseRadius = calcRadius()
    for (const bl of blobStates) {
      bl.radius = baseRadius * (0.85 + Math.random() * 0.3)
    }
  })

  const speeds = [0.6, 0.45, 0.5, 0.55, 0.6]
  const turns = [0.008, 0.006, 0.009, 0.007, 0.01]

  const colors = config.colors.slice(0, config.count)
  while (colors.length < config.count) {
    colors.push(config.colors[colors.length % config.colors.length])
  }

  blobStates = colors.map((c, i) => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    angle: Math.random() * Math.PI * 2,
    speed: speeds[i % speeds.length] * config.speed,
    turnSpeed: turns[i % turns.length],
    radius: baseRadius * (0.85 + Math.random() * 0.3),
    ...c
  }))

  function render(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = config.opacity

    const cx = canvas.width / 2
    const cy = canvas.height / 2

    for (const bl of blobStates) {
      bl.angle += bl.turnSpeed

      const dx = cx - bl.x
      const dy = cy - bl.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const pullAngle = Math.atan2(dy, dx)
      const pull = Math.min(dist / (canvas.width * 0.6), 1) * 0.02
      bl.angle += Math.sin(pullAngle - bl.angle) * pull

      for (const other of blobStates) {
        if (other === bl) continue
        const odx = bl.x - other.x
        const ody = bl.y - other.y
        const odist = Math.sqrt(odx * odx + ody * ody)
        const minDist = (bl.radius + other.radius) * 0.3
        if (odist < minDist && odist > 0) {
          const repelAngle = Math.atan2(ody, odx)
          const strength = (1 - odist / minDist) * 0.015
          bl.angle += Math.sin(repelAngle - bl.angle) * strength
        }
      }

      bl.x += Math.cos(bl.angle) * bl.speed
      bl.y += Math.sin(bl.angle) * bl.speed

      const grad = ctx.createRadialGradient(bl.x, bl.y, 0, bl.x, bl.y, bl.radius)
      grad.addColorStop(0, `rgba(${bl.r}, ${bl.g}, ${bl.b}, 0.9)`)
      grad.addColorStop(0.15, `rgba(${bl.r}, ${bl.g}, ${bl.b}, 0.6)`)
      grad.addColorStop(0.4, `rgba(${bl.r}, ${bl.g}, ${bl.b}, 0.2)`)
      grad.addColorStop(0.7, `rgba(${bl.r}, ${bl.g}, ${bl.b}, 0.05)`)
      grad.addColorStop(1, 'transparent')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    ctx.globalAlpha = 1
    animationId = requestAnimationFrame(render)
  }

  render()
}
