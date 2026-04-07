import { useEffect, useRef } from 'react'

export function Moon(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

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
    const r = 35
    const tilt = -0.35

    // Полный цикл фаз ~120с
    function render(): void {
      ctx.clearRect(0, 0, size, size)

      // angle 0..2PI — полный лунный цикл
      // 0 = новолуние, PI/2 = первая четверть, PI = полнолуние, 3PI/2 = последняя четверть
      const t = performance.now() * 0.001
      const angle = (t * 0.05) % (Math.PI * 2) // полный цикл ~125с

      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(tilt)
      ctx.translate(-cx, -cy)

      drawMoonPhase(ctx, cx, cy, r, angle)

      ctx.restore()

      rafRef.current = requestAnimationFrame(render)
    }

    render()
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <div className="absolute pointer-events-none" style={{ top: 10, right: 30, zIndex: 0 }}>
      <canvas ref={canvasRef} />
    </div>
  )
}

/**
 * Рисует лунный диск с правильными фазами.
 * angle: 0 = новолуние, PI = полнолуние, 2PI = снова новолуние
 *
 * Геометрия: внешний край — всегда полный круг (край сферы).
 * Терминатор — эллипс с шириной cos(angle) * r.
 * При angle 0..PI — растущая луна (терминатор слева).
 * При angle PI..2PI — убывающая луна (терминатор справа).
 */
function drawMoonPhase(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, angle: number): void {
  // cos(angle): 1 = новолуние, 0 = четверть, -1 = полнолуние
  const cosA = Math.cos(angle)
  const terminatorX = r * cosA

  // Яркость зависит от фазы — полнолуние ярче
  const brightness = 0.4 + (1 - Math.abs(cosA)) * 0.6

  // Bloom слои
  const bloomLayers = [
    { scale: 2.5, blur: 50, alpha: 0.08 * brightness },
    { scale: 1.8, blur: 30, alpha: 0.12 * brightness },
    { scale: 1.3, blur: 15, alpha: 0.2 * brightness },
    { scale: 1.08, blur: 6, alpha: 0.35 * brightness },
  ]

  for (const layer of bloomLayers) {
    ctx.save()
    ctx.filter = `blur(${layer.blur}px)`
    drawLitArea(ctx, cx, cy, r * layer.scale, terminatorX * layer.scale, angle)
    ctx.fillStyle = `rgba(167, 139, 250, ${layer.alpha})`
    ctx.fill()
    ctx.restore()
  }

  // Теневая часть — чёрный диск, еле видный
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'
  ctx.fill()

  // Пятна (моря) — рисуем на полном диске, потом обрежем по освещённой области
  ctx.save()
  drawLitArea(ctx, cx, cy, r, terminatorX, angle)
  ctx.clip()

  const spots = [
    // Крупные моря — ближе к краям
    { x: -12, y: -18, rx: 12, ry: 8 },
    { x: 14, y: 8, rx: 10, ry: 8 },
    { x: -4, y: 20, rx: 9, ry: 6 },
    // Средние
    { x: 18, y: -14, rx: 6, ry: 5 },
    { x: -20, y: 4, rx: 5, ry: 6 },
    { x: 8, y: -22, rx: 5, ry: 4 },
    // Мелкие кратеры — по краям
    { x: -24, y: -10, rx: 3, ry: 3 },
    { x: 22, y: 18, rx: 3, ry: 2 },
    { x: -10, y: 25, rx: 3, ry: 3 },
    { x: 2, y: -26, rx: 3, ry: 2 },
    { x: 24, y: -4, rx: 2, ry: 2 },
    { x: -16, y: -22, rx: 2, ry: 2 },
  ]

  ctx.filter = 'blur(1px)'
  for (const s of spots) {
    ctx.beginPath()
    ctx.ellipse(cx + s.x, cy + s.y, s.rx, s.ry, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(140, 120, 180, 0.35)'
    ctx.fill()
  }
  ctx.filter = 'none'

  ctx.restore()

  // Освещённая часть
  drawLitArea(ctx, cx, cy, r, terminatorX, angle)
  const grad = ctx.createLinearGradient(cx, cy - r, cx, cy + r)
  grad.addColorStop(0, `rgba(232, 224, 255, ${brightness})`)
  grad.addColorStop(0.5, `rgba(212, 204, 240, ${brightness})`)
  grad.addColorStop(1, `rgba(192, 180, 228, ${brightness})`)
  ctx.fillStyle = grad
  ctx.fill()
}

/**
 * Рисует освещённую область луны.
 *
 * Первая половина цикла (angle 0..PI) — растущая:
 *   Освещён правый край, терминатор идёт справа налево.
 *
 * Вторая половина (angle PI..2PI) — убывающая:
 *   Освещён левый край, терминатор идёт слева направо.
 *
 * При полнолунии (angle ≈ PI) — рисуем полный круг.
 */
function drawLitArea(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  r: number,
  terminatorX: number,
  angle: number
): void {
  const growing = (angle % (Math.PI * 2)) < Math.PI

  ctx.beginPath()

  if (growing) {
    // Растущая — правая дуга круга + терминатор-эллипс
    ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false)
    ctx.ellipse(cx, cy, Math.abs(terminatorX), r, 0, Math.PI / 2, -Math.PI / 2, terminatorX > 0)
  } else {
    // Убывающая — левая дуга круга + терминатор-эллипс
    ctx.arc(cx, cy, r, Math.PI / 2, -Math.PI / 2, false)
    ctx.ellipse(cx, cy, Math.abs(terminatorX), r, 0, -Math.PI / 2, Math.PI / 2, terminatorX > 0)
  }

  ctx.closePath()
}
