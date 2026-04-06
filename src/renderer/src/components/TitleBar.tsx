import { Minus, Square, X, Mic, ChevronDown } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { themes, ThemeTitlebar } from '../themes'

interface TitleBarProps {
  isRecording: boolean
  isProcessing: boolean
  currentTheme: string
  onThemeChange: (id: string) => void
  titlebarConfig: ThemeTitlebar
}

export function TitleBar({ isRecording, isProcessing, currentTheme, onThemeChange, titlebarConfig }: TitleBarProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 })

  const tb = titlebarConfig

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

  const btnStyle = {
    padding: '4px 6px',
    borderRadius: tb.buttonRadius,
    background: tb.buttonBg,
    color: tb.buttonColor,
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.15s',
  }

  return (
    <div
      className="titlebar-drag flex items-center justify-between h-10 px-4 shrink-0 relative"
      style={{ background: 'var(--surface-panel)', borderBottom: '1px solid var(--border)', zIndex: 30, borderRadius: 'var(--radius-panel)' }}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-6 h-6 flex items-center justify-center" style={{ background: 'var(--accent-bg-hover)', borderRadius: 'var(--radius)' }}>
          <Mic size={13} style={{ color: 'var(--accent)' }} />
        </div>
        <span className="text-sm font-semibold tracking-wide" style={{ color: tb.titleColor }}>VoiceType</span>

        {isRecording && (
          <div className="flex items-center gap-1.5 ml-3 px-2.5 py-0.5"
            style={{ background: 'var(--accent-bg)', borderRadius: 'var(--radius-pill)', border: '1px solid var(--border)' }}>
            <div className="w-2 h-2 rounded-full animate-pulse-recording" style={{ background: tb.titleColor }} />
            <span className="text-xs font-medium" style={{ color: tb.titleColor }}>Запись</span>
          </div>
        )}

        {isProcessing && (
          <div className="flex items-center gap-1.5 ml-3 px-2.5 py-0.5"
            style={{ background: 'var(--accent-bg)', borderRadius: 'var(--radius-pill)', border: '1px solid var(--border)' }}>
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: tb.titleColor, opacity: 0.7 }} />
            <span className="text-xs font-medium" style={{ color: tb.titleColor }}>Обработка</span>
          </div>
        )}

        <div className="titlebar-no-drag ml-4">
          <button
            ref={btnRef}
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1 px-2 py-1 transition-colors"
            style={{ color: 'var(--text-4)', borderRadius: tb.buttonRadius }}
          >
            <span className="text-[11px]">{current?.name}</span>
            <ChevronDown size={10} />
          </button>

          {open && createPortal(
            <div
              ref={dropRef}
              className="fixed py-1 min-w-[120px]"
              style={{ top: dropPos.top, left: dropPos.left, background: 'var(--surface-strong)', border: '1px solid var(--border)', zIndex: 99999, backdropFilter: 'blur(12px)', borderRadius: 'var(--radius)' }}
            >
              {themes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { onThemeChange(t.id); setOpen(false) }}
                  className="w-full text-left px-3 py-1.5 text-[11px] transition-colors flex items-center gap-2"
                  style={{ color: t.id === currentTheme ? 'var(--accent)' : 'var(--text-3)' }}
                >
                  <div className="w-3 h-3 shrink-0" style={{ background: t.gradient, borderRadius: t.ui.radius > 0 ? 9999 : 0 }} />
                  {t.name}
                </button>
              ))}
            </div>,
            document.body
          )}
        </div>
      </div>

      <div className="titlebar-no-drag flex items-center gap-0.5">
        {tb.buttonStyle === 'classic' ? (
          <>
            <button onClick={() => window.api.windowMinimize()} style={{ ...btnStyle, fontSize: 11, fontWeight: 'bold', width: 22, height: 20, boxShadow: 'inset -1px -1px 0 #808080, inset 1px 1px 0 #ffffff' }}>_</button>
            <button onClick={() => window.api.windowMaximize()} style={{ ...btnStyle, fontSize: 10, fontWeight: 'bold', width: 22, height: 20, boxShadow: 'inset -1px -1px 0 #808080, inset 1px 1px 0 #ffffff' }}>□</button>
            <button onClick={() => window.api.windowClose()} style={{ ...btnStyle, fontSize: 11, fontWeight: 'bold', width: 22, height: 20, boxShadow: 'inset -1px -1px 0 #808080, inset 1px 1px 0 #ffffff' }}>✕</button>
          </>
        ) : (
          <>
            <button onClick={() => window.api.windowMinimize()} style={btnStyle}
              onMouseEnter={(e) => { e.currentTarget.style.background = tb.buttonBgHover }}
              onMouseLeave={(e) => { e.currentTarget.style.background = tb.buttonBg }}>
              <Minus size={14} />
            </button>
            <button onClick={() => window.api.windowMaximize()} style={btnStyle}
              onMouseEnter={(e) => { e.currentTarget.style.background = tb.buttonBgHover }}
              onMouseLeave={(e) => { e.currentTarget.style.background = tb.buttonBg }}>
              <Square size={12} />
            </button>
            <button onClick={() => window.api.windowClose()} style={btnStyle}
              onMouseEnter={(e) => { e.currentTarget.style.background = tb.buttonCloseHover; e.currentTarget.style.color = '#ef4444' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = tb.buttonBg; e.currentTarget.style.color = tb.buttonColor }}>
              <X size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
