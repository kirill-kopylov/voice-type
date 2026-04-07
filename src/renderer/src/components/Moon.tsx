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
    const size = 300
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

      // Bloom
      const bloomLayers = [
        { scale: 2.5, blur: 50, alpha: 0.08 * brightness },
        { scale: 1.8, blur: 30, alpha: 0.12 * brightness },
        { scale: 1.3, blur: 15, alpha: 0.2 * brightness },
        { scale: 1.08, blur: 6, alpha: 0.35 * brightness },
      ]

      for (const layer of bloomLayers) {
        ctx.save()
        ctx.filter = `blur(${layer.blur}px)`
        drawLitArea(ctx, cx, cy, r * layer.scale, terminatorX * layer.scale, growing)
        ctx.fillStyle = `rgba(167, 139, 250, ${layer.alpha})`
        ctx.fill()
        ctx.restore()
      }

      // Теневой диск
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'
      ctx.fill()

      // Текстура луны — обрезаем по освещённой области
      if (imgRef.current) {
        ctx.save()
        drawLitArea(ctx, cx, cy, r, terminatorX, growing)
        ctx.clip()

        // Рисуем текстуру поверх
        ctx.globalAlpha = brightness
        ctx.drawImage(imgRef.current, cx - r, cy - r, r * 2, r * 2)
        ctx.globalAlpha = 1

        // Подкрашиваем в лавандовый
        drawLitArea(ctx, cx, cy, r, terminatorX, growing)
        ctx.fillStyle = `rgba(180, 160, 240, ${0.15 * brightness})`
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
