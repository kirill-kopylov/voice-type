import { describe, it, expect } from 'vitest'
import { planScreenRecording, MAX_FRAME_HEIGHT } from './screen-layout'
import type { ScreenDisplay } from './types'

const display = (id: string, x: number, width: number, height: number, scaleFactor = 1, primary = false): ScreenDisplay => ({
  id, bounds: { x, y: 0, width, height }, scaleFactor, primary
})

const main = display('1', 0, 1920, 1080, 1, true)
const side = display('2', 1920, 1920, 1080)

describe('planScreenRecording', () => {
  it('выключено — снимать нечего', () => {
    expect(planScreenRecording('off', [main], null)).toBeNull()
  })

  it('«весь экран» снимает основной монитор', () => {
    const plan = planScreenRecording('screen', [side, main], null)

    expect(plan?.layers.map((l) => l.displayId)).toEqual(['1'])
    expect(plan).toMatchObject({ width: 1920, height: 1080 })
  })

  it('большой монитор уменьшается до 1080 по высоте, кадр не растёт сверх родного разрешения', () => {
    const plan = planScreenRecording('screen', [display('1', 0, 2560, 1440, 1, true)], null)
    expect(plan?.height).toBeLessThanOrEqual(MAX_FRAME_HEIGHT)
    expect(plan?.width).toBe(1920)

    const small = planScreenRecording('screen', [display('1', 0, 1280, 720, 1, true)], null)
    expect(small).toMatchObject({ width: 1280, height: 720 })
  })

  it('«все экраны» кладёт мониторы рядом так же, как они стоят на столе', () => {
    const plan = planScreenRecording('all-screens', [main, side], null)

    expect(plan).toMatchObject({ width: 3840, height: 1080 })
    expect(plan?.layers.map((l) => l.target.x)).toEqual([0, 1920])
  })

  it('область берётся из выбранного места монитора и не растягивается', () => {
    const region = { displayId: '2', x: 100, y: 50, width: 800, height: 600 }
    const plan = planScreenRecording('region', [main, side], region)

    expect(plan).toMatchObject({ width: 800, height: 600 })
    expect(plan?.layers[0]).toMatchObject({ displayId: '2', source: { x: 100, y: 50, width: 800, height: 600 } })
  })

  it('область на неизвестном мониторе или без выбора — снимать нечего', () => {
    expect(planScreenRecording('region', [main], null)).toBeNull()
    expect(planScreenRecording('region', [main], { displayId: '9', x: 0, y: 0, width: 100, height: 100 })).toBeNull()
  })

  it('размеры кадра чётные — так требуют видеокодеки', () => {
    const plan = planScreenRecording('region', [main], { displayId: '1', x: 0, y: 0, width: 801, height: 601 })
    expect(plan!.width % 2).toBe(0)
    expect(plan!.height % 2).toBe(0)
  })
})
