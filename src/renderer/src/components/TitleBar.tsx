import { Minus, Square, X, Mic } from 'lucide-react'

interface TitleBarProps {
  isRecording: boolean
  isProcessing: boolean
}

export function TitleBar({ isRecording, isProcessing }: TitleBarProps): JSX.Element {
  return (
    <div
      className="titlebar-drag flex items-center justify-between h-10 glass px-4 shrink-0 relative z-20"
      style={{ background: 'var(--surface-panel)', borderBottom: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-bg-hover)' }}>
          <Mic size={13} style={{ color: 'var(--accent)' }} />
        </div>
        <span className="text-sm font-semibold tracking-wide" style={{ color: 'var(--text-2)' }}>VoiceType</span>

        {isRecording && (
          <div className="flex items-center gap-1.5 ml-3 px-2.5 py-0.5 rounded-full" style={{ background: 'var(--accent-bg)', border: '1px solid var(--border)' }}>
            <div className="w-2 h-2 bg-white rounded-full animate-pulse-recording" />
            <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Запись</span>
          </div>
        )}

        {isProcessing && (
          <div className="flex items-center gap-1.5 ml-3 px-2.5 py-0.5 rounded-full" style={{ background: 'var(--accent-bg)', border: '1px solid var(--border)' }}>
            <div className="w-2 h-2 bg-white/80 rounded-full animate-pulse" />
            <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Обработка</span>
          </div>
        )}
      </div>

      <div className="titlebar-no-drag flex items-center">
        <button onClick={() => window.api.windowMinimize()} className="p-2 rounded transition-colors" style={{ color: 'var(--text-3)' }}><Minus size={14} /></button>
        <button onClick={() => window.api.windowMaximize()} className="p-2 rounded transition-colors" style={{ color: 'var(--text-3)' }}><Square size={12} /></button>
        <button onClick={() => window.api.windowClose()} className="p-2 rounded hover:bg-red-500/20 transition-colors" style={{ color: 'var(--text-3)' }}><X size={14} /></button>
      </div>
    </div>
  )
}
