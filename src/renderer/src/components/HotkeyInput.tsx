import { useState, useRef } from 'react'
import { Keyboard } from 'lucide-react'

interface HotkeyInputProps {
  value: string
  onChange: (value: string) => void
}

function keyEventToAccelerator(e: React.KeyboardEvent): string | null {
  // Игнорируем одиночные модификаторы
  const modifierKeys = ['Control', 'Shift', 'Alt', 'Meta']
  if (modifierKeys.includes(e.key)) return null

  const parts: string[] = []

  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')

  // Маппинг клавиш в формат Electron
  const keyMap: Record<string, string> = {
    ' ': 'Space',
    'ArrowUp': 'Up',
    'ArrowDown': 'Down',
    'ArrowLeft': 'Left',
    'ArrowRight': 'Right',
    'Enter': 'Return',
    'Escape': 'Escape',
    'Backspace': 'Backspace',
    'Delete': 'Delete',
    'Tab': 'Tab',
    'Home': 'Home',
    'End': 'End',
    'PageUp': 'PageUp',
    'PageDown': 'PageDown',
    'Insert': 'Insert',
  }

  let key = e.key

  if (keyMap[key]) {
    key = keyMap[key]
  } else if (key.startsWith('F') && key.length <= 3 && !isNaN(Number(key.slice(1)))) {
    // F1-F24 — оставляем как есть
  } else if (key.length === 1) {
    key = key.toUpperCase()
  } else {
    return null
  }

  // Нужен хотя бы один модификатор (кроме F-клавиш)
  if (parts.length === 0 && !key.startsWith('F')) return null

  parts.push(key)
  return parts.join('+')
}

export function HotkeyInput({ value, onChange }: HotkeyInputProps): JSX.Element {
  const [capturing, setCapturing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    e.preventDefault()
    e.stopPropagation()

    const accelerator = keyEventToAccelerator(e)
    if (accelerator) {
      onChange(accelerator)
      setCapturing(false)
      inputRef.current?.blur()
    }
  }

  const displayValue = value
    .replace('CommandOrControl', 'Ctrl')
    .replace('CmdOrCtrl', 'Ctrl')

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        readOnly
        value={capturing ? 'Нажмите сочетание клавиш...' : displayValue}
        onFocus={() => setCapturing(true)}
        onBlur={() => setCapturing(false)}
        onKeyDown={handleKeyDown}
        className="w-full px-3.5 py-2.5 pr-10 glass rounded-xl text-sm cursor-pointer focus:outline-none"
        style={{
          background: 'var(--surface)',
          borderColor: capturing ? 'var(--accent)' : 'var(--border)',
          color: capturing ? 'var(--accent)' : 'var(--text-1)',
        }}
      />
      <Keyboard
        size={14}
        className="absolute right-3 top-1/2 -translate-y-1/2"
        style={{ color: capturing ? 'var(--accent)' : 'var(--text-4)' }}
      />
    </div>
  )
}
