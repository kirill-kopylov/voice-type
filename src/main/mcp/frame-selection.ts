// Какие кадры показать агенту: равномерно по отрезку, без почти одинаковых соседей. Без ffmpeg и electron.

// Средняя разница серых «отпечатков» кадров (0..255), с которой кадры считаются разными.
// Курсор или мигание почти ничего не меняют, а смена окна или строка текста — заметно больше.
export const DEFAULT_MIN_DIFFERENCE = 1.5

export interface FrameCandidate {
  atSec: number
  /** Уменьшенный серый кадр: по нему сравниваем, не декодируя картинку целиком */
  signature: Uint8Array
}

/** n точек от from до to включительно; одна точка — начало отрезка. */
export function frameTimes(fromSec: number, toSec: number, count: number): number[] {
  if (count <= 1 || toSec <= fromSec) return [fromSec]
  const step = (toSec - fromSec) / (count - 1)
  return Array.from({ length: count }, (_, i) => Math.round((fromSec + step * i) * 100) / 100)
}

export function meanAbsDifference(a: Uint8Array, b: Uint8Array): number {
  const length = Math.min(a.length, b.length)
  if (length === 0) return 0
  let sum = 0
  for (let i = 0; i < length; i++) sum += Math.abs(a[i] - b[i])
  return sum / length
}

/** Равномерно выбирает count элементов, сохраняя первый и последний. */
function evenlySpaced<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items
  if (count <= 1) return [items[0]]
  return Array.from({ length: count }, (_, i) => items[Math.round((i * (items.length - 1)) / (count - 1))])
}

/**
 * Идём по кадрам во времени и оставляем те, что заметно отличаются от последнего оставленного.
 * Остаётся больше count — берём равномерно; меньше — отдаём сколько есть, на экране просто ничего не менялось.
 */
export function pickDistinctFrames<T extends FrameCandidate>(candidates: T[], count: number, minDifference = DEFAULT_MIN_DIFFERENCE): T[] {
  const distinct = candidates.reduce<T[]>((kept, frame) => {
    const last = kept[kept.length - 1]
    if (!last || meanAbsDifference(last.signature, frame.signature) >= minDifference) kept.push(frame)
    return kept
  }, [])
  return evenlySpaced(distinct, count)
}
