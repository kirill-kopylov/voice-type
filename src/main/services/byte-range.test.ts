import { describe, it, expect } from 'vitest'
import { parseByteRange } from './byte-range'

describe('parseByteRange', () => {
  it('диапазон с обоими концами', () => {
    expect(parseByteRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 })
  })

  it('открытый конец тянется до конца файла', () => {
    expect(parseByteRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 })
  })

  it('конец за пределами файла обрезается', () => {
    expect(parseByteRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 })
  })

  it('«последние N байт»', () => {
    expect(parseByteRange('bytes=-30', 100)).toEqual({ start: 70, end: 99 })
  })

  it('начало за концом файла и мусор отвергаются', () => {
    expect(parseByteRange('bytes=100-', 100)).toBeNull()
    expect(parseByteRange('bytes=20-10', 100)).toBeNull()
    expect(parseByteRange('lines=1-2', 100)).toBeNull()
    expect(parseByteRange('bytes=-', 100)).toBeNull()
  })
})
