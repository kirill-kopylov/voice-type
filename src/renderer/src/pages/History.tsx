import { useState, useRef } from 'react'
import { Search, Trash2, Copy, ClipboardPaste, Play, Pause, X, AlertCircle, RotateCcw } from 'lucide-react'
import { TranscriptionRecord } from '../types'
import { formatDateTime, formatDuration } from '../utils/format'

interface HistoryProps {
  history: TranscriptionRecord[]
  onDelete: (id: string) => void
  onClear: () => void
  onRetry: (id: string) => void
  showToast: (message: string, type: 'success' | 'error') => void
}

export function History({ history, onDelete, onClear, onRetry, showToast }: HistoryProps): JSX.Element {
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const filtered = search.trim()
    ? history.filter((r) => r.text.toLowerCase().includes(search.toLowerCase()) || r.error?.toLowerCase().includes(search.toLowerCase()))
    : history

  const handleCopy = async (text: string): Promise<void> => { await window.api.copyText(text); showToast('Скопировано', 'success') }
  const handleRePaste = async (id: string): Promise<void> => { await window.api.rePaste(id); showToast('Вставлено', 'success') }

  const handlePlayAudio = async (record: TranscriptionRecord): Promise<void> => {
    if (playingId === record.id) { audioRef.current?.pause(); setPlayingId(null); return }
    const buf = await window.api.getAudio(record.audioFileName)
    if (!buf) { showToast('Аудио не найдено', 'error'); return }
    if (audioRef.current) audioRef.current.pause()
    const blob = new Blob([buf], { type: 'audio/webm' })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.onended = () => { setPlayingId(null); URL.revokeObjectURL(url) }
    audio.play(); audioRef.current = audio; setPlayingId(record.id)
  }

  const handleClearAll = (): void => {
    if (!confirmClear) { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); return }
    onClear(); setConfirmClear(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>История</h1>
        {history.length > 0 && (
          <button onClick={handleClearAll} className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors"
            style={{ color: confirmClear ? '#fca5a5' : 'var(--text-3)', background: confirmClear ? 'rgba(239,68,68,0.15)' : 'transparent' }}>
            <Trash2 size={14} />{confirmClear ? 'Точно удалить?' : 'Очистить'}
          </button>
        )}
      </div>

      {history.length > 0 && (
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-4)' }} />
          <input type="text" placeholder="Поиск..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 glass rounded-xl text-sm"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-1)' }} />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-4)' }}><X size={14} /></button>}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--text-3)' }}>
          {history.length === 0 ? (<><p className="text-lg font-medium">Пока нет записей</p><p className="text-sm mt-1" style={{ color: 'var(--text-4)' }}>Нажмите горячую клавишу</p></>) : (<p className="text-sm">Ничего не найдено</p>)}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((record) => (
            <div key={record.id} className="glass rounded-xl overflow-hidden transition-colors"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}>
                <div className={`w-2 h-2 rounded-full shrink-0 ${record.status === 'success' ? 'bg-green-300' : 'bg-red-300'}`} />
                <p className="flex-1 text-sm truncate" style={{ color: 'var(--text-2)' }}>
                  {record.status === 'error' ? <span className="flex items-center gap-1.5" style={{ color: '#fca5a5' }}><AlertCircle size={13} />{record.error}</span> : record.text}
                </p>
                <span className="text-xs shrink-0" style={{ color: 'var(--text-4)' }}>{formatDuration(record.durationMs)}</span>
                <span className="text-xs shrink-0" style={{ color: 'var(--text-4)' }}>{formatDateTime(record.createdAt)}</span>
              </div>

              {expandedId === record.id && (
                <div className="px-4 py-3 space-y-3" style={{ borderTop: '1px solid var(--border)' }}>
                  {record.status === 'success' && <p className="text-sm whitespace-pre-wrap leading-relaxed select-text" style={{ color: 'var(--text-2)' }}>{record.text}</p>}
                  <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-4)' }}>
                    <span className="px-2 py-0.5 rounded" style={{ background: 'var(--accent-bg)' }}>{record.provider === 'openai' ? 'OpenAI' : 'OpenRouter'}</span>
                    <span>{record.model}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Btn onClick={() => handlePlayAudio(record)} icon={playingId === record.id ? Pause : Play}>{playingId === record.id ? 'Стоп' : 'Слушать'}</Btn>
                    {record.status === 'success' && <>
                      <Btn onClick={() => handleCopy(record.text)} icon={Copy}>Копировать</Btn>
                      <Btn onClick={() => handleRePaste(record.id)} icon={ClipboardPaste} accent>Вставить</Btn>
                    </>}
                    {record.status === 'error' && (
                      <Btn onClick={() => onRetry(record.id)} icon={RotateCcw} accent>Повторить</Btn>
                    )}
                    <button onClick={() => onDelete(record.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ml-auto hover:bg-red-500/15"
                      style={{ color: 'var(--text-4)' }}><Trash2 size={13} />Удалить</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Btn({ onClick, icon: Icon, accent, children }: { onClick: () => void; icon: typeof Play; accent?: boolean; children: React.ReactNode }): JSX.Element {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
      style={{ background: accent ? 'var(--accent-bg-hover)' : 'var(--accent-bg)', color: 'var(--text-2)' }}>
      <Icon size={13} />{children}
    </button>
  )
}
