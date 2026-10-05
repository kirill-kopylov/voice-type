export interface ByteRange {
  start: number
  end: number // включительно
}

/**
 * Разбор заголовка Range для одного диапазона (так просит видеоплеер при перемотке).
 * null — заголовок не годится (или диапазон за пределами файла).
 */
export function parseByteRange(header: string, size: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || size <= 0) return null
  const [, first, last] = match
  if (first === '' && last === '') return null

  // «bytes=-500» — последние 500 байт
  const start = first === '' ? Math.max(0, size - Number(last)) : Number(first)
  const end = first === '' || last === '' ? size - 1 : Math.min(Number(last), size - 1)
  return start <= end && start < size ? { start, end } : null
}
