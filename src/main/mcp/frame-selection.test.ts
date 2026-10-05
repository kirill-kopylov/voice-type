import { describe, it, expect } from 'vitest'
import { frameTimes, pickDistinctFrames, type FrameCandidate } from './frame-selection'

const frame = (atSec: number, shade: number): FrameCandidate => ({ atSec, signature: new Uint8Array(16).fill(shade) })

describe('frameTimes', () => {
  it('равномерно по отрезку, концы включены', () => {
    expect(frameTimes(10, 20, 3)).toEqual([10, 15, 20])
  })

  it('один кадр — начало отрезка; пустой отрезок — тоже один кадр', () => {
    expect(frameTimes(10, 20, 1)).toEqual([10])
    expect(frameTimes(10, 10, 5)).toEqual([10])
  })
})

describe('pickDistinctFrames', () => {
  it('выбрасывает кадры, почти не отличающиеся от предыдущего', () => {
    const frames = [frame(0, 100), frame(1, 100), frame(2, 101), frame(3, 200), frame(4, 200)]

    expect(pickDistinctFrames(frames, 10).map((f) => f.atSec)).toEqual([0, 3])
  })

  it('отличающихся кадров больше, чем просили, — берёт равномерно, с первым и последним', () => {
    const frames = Array.from({ length: 9 }, (_, i) => frame(i, i % 2 === 0 ? 0 : 200))

    const picked = pickDistinctFrames(frames, 3).map((f) => f.atSec)

    expect(picked).toEqual([0, 4, 8])
  })

  it('на неподвижном экране остаётся один кадр', () => {
    const still = Array.from({ length: 6 }, (_, i) => frame(i, 50))

    expect(pickDistinctFrames(still, 6)).toHaveLength(1)
  })
})
