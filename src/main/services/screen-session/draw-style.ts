// Набор инструментов рисования: общий для панели и оверлеев, без electron.

export type DrawTool = 'pen' | 'marker' | 'line' | 'arrow' | 'rectangle' | 'ellipse' | 'text'

export interface DrawStyle {
  tool: DrawTool
  color: string
  width: number
  /** Рисунки сами исчезают через несколько секунд — удобно показывать мышью, не оставляя следов */
  fade: boolean
}

export const DRAW_TOOLS: Array<{ id: DrawTool; label: string }> = [
  { id: 'arrow', label: 'Стрелка' },
  { id: 'ellipse', label: 'Кружок / эллипс (Shift — круг)' },
  { id: 'rectangle', label: 'Прямоугольник (Shift — квадрат)' },
  { id: 'pen', label: 'Свободная рука' },
  { id: 'marker', label: 'Маркер' },
  { id: 'line', label: 'Линия (Shift — под 45°)' },
  { id: 'text', label: 'Текст' }
]

export const DRAW_COLORS = ['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#ffffff', '#111111']
export const DRAW_WIDTHS = [2, 4, 8]

export const DEFAULT_DRAW_STYLE: DrawStyle = { tool: 'arrow', color: DRAW_COLORS[0], width: DRAW_WIDTHS[1], fade: false }
