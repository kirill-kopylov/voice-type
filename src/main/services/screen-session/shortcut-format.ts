// Какие нажатия клавиш попадают в запись событий. Без electron и нативных модулей.
// Приватность: обычный набираемый текст не пишем — только сочетания с Ctrl/Alt/Win и служебные клавиши.

export interface Modifiers {
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}

const MODIFIER_KEYS = new Set(['Ctrl', 'CtrlRight', 'Alt', 'AltRight', 'Shift', 'ShiftRight', 'Meta', 'MetaRight'])
const SERVICE_KEYS = new Set(['Enter', 'NumpadEnter', 'Escape', 'Tab', 'PrintScreen'])
const FUNCTION_KEY = /^F\d{1,2}$/

/**
 * Описание нажатия вроде «Ctrl+Shift+S» или «Enter»; null — клавишу не записываем.
 * keyName — имя клавиши из таблицы uiohook (A, Enter, F5, ArrowLeft…).
 */
export function describeShortcut(keyName: string | undefined, modifiers: Modifiers): string | null {
  if (!keyName || MODIFIER_KEYS.has(keyName)) return null

  const isService = SERVICE_KEYS.has(keyName) || FUNCTION_KEY.test(keyName)
  const hasCommandModifier = modifiers.ctrl || modifiers.alt || modifiers.meta
  if (!isService && !hasCommandModifier) return null

  const parts = [
    modifiers.ctrl && 'Ctrl',
    modifiers.alt && 'Alt',
    modifiers.shift && 'Shift',
    modifiers.meta && 'Win',
    keyName === 'NumpadEnter' ? 'Enter' : keyName
  ]
  return parts.filter(Boolean).join('+')
}
