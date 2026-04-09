import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Plus } from 'lucide-react'

interface HotkeyInputProps {
  value: string
  onChange: (value: string) => void
}

const MODIFIERS = [
  { label: 'Ctrl/Cmd', value: 'CommandOrControl' },
  { label: 'Shift', value: 'Shift' },
  { label: 'Alt', value: 'Alt' },
]

const KEYS = [
  { label: 'Space', value: 'Space' },
  { label: 'Enter', value: 'Return' },
  { label: 'Tab', value: 'Tab' },
  ...Array.from({ length: 12 }, (_, i) => ({ label: `F${i + 1}`, value: `F${i + 1}` })),
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => ({ label: c, value: c })),
  ...'0123456789'.split('').map((c) => ({ label: c, value: c })),
]

export function HotkeyInput({ value, onChange }: HotkeyInputProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!open) return
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left })
    }
    const handler = (e: MouseEvent): void => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const insert = (part: string): void => {
    const current = value.trim()
    if (!current) {
      onChange(part)
    } else if (current.endsWith('+')) {
      onChange(current + part)
    } else {
      onChange(current + '+' + part)
    }
  }

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 px-3.5 py-2.5 glass rounded-xl text-sm focus:outline-none"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
      />
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="px-2.5 py-2.5 glass rounded-xl transition-colors"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-3)' }}
      >
        <Plus size={14} />
      </button>

      {open && createPortal(
        <div
          ref={dropRef}
          className="fixed rounded-xl overflow-hidden"
          style={{
            top: pos.top, left: pos.left,
            width: 280, maxHeight: 320, overflowY: 'auto',
            background: 'var(--surface-strong)',
            border: '1px solid var(--border)',
            zIndex: 99999,
            backdropFilter: 'blur(12px)',
            borderRadius: 'var(--radius)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            padding: 8
          }}
        >
          <div className="text-[10px] uppercase tracking-wider px-2 py-1" style={{ color: 'var(--text-4)' }}>Модификаторы</div>
          <div className="flex flex-wrap gap-1 px-1 mb-2">
            {MODIFIERS.map((m) => (
              <button key={m.value} onClick={() => insert(m.value)}
                className="px-2.5 py-1 text-xs rounded-lg transition-colors"
                style={{ background: 'var(--accent-bg)', color: 'var(--text-2)' }}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="text-[10px] uppercase tracking-wider px-2 py-1" style={{ color: 'var(--text-4)' }}>Клавиши</div>
          <div className="flex flex-wrap gap-1 px-1">
            {KEYS.map((k) => (
              <button key={k.value} onClick={() => { insert(k.value); setOpen(false) }}
                className="px-2 py-1 text-xs rounded-lg transition-colors"
                style={{ background: 'var(--accent-bg)', color: 'var(--text-2)' }}>
                {k.label}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
