import { useState, useEffect, useCallback, useRef } from 'react'
import { initBlobs } from './blobs'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { History } from './pages/History'
import { Settings } from './pages/Settings'
import type { TranscriptionRecord, AppSettings, MeetingRecord, MeetingNote, VoiceProfile } from '@shared/types'
import { Meetings } from './pages/Meetings'
import { SearchModal } from './components/SearchModal'
import { applyTheme, getThemeById } from './themes'
import { generateNoiseTextures } from './noise'
import { createLevelMeter, meetingLevels, SILENT_LEVELS } from './utils/audio-levels'

const LEVEL_REPORT_INTERVAL_MS = 50

export type Page = 'dashboard' | 'history' | 'meetings' | 'settings'

export function App(): JSX.Element {
  const [page, setPage] = useState<Page>('dashboard')
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [history, setHistory] = useState<TranscriptionRecord[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [themeId, setThemeId] = useState('sunset')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordingStartRef = useRef<number>(0)

  // Meeting state
  const [meetings, setMeetings] = useState<MeetingRecord[]>([])
  const [isMeetingRecording, setIsMeetingRecording] = useState(false)
  const meetingRecorderRef = useRef<MediaRecorder | null>(null)
  const meetingChunksRef = useRef<Blob[]>([])
  const meetingStartRef = useRef<number>(0)
  const meetingStreamsRef = useRef<MediaStream[]>([])
  const meetingAudioContextRef = useRef<AudioContext | null>(null)
  const levelTimerRef = useRef<number | null>(null)

  // Voice profiles + search
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([])
  const [searchOpen, setSearchOpen] = useState(false)

  // Применяем тему
  useEffect(() => {
    const theme = getThemeById(themeId)
    applyTheme(theme)
    initBlobs(theme.blobs)
    generateNoiseTextures(theme.noise)
    if (window.api) {
      window.api.setOverlayTheme(theme.overlay as unknown as Record<string, string | number>)
    }
  }, [themeId])

  const handleThemeChange = useCallback((id: string) => {
    setThemeId(id)
    if (window.api) window.api.updateSettings({ theme: id })
  }, [])

  useEffect(() => {
    if (!window.api) return
    window.api.getHistory().then(setHistory)
    window.api.getMeetings().then(setMeetings)
    window.api.getVoiceProfiles().then(setVoiceProfiles)
    window.api.getSettings().then((s) => {
      setSettings(s)
      if (s.theme) setThemeId(s.theme)
    })
  }, [])

  // Ctrl+K — глобальный поиск (e.code не зависит от раскладки клавиатуры)
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.code === 'Escape') setSearchOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type })
  }, [])

  useEffect(() => {
    if (!window.api) return

    const unsubRecording = window.api.onRecordingStateChanged((recording) => {
      setIsRecording(recording)
      if (recording) {
        startRecording()
      } else {
        stopRecording()
      }
    })

    const unsubTranscription = window.api.onTranscriptionComplete((record) => {
      setIsProcessing(false)
      setHistory((prev) => [record, ...prev])

      if (record.status === 'error') {
        showToast(record.error || 'Ошибка транскрипции', 'error')
      } else {
        showToast('Текст распознан и вставлен', 'success')
      }
    })

    const unsubMeeting = window.api.onMeetingStateChanged((recording) => {
      setIsMeetingRecording(recording)
      if (recording) {
        startMeetingRecording()
      } else {
        stopMeetingRecording()
      }
    })

    const unsubMeetingUpdated = window.api.onMeetingUpdated((updated) => {
      setMeetings((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
      if (updated.summaryStatus === 'done') {
        showToast('Саммари готово', 'success')
      }
    })

    const unsubNotes = window.api.onMeetingNotesChanged((meetingId, notes) => {
      setMeetings((prev) => prev.map((m) => (m.id === meetingId ? { ...m, notes } : m)))
    })

    return () => {
      unsubNotes()
      unsubMeetingUpdated()
      unsubMeeting()
      unsubRecording()
      unsubTranscription()
    }
  }, [showToast])

  async function startRecording(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      chunksRef.current = []
      recordingStartRef.current = Date.now()
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.start(100)
      mediaRecorderRef.current = recorder
    } catch {
      showToast('Нет доступа к микрофону', 'error')
    }
  }

  async function stopRecording(): Promise<void> {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    setIsProcessing(true)
    recorder.onstop = async () => {
      const durationMs = Date.now() - recordingStartRef.current
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      const arrayBuffer = await blob.arrayBuffer()
      recorder.stream.getTracks().forEach((t) => t.stop())
      window.api.submitAudio(arrayBuffer, durationMs)
    }
    recorder.stop()
  }

  // ═══ MEETING RECORDING ═══
  async function startMeetingRecording(): Promise<void> {
    try {
      const captureSystem = settings?.captureSystemAudio ?? true
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      meetingStreamsRef.current = [micStream]

      let systemStream: MediaStream | null = null

      if (captureSystem) {
        try {
          // Захват системного звука через desktopCapturer (Electron)
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: true  // Требуется для getDisplayMedia, но будем использовать только audio
          })

          // Останавливаем видео-трек, оставляем только аудио
          displayStream.getVideoTracks().forEach((t) => t.stop())

          const systemAudio = displayStream.getAudioTracks()
          if (systemAudio.length > 0) {
            meetingStreamsRef.current.push(displayStream)
            systemStream = new MediaStream(systemAudio)
          }
        } catch (err) {
          console.warn('Системный звук не захвачен:', err)
          showToast('Системный звук недоступен — пишу только микрофон', 'error')
        }
      }

      const audioContext = new AudioContext()
      meetingAudioContextRef.current = audioContext

      let combinedStream: MediaStream = micStream
      if (systemStream) {
        // Микшируем микрофон + системное аудио
        const destination = audioContext.createMediaStreamDestination()
        audioContext.createMediaStreamSource(micStream).connect(destination)
        audioContext.createMediaStreamSource(systemStream).connect(destination)
        combinedStream = destination.stream
      }

      startLevelReporting(audioContext, micStream, systemStream)

      const recorder = new MediaRecorder(combinedStream, { mimeType: 'audio/webm;codecs=opus' })
      meetingChunksRef.current = []
      meetingStartRef.current = Date.now()
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) meetingChunksRef.current.push(e.data)
      }
      recorder.start(1000)
      meetingRecorderRef.current = recorder

      showToast('Запись встречи началась', 'success')
    } catch {
      stopLevelReporting()
      showToast('Не удалось начать запись встречи', 'error')
    }
  }

  // Уровни микрофона и звука компьютера: в индикатор окна и в оверлей, чтобы было видно, что слышно обоих
  function startLevelReporting(context: AudioContext, micStream: MediaStream, systemStream: MediaStream | null): void {
    const micMeter = createLevelMeter(context, micStream)
    const systemMeter = systemStream ? createLevelMeter(context, systemStream) : null

    levelTimerRef.current = window.setInterval(() => {
      const levels = { mic: micMeter.read(), system: systemMeter?.read() ?? 0, systemCaptured: systemMeter !== null }
      meetingLevels.set(levels)
      window.api.sendMeetingLevels(levels)
    }, LEVEL_REPORT_INTERVAL_MS)
  }

  function stopLevelReporting(): void {
    if (levelTimerRef.current !== null) window.clearInterval(levelTimerRef.current)
    levelTimerRef.current = null
    meetingLevels.set(SILENT_LEVELS)
  }

  async function stopMeetingRecording(): Promise<void> {
    const recorder = meetingRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return

    stopLevelReporting()
    showToast('Обработка встречи... это может занять минуту', 'success')

    recorder.onstop = async () => {
      const durationMs = Date.now() - meetingStartRef.current
      const blob = new Blob(meetingChunksRef.current, { type: 'audio/webm' })
      const arrayBuffer = await blob.arrayBuffer()

      // Останавливаем все стримы
      meetingStreamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()))
      meetingStreamsRef.current = []
      void meetingAudioContextRef.current?.close()
      meetingAudioContextRef.current = null

      const record = await window.api.submitMeeting(arrayBuffer, durationMs)
      setMeetings((prev) => [record, ...prev])

      if (record.status === 'error') {
        showToast(record.error || 'Ошибка диаризации', 'error')
      } else {
        showToast(`Встреча расшифрована: ${record.segments.length} реплик`, 'success')
      }
    }
    recorder.stop()
  }

  const handleDeleteItem = async (id: string): Promise<void> => {
    await window.api.deleteHistoryItem(id)
    setHistory((prev) => prev.filter((r) => r.id !== id))
  }

  const handleDeleteMeeting = async (id: string): Promise<void> => {
    await window.api.deleteMeeting(id)
    setMeetings((prev) => prev.filter((m) => m.id !== id))
  }

  const handleRenameSpeaker = async (id: string, oldName: string, newName: string): Promise<void> => {
    await window.api.renameMeetingSpeaker(id, oldName, newName)
    setMeetings((prev) => prev.map((m) =>
      m.id === id ? { ...m, speakerNames: { ...m.speakerNames, [oldName]: newName } } : m
    ))
  }

  const applyNotes = (meetingId: string, updated: MeetingRecord | null): void => {
    if (!updated) return
    const notes: MeetingNote[] = updated.notes ?? []
    setMeetings((prev) => prev.map((m) => (m.id === meetingId ? { ...m, notes } : m)))
  }

  const handleAddNote = async (meetingId: string, text: string): Promise<void> => {
    applyNotes(meetingId, await window.api.addMeetingNote(meetingId, text))
  }

  const handleUpdateNote = async (meetingId: string, noteId: string, text: string): Promise<void> => {
    applyNotes(meetingId, await window.api.updateMeetingNote(meetingId, noteId, text))
  }

  const handleDeleteNote = async (meetingId: string, noteId: string): Promise<void> => {
    applyNotes(meetingId, await window.api.deleteMeetingNote(meetingId, noteId))
  }

  const handleSaveVoiceProfile = async (meetingId: string, speaker: string, name: string): Promise<void> => {
    try {
      showToast('Извлекаю голос...', 'success')
      const result = await window.api.createVoiceProfileFromMeeting(meetingId, speaker, name)
      if (result.error || !result.profile) {
        showToast(result.error || 'Не получилось создать профиль', 'error')
        return
      }
      setVoiceProfiles((prev) => [result.profile!, ...prev])
      showToast(`Голос "${result.profile.name}" сохранён`, 'success')
    } catch (err) {
      console.error('Ошибка создания профиля:', err)
      showToast('Ошибка создания профиля голоса', 'error')
    }
  }

  const handleDeleteVoiceProfile = async (id: string): Promise<void> => {
    await window.api.deleteVoiceProfile(id)
    setVoiceProfiles((prev) => prev.filter((p) => p.id !== id))
  }

  const handleGenerateSummary = async (meetingId: string): Promise<void> => {
    showToast('Делаю саммари...', 'success')
    await window.api.generateMeetingSummary(meetingId)
    // ответ придёт через onMeetingUpdated
  }

  const handleRetryMeeting = async (meetingId: string): Promise<void> => {
    showToast('Повторная транскрипция встречи...', 'success')
    const updated = await window.api.retryMeeting(meetingId)
    if (updated) {
      setMeetings((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
      if (updated.status === 'success') showToast('Встреча расшифрована', 'success')
      else if (updated.error) showToast(updated.error, 'error')
    }
  }

  const handleClearHistory = async (): Promise<void> => {
    await window.api.clearHistory()
    setHistory([])
  }

  const handleRetry = async (id: string): Promise<void> => {
    showToast('Повторная транскрипция...', 'success')
    await window.api.retryTranscription(id)
    const updated = await window.api.getHistory()
    setHistory(updated)
  }

  const handleUpdateSettings = async (partial: Partial<AppSettings>): Promise<void> => {
    const updated = await window.api.updateSettings(partial)
    setSettings(updated)
    showToast('Настройки сохранены', 'success')
  }

  return (
    <Layout page={page} onPageChange={setPage} isRecording={isRecording} isProcessing={isProcessing} hotkey={settings?.hotkey ?? ''} currentTheme={themeId} onThemeChange={handleThemeChange} titlebarConfig={getThemeById(themeId).titlebar} decor={getThemeById(themeId).decor} onOpenSearch={() => setSearchOpen(true)}>
      {page === 'dashboard' && (
        <Dashboard
          isRecording={isRecording}
          isProcessing={isProcessing}
          history={history}
          settings={settings}
        />
      )}
      {page === 'history' && (
        <History
          history={history}
          onDelete={handleDeleteItem}
          onClear={handleClearHistory}
          onRetry={handleRetry}
          showToast={showToast}
        />
      )}
      {page === 'meetings' && (
        <Meetings
          meetings={meetings}
          voiceProfiles={voiceProfiles}
          isRecording={isMeetingRecording}
          onDelete={handleDeleteMeeting}
          onRenameSpeaker={handleRenameSpeaker}
          onAddNote={handleAddNote}
          onUpdateNote={handleUpdateNote}
          onDeleteNote={handleDeleteNote}
          onSaveVoiceProfile={handleSaveVoiceProfile}
          onDeleteVoiceProfile={handleDeleteVoiceProfile}
          onGenerateSummary={handleGenerateSummary}
          onRetryMeeting={handleRetryMeeting}
          showToast={showToast}
        />
      )}
      {page === 'settings' && settings && (
        <Settings settings={settings} onUpdate={handleUpdateSettings} showToast={showToast} />
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl text-sm font-medium shadow-2xl z-50 transition-all
            ${toast.type === 'success' ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'}`}
        >
          {toast.message}
        </div>
      )}

      {searchOpen && (
        <SearchModal
          history={history}
          meetings={meetings}
          onClose={() => setSearchOpen(false)}
          onNavigate={(target) => {
            setPage(target.page)
            setSearchOpen(false)
          }}
        />
      )}
    </Layout>
  )
}
