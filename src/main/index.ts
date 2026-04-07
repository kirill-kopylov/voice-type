import {
  app,
  BrowserWindow,
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
import { transcribeAudio, testConnection } from './services/transcription'
import { pasteText, simulateEnter } from './services/paste'
import { saveAudio, loadAudio, deleteAudio } from './services/audio-storage'
import { createTray, setTrayRecording, updateTrayMenu } from './services/tray'
import { createCircleIcon } from './services/icon'
import { OVERLAY_HTML } from './overlay.html'

let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let isRecording = false
let currentHotkey: string | null = null
let currentOverlayTheme: Record<string, string | number> | null = null
let trayCallbacks: { toggle: () => void; quit: () => void } | null = null

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

function applyAutoStart(): void {
  const settings = store.getSettings()
  app.setLoginItemSettings({ openAtLogin: settings.autoStart })
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
    if (mainWindow && trayCallbacks) updateTrayMenu(mainWindow, trayCallbacks.toggle, trayCallbacks.quit)

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
        pasteText(finalText, settings.keepInClipboard)
      }

      if (shouldEnter) {
        // Enter через 400мс после вставки
        setTimeout(() => simulateEnter(), 1000)
      }
    }

    showOverlay('hidden')
    mainWindow?.webContents.send('transcription-complete', record)
    return record
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
    if (mainWindow && trayCallbacks) updateTrayMenu(mainWindow, trayCallbacks.toggle, trayCallbacks.quit)

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
    if ('hotkey' in partial) registerHotkey()
    if ('autoStart' in partial) applyAutoStart()
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

  createMainWindow()
  createOverlayWindow()
  setupIpcHandlers()
  registerHotkey()
  applyAutoStart()

  if (mainWindow) {
    trayCallbacks = {
      toggle: () => toggleRecording(),
      quit: () => { app.isQuitting = true; app.quit() }
    }
    createTray(mainWindow, trayCallbacks.toggle, trayCallbacks.quit)
  }
})

app.on('before-quit', () => { app.isQuitting = true })
app.on('will-quit', () => { globalShortcut.unregisterAll() })
app.on('window-all-closed', () => {})

