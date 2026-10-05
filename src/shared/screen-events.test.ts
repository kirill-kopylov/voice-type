import { describe, expect, it } from 'vitest'
import { describeEvents, eventsBetween } from './screen-events'
import type { ScreenEvent } from './types'

const click = (atMs: number, window: string, extra: Partial<Extract<ScreenEvent, { kind: 'click' }>> = {}): ScreenEvent =>
  ({ kind: 'click', atMs, window, displayId: '1', x: 100, y: 200, button: 'left', double: false, ...extra })

describe('describeEvents', () => {
  it('клики подряд в одном окне склеиваются, а в разных окнах и с большой паузой — нет', () => {
    const lines = describeEvents([
      click(1000, 'Chrome'), click(1800, 'Chrome'), click(2500, 'Chrome'),
      click(3000, 'Excel'),
      click(20000, 'Excel')
    ])
    expect(lines).toHaveLength(3)
    expect(lines[0].text).toContain('3 клика')
    expect(lines[0].atMs).toBe(1000)
  })

  it('окно называется только когда сменилось', () => {
    const lines = describeEvents([
      { kind: 'key', atMs: 0, shortcut: 'Ctrl+S', window: 'Word' },
      { kind: 'key', atMs: 5000, shortcut: 'Ctrl+P', window: 'Word' },
      { kind: 'key', atMs: 9000, shortcut: 'Ctrl+S', window: 'Excel' }
    ])
    expect(lines[0].text).toContain('Word')
    expect(lines[1].text).not.toContain('Word')
    expect(lines[2].text).toContain('Excel')
  })

  it('переход между окнами задаёт контекст следующих событий', () => {
    const lines = describeEvents([
      { kind: 'window', atMs: 0, change: 'focus', title: 'Чат', app: 'Telegram' },
      { kind: 'text', atMs: 1000, text: 'привет', hidden: false, window: 'Чат' }
    ])
    expect(lines[1].text).toContain('привет')
    expect(lines[1].text).not.toContain('окно')
  })

  it('скрытый текст не раскрывается, длинный — обрезается', () => {
    const [hidden, long] = describeEvents([
      { kind: 'text', atMs: 0, text: 'секрет', hidden: true },
      { kind: 'clipboard', atMs: 1, text: 'я'.repeat(500) }
    ])
    expect(hidden.text).not.toContain('секрет')
    expect(long.text.length).toBeLessThan(260)
  })

  it('рисунок описывается с цветом и местом', () => {
    const [line] = describeEvents([
      { kind: 'drawing', atMs: 0, displayId: '1', tool: 'arrow', color: '#ef4444', rect: { x: 10, y: 20, width: 30, height: 40 } }
    ])
    expect(line.text).toContain('красный')
    expect(line.text).toContain('стрелку')
    expect(line.text).toContain('(10, 20)')
  })
})

describe('eventsBetween', () => {
  it('берёт события отрезка включительно, границы в секундах', () => {
    const events: ScreenEvent[] = [click(500, 'A'), click(1000, 'A'), click(2000, 'A'), click(2500, 'A')]
    expect(eventsBetween(events, 1, 2).map((e) => e.atMs)).toEqual([1000, 2000])
  })
})
