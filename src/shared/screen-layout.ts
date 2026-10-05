// Раскладка видео встречи: что взять с каких мониторов и куда положить на кадр. Чистая математика без DOM.
import type { Rect, ScreenCaptureMode, ScreenDisplay, ScreenRegion } from './types'

// Кадр не больше 1080 по высоте; по ширине запас на два монитора рядом
export const MAX_FRAME_WIDTH = 3840
export const MAX_FRAME_HEIGHT = 1080

/** Часть монитора (в DIP внутри монитора) и её место на итоговом кадре (в пикселях) */
export interface ScreenLayer {
  displayId: string
  /** Размер монитора в DIP: по нему размер потока переводится в координаты source */
  displaySize: { width: number; height: number }
  source: Rect
  target: Rect
}

export interface ScreenPlan {
  width: number
  height: number
  layers: ScreenLayer[]
}

const evenCeil = (value: number): number => Math.max(2, Math.ceil(value / 2) * 2)

interface Piece {
  displayId: string
  displaySize: { width: number; height: number }
  /** Положение куска в общем DIP-пространстве рабочего стола */
  desktop: Rect
  /** Откуда его брать внутри монитора */
  source: Rect
  scaleFactor: number
}

function planPieces(pieces: Piece[]): ScreenPlan {
  const left = Math.min(...pieces.map((p) => p.desktop.x))
  const top = Math.min(...pieces.map((p) => p.desktop.y))
  const right = Math.max(...pieces.map((p) => p.desktop.x + p.desktop.width))
  const bottom = Math.max(...pieces.map((p) => p.desktop.y + p.desktop.height))
  const totalWidth = right - left
  const totalHeight = bottom - top

  // Пикселей на DIP: не больше родного разрешения самого плотного монитора, не больше лимита кадра
  const nativeScale = Math.max(...pieces.map((p) => p.scaleFactor))
  const scale = Math.min(nativeScale, MAX_FRAME_WIDTH / totalWidth, MAX_FRAME_HEIGHT / totalHeight)

  return {
    width: evenCeil(totalWidth * scale),
    height: evenCeil(totalHeight * scale),
    layers: pieces.map((p) => ({
      displayId: p.displayId,
      displaySize: p.displaySize,
      source: p.source,
      target: {
        x: Math.round((p.desktop.x - left) * scale),
        y: Math.round((p.desktop.y - top) * scale),
        width: Math.round(p.desktop.width * scale),
        height: Math.round(p.desktop.height * scale)
      }
    }))
  }
}

const wholeDisplay = (display: ScreenDisplay): Piece => ({
  displayId: display.id,
  displaySize: { width: display.bounds.width, height: display.bounds.height },
  desktop: display.bounds,
  source: { x: 0, y: 0, width: display.bounds.width, height: display.bounds.height },
  scaleFactor: display.scaleFactor
})

/** null — снимать нечего: режим «выкл», нет мониторов или не выбрана область */
export function planScreenRecording(
  mode: ScreenCaptureMode,
  displays: ScreenDisplay[],
  region: ScreenRegion | null
): ScreenPlan | null {
  if (mode === 'off' || displays.length === 0) return null

  if (mode === 'all-screens') return planPieces(displays.map(wholeDisplay))

  if (mode === 'screen') {
    const primary = displays.find((d) => d.primary) ?? displays[0]
    return planPieces([wholeDisplay(primary)])
  }

  const display = region && displays.find((d) => d.id === region.displayId)
  if (!region || !display) return null
  return planPieces([{
    displayId: display.id,
    displaySize: { width: display.bounds.width, height: display.bounds.height },
    desktop: { x: display.bounds.x + region.x, y: display.bounds.y + region.y, width: region.width, height: region.height },
    source: { x: region.x, y: region.y, width: region.width, height: region.height },
    scaleFactor: display.scaleFactor
  }])
}
