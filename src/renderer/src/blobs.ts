interface Blob {
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

export function initBlobs(): void {
  const canvas = document.getElementById('blobs-canvas') as HTMLCanvasElement
  if (!canvas) return
  const ctx = canvas.getContext('2d')!

  function resize(): void {
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
  }
  resize()
  window.addEventListener('resize', resize)

  // Каждый блоб движется по плавной кривой — угол медленно меняется
  const blobs: Blob[] = [
    { x: 200, y: 200, angle: 0.3, speed: 0.8, turnSpeed: 0.008, radius: 450, r: 255, g: 140, b: 50 },
    { x: 600, y: 350, angle: 2.1, speed: 0.7, turnSpeed: 0.006, radius: 420, r: 230, g: 90, b: 80 },
    { x: 350, y: 500, angle: 4.2, speed: 0.65, turnSpeed: 0.009, radius: 460, r: 200, g: 60, b: 140 },
    { x: 700, y: 150, angle: 1.0, speed: 0.55, turnSpeed: 0.007, radius: 380, r: 250, g: 180, b: 60 },
    { x: 100, y: 400, angle: 3.5, speed: 0.6, turnSpeed: 0.01, radius: 400, r: 220, g: 50, b: 100 },
  ]

  function render(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.globalCompositeOperation = 'lighter'

    const cx = canvas.width / 2
    const cy = canvas.height / 2

    for (const bl of blobs) {
      // Плавный поворот — постоянно меняет направление
      bl.angle += bl.turnSpeed

      // Притяжение к центру — чем дальше от центра, тем сильнее тянет обратно
      const dx = cx - bl.x
      const dy = cy - bl.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const pullAngle = Math.atan2(dy, dx)
      const pull = Math.min(dist / (canvas.width * 0.6), 1) * 0.02
      bl.angle += Math.sin(pullAngle - bl.angle) * pull

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

    requestAnimationFrame(render)
  }

  render()
}
