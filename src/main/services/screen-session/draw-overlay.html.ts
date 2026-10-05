// Страница-оверлей на один монитор: прозрачный холст поверх экрана. Рисунки попадают в запись экрана.
// Внутри нет шаблонных строк и обратных кавычек — вся страница лежит в одной строке TS.
export const FADE_AFTER_MS = 5000
export const FADE_DURATION_MS = 1000
export const RING_DURATION_MS = 600

export const DRAW_OVERLAY_HTML = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: transparent; user-select: none; }
  body.drawing { cursor: crosshair; }
  canvas { position: fixed; inset: 0; width: 100%; height: 100%; }
  #text-input { position: fixed; display: none; margin: 0; padding: 0 2px; border: 1px dashed rgba(255,255,255,0.8);
                background: rgba(0,0,0,0.25); outline: none; font-family: Segoe UI, sans-serif; font-weight: 700; }
</style></head><body>
  <canvas id="canvas"></canvas>
  <input id="text-input" type="text">
  <script>
    const { ipcRenderer } = require('electron')
    const displayId = new URLSearchParams(location.search).get('display')
    const FADE_AFTER = ${FADE_AFTER_MS}
    const FADE_DURATION = ${FADE_DURATION_MS}
    const RING_DURATION = ${RING_DURATION_MS}
    const canvas = document.getElementById('canvas')
    const ctx = canvas.getContext('2d')
    const textInput = document.getElementById('text-input')

    let style = { tool: 'arrow', color: '#ef4444', width: 4, fade: false }
    let drawing = false
    let strokes = []
    let rings = []
    let current = null
    let counter = 0
    let animating = false

    function resize() {
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(innerWidth * dpr)
      canvas.height = Math.round(innerHeight * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      render()
    }
    addEventListener('resize', resize)

    function strokeAlpha(stroke, now) {
      if (!stroke.fadeStart) return 1
      const left = stroke.fadeStart + FADE_DURATION - now
      return Math.max(0, Math.min(1, left / FADE_DURATION))
    }

    function drawArrowHead(from, to, size) {
      const angle = Math.atan2(to.y - from.y, to.x - from.x)
      ctx.beginPath()
      ctx.moveTo(to.x, to.y)
      ctx.lineTo(to.x - size * Math.cos(angle - 0.45), to.y - size * Math.sin(angle - 0.45))
      ctx.moveTo(to.x, to.y)
      ctx.lineTo(to.x - size * Math.cos(angle + 0.45), to.y - size * Math.sin(angle + 0.45))
      ctx.stroke()
    }

    function drawFreehand(points) {
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)
      if (points.length === 1) ctx.lineTo(points[0].x + 0.01, points[0].y)
      for (let i = 1; i < points.length - 1; i++) {
        const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 }
        ctx.quadraticCurveTo(points[i].x, points[i].y, mid.x, mid.y)
      }
      if (points.length > 1) ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y)
      ctx.stroke()
    }

    function drawStroke(stroke, alpha) {
      const p = stroke.points
      const a = p[0]
      const b = p[p.length - 1]
      ctx.save()
      ctx.globalAlpha = alpha * (stroke.tool === 'marker' ? 0.35 : 1)
      ctx.strokeStyle = stroke.color
      ctx.fillStyle = stroke.color
      ctx.lineWidth = stroke.tool === 'marker' ? stroke.width * 4 : stroke.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      if (stroke.tool === 'pen' || stroke.tool === 'marker') drawFreehand(p)
      else if (stroke.tool === 'line' || stroke.tool === 'arrow') {
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
        if (stroke.tool === 'arrow') drawArrowHead(a, b, Math.max(16, stroke.width * 4.5))
      } else if (stroke.tool === 'rectangle') {
        ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
      } else if (stroke.tool === 'ellipse') {
        ctx.beginPath()
        ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2)
        ctx.stroke()
      } else if (stroke.tool === 'text') {
        ctx.font = '700 ' + (14 + stroke.width * 4) + 'px Segoe UI, sans-serif'
        ctx.textBaseline = 'top'
        ctx.lineWidth = 4
        ctx.strokeStyle = 'rgba(0,0,0,0.65)'
        ctx.strokeText(stroke.text, a.x, a.y)
        ctx.fillText(stroke.text, a.x, a.y)
      }
      ctx.restore()
    }

    function drawRing(ring, now) {
      const t = (now - ring.born) / RING_DURATION
      ctx.save()
      ctx.globalAlpha = 1 - t
      ctx.strokeStyle = '#ffb020'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(ring.x, ring.y, 10 + 26 * t, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }

    // Удаляет исчезнувшие рисунки и кольца, запускает отметку «пора исчезать»
    function expire(now) {
      strokes.forEach(function (s) { if (s.fade && !s.fadeStart && now - s.born >= FADE_AFTER) s.fadeStart = now })
      const gone = strokes.filter(function (s) { return s.fadeStart && now - s.fadeStart >= FADE_DURATION })
      if (gone.length) {
        strokes = strokes.filter(function (s) { return gone.indexOf(s) === -1 })
        gone.forEach(function (s) { ipcRenderer.send('draw:stroke-gone', s.id) })
      }
      rings = rings.filter(function (r) { return now - r.born < RING_DURATION })
    }

    function render() {
      const now = performance.now()
      expire(now)
      ctx.clearRect(0, 0, innerWidth, innerHeight)
      strokes.forEach(function (s) { drawStroke(s, strokeAlpha(s, now)) })
      if (current) drawStroke(current, 1)
      rings.forEach(function (r) { drawRing(r, now) })
      // Пока есть то, что исчезает или расходится кольцом, перерисовываем кадр за кадром
      const needsFrames = rings.length > 0 || strokes.some(function (s) { return s.fade })
      if (needsFrames && !animating) { animating = true; requestAnimationFrame(tick) }
    }
    function tick() { animating = false; render() }

    function constrain(tool, start, end, shift) {
      if (!shift) return end
      const dx = end.x - start.x
      const dy = end.y - start.y
      if (tool === 'rectangle' || tool === 'ellipse') {
        const side = Math.max(Math.abs(dx), Math.abs(dy))
        return { x: start.x + Math.sign(dx || 1) * side, y: start.y + Math.sign(dy || 1) * side }
      }
      if (tool === 'line' || tool === 'arrow') {
        const step = Math.PI / 4
        const angle = Math.round(Math.atan2(dy, dx) / step) * step
        const length = Math.hypot(dx, dy)
        return { x: start.x + length * Math.cos(angle), y: start.y + length * Math.sin(angle) }
      }
      return end
    }

    // Границы фигуры в координатах монитора: по ним агент находит рисунок на кадре
    function boundsOf(stroke) {
      const xs = stroke.points.map(function (p) { return p.x })
      const ys = stroke.points.map(function (p) { return p.y })
      const x = Math.min.apply(null, xs)
      const y = Math.min.apply(null, ys)
      if (stroke.tool === 'text') {
        const size = 14 + stroke.width * 4
        return { x: Math.round(x), y: Math.round(y), width: Math.round(stroke.text.length * size * 0.6), height: Math.round(size * 1.3) }
      }
      return { x: Math.round(x), y: Math.round(y), width: Math.round(Math.max.apply(null, xs) - x), height: Math.round(Math.max.apply(null, ys) - y) }
    }

    function finishStroke(stroke) {
      stroke.born = performance.now()
      stroke.id = displayId + '-' + (++counter)
      strokes.push(stroke)
      ipcRenderer.send('draw:stroke-added', displayId, stroke.id,
        { tool: stroke.tool, color: stroke.color, text: stroke.text, rect: boundsOf(stroke) })
      render()
    }

    function startText(point) {
      textInput.style.display = 'block'
      textInput.style.left = point.x + 'px'
      textInput.style.top = point.y + 'px'
      textInput.style.fontSize = (14 + style.width * 4) + 'px'
      textInput.style.color = style.color
      textInput.value = ''
      setTimeout(function () { textInput.focus() }, 0)
      textInput.dataset.x = point.x
      textInput.dataset.y = point.y
    }
    function endText(commit) {
      if (textInput.style.display === 'none') return
      const text = textInput.value.trim()
      textInput.style.display = 'none'
      if (commit && text) {
        finishStroke({ tool: 'text', color: style.color, width: style.width, fade: style.fade, text: text,
                       points: [{ x: Number(textInput.dataset.x), y: Number(textInput.dataset.y) }] })
      }
    }
    textInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') endText(true)
      e.stopPropagation()
    })
    textInput.addEventListener('blur', function () { endText(true) })

    addEventListener('pointerdown', function (e) {
      if (!drawing || e.target === textInput) return
      endText(true)
      const point = { x: e.clientX, y: e.clientY }
      if (style.tool === 'text') { startText(point); return }
      current = { tool: style.tool, color: style.color, width: style.width, fade: style.fade, points: [point] }
      document.body.setPointerCapture(e.pointerId)
      render()
    })
    addEventListener('pointermove', function (e) {
      if (!current) return
      const point = { x: e.clientX, y: e.clientY }
      if (current.tool === 'pen' || current.tool === 'marker') current.points.push(point)
      else current.points = [current.points[0], constrain(current.tool, current.points[0], point, e.shiftKey)]
      render()
    })
    addEventListener('pointerup', function () {
      if (!current) return
      const stroke = current
      current = null
      // Случайный клик без движения фигурой не считается
      const moved = stroke.points.length > 1 && Math.hypot(stroke.points[stroke.points.length - 1].x - stroke.points[0].x, stroke.points[stroke.points.length - 1].y - stroke.points[0].y) > 2
      if (moved || stroke.tool === 'pen' || stroke.tool === 'marker') finishStroke(stroke)
      else render()
    })

    ipcRenderer.on('draw:style', function (_e, next) { style = next })
    ipcRenderer.on('draw:mode', function (_e, active) {
      drawing = active
      document.body.classList.toggle('drawing', active)
      if (!active) { current = null; endText(false) }
    })
    ipcRenderer.on('draw:remove', function (_e, id) { strokes = strokes.filter(function (s) { return s.id !== id }); render() })
    ipcRenderer.on('draw:clear', function () { strokes = []; current = null; render() })
    ipcRenderer.on('draw:ring', function (_e, point) { rings.push({ x: point.x, y: point.y, born: performance.now() }); render() })
    resize()
  </script>
</body></html>`
