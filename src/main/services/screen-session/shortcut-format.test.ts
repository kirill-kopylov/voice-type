import { describe, expect, it } from 'vitest'
import { describeShortcut, type Modifiers } from './shortcut-format'

const none: Modifiers = { ctrl: false, alt: false, shift: false, meta: false }

describe('describeShortcut', () => {
  it('набираемый текст не записывается — ни буквы, ни цифры, ни Shift+буква', () => {
    expect(describeShortcut('A', none)).toBeNull()
    expect(describeShortcut('5', none)).toBeNull()
    expect(describeShortcut('P', { ...none, shift: true })).toBeNull()
    expect(describeShortcut('Space', none)).toBeNull()
    expect(describeShortcut('Backspace', none)).toBeNull()
  })

  it('сочетания с Ctrl, Alt или Win записываются в порядке Ctrl, Alt, Shift, Win', () => {
    expect(describeShortcut('S', { ...none, ctrl: true })).toBe('Ctrl+S')
    expect(describeShortcut('Tab', { ...none, alt: true })).toBe('Alt+Tab')
    expect(describeShortcut('Z', { ctrl: true, alt: false, shift: true, meta: false })).toBe('Ctrl+Shift+Z')
    expect(describeShortcut('D', { ...none, meta: true })).toBe('Win+D')
  })

  it('служебные клавиши записываются и без модификаторов', () => {
    expect(describeShortcut('Enter', none)).toBe('Enter')
    expect(describeShortcut('NumpadEnter', none)).toBe('Enter')
    expect(describeShortcut('Escape', none)).toBe('Escape')
    expect(describeShortcut('F5', none)).toBe('F5')
  })

  it('сами модификаторы и неизвестные клавиши пропускаются', () => {
    expect(describeShortcut('Ctrl', { ...none, ctrl: true })).toBeNull()
    expect(describeShortcut('ShiftRight', { ...none, shift: true })).toBeNull()
    expect(describeShortcut(undefined, { ...none, ctrl: true })).toBeNull()
  })
})
