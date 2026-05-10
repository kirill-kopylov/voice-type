import {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  clipboard,
  screen,
  session,
  nativeImage
} from 'electron'
import path from 'path'
import { writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { store } from './services/store'
import { transcribeAudio, testConnection, transcribeDiarized, KnownSpeaker } from './services/transcription'
import { generateSummary } from './services/summary'
import { extractSpeakerSegments } from './services/extract-speaker'
import type { MeetingRecord, VoiceProfile } from './services/types'
import { pasteText, simulateEnter } from './services/paste'
import { captureWindow, pasteToStickyWindow, getStickyHwnd, clearStickyWindow } from './services/sticky-window'
import { saveAudio, loadAudio, deleteAudio, saveProfileAudio, loadProfileAudio, deleteProfileAudio } from './services/audio-storage'
import { createTray, setTrayRecording, updateTrayMenu, TrayCallbacks } from './services/tray'
import { createCircleIcon } from './services/icon'
import { OVERLAY_HTML } from './overlay.html'
import { telegramBot } from './services/telegram-bot'

let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let isRecording = false
let currentHotkey: string | null = null
let currentStickyHotkey: string | null = null
let currentMeetingHotkey: string | null = null
let isMeetingRecording = false
let currentOverlayTheme: Record<string, string | number> | null = null
let trayCallbacks: TrayCallbacks | null = null

function refreshTrayMenu(): void {
  if (mainWindow && trayCallbacks) {
    updateTrayMenu(mainWindow, trayCallbacks, { isMeetingRecording })
  }
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1050,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: '#e8725a',
    icon: nativeImage.createFromBuffer(createCircleIcon(232, 114, 90)),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })
}

function createOverlayWindow(): void {
  const display = screen.getPrimaryDisplay()
  const { width: screenWidth, height: workAreaHeight } = display.workAreaSize

  // Сохраняем HTML в файл — data: URL не даёт доступ к микрофону
  const overlayPath = path.join(app.getPath('userData'), 'overlay.html')
  writeFileSync(overlayPath, OVERLAY_HTML, 'utf-8')

  overlayWindow = new BrowserWindow({
    width: 150,
    height: 44,
    x: screenWidth - 166,
    y: workAreaHeight - 60,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    hasShadow: false,
    type: 'toolbar',
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false
    }
  })

  overlayWindow.loadFile(overlayPath)
  overlayWindow.hide()
}

function showOverlay(state: 'recording' | 'processing' | 'hidden'): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return

  if (state === 'hidden') {
    overlayWindow.webContents.executeJavaScript(`setState('hidden')`)
    overlayWindow.hide()
    return
  }

  // Применяем тему перед переключением состояния
  if (currentOverlayTheme) {
    overlayWindow.webContents.executeJavaScript(`applyOverlayTheme(${JSON.stringify(currentOverlayTheme)})`)
  }
  overlayWindow.show()
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.webContents.executeJavaScript(`setState('${state}')`)
}

function playSound(type: 'start' | 'stop'): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.webContents.executeJavaScript(`playBeep('${type}')`)
}

function registerHotkey(): void {
  if (currentHotkey) {
    globalShortcut.unregister(currentHotkey)
  }

  const settings = store.getSettings()
  currentHotkey = settings.hotkey

  const registered = globalShortcut.register(currentHotkey, () => {
    toggleRecording()
  })

  if (!registered) {
    console.error(`Не удалось зарегистрировать горячую клавишу: ${currentHotkey}`)
  }

  // Sticky window hotkey
  if (currentStickyHotkey) {
    globalShortcut.unregister(currentStickyHotkey)
  }

  if (settings.stickyWindow && settings.stickyHotkey) {
    currentStickyHotkey = settings.stickyHotkey
    const stickyRegistered = globalShortcut.register(currentStickyHotkey, async () => {
      if (getStickyHwnd()) {
        clearStickyWindow()
        mainWindow?.webContents.send('sticky-status', false)
        playSound('stop')
      } else {
        const hwnd = await captureWindow()
        mainWindow?.webContents.send('sticky-status', !!hwnd)
        if (hwnd) playSound('start')
      }
    })

    if (!stickyRegistered) {
      console.error(`Не удалось зарегистрировать sticky-хоткей: ${currentStickyHotkey}`)
    }
  }

  // Meeting hotkey
  if (currentMeetingHotkey) {
    globalShortcut.unregister(currentMeetingHotkey)
  }

  if (settings.meetingHotkey) {
    currentMeetingHotkey = settings.meetingHotkey
    const meetingRegistered = globalShortcut.register(currentMeetingHotkey, () => {
      toggleMeetingRecording()
    })

    if (!meetingRegistered) {
      console.error(`Не удалось зарегистрировать meeting-хоткей: ${currentMeetingHotkey}`)
    }
  }
}

