import { useEffect, useRef } from 'react'
// @ts-ignore — webpack/vite обработает как asset
import moonTexturePath from '../../../../resources/moon.png'

export function Moon(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const imgRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    const size = 500
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = size + 'px'
    canvas.style.height = size + 'px'

    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)

    const cx = size / 2
    const cy = size / 2
    const r = 38
    const tilt = -0.35

    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      render()
    }
    img.src = moonTexturePath

    function render(): void {
      ctx.clearRect(0, 0, size, size)

      const t = performance.now() * 0.001
      const angle = (t * 0.05) % (Math.PI * 2)
      const cosA = Math.cos(angle)
      const terminatorX = r * cosA
      const growing = (angle % (Math.PI * 2)) < Math.PI
      const brightness = 0.4 + (1 - Math.abs(cosA)) * 0.6

      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(tilt)
      ctx.translate(-cx, -cy)

      // Непрозрачный диск — градиент по углу терминатора
      ctx.beginPath()
      ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2)
      // Градиент: всегда из нижнего-левого в верхний-правый
      const diskGrad = ctx.createLinearGradient(cx - r, cy + r, cx + r, cy - r)
      diskGrad.addColorStop(0, '#362e81')
      diskGrad.addColorStop(1, '#221f54')
      ctx.fillStyle = diskGrad
      ctx.fill()

      // Текстура луны — обрезаем по освещённой области
      if (imgRef.current) {
        ctx.save()
        drawLitArea(ctx, cx, cy, r, terminatorX, growing)
        ctx.clip()

        // Текстура — ярче
        ctx.globalAlpha = Math.min(1, brightness * 2)
        ctx.drawImage(imgRef.current, cx - r, cy - r, r * 2, r * 2)
        ctx.globalAlpha = 1

        // Поверх — яркий светлый слой
        drawLitArea(ctx, cx, cy, r, terminatorX, growing)
        ctx.fillStyle = `rgba(240, 235, 255, ${0.35 * brightness})`
        ctx.fill()

        ctx.restore()
      }

      // Bloom — всё поверх луны
      const bloomLayers = [
        { scale: 3.5, blur: 60, alpha: 0.1 * brightness },
        { scale: 2.5, blur: 40, alpha: 0.15 * brightness },
        { scale: 1.6, blur: 20, alpha: 0.25 * brightness },
        { scale: 1.15, blur: 8, alpha: 0.4 * brightness },
      ]

      for (const layer of bloomLayers) {
        ctx.save()
        ctx.filter = `blur(${layer.blur}px)`
        drawLitArea(ctx, cx, cy, r * layer.scale, terminatorX * layer.scale, growing)
        ctx.fillStyle = `rgba(167, 139, 250, ${layer.alpha})`
        ctx.fill()
        ctx.restore()
      }

      ctx.restore()

      rafRef.current = requestAnimationFrame(render)
    }

    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <div className="absolute pointer-events-none" style={{ top: 10, right: 30, zIndex: 0 }}>
      <canvas ref={canvasRef} />
    </div>
  )
}

function drawLitArea(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  r: number,
  terminatorX: number,
  growing: boolean
): void {
  ctx.beginPath()

  if (growing) {
    ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false)
    ctx.ellipse(cx, cy, Math.abs(terminatorX), r, 0, Math.PI / 2, -Math.PI / 2, terminatorX > 0)
  } else {
    ctx.arc(cx, cy, r, Math.PI / 2, -Math.PI / 2, false)
    ctx.ellipse(cx, cy, Math.abs(terminatorX), r, 0, -Math.PI / 2, Math.PI / 2, terminatorX > 0)
  }

  ctx.closePath()
}
