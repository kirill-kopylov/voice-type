import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'

interface SelectOption {
  value: string
  label: string
  sub?: string
}

interface SelectProps {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
}

export function Select({ value, options, onChange, placeholder }: SelectProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })

  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
    const handler = (e: MouseEvent): void => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 glass rounded-xl text-sm text-left transition-colors"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
      >
        <div className="flex-1 min-w-0">
          <span style={{ color: selected ? 'var(--text-1)' : 'var(--text-4)' }}>
            {selected?.label ?? placeholder ?? 'Выбрать...'}
          </span>
          {selected?.sub && <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-4)' }}>{selected.sub}</div>}
        </div>
        <ChevronDown size={14} style={{ color: 'var(--text-4)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && createPortal(
        <div
          ref={dropRef}
          className="fixed rounded-xl overflow-hidden"
          style={{
            top: pos.top,
            left: pos.left,
            width: pos.width,
            maxHeight: 240,
            overflowY: 'auto',
            background: 'var(--surface-strong)',
            border: '1px solid var(--border)',
            zIndex: 99999,
            backdropFilter: 'blur(12px)',
            borderRadius: 'var(--radius)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
          }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm text-left transition-colors"
              style={{
                color: opt.value === value ? 'var(--accent)' : 'var(--text-2)',
                background: opt.value === value ? 'var(--accent-bg)' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (opt.value !== value) e.currentTarget.style.background = 'var(--accent-bg)'
              }}
              onMouseLeave={(e) => {
                if (opt.value !== value) e.currentTarget.style.background = 'transparent'
              }}
            >
              <div className="flex-1 min-w-0">
                <div>{opt.label}</div>
                {opt.sub && <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-4)' }}>{opt.sub}</div>}
              </div>
              {opt.value === value && <Check size={14} className="shrink-0" style={{ color: 'var(--accent)' }} />}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}