function toggleMeetingRecording(): void {
  isMeetingRecording = !isMeetingRecording
  console.log(`[meeting] ${isMeetingRecording ? 'START' : 'STOP'}`)
  playSound(isMeetingRecording ? 'start' : 'stop')
  mainWindow?.webContents.send('meeting-state-changed', isMeetingRecording)

  if (isMeetingRecording) {
    showOverlay('recording')
  } else {
    showOverlay('processing')
  }

  refreshTrayMenu()
}

function toggleRecording(): void {
  isRecording = !isRecording

  setTrayRecording(isRecording)
  mainWindow?.webContents.send('recording-state-changed', isRecording)

  if (isRecording) {
    playSound('start')
    showOverlay('recording')
  } else {
    playSound('stop')
    showOverlay('processing')
  }
}

async function runSummary(meetingId: string): Promise<MeetingRecord | null> {
  const meeting = store.getMeeting(meetingId)
  if (!meeting || meeting.segments.length === 0) return null

  const settings = store.getSettings()
  const apiKey = settings.openAiApiKey
  if (!apiKey) {
    store.updateMeeting(meetingId, { summaryStatus: 'error', summaryError: 'OpenAI ключ не задан' })
    const updated = store.getMeeting(meetingId)
    if (updated) mainWindow?.webContents.send('meeting-updated', updated)
    return updated ?? null
  }

  store.updateMeeting(meetingId, { summaryStatus: 'pending', summaryError: undefined })

  const result = await generateSummary(meeting.segments, apiKey, meeting.speakerNames)

  if (result.error || !result.summary) {
    store.updateMeeting(meetingId, { summaryStatus: 'error', summaryError: result.error })
  } else {
    const newSpeakerNames = { ...meeting.speakerNames }
    if (result.summary.guessedNames) {
      for (const [raw, guessed] of Object.entries(result.summary.guessedNames)) {
        if (!newSpeakerNames[raw] || newSpeakerNames[raw].startsWith('Speaker')) {
          newSpeakerNames[raw] = guessed
        }
      }
    }
    const patch: Partial<MeetingRecord> = {
      summary: result.summary,
      summaryStatus: 'done',
      speakerNames: newSpeakerNames
    }
    // Заменяем дефолтный заголовок-таймстамп на сгенерированный
    if (result.title && (meeting.title.startsWith('Встреча ') || !meeting.title)) {
      patch.title = result.title
    }
    store.updateMeeting(meetingId, patch)
  }

  const updated = store.getMeeting(meetingId)
  if (updated) mainWindow?.webContents.send('meeting-updated', updated)
  return updated ?? null
}

function applyAutoStart(): void {
  // В dev-режиме не трогаем автозапуск — иначе electron.exe попадёт в реестр
  if (process.env.ELECTRON_RENDERER_URL) return

  const settings = store.getSettings()
  app.setLoginItemSettings({ openAtLogin: settings.autoStart })
}

function applyTelegramBot(): void {
  const settings = store.getSettings()
  if (settings.telegramEnabled && settings.telegramBotToken && settings.telegramAllowedUserIds.length > 0) {
    telegramBot.start(settings.telegramBotToken, settings.telegramAllowedUserIds)
  } else {
    telegramBot.stop()
  }
}

