interface Blob {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  color: string
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

  const blobs: Blob[] = [
    { x: 150, y: 150, vx: 0.7, vy: 0.5, radius: 400, color: 'rgba(240, 128, 48, 0.45)' },
    { x: 500, y: 300, vx: -0.5, vy: 0.6, radius: 380, color: 'rgba(212, 82, 74, 0.4)' },
    { x: 300, y: 500, vx: 0.6, vy: -0.7, radius: 420, color: 'rgba(168, 56, 120, 0.42)' },
  ]

  function render(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (const b of blobs) {
      b.x += b.vx
      b.y += b.vy

      if (b.x - b.radius < 0 || b.x + b.radius > canvas.width) b.vx *= -1
      if (b.y - b.radius < 0 || b.y + b.radius > canvas.height) b.vy *= -1

      b.x = Math.max(b.radius, Math.min(canvas.width - b.radius, b.x))
      b.y = Math.max(b.radius, Math.min(canvas.height - b.radius, b.y))

      const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius)
      grad.addColorStop(0, b.color)
      grad.addColorStop(1, 'transparent')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    requestAnimationFrame(render)
  }

  render()
}
