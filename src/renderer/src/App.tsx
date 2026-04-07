import { useState, useEffect, useCallback, useRef } from 'react'
import { initBlobs } from './blobs'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { History } from './pages/History'
import { Settings } from './pages/Settings'
import { TranscriptionRecord, AppSettings } from './types'
import { applyTheme, getThemeById } from './themes'
import { generateNoiseTextures } from './noise'

export type Page = 'dashboard' | 'history' | 'settings'

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
    window.api.getSettings().then((s) => {
      setSettings(s)
      if (s.theme) setThemeId(s.theme)
    })
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

    return () => {
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

  const handleDeleteItem = async (id: string): Promise<void> => {
    await window.api.deleteHistoryItem(id)
    setHistory((prev) => prev.filter((r) => r.id !== id))
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
    <Layout page={page} onPageChange={setPage} isRecording={isRecording} isProcessing={isProcessing} hotkey={settings?.hotkey ?? ''} currentTheme={themeId} onThemeChange={handleThemeChange} titlebarConfig={getThemeById(themeId).titlebar} decor={getThemeById(themeId).decor}>
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
    </Layout>
  )
}
