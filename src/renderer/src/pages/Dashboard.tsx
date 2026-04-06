import { Mic, MicOff, Activity, Clock, FileText, AlertCircle } from 'lucide-react'
import { TranscriptionRecord, AppSettings } from '../types'
import { formatDuration, formatRelativeDate } from '../utils/format'

interface DashboardProps {
  isRecording: boolean
  isProcessing: boolean
  history: TranscriptionRecord[]
  settings: AppSettings | null
}

export function Dashboard({ isRecording, isProcessing, history, settings }: DashboardProps): JSX.Element {
  const hotkeyLabel = (settings?.hotkey ?? '').replace('CommandOrControl', 'Ctrl').replace('CmdOrCtrl', 'Ctrl')

  const todayCount = history.filter((r) => new Date(r.createdAt).toDateString() === new Date().toDateString()).length
  const totalDuration = history.reduce((sum, r) => sum + r.durationMs, 0)
  const errorCount = history.filter((r) => r.status === 'error').length
  const recentItems = history.slice(0, 5)

  const hasApiKey = settings ? (settings.provider === 'openai' ? !!settings.openAiApiKey : !!settings.openRouterApiKey) : false

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>Дашборд</h1>

      {!hasApiKey && (
        <div className="flex items-center gap-3 p-4 glass rounded-xl" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <AlertCircle size={20} style={{ color: 'var(--text-2)' }} />
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>
            API ключ не настроен. Перейдите в <span className="font-semibold">Настройки</span>.
          </p>
        </div>
      )}

      <div className="flex items-center justify-center py-10">
        <div className="flex flex-col items-center gap-5">
          <div
            className={`w-28 h-28 flex items-center justify-center glass transition-all duration-300`}
            style={{
              borderRadius: 'var(--radius-pill)',
              background: isRecording ? 'rgba(255,255,255,0.15)' : isProcessing ? 'rgba(255,255,255,0.1)' : 'var(--surface)',
              border: `2px solid ${isRecording ? 'rgba(255,255,255,0.4)' : 'var(--border)'}`,
              boxShadow: isRecording ? '0 0 40px rgba(255,255,255,0.15)' : 'none'
            }}
          >
            {isRecording ? (
              <Mic size={40} className="text-white animate-pulse-recording" />
            ) : isProcessing ? (
              <Activity size={40} className="text-white/70 animate-pulse" />
            ) : (
              <MicOff size={40} style={{ color: 'var(--text-3)' }} />
            )}
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold" style={{ color: 'var(--text-1)' }}>
              {isRecording ? 'Идёт запись...' : isProcessing ? 'Обработка...' : 'Ожидание'}
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
              {isRecording ? `Нажмите ${hotkeyLabel} для остановки` : `Нажмите ${hotkeyLabel} для начала записи`}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { icon: FileText, label: 'Всего записей', value: String(history.length) },
          { icon: Activity, label: 'Сегодня', value: String(todayCount) },
          { icon: Clock, label: 'Длительность', value: formatDuration(totalDuration) },
          { icon: AlertCircle, label: 'Ошибки', value: String(errorCount) },
        ].map((card, i) => (
          <div key={i} className="p-4 rounded-xl glass" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <card.icon size={20} className="mb-2" style={{ color: 'var(--text-3)' }} />
            <p className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>{card.value}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-4)' }}>{card.label}</p>
          </div>
        ))}
      </div>

      {recentItems.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-1)' }}>Последние записи</h2>
          <div className="space-y-2">
            {recentItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-4 p-4 glass rounded-xl transition-colors"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${item.status === 'success' ? 'bg-green-300' : 'bg-red-300'}`} />
                <p className="flex-1 text-sm truncate" style={{ color: 'var(--text-2)' }}>
                  {item.status === 'error' ? item.error : item.text}
                </p>
                <span className="text-xs shrink-0" style={{ color: 'var(--text-4)' }}>{formatRelativeDate(item.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