function setupIpcHandlers(): void {
  // Тема overlay — из renderer
  ipcMain.on('set-overlay-theme', (_event, config: Record<string, string | number>) => {
    currentOverlayTheme = config
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.executeJavaScript(`applyOverlayTheme(${JSON.stringify(config)})`)
    }
  })

  ipcMain.handle('submit-audio', async (_event, audioData: ArrayBuffer, durationMs: number) => {
    console.log(`[ipc] submit-audio: ${audioData.byteLength} байт, ${durationMs}мс`)
    const settings = store.getSettings()
    const id = randomUUID()
    const audioBuffer = Buffer.from(audioData)

    const audioFileName = saveAudio(id, audioBuffer)
    const result = await transcribeAudio(audioBuffer, settings)

    const record = {
      id,
      text: result.text,
      audioFileName,
      durationMs,
      createdAt: new Date().toISOString(),
      provider: settings.provider,
      model: settings.model,
      status: result.error ? 'error' as const : 'success' as const,
      error: result.error
    }

    store.addHistory(record)
    refreshTrayMenu()

    if (!result.error && settings.autoPaste && result.text.trim()) {
      let finalText = result.text.trim()
      let shouldEnter = false

      // Проверяем триггер auto-enter — вхождение в последних двух словах
      if (settings.autoEnter && settings.autoEnterTriggers) {
        const triggers = settings.autoEnterTriggers.split(',').map((t) => t.trim().toLowerCase())
        const words = finalText.split(/\s+/)
        const len = words.length

        // Проверяем последние 2 слова (или 1 если текст из одного слова)
        const checkCount = Math.min(2, len)
        for (let wi = len - checkCount; wi < len; wi++) {
          const clean = words[wi].replace(/[.,!?;:…"'()]+/g, '').toLowerCase()
          const matched = triggers.some((t) => clean.includes(t))
          if (matched) {
            // Отрезаем всё начиная с этого слова
            finalText = words.slice(0, wi).join(' ').replace(/[.,!?\s]+$/, '')
            shouldEnter = true
            break
          }
        }
      }

      if (finalText) {
        if (settings.stickyWindow && getStickyHwnd()) {
          // Sticky mode — вставка в зафиксированное окно + Enter + возврат
          pasteToStickyWindow(finalText, settings.keepInClipboard)
        } else {
          pasteText(finalText, settings.keepInClipboard)
          if (shouldEnter) {
            setTimeout(() => simulateEnter(), 1000)
          }
        }
      }
    }

    showOverlay('hidden')
    mainWindow?.webContents.send('transcription-complete', record)
    return record
  })

  // ═══ MEETINGS ═══
  ipcMain.handle('submit-meeting', async (_event, audioData: ArrayBuffer, durationMs: number) => {
    console.log(`[meeting] submit: ${audioData.byteLength} байт, ${durationMs}мс`)
    const settings = store.getSettings()
    const id = randomUUID()
    const audioBuffer = Buffer.from(audioData)
    const audioFileName = saveAudio(id, audioBuffer)

    const apiKey = settings.openAiApiKey
    if (!apiKey) {
      const record: MeetingRecord = {
        id, title: `Встреча ${new Date().toLocaleString('ru-RU')}`,
        audioFileName, durationMs,
        createdAt: new Date().toISOString(),
        segments: [], speakerNames: {},
        status: 'error', error: 'OpenAI API ключ не задан (диаризация только через OpenAI)'
      }
      store.addMeeting(record)
      showOverlay('hidden')
      return record
    }

    // Подгружаем голосовые профили — до 4
    const profiles = store.getVoiceProfiles().slice(0, 4)
    const knownSpeakers: KnownSpeaker[] = []
    for (const p of profiles) {
      const audio = loadProfileAudio(p.audioFileName)
      if (audio) knownSpeakers.push({ name: p.name, audio })
    }
    if (knownSpeakers.length > 0) {
      console.log(`[meeting] Использую ${knownSpeakers.length} голосовых профилей`)
    }

    const result = await transcribeDiarized(audioBuffer, apiKey, settings.language, knownSpeakers)

    // Если профили использованы — speaker уже содержит имя, копируем в speakerNames
    const initialSpeakerNames: Record<string, string> = {}
    if (knownSpeakers.length > 0) {
      for (const seg of result.segments) {
        if (seg.speaker && !seg.speaker.startsWith('Speaker')) {
          initialSpeakerNames[seg.speaker] = seg.speaker
        }
      }
    }

    const record: MeetingRecord = {
      id,
      title: `Встреча ${new Date().toLocaleString('ru-RU')}`,
      audioFileName, durationMs,
      createdAt: new Date().toISOString(),
      segments: result.segments,
      speakerNames: initialSpeakerNames,
      summaryStatus: result.error ? undefined : 'pending',
      status: result.error ? 'error' : 'success',
      error: result.error
    }

    store.addMeeting(record)
    showOverlay('hidden')
    mainWindow?.webContents.send('meeting-complete', record)

    // Авто-саммари в фоне, не блокируем ответ
    if (!result.error && result.segments.length > 0) {
      runSummary(record.id).catch((err) => console.error('[summary] background:', err))
    }

    return record
  })

  // Воспроизведение саммари по требованию (или повторно)
  ipcMain.handle('generate-meeting-summary', async (_event, id: string) => {
    return runSummary(id)
  })

  // ═══ VOICE PROFILES ═══
  ipcMain.handle('get-voice-profiles', () => store.getVoiceProfiles())

  // Создание профиля голоса прямо из встречи —
  // вся тяжёлая работа (декодирование/нарезка) в main process через ffmpeg
  ipcMain.handle('create-voice-profile-from-meeting', async (_event, meetingId: string, speaker: string, name: string) => {
    const meeting = store.getMeeting(meetingId)
    if (!meeting) return { error: 'Встреча не найдена' }

    const audioBuffer = loadAudio(meeting.audioFileName)
    if (!audioBuffer) return { error: 'Аудиофайл встречи не найден' }

    const segments = meeting.segments
      .filter((s) => s.speaker === speaker)
      .map((s) => ({ start: s.start, end: s.end }))

    if (segments.length === 0) return { error: 'Нет реплик этого спикера' }

    const wav = await extractSpeakerSegments(audioBuffer, segments)
    if (!wav) return { error: 'Не получилось извлечь аудио (нужно 3+ секунд речи)' }

    const id = randomUUID()
    const audioFileName = saveProfileAudio(id, wav)
    const totalDur = segments.reduce((sum, s) => sum + (s.end - s.start), 0) * 1000

    const profile: VoiceProfile = {
      id, name: name.trim() || 'Без имени',
      audioFileName,
      durationMs: Math.round(totalDur),
      segmentCount: segments.length,
      sourceMeetingId: meetingId,
      createdAt: new Date().toISOString()
    }
    store.addVoiceProfile(profile)
    return { profile }
  })

  ipcMain.handle('delete-voice-profile', (_event, id: string) => {
    const p = store.getVoiceProfile(id)
    if (p) {
      deleteProfileAudio(p.audioFileName)
      store.deleteVoiceProfile(id)
    }
  })

  ipcMain.handle('get-voice-profile-audio', (_event, fileName: string) => {
    const buf = loadProfileAudio(fileName)
    return buf ? buf.buffer : null
  })

  ipcMain.handle('retry-meeting', async (_event, id: string) => {
    const meeting = store.getMeeting(id)
    if (!meeting) return null

    const audioBuffer = loadAudio(meeting.audioFileName)
    if (!audioBuffer) return null

    const settings = store.getSettings()
    const apiKey = settings.openAiApiKey
    if (!apiKey) {
      store.updateMeeting(id, { status: 'error', error: 'OpenAI API ключ не задан' })
      return store.getMeeting(id)
    }

    showOverlay('processing')

    const profiles = store.getVoiceProfiles().slice(0, 4)
    const knownSpeakers: KnownSpeaker[] = []
    for (const p of profiles) {
      const audio = loadProfileAudio(p.audioFileName)
      if (audio) knownSpeakers.push({ name: p.name, audio })
    }

    const result = await transcribeDiarized(audioBuffer, apiKey, settings.language, knownSpeakers)

    const initialSpeakerNames: Record<string, string> = {}
    if (knownSpeakers.length > 0) {
      for (const seg of result.segments) {
        if (seg.speaker && !seg.speaker.startsWith('Speaker')) {
          initialSpeakerNames[seg.speaker] = seg.speaker
        }
      }
    }

    store.updateMeeting(id, {
      segments: result.segments,
      speakerNames: { ...meeting.speakerNames, ...initialSpeakerNames },
      summary: undefined,
      summaryStatus: result.error ? undefined : 'pending',
      summaryError: undefined,
      status: result.error ? 'error' : 'success',
      error: result.error
    })

    showOverlay('hidden')

    const updated = store.getMeeting(id)
    if (updated) mainWindow?.webContents.send('meeting-updated', updated)

    if (!result.error && result.segments.length > 0) {
      runSummary(id).catch((err) => console.error('[summary] retry:', err))
    }

    return updated ?? null
  })

  ipcMain.handle('get-meetings', () => store.getMeetings())

  ipcMain.handle('delete-meeting', (_event, id: string) => {
    const m = store.getMeeting(id)
    if (m) {
      deleteAudio(m.audioFileName)
      store.deleteMeeting(id)
    }
  })

  ipcMain.handle('rename-meeting-speaker', (_event, id: string, oldName: string, newName: string) => {
    const m = store.getMeeting(id)
    if (!m) return
    const speakerNames = { ...m.speakerNames, [oldName]: newName }
    store.updateMeeting(id, { speakerNames })
  })

  ipcMain.handle('get-meeting-audio', (_event, fileName: string) => {
    const buffer = loadAudio(fileName)
    return buffer ? buffer.buffer : null
  })

  ipcMain.handle('get-history', () => store.getHistory())

  ipcMain.handle('delete-history-item', (_event, id: string) => {
    const item = store.getHistoryItem(id)
    if (item) {
      deleteAudio(item.audioFileName)
      store.deleteHistory(id)
    }
  })

  ipcMain.handle('clear-history', () => {
    const history = store.getHistory()
    for (const item of history) {
      deleteAudio(item.audioFileName)
    }
    store.clearHistory()
  })

  ipcMain.handle('retry-transcription', async (_event, id: string) => {
    const item = store.getHistoryItem(id)
    if (!item) return null

    const audioBuffer = loadAudio(item.audioFileName)
    if (!audioBuffer) return null

    const settings = store.getSettings()
    console.log(`[retry] Повторная транскрипция ${id}`)

    showOverlay('processing')

    const result = await transcribeAudio(audioBuffer, settings)

    // Обновляем запись в истории
    const updated = {
      ...item,
      text: result.text,
      status: result.error ? 'error' as const : 'success' as const,
      error: result.error,
      provider: settings.provider,
      model: settings.model
    }

    store.deleteHistory(id)
    store.addHistory(updated)
    refreshTrayMenu()

    if (!result.error && settings.autoPaste && result.text.trim()) {
      pasteText(result.text, settings.keepInClipboard)
    }

    showOverlay('hidden')
    mainWindow?.webContents.send('transcription-complete', updated)

    return updated
  })

  ipcMain.handle('re-paste', (_event, id: string) => {
    const item = store.getHistoryItem(id)
    if (item?.text) {
      const settings = store.getSettings()
      pasteText(item.text, settings.keepInClipboard)
    }
  })

  ipcMain.handle('copy-text', (_event, text: string) => {
    clipboard.writeText(text)
  })

  ipcMain.handle('get-audio', (_event, fileName: string) => {
    const buffer = loadAudio(fileName)
    return buffer ? buffer.buffer : null
  })

  ipcMain.handle('get-settings', () => store.getSettings())

  ipcMain.handle('update-settings', (_event, partial: Record<string, unknown>) => {
    const updated = store.updateSettings(partial)
    if ('hotkey' in partial || 'stickyWindow' in partial || 'stickyHotkey' in partial || 'meetingHotkey' in partial) registerHotkey()
    if ('autoStart' in partial) applyAutoStart()
    if ('telegramEnabled' in partial || 'telegramBotToken' in partial || 'telegramAllowedUserIds' in partial) {
      applyTelegramBot()
    }
    return updated
  })

  ipcMain.handle('test-connection', async () => {
    const settings = store.getSettings()
    return testConnection(settings)
  })

  ipcMain.handle('window-minimize', () => mainWindow?.minimize())
  ipcMain.handle('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.handle('window-close', () => mainWindow?.hide())
}

declare module 'electron' {
  interface App { isQuitting: boolean }
}
app.isQuitting = false

app.whenReady().then(() => {
  // Разрешаем доступ к микрофону для overlay
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(true))
  session.defaultSession.setPermissionCheckHandler(() => true)

  // Захват системного звука для встреч — даём первый screen с loopback audio
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      // На Windows audio: 'loopback' даёт системный звук
      callback({ video: sources[0], audio: 'loopback' })
    }).catch((err) => {
      console.error('[displayMedia] Ошибка:', err)
      callback({})
    })
  })

  createMainWindow()
  createOverlayWindow()
  setupIpcHandlers()
  registerHotkey()
  applyAutoStart()
  applyTelegramBot()

  if (mainWindow) {
    trayCallbacks = {
      toggleRecording: () => toggleRecording(),
      toggleMeeting: () => toggleMeetingRecording(),
      quit: () => { app.isQuitting = true; app.quit() }
    }
    createTray(mainWindow, trayCallbacks)
  }
})

app.on('before-quit', () => { app.isQuitting = true; telegramBot.stop() })
app.on('will-quit', () => { globalShortcut.unregisterAll() })
app.on('window-all-closed', () => {})

