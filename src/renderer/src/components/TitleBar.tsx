import { Minus, Square, X, Mic, ChevronDown } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { themes } from '../themes'

interface TitleBarProps {
  isRecording: boolean
  isProcessing: boolean
  currentTheme: string
  onThemeChange: (id: string) => void
}

export function TitleBar({ isRecording, isProcessing, currentTheme, onThemeChange }: TitleBarProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!open) return
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setDropPos({ top: rect.bottom + 4, left: rect.left })
    }
    const handler = (e: MouseEvent): void => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const current = themes.find((t) => t.id === currentTheme)

  return (
    <div
      className="titlebar-drag flex items-center justify-between h-10 px-4 shrink-0 relative"
      style={{ background: 'var(--surface-panel)', borderBottom: '1px solid var(--border)', zIndex: 30, borderRadius: 'var(--radius-panel)' }}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-bg-hover)' }}>
          <Mic size={13} style={{ color: 'var(--accent)' }} />
        </div>
        <span className="text-sm font-semibold tracking-wide" style={{ color: 'var(--text-2)' }}>VoiceType</span>

        {isRecording && (
          <div className="flex items-center gap-1.5 ml-3 px-2.5 py-0.5" style={{ background: 'var(--accent-bg)', borderColor: 'var(--border)', borderRadius: 'var(--radius-pill)' }}>
            <div className="w-2 h-2 bg-white rounded-full animate-pulse-recording" />
            <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Запись</span>
          </div>
        )}

        {isProcessing && (
          <div className="flex items-center gap-1.5 ml-3 px-2.5 py-0.5" style={{ background: 'var(--accent-bg)', borderColor: 'var(--border)', borderRadius: 'var(--radius-pill)' }}>
            <div className="w-2 h-2 bg-white/80 rounded-full animate-pulse" />
            <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Обработка</span>
          </div>
        )}

        {/* Переключатель тем */}
        <div className="titlebar-no-drag ml-4">
          <button
            ref={btnRef}
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1 px-2 py-1 rounded-md transition-colors"
            style={{ color: 'var(--text-4)' }}
          >
            <span className="text-[11px]">{current?.name}</span>
            <ChevronDown size={10} />
          </button>

          {open && createPortal(
            <div
              ref={dropRef}
              className="fixed py-1 rounded-lg min-w-[120px]"
              style={{ top: dropPos.top, left: dropPos.left, background: 'var(--surface-strong)', borderColor: 'var(--border)', zIndex: 99999, backdropFilter: 'blur(12px)' }}
            >
              {themes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { onThemeChange(t.id); setOpen(false) }}
                  className="w-full text-left px-3 py-1.5 text-[11px] transition-colors flex items-center gap-2"
                  style={{ color: t.id === currentTheme ? 'var(--accent)' : 'var(--text-3)' }}
                >
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: t.gradient }} />
                  {t.name}
                </button>
              ))}
            </div>,
            document.body
          )}
        </div>
      </div>

      <div className="titlebar-no-drag flex items-center">
        <button onClick={() => window.api.windowMinimize()} className="p-2 rounded transition-colors" style={{ color: 'var(--text-3)' }}><Minus size={14} /></button>
        <button onClick={() => window.api.windowMaximize()} className="p-2 rounded transition-colors" style={{ color: 'var(--text-3)' }}><Square size={12} /></button>
        <button onClick={() => window.api.windowClose()} className="p-2 rounded hover:bg-red-500/20 transition-colors" style={{ color: 'var(--text-3)' }}><X size={14} /></button>
      </div>
    </div>
  )
}
