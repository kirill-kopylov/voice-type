import { useState } from 'react'
import { Trash2, Users, AlertCircle, Edit2, Check, X, Play, Pause } from 'lucide-react'
import { MeetingRecord, DialogSegment } from '../types'
import { formatDateTime, formatDuration } from '../utils/format'

interface Props {
  meetings: MeetingRecord[]
  isRecording: boolean
  onDelete: (id: string) => void
  onRenameSpeaker: (id: string, oldName: string, newName: string) => void
  showToast: (message: string, type: 'success' | 'error') => void
}

export function Meetings({ meetings, isRecording, onDelete, onRenameSpeaker, showToast }: Props): JSX.Element {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>Встречи</h1>
        {isRecording && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
            <div className="w-2 h-2 rounded-full animate-pulse-recording" style={{ background: 'var(--accent)' }} />
            <span className="text-xs font-medium">Запись идёт</span>
          </div>
        )}
      </div>

      <div className="glass rounded-xl p-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <Users size={18} style={{ color: 'var(--accent)' }} />
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>
            Нажмите горячую клавишу meeting (по умолчанию Ctrl+Shift+M) чтобы начать/остановить запись встречи.
            Записывается микрофон + системное аудио (Zoom, Meet, Teams). Распознавание через OpenAI с разделением спикеров.
          </p>
        </div>
      </div>

      {meetings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--text-3)' }}>
          <p className="text-lg font-medium">Нет записанных встреч</p>
        </div>
      ) : (
        <div className="space-y-3">
          {meetings.map((m) => (
            <MeetingCard
              key={m.id}
              meeting={m}
              expanded={expandedId === m.id}
              onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)}
              onDelete={() => onDelete(m.id)}
              onRenameSpeaker={(oldName, newName) => onRenameSpeaker(m.id, oldName, newName)}
              showToast={showToast}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function MeetingCard({
  meeting: m, expanded, onToggle, onDelete, onRenameSpeaker, showToast
}: {
  meeting: MeetingRecord
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
  onRenameSpeaker: (oldName: string, newName: string) => void
  showToast: (message: string, type: 'success' | 'error') => void
}): JSX.Element {
  const speakerName = (raw: string): string => m.speakerNames[raw] ?? raw
  const uniqueSpeakers = Array.from(new Set(m.segments.map((s) => s.speaker)))

  const handleCopyDialog = (): void => {
    const text = m.segments.map((s) => `${speakerName(s.speaker)}: ${s.text}`).join('\n\n')
    window.api.copyText(text)
    showToast('Диалог скопирован', 'success')
  }

  return (
    <div className="glass rounded-xl overflow-hidden transition-colors" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={onToggle}>
        <div className={`w-2 h-2 rounded-full shrink-0 ${m.status === 'success' ? 'bg-green-300' : 'bg-red-300'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{m.title}</p>
          {m.status === 'error' ? (
            <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: '#fca5a5' }}>
              <AlertCircle size={11} /> {m.error}
            </p>
          ) : (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-4)' }}>
              {m.segments.length} реплик · {uniqueSpeakers.length} {uniqueSpeakers.length === 1 ? 'спикер' : 'спикеров'}
            </p>
          )}
        </div>
        <span className="text-xs shrink-0" style={{ color: 'var(--text-4)' }}>{formatDuration(m.durationMs)}</span>
        <span className="text-xs shrink-0" style={{ color: 'var(--text-4)' }}>{formatDateTime(m.createdAt)}</span>
      </div>

      {expanded && (
        <div className="px-4 py-4 space-y-4" style={{ borderTop: '1px solid var(--border)' }}>
          {m.status === 'success' && (
            <>
              {/* Спикеры с редактированием */}
              {uniqueSpeakers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {uniqueSpeakers.map((s) => (
                    <SpeakerTag
                      key={s}
                      raw={s}
                      displayName={speakerName(s)}
                      onRename={(newName) => onRenameSpeaker(s, newName)}
                    />
                  ))}
                </div>
              )}

              {/* Диалог */}
              <div className="space-y-3">
                {m.segments.map((seg, i) => (
                  <DialogLine key={i} segment={seg} speakerName={speakerName(seg.speaker)} />
                ))}
              </div>

              <div className="flex gap-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                <button
                  onClick={handleCopyDialog}
                  className="px-3 py-1.5 text-xs rounded-lg transition-colors"
                  style={{ background: 'var(--accent-bg)', color: 'var(--text-2)' }}
                >
                  Скопировать диалог
                </button>
                <button
                  onClick={onDelete}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ml-auto hover:bg-red-500/15"
                  style={{ color: 'var(--text-4)' }}
                >
                  <Trash2 size={12} /> Удалить
                </button>
              </div>
            </>
          )}

          {m.status === 'error' && (
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors hover:bg-red-500/15"
              style={{ color: 'var(--text-4)' }}
            >
              <Trash2 size={12} /> Удалить
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function SpeakerTag({ raw, displayName, onRename }: { raw: string; displayName: string; onRename: (name: string) => void }): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(displayName)

  const save = (): void => {
    if (value.trim() && value !== displayName) onRename(value.trim())
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'var(--accent-bg)' }}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setValue(displayName); setEditing(false) } }}
          className="text-xs bg-transparent focus:outline-none w-24"
          style={{ color: 'var(--text-1)' }}
          autoFocus
        />
        <button onClick={save} style={{ color: 'var(--accent)' }}><Check size={12} /></button>
        <button onClick={() => { setValue(displayName); setEditing(false) }} style={{ color: 'var(--text-4)' }}><X size={12} /></button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors"
      style={{ background: 'var(--accent-bg)', color: 'var(--text-2)' }}
      title={`Переименовать (исходно: ${raw})`}
    >
      <span>{displayName}</span>
      <Edit2 size={10} style={{ color: 'var(--text-4)' }} />
    </button>
  )
}

function DialogLine({ segment, speakerName }: { segment: DialogSegment; speakerName: string }): JSX.Element {
  const mins = Math.floor(segment.start / 60)
  const secs = Math.floor(segment.start % 60).toString().padStart(2, '0')

  return (
    <div className="flex gap-3 select-text">
      <div className="shrink-0 w-24 pt-0.5">
        <div className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>{speakerName}</div>
        <div className="text-[10px]" style={{ color: 'var(--text-4)' }}>{mins}:{secs}</div>
      </div>
      <p className="text-sm leading-relaxed flex-1" style={{ color: 'var(--text-1)' }}>{segment.text}</p>
    </div>
  )
}
