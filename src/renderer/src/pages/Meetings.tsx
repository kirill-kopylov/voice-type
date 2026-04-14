import { useState, useRef, useEffect } from 'react'
import { Trash2, Users, AlertCircle, Edit2, Check, X, Play, Pause, Copy, UserPlus, Sparkles, Loader2, RotateCcw } from 'lucide-react'
import { MeetingRecord, DialogSegment, VoiceProfile } from '../types'
import { formatDateTime, formatDuration } from '../utils/format'

interface Props {
  meetings: MeetingRecord[]
  voiceProfiles: VoiceProfile[]
  isRecording: boolean
  onDelete: (id: string) => void
  onRenameSpeaker: (id: string, oldName: string, newName: string) => void
  onSaveVoiceProfile: (meetingId: string, speaker: string, name: string) => void
  onDeleteVoiceProfile: (id: string) => void
  onGenerateSummary: (meetingId: string) => void
  showToast: (message: string, type: 'success' | 'error') => void
}

export function Meetings({
  meetings, voiceProfiles, isRecording,
  onDelete, onRenameSpeaker, onSaveVoiceProfile, onDeleteVoiceProfile, onGenerateSummary, showToast
}: Props): JSX.Element {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showProfiles, setShowProfiles] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>Встречи</h1>
        <div className="flex items-center gap-3">
          {isRecording && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
              <div className="w-2 h-2 rounded-full animate-pulse-recording" style={{ background: 'var(--accent)' }} />
              <span className="text-xs font-medium">Запись идёт</span>
            </div>
          )}
          <button
            onClick={() => setShowProfiles(!showProfiles)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
            style={{ background: showProfiles ? 'var(--accent-bg-hover)' : 'var(--surface)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
          >
            <UserPlus size={13} /> Голоса ({voiceProfiles.length})
          </button>
        </div>
      </div>

      {showProfiles && (
        <VoiceProfilesPanel profiles={voiceProfiles} onDelete={onDeleteVoiceProfile} />
      )}

      <div className="glass rounded-xl p-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <Users size={18} style={{ color: 'var(--accent)' }} />
          <div className="text-sm" style={{ color: 'var(--text-2)' }}>
            <p>Хоткей по умолчанию <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--accent-bg)' }}>Ctrl+Shift+M</kbd> — старт/стоп записи. Микрофон + системный звук. Через OpenAI с разделением спикеров и автосаммари.</p>
            {voiceProfiles.length > 0 && (
              <p className="mt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
                Активные голосовые профили: {voiceProfiles.slice(0, 4).map((p) => p.name).join(', ')}
                {voiceProfiles.length > 4 && ` (используется первые 4 из ${voiceProfiles.length})`}
              </p>
            )}
          </div>
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
              onSaveVoiceProfile={(speaker, name) => onSaveVoiceProfile(m.id, speaker, name)}
              onGenerateSummary={() => onGenerateSummary(m.id)}
              showToast={showToast}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function VoiceProfilesPanel({ profiles, onDelete }: { profiles: VoiceProfile[]; onDelete: (id: string) => void }): JSX.Element {
  if (profiles.length === 0) {
    return (
      <div className="glass rounded-xl p-4 text-center text-xs" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-3)' }}>
        Нет сохранённых голосов. Раскройте встречу → нажмите на иконку рядом с именем спикера, чтобы создать профиль из его реплик.
      </div>
    )
  }

  return (
    <div className="glass rounded-xl p-4 space-y-2" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>Голосовые профили (используются в новых встречах)</p>
      <div className="flex flex-wrap gap-2">
        {profiles.map((p, i) => (
          <div
            key={p.id}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
            style={{
              background: i < 4 ? 'var(--accent-bg-hover)' : 'var(--accent-bg)',
              color: 'var(--text-1)'
            }}
          >
            <span className="font-medium">{p.name}</span>
            <span style={{ color: 'var(--text-4)' }}>{(p.durationMs / 1000).toFixed(1)}с · {p.segmentCount} реплик</span>
            <button onClick={() => onDelete(p.id)} style={{ color: 'var(--text-4)' }}><X size={12} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

function MeetingCard({
  meeting: m, expanded, onToggle, onDelete, onRenameSpeaker, onSaveVoiceProfile, onGenerateSummary, showToast
}: {
  meeting: MeetingRecord
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
  onRenameSpeaker: (oldName: string, newName: string) => void
  onSaveVoiceProfile: (speaker: string, name: string) => void
  onGenerateSummary: () => void
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
              {m.summaryStatus === 'pending' && ' · саммари готовится...'}
            </p>
          )}
        </div>
        <span className="text-xs shrink-0" style={{ color: 'var(--text-4)' }}>{formatDuration(m.durationMs)}</span>
        <span className="text-xs shrink-0" style={{ color: 'var(--text-4)' }}>{formatDateTime(m.createdAt)}</span>
      </div>

      {expanded && (
        <div className="px-4 py-4 space-y-4" style={{ borderTop: '1px solid var(--border)' }}>
          {/* Панель действий */}
          <div className="flex items-center gap-2 flex-wrap">
            <AudioPlayer fileName={m.audioFileName} />
            {m.status === 'success' && (
              <>
                <button
                  onClick={handleCopyDialog}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
                  style={{ background: 'var(--accent-bg)', color: 'var(--text-2)' }}
                >
                  <Copy size={12} /> Скопировать диалог
                </button>
                {(!m.summary || m.summaryStatus === 'error') && (
                  <button
                    onClick={onGenerateSummary}
                    disabled={m.summaryStatus === 'pending'}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors disabled:opacity-50"
                    style={{ background: 'var(--accent-bg-hover)', color: 'var(--accent)' }}
                  >
                    {m.summaryStatus === 'pending' ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    {m.summaryStatus === 'error' ? 'Повторить саммари' : 'Сделать саммари'}
                  </button>
                )}
                {m.summary && (
                  <button
                    onClick={onGenerateSummary}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
                    style={{ background: 'var(--accent-bg)', color: 'var(--text-3)' }}
                  >
                    <RotateCcw size={11} /> Пересчитать саммари
                  </button>
                )}
              </>
            )}
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ml-auto hover:bg-red-500/15"
              style={{ color: 'var(--text-4)' }}
            >
              <Trash2 size={12} /> Удалить
            </button>
          </div>

          {/* Саммари */}
          {m.summaryStatus === 'pending' && (
            <div className="p-3 rounded-lg flex items-center gap-2 text-xs" style={{ background: 'var(--accent-bg)', color: 'var(--text-3)' }}>
              <Loader2 size={12} className="animate-spin" /> Готовлю саммари встречи…
            </div>
          )}
          {m.summaryStatus === 'error' && m.summaryError && (
            <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5' }}>
              Не получилось сделать саммари: {m.summaryError}
            </div>
          )}
          {m.summary && <SummaryBlock summary={m.summary} speakerName={speakerName} />}

          {m.status === 'success' && (
            <>
              {/* Спикеры — переименование + сохранение голоса */}
              {uniqueSpeakers.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>Спикеры</p>
                  <div className="flex flex-wrap gap-2">
                    {uniqueSpeakers.map((s) => (
                      <SpeakerTag
                        key={s}
                        raw={s}
                        displayName={speakerName(s)}
                        onRename={(newName) => onRenameSpeaker(s, newName)}
                        onSaveProfile={(name) => onSaveVoiceProfile(s, name)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Диалог */}
              <div className="space-y-3">
                {m.segments.map((seg, i) => (
                  <DialogLine key={i} segment={seg} speakerName={speakerName(seg.speaker)} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function SummaryBlock({ summary, speakerName }: { summary: NonNullable<MeetingRecord['summary']>; speakerName: (raw: string) => string }): JSX.Element {
  return (
    <div className="p-4 rounded-lg space-y-3" style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)' }}>
      <div className="flex items-center gap-2">
        <Sparkles size={14} style={{ color: 'var(--accent)' }} />
        <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--accent)' }}>Саммари</span>
      </div>

      {summary.brief && (
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-1)' }}>{summary.brief}</p>
      )}

      {summary.topics.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-3)' }}>Темы</p>
          <div className="flex flex-wrap gap-1.5">
            {summary.topics.map((t, i) => (
              <span key={i} className="px-2 py-0.5 rounded text-xs" style={{ background: 'var(--surface)', color: 'var(--text-2)' }}>
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {summary.decisions.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-3)' }}>Договорённости</p>
          <ul className="space-y-1.5">
            {summary.decisions.map((d, i) => (
              <li key={i} className="text-sm flex gap-2" style={{ color: 'var(--text-2)' }}>
                <span style={{ color: 'var(--accent)' }}>•</span>
                <div>
                  <span>{d.text}</span>
                  {(d.assignee || d.deadline) && (
                    <span className="text-xs ml-2" style={{ color: 'var(--text-4)' }}>
                      {d.assignee && `→ ${speakerName(d.assignee)}`}
                      {d.assignee && d.deadline && ' · '}
                      {d.deadline && d.deadline}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function SpeakerTag({
  raw, displayName, onRename, onSaveProfile
}: {
  raw: string
  displayName: string
  onRename: (name: string) => void
  onSaveProfile: (name: string) => void
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(displayName)

  const save = (): void => {
    if (value.trim() && value !== displayName) onRename(value.trim())
    setEditing(false)
  }

  const handleSaveProfile = (): void => {
    const name = displayName.startsWith('Speaker') ? prompt('Имя для голосового профиля:') ?? '' : displayName
    if (name.trim()) onSaveProfile(name.trim())
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
    <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg" style={{ background: 'var(--accent-bg)' }}>
      <span className="text-xs" style={{ color: 'var(--text-2)' }}>{displayName}</span>
      <button onClick={() => setEditing(true)} title="Переименовать" style={{ color: 'var(--text-4)' }}>
        <Edit2 size={10} />
      </button>
      <button onClick={handleSaveProfile} title="Сохранить голос как профиль" style={{ color: 'var(--accent)' }}>
        <UserPlus size={11} />
      </button>
    </div>
  )
}

function AudioPlayer({ fileName }: { fileName: string }): JSX.Element {
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [])

  const toggle = async (): Promise<void> => {
    if (playing) {
      audioRef.current?.pause()
      setPlaying(false)
      return
    }

    if (audioRef.current && urlRef.current) {
      audioRef.current.play()
      setPlaying(true)
      return
    }

    setLoading(true)
    const buf = await window.api.getMeetingAudio(fileName)
    setLoading(false)
    if (!buf) return

    const blob = new Blob([buf], { type: 'audio/webm' })
    const url = URL.createObjectURL(blob)
    urlRef.current = url
    const audio = new Audio(url)
    audio.onended = () => setPlaying(false)
    audio.onpause = () => setPlaying(false)
    audio.onplay = () => setPlaying(true)
    audio.play()
    audioRef.current = audio
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors disabled:opacity-50"
      style={{ background: 'var(--accent-bg)', color: 'var(--text-2)' }}
    >
      {playing ? <Pause size={12} /> : <Play size={12} />}
      {loading ? 'Загрузка...' : playing ? 'Пауза' : 'Прослушать'}
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
