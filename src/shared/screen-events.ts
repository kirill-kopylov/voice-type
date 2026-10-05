// События экрана текстом: для расшифровки в MCP и для карточки встречи. Без electron и DOM.
import type { ScreenEvent } from './types'

export interface EventLine {
  atMs: number
  kind: ScreenEvent['kind']
  text: string
}

const MAX_QUOTE_LENGTH = 200
const MAX_WINDOW_TITLE_LENGTH = 70
// Клики подряд в одном окне за такое время схлопываются в одну строку
const CLICK_MERGE_WINDOW_MS = 4000

const COLOR_NAMES: Record<string, string> = {
  '#ef4444': 'красный', '#facc15': 'жёлтый', '#22c55e': 'зелёный',
  '#3b82f6': 'синий', '#ffffff': 'белый', '#111111': 'чёрный'
}
const DRAWING_NAMES: Record<string, string> = {
  arrow: 'стрелку', ellipse: 'эллипс', rectangle: 'прямоугольник', pen: 'линию от руки',
  marker: 'выделение маркером', line: 'линию', text: 'надпись'
}

const truncate = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max)}…` : text)
const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim()
const quote = (text: string): string => `«${truncate(oneLine(text), MAX_QUOTE_LENGTH)}»`
const windowName = (title: string): string => `«${truncate(oneLine(title), MAX_WINDOW_TITLE_LENGTH)}»`

type ClickEvent = Extract<ScreenEvent, { kind: 'click' }>

const BUTTON_PREFIX: Record<ClickEvent['button'], string> = { left: '', right: 'правый ', middle: 'средний ' }

function describeClicks(clicks: ClickEvent[]): string {
  const first = clicks[0]
  const prefix = BUTTON_PREFIX[first.button]
  if (clicks.length === 1) return `${first.double ? 'двойной ' : ''}${prefix}клик (${first.x}, ${first.y})`
  return `${clicks.length} ${prefix}клика подряд около (${first.x}, ${first.y})`
}

function describeDrawing(event: Extract<ScreenEvent, { kind: 'drawing' }>): string {
  const what = DRAWING_NAMES[event.tool] ?? 'фигуру'
  const color = COLOR_NAMES[event.color.toLowerCase()] ?? ''
  const { x, y, width, height } = event.rect
  const place = `в области (${x}, ${y}) размером ${width}×${height}`
  if (event.tool === 'text' && event.text) return `написал на экране ${quote(event.text)} ${place}`
  return `нарисовал ${color ? `${color} ` : ''}${what} ${place}`
}

/** Что произошло, без указания окна: окно добавляется отдельно, и только когда оно сменилось. */
function describeEvent(event: ScreenEvent): string {
  switch (event.kind) {
    case 'click': return describeClicks([event])
    case 'key': return `нажал ${event.shortcut}`
    case 'text': return event.hidden ? 'печатал в окне ввода пароля (текст скрыт)' : `напечатал ${quote(event.text)}`
    case 'clipboard': return `скопировал ${quote(event.text)}`
    case 'window':
      if (event.change === 'focus') return `перешёл в окно ${windowName(event.title)}${event.app ? ` (${event.app})` : ''}`
      return `${event.change === 'open' ? 'открылось' : 'закрылось'} окно ${windowName(event.title)}`
    case 'drawing': return describeDrawing(event)
  }
}

function groupClicks(events: ScreenEvent[]): ScreenEvent[][] {
  return events.reduce<ScreenEvent[][]>((groups, event) => {
    const last = groups[groups.length - 1]
    const previous = last?.[last.length - 1]
    const continuesClicks = event.kind === 'click' && previous?.kind === 'click'
      && previous.button === event.button
      && previous.window === event.window
      && event.atMs - previous.atMs <= CLICK_MERGE_WINDOW_MS
    if (continuesClicks) last.push(event)
    else groups.push([event])
    return groups
  }, [])
}

/**
 * Строки для чтения: клики подряд склеены, окно названо только там, где оно сменилось.
 * События окон (переход, открытие, закрытие) сами называют окно и контекст не меняют, кроме перехода.
 */
export function describeEvents(events: ScreenEvent[]): EventLine[] {
  let currentWindow: string | undefined
  return groupClicks(events).map((group) => {
    const first = group[0]
    const body = first.kind === 'click' ? describeClicks(group.filter((e): e is ClickEvent => e.kind === 'click')) : describeEvent(first)

    if (first.kind === 'window') {
      if (first.change === 'focus') currentWindow = first.title
      return { atMs: first.atMs, kind: first.kind, text: body }
    }
    const windowChanged = first.window !== undefined && first.window !== currentWindow
    if (first.window !== undefined) currentWindow = first.window
    return { atMs: first.atMs, kind: first.kind, text: windowChanged ? `${body} — окно ${windowName(first.window as string)}` : body }
  })
}

export function eventsBetween(events: ScreenEvent[], fromSec: number, toSec: number): ScreenEvent[] {
  return events.filter((event) => event.atMs >= fromSec * 1000 && event.atMs <= toSec * 1000)
}
