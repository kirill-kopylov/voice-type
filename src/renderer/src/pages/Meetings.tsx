import { useState, useRef, useEffect, useMemo } from 'react'
import { Trash2, Users, AlertCircle, Edit2, Check, X, Play, Pause, Copy, UserPlus, Sparkles, Loader2, RotateCcw, StickyNote, Bot, Plus, FolderOpen, Upload, ListVideo } from 'lucide-react'
import type { MeetingRecord, MeetingNote, VoiceProfile } from '@shared/types'
import { chapterRanges, formatClock, matchingSegments, speakerShares } from '@shared/meeting-timeline'
import { formatDateTime, formatDuration } from '../utils/format'
import { MeetingLevelMeter } from '../components/MeetingLevelMeter'
import { useMediaPlayer } from '../hooks/useMediaPlayer'
import { MeetingPlayer } from '../components/meeting-player/MeetingPlayer'
import { ChapterList } from '../components/meeting-player/ChapterList'
import { speakerColors } from '../components/meeting-player/speaker-colors'
import type { TimelineMarker } from '../components/meeting-player/PlayerTimeline'
import { MeetingTranscript } from '../components/meeting-transcript/MeetingTranscript'

interface Props {
  meetings: MeetingRecord[]
  voiceProfiles: VoiceProfile[]
  isRecording: boolean
  onDelete: (id: string) => void
  onDeleteVideo: (id: string) => void
  onRenameSpeaker: (id: string, oldName: string, newName: string) => void
  onAddNote: (meetingId: string, text: string, atSec?: number) => void
  onUpdateNote: (meetingId: string, noteId: string, text: string) => void
  onDeleteNote: (meetingId: string, noteId: string) => void
  onSaveVoiceProfile: (meetingId: string, speaker: string, name: string) => void
  onDeleteVoiceProfile: (id: string) => void
  onGenerateSummary: (meetingId: string) => void
  onRetryMeeting: (meetingId: string) => void
  /** Готовые записи (видео или аудио) с диска — разобрать как встречи */
  onImportFiles: (paths: string[]) => void
  showToast: (message: string, type: 'success' | 'error') => void
}

const draggingFiles = (event: React.DragEvent): boolean => event.dataTransfer.types.includes('Files')

export function Meetings({
  meetings, voiceProfiles, isRecording,
  onDelete, onDeleteVideo, onRenameSpeaker, onAddNote, onUpdateNote, onDeleteNote,
  onSaveVoiceProfile, onDeleteVoiceProfile, onGenerateSummary, onRetryMeeting, onImportFiles, showToast
}: Props): JSX.Element {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showProfiles, setShowProfiles] = useState(false)
  const [dropActive, setDropActive] = useState(false)

  const pickFiles = async (): Promise<void> => onImportFiles(await window.api.pickMeetingFiles())

  return (
    <div
      className="space-y-6 min-h-full"
      onDragOver={(e) => {
        if (!draggingFiles(e)) return
        e.preventDefault()
        setDropActive(true)
      }}
      onDragLeave={(e) => {
        // dragleave приходит и при переходе на дочерний элемент — гасим, только когда курсор ушёл со страницы
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropActive(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDropActive(false)
        onImportFiles(Array.from(e.dataTransfer.files, (file) => file.path))
      }}
    >
      {dropActive && (
        // fixed: страница с раскрытой встречей длиннее окна, подсказка должна быть в видимой части
        <div
          className="fixed inset-3 z-50 flex flex-col items-center justify-center gap-2 rounded-xl pointer-events-none"
          style={{ background: 'var(--surface-strong)', backdropFilter: 'blur(8px)', border: '2px dashed var(--accent)', color: 'var(--accent)' }}
        >
          <Upload size={28} />
          <p className="text-sm font-medium">Отпустите — разберу как встречу</p>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>Видео или аудио: голоса, реплики, саммари</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>Встречи</h1>
        <div className="flex items-center gap-3">
          {isRecording && (
            <div className="flex items-center gap-4 px-3 py-2 rounded-lg" style={{ background: 'var(--accent-bg)' }}>
              <div className="flex items-center gap-2" style={{ color: 'var(--accent)' }}>
                <div className="w-2 h-2 rounded-full animate-pulse-recording" style={{ background: 'var(--accent)' }} />
                <span className="text-xs font-medium">Запись идёт</span>
              </div>
              <MeetingLevelMeter />
            </div>
          )}
          <button
            onClick={() => setShowProfiles(!showProfiles)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
            style={{ background: showProfiles ? 'var(--accent-bg-hover)' : 'var(--surface)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
          >
            <UserPlus size={13} /> Голоса ({voiceProfiles.length})
          </button>
          <button
            onClick={() => void pickFiles()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
            style={{ background: 'var(--accent-bg-hover)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}
            title="Видео или аудио готовой встречи — разберу так же, как записанную"
          >
            <Upload size={13} /> Загрузить запись
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
            <p>Хоткей по умолчанию <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--accent-bg)' }}>Ctrl+Shift+M</kbd> — старт/стоп записи. Микрофон + системный звук. С разделением спикеров и автосаммари.</p>
            <p className="mt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
              Уже есть запись созвона? Перетащите видео или аудио сюда — разберу так же.
            </p>
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
              onDeleteVideo={() => onDeleteVideo(m.id)}
              onRenameSpeaker={(oldName, newName) => onRenameSpeaker(m.id, oldName, newName)}
              onAddNote={(text, atSec) => onAddNote(m.id, text, atSec)}
              onUpdateNote={(noteId, text) => onUpdateNote(m.id, noteId, text)}
              onDeleteNote={(noteId) => onDeleteNote(m.id, noteId)}
              onSaveVoiceProfile={(speaker, name) => onSaveVoiceProfile(m.id, speaker, name)}
              onGenerateSummary={() => onGenerateSummary(m.id)}
              onRetry={() => onRetryMeeting(m.id)}
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
    <div className="glass rounded-xl p-4 space-y-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>Голосовые профили (первые 4 используются в новых встречах)</p>
      <div className="space-y-2">
        {profiles.map((p, i) => (
          <VoiceProfileRow key={p.id} profile={p} active={i < 4} onDelete={() => onDelete(p.id)} />
        ))}
      </div>
    </div>
  )
}

function VoiceProfileRow({ profile, active, onDelete }: { profile: VoiceProfile; active: boolean; onDelete: () => void }): JSX.Element {
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
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
    const buf = await window.api.getVoiceProfileAudio(profile.audioFileName)
    setLoading(false)
    if (!buf) return
    const blob = new Blob([buf], { type: 'audio/wav' })
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
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs"
      style={{
        background: active ? 'var(--accent-bg-hover)' : 'var(--accent-bg)',
        color: 'var(--text-1)'
      }}
    >
      <button
        onClick={toggle}
        disabled={loading}
        className="flex items-center justify-center w-7 h-7 rounded-full disabled:opacity-50"
        style={{ background: 'var(--surface)', color: 'var(--accent)' }}
        title="Прослушать сэмпл"
      >
        {playing ? <Pause size={12} /> : <Play size={12} />}
      </button>
      <span className="font-medium flex-1">{profile.name}</span>
      <span style={{ color: 'var(--text-4)' }}>
        {(profile.durationMs / 1000).toFixed(1)}с · {profile.segmentCount} реплик
        {!active && ' · не активен'}
      </span>
      <button onClick={onDelete} title="Удалить" style={{ color: 'var(--text-4)' }}>
        <X size={14} />
      </button>
    </div>
  )
}

interface MeetingCardActions {
  onDelete: () => void
  onDeleteVideo: () => void
  onRenameSpeaker: (oldName: string, newName: string) => void
  onAddNote: (text: string, atSec?: number) => void
  onUpdateNote: (noteId: string, text: string) => void
  onDeleteNote: (noteId: string) => void
  onSaveVoiceProfile: (speaker: string, name: string) => void
  onGenerateSummary: () => void
  onRetry: () => void
  showToast: (message: string, type: 'success' | 'error') => void
}

function MeetingCard({ meeting: m, expanded, onToggle, ...actions }: MeetingCardActions & {
  meeting: MeetingRecord
  expanded: boolean
  onToggle: () => void
}): JSX.Element {
  const speakerCount = new Set(m.segments.map((s) => s.speaker)).size

  return (
    <div className="glass rounded-xl overflow-hidden transition-colors" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={onToggle}>
        <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT_CLASSES[m.status]}`} style={m.status === 'processing' ? { background: 'var(--accent)' } : undefined} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{m.title}</p>
          {m.status === 'processing' ? (
            <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--text-3)' }}>
              <Loader2 size={11} className="animate-spin" /> Расшифровываю: голоса, реплики, потом саммари…
            </p>
          ) : m.status === 'error' ? (
            <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: '#fca5a5' }}>
              <AlertCircle size={11} /> {m.error}
            </p>
          ) : (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-4)' }}>
              {m.segments.length} реплик · {speakerCount} {speakerCount === 1 ? 'спикер' : 'спикеров'}
              {(m.summary?.chapters?.length ?? 0) > 0 && ` · глав: ${m.summary?.chapters?.length}`}
              {(m.notes?.length ?? 0) > 0 && ` · заметок: ${m.notes?.length}`}
              {m.summaryStatus === 'pending' && ' · саммари готовится...'}
            </p>
          )}
        </div>
        <span className="text-xs shrink-0" style={{ color: 'var(--text-4)' }}>{formatDuration(m.durationMs)}</span>
        <span className="text-xs shrink-0" style={{ color: 'var(--text-4)' }}>{formatDateTime(m.createdAt)}</span>
      </div>

      {expanded && <MeetingDetails meeting={m} {...actions} />}
    </div>
  )
}

// Короче этого модель глав не делает — и подсказку «пересчитать ради оглавления» не показываем
const CHAPTERS_MIN_SEC = 240

/**
 * Раскрытая встреча. Плеер — общий для всего, что ниже: оглавление, договорённости, заметки и диалог
 * перематывают его, а он подсвечивает, где сейчас запись.
 */
function MeetingDetails({
  meeting: m, onDelete, onDeleteVideo, onRenameSpeaker, onAddNote, onUpdateNote, onDeleteNote,
  onSaveVoiceProfile, onGenerateSummary, onRetry, showToast
}: MeetingCardActions & { meeting: MeetingRecord }): JSX.Element {
  const segments = useMemo(() => [...m.segments].sort((a, b) => a.start - b.start), [m.segments])
  const player = useMediaPlayer(m.id, m.durationMs / 1000)
  const colors = useMemo(() => speakerColors(segments), [segments])
  const shares = useMemo(() => speakerShares(segments), [segments])
  const chapters = useMemo(() => chapterRanges(m.summary?.chapters ?? [], player.duration), [m.summary?.chapters, player.duration])
  const [query, setQuery] = useState('')
  const matches = useMemo(() => matchingSegments(segments, query), [segments, query])
  const matchTimes = useMemo(() => matches.map((index) => segments[index].start), [matches, segments])
  const [noteMoment, setNoteMoment] = useState<number | null>(null)
  const speakerName = (raw: string): string => m.speakerNames[raw] ?? raw

  const markers = useMemo((): TimelineMarker[] => [
    ...(m.summary?.decisions ?? []).flatMap((d) => (d.atSec === undefined ? [] : [{ atSec: d.atSec, kind: 'decision' as const, label: d.text }])),
    ...(m.notes ?? []).flatMap((n) => (n.atSec === undefined ? [] : [{ atSec: n.atSec, kind: 'note' as const, label: n.text }]))
  ], [m.summary?.decisions, m.notes])

  const copy = (text: string, message: string): void => {
    void window.api.copyText(text)
    showToast(message, 'success')
  }

  const handleCopyDialog = (): void => {
    copy(segments.map((s) => `${speakerName(s.speaker)}: ${s.text}`).join('\n\n'), 'Диалог скопирован')
  }

  const seekAndPlay = (atSec: number): void => player.seek(atSec, true)
  // Саммари сделано до появления глав, а встреча достаточно длинная, чтобы они были
  const chaptersMissing = m.summary !== undefined && m.summary.chapters === undefined && m.summaryStatus !== 'pending' && player.duration >= CHAPTERS_MIN_SEC

  return (
    <div className="px-4 py-4 space-y-5" style={{ borderTop: '1px solid var(--border)' }}>
      {/* Панель действий */}
      <div className="flex items-center gap-2 flex-wrap">
        {m.status !== 'processing' && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors"
            style={{
              background: m.status === 'error' ? 'var(--accent-bg-hover)' : 'var(--accent-bg)',
              color: m.status === 'error' ? 'var(--accent)' : 'var(--text-3)'
            }}
          >
            <RotateCcw size={12} />
            {m.status === 'error' ? 'Повторить транскрипцию' : 'Прогнать заново'}
          </button>
        )}
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
                disabled={m.summaryStatus === 'pending'}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors disabled:opacity-50"
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

      <div className="space-y-2">
        <MeetingPlayer
          meeting={m}
          player={player}
          segments={segments}
          chapters={chapters}
          colors={colors}
          speakerName={speakerName}
          markers={markers}
          matchTimes={matchTimes}
          onNoteAtMoment={setNoteMoment}
        />
        <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-4)' }}>
          <span>Пробел — пауза, ← → — 5 секунд, J L — 15, N — заметка к моменту</span>
          {m.videoFileName && <VideoFileActions meetingId={m.id} onDelete={onDeleteVideo} />}
        </div>
      </div>

      {chapters.length > 0 && (
        <ChapterList
          chapters={chapters}
          player={player}
          segments={segments}
          speakerName={speakerName}
          onCopy={(text) => copy(text, 'Глава скопирована')}
        />
      )}
      {chaptersMissing && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--accent-bg)', color: 'var(--text-3)' }}>
          <ListVideo size={13} className="shrink-0" />
          <span>Оглавления по темам пока нет: саммари этой встречи сделано раньше, чем появились главы.</span>
          <button
            onClick={onGenerateSummary}
            className="ml-auto shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-lg"
            style={{ background: 'var(--accent-bg-hover)', color: 'var(--accent)' }}
          >
            <Sparkles size={12} /> Пересчитать саммари
          </button>
        </div>
      )}

      {/* Саммари */}
      {m.summaryStatus === 'pending' && (
        <div className="p-3 rounded-lg flex items-center gap-2 text-xs" style={{ background: 'var(--accent-bg)', color: 'var(--text-3)' }}>
          <Loader2 size={12} className="animate-spin" /> Готовлю саммари и оглавление встречи…
        </div>
      )}
      {m.summaryStatus === 'error' && m.summaryError && (
        <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5' }}>
          Не получилось сделать саммари: {m.summaryError}
        </div>
      )}
      {m.summary && <SummaryBlock summary={m.summary} speakerName={speakerName} onSeek={seekAndPlay} />}

      <NotesBlock
        notes={m.notes ?? []}
        moment={noteMoment}
        onClearMoment={() => setNoteMoment(null)}
        onAdd={onAddNote}
        onUpdate={onUpdateNote}
        onDelete={onDeleteNote}
        onSeek={seekAndPlay}
      />

      {m.status === 'success' && (
        <>
          {/* Спикеры — цвет как на таймлайне, доля речи, переименование и сохранение голоса */}
          {colors.size > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>Спикеры</p>
              <div className="flex flex-wrap gap-2">
                {[...colors].map(([raw, color]) => (
                  <SpeakerTag
                    key={raw}
                    raw={raw}
                    displayName={speakerName(raw)}
                    color={color}
                    share={shares.get(raw) ?? 0}
                    onRename={(newName) => onRenameSpeaker(raw, newName)}
                    onSaveProfile={(name) => onSaveVoiceProfile(raw, name)}
                  />
                ))}
              </div>
            </div>
          )}

          <MeetingTranscript
            meeting={m}
            segments={segments}
            chapters={chapters}
            player={player}
            colors={colors}
            speakerName={speakerName}
            query={query}
            onQueryChange={setQuery}
            matches={matches}
          />
        </>
      )}
    </div>
  )
}

// Цвет «в работе» — акцент темы, задаётся стилем; классом — только пульсация
const STATUS_DOT_CLASSES: Record<MeetingRecord['status'], string> = {
  processing: 'animate-pulse',
  success: 'bg-green-300',
  error: 'bg-red-300'
}

function VideoFileActions({ meetingId, onDelete }: { meetingId: string; onDelete: () => void }): JSX.Element {
  const [confirming, setConfirming] = useState(false)

  // Удаление необратимо — просим второй клик, а если пользователь передумал, кнопка возвращается сама
  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 4000)
    return () => clearTimeout(timer)
  }, [confirming])

  return (
    <div className="ml-auto flex items-center gap-2 shrink-0">
      <button
        onClick={() => window.api.revealMeetingVideo(meetingId)}
        className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg transition-colors"
        style={{ background: 'var(--accent-bg)', color: 'var(--text-2)' }}
      >
        <FolderOpen size={12} /> Открыть файл
      </button>
      <button
        onClick={() => (confirming ? onDelete() : setConfirming(true))}
        className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg transition-colors hover:bg-red-500/15"
        style={{ color: confirming ? '#fca5a5' : 'var(--text-4)' }}
        title="Звук и расшифровка останутся"
      >
        <Trash2 size={12} /> {confirming ? 'Точно удалить видео?' : 'Удалить видео'}
      </button>
    </div>
  )
}

/** Тайм-код, который перематывает запись к моменту и включает её */
function MomentButton({ atSec, onSeek }: { atSec: number; onSeek: (atSec: number) => void }): JSX.Element {
  return (
    <button
      onClick={() => onSeek(atSec)}
      className="shrink-0 px-1.5 rounded text-[11px] tabular-nums font-medium transition-colors hover:bg-[var(--accent-bg-hover)]"
      style={{ color: 'var(--accent)' }}
      title="Смотреть этот момент"
    >
      {formatClock(atSec)}
    </button>
  )
}

function SummaryBlock({ summary, speakerName, onSeek }: {
  summary: NonNullable<MeetingRecord['summary']>
  speakerName: (raw: string) => string
  onSeek: (atSec: number) => void
}): JSX.Element {
  const topics = summary.topics ?? []
  const decisions = summary.decisions ?? []

  return (
    <div className="p-4 rounded-lg space-y-3" style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)' }}>
      <div className="flex items-center gap-2">
        <Sparkles size={14} style={{ color: 'var(--accent)' }} />
        <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--accent)' }}>Саммари</span>
      </div>

      {summary.brief && (
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-1)' }}>{summary.brief}</p>
      )}

      {topics.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-3)' }}>Темы</p>
          <div className="flex flex-wrap gap-1.5">
            {topics.map((t, i) => (
              <span key={i} className="px-2 py-0.5 rounded text-xs" style={{ background: 'var(--surface)', color: 'var(--text-2)' }}>
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {decisions.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-3)' }}>Договорённости</p>
          <ul className="space-y-1.5">
            {decisions.map((d, i) => (
              <li key={i} className="text-sm flex items-baseline gap-2" style={{ color: 'var(--text-2)' }}>
                {d.atSec === undefined ? <span className="w-[42px] text-center shrink-0" style={{ color: 'var(--accent)' }}>•</span> : <MomentButton atSec={d.atSec} onSeek={onSeek} />}
                <div>
                  <span>{d?.text ?? ''}</span>
                  {(d?.assignee || d?.deadline) && (
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

function NotesBlock({ notes, moment, onClearMoment, onAdd, onUpdate, onDelete, onSeek }: {
  notes: MeetingNote[]
  /** Заметку пишут к этому моменту записи; null — к встрече в целом */
  moment: number | null
  onClearMoment: () => void
  onAdd: (text: string, atSec?: number) => void
  onUpdate: (noteId: string, text: string) => void
  onDelete: (noteId: string) => void
  onSeek: (atSec: number) => void
}): JSX.Element {
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (moment !== null) textareaRef.current?.focus()
  }, [moment])

  const submit = (): void => {
    if (!draft.trim()) return
    onAdd(draft.trim(), moment ?? undefined)
    setDraft('')
    onClearMoment()
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <StickyNote size={13} style={{ color: 'var(--text-3)' }} />
        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>Заметки</span>
      </div>

      {notes.map((note) => (
        <NoteItem key={note.id} note={note} onUpdate={(text) => onUpdate(note.id, text)} onDelete={() => onDelete(note.id)} onSeek={onSeek} />
      ))}

      {moment !== null && (
        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
          Заметка к моменту
          <MomentButton atSec={moment} onSeek={onSeek} />
          <button onClick={onClearMoment} style={{ color: 'var(--text-4)' }} title="Писать к встрече целиком"><X size={11} /></button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit()
          }}
          placeholder={moment !== null ? 'Что важно в этом месте… (Ctrl+Enter — добавить)' : 'Что сделано, какие задачи созданы, ссылки… (Ctrl+Enter — добавить)'}
          rows={2}
          className="flex-1 text-xs rounded-lg px-3 py-2 resize-y focus:outline-none select-text"
          style={{ background: 'var(--accent-bg)', color: 'var(--text-1)', border: `1px solid ${moment !== null ? 'var(--accent-border)' : 'var(--border)'}` }}
        />
        <button
          onClick={submit}
          disabled={!draft.trim()}
          className="flex items-center gap-1 px-3 py-2 text-xs rounded-lg disabled:opacity-40"
          style={{ background: 'var(--accent-bg-hover)', color: 'var(--accent)' }}
        >
          <Plus size={12} /> Добавить
        </button>
      </div>
    </div>
  )
}

function NoteItem({ note, onUpdate, onDelete, onSeek }: {
  note: MeetingNote
  onUpdate: (text: string) => void
  onDelete: () => void
  onSeek: (atSec: number) => void
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(note.text)

  const save = (): void => {
    if (value.trim() && value.trim() !== note.text) onUpdate(value.trim())
    setEditing(false)
  }

  return (
    <div className="rounded-lg px-3 py-2 space-y-1" style={{ background: 'var(--accent-bg)' }}>
      <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-4)' }}>
        {note.source === 'agent' ? <Bot size={11} style={{ color: 'var(--accent)' }} /> : <StickyNote size={11} />}
        <span style={{ color: note.source === 'agent' ? 'var(--accent)' : 'var(--text-3)' }}>{note.author}</span>
        {note.atSec !== undefined && <MomentButton atSec={note.atSec} onSeek={onSeek} />}
        <span>{formatDateTime(note.createdAt)}{note.updatedAt && ' · изменено'}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {!editing && <button onClick={() => { setValue(note.text); setEditing(true) }} title="Изменить"><Edit2 size={11} /></button>}
          <button onClick={onDelete} title="Удалить"><Trash2 size={11} /></button>
        </div>
      </div>

      {editing ? (
        <div className="flex items-end gap-2">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={3}
            autoFocus
            className="flex-1 text-sm rounded px-2 py-1 resize-y focus:outline-none select-text"
            style={{ background: 'var(--surface)', color: 'var(--text-1)' }}
          />
          <button onClick={save} style={{ color: 'var(--accent)' }}><Check size={14} /></button>
          <button onClick={() => setEditing(false)} style={{ color: 'var(--text-4)' }}><X size={14} /></button>
        </div>
      ) : (
        <p className="text-sm leading-relaxed whitespace-pre-wrap select-text" style={{ color: 'var(--text-1)' }}>{note.text}</p>
      )}
    </div>
  )
}

function SpeakerTag({
  raw, displayName, color, share, onRename, onSaveProfile
}: {
  raw: string
  displayName: string
  /** Цвет спикера на таймлайне и в диалоге */
  color: string
  /** Доля речи, 0..1 */
  share: number
  onRename: (name: string) => void
  onSaveProfile: (name: string) => void
}): JSX.Element {
  const [mode, setMode] = useState<'view' | 'rename' | 'profile'>('view')
  const [value, setValue] = useState(displayName)

  const save = (): void => {
    if (mode === 'rename') {
      if (value.trim() && value !== displayName) onRename(value.trim())
    } else if (mode === 'profile') {
      if (value.trim()) onSaveProfile(value.trim())
    }
    setMode('view')
  }

  const startProfile = (): void => {
    setValue(displayName.startsWith('Speaker') ? '' : displayName)
    setMode('profile')
  }

  if (mode !== 'view') {
    return (
      <div className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'var(--accent-bg)', border: mode === 'profile' ? '1px solid var(--accent)' : 'none' }}>
        {mode === 'profile' && <UserPlus size={11} style={{ color: 'var(--accent)' }} />}
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') { setValue(displayName); setMode('view') }
          }}
          placeholder={mode === 'profile' ? 'Имя для голоса' : ''}
          className="text-xs bg-transparent focus:outline-none w-28"
          style={{ color: 'var(--text-1)' }}
          autoFocus
        />
        <button onClick={save} style={{ color: 'var(--accent)' }}><Check size={12} /></button>
        <button onClick={() => { setValue(displayName); setMode('view') }} style={{ color: 'var(--text-4)' }}><X size={12} /></button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: 'var(--accent-bg)' }} title={raw}>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-xs" style={{ color: 'var(--text-2)' }}>{displayName}</span>
      <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-4)' }} title="Доля времени речи">{Math.round(share * 100)}%</span>
      <button onClick={() => { setValue(displayName); setMode('rename') }} title="Переименовать" style={{ color: 'var(--text-4)' }}>
        <Edit2 size={10} />
      </button>
      <button onClick={startProfile} title="Сохранить голос как профиль" style={{ color: 'var(--accent)' }}>
        <UserPlus size={11} />
      </button>
    </div>
  )
}
